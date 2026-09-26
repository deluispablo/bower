#!/usr/bin/env bash
# Hermetic test for scripts/deploy-api.sh's `deploy` subcommand. wrangler
# and openssl are stubs on PATH, so nothing reaches Cloudflare's API or a
# real account. Each case copies the real script into a throwaway
# scripts/+api/ pair (deploy-api.sh finds "its" api/ next to itself), so a
# case that rewrites wrangler.toml never touches the real one.
#
# Prints "ok <case>" per case and exits non-zero on the first failure.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT_SRC="$HERE/../deploy-api.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

STUBS="$WORK/bin"
mkdir -p "$STUBS"

# --- stubs -------------------------------------------------------------

cat >"$STUBS/openssl" <<'STUB'
#!/usr/bin/env bash
# Fixed fake key: deterministic, and obviously not a real secret.
if [ "$1" = rand ]; then
  echo 'ZmFrZS1nZW5lcmF0ZWQtc2VjcmV0LXZhbHVlLTAwMDAwMDAwMDA='
  exit 0
fi
echo "openssl stub: unsupported args: $*" >&2
exit 90
STUB

cat >"$STUBS/wrangler" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
echo "wrangler $*" >>"$STUB_STATE/calls.log"
case "$1" in
  whoami)
    if [ "${STUB_SCENARIO:-}" = not-logged-in ]; then
      echo "You are not authenticated. Please run \`wrangler login\`."
      exit 1
    fi
    echo "You are logged in with an OAuth token, associated with the email 'you@example.com'."
    exit 0
    ;;
  kv)
    if [ "${2:-}" = namespace ] && [ "${3:-}" = create ]; then
      cat <<'EOF'

 stub-wrangler 4.999.0
-------------------
Creating namespace with title "bower-api-BOWER_KV"
Success!
Add the following to your configuration file:
[[kv_namespaces]]
binding = "BOWER_KV"
id = "stub-new-kv-id-000111222"
EOF
      exit 0
    fi
    echo "wrangler stub: unhandled kv args: $*" >&2
    exit 90
    ;;
  deploy)
    cat <<'EOF'

 stub-wrangler 4.999.0
-------------------
Total Upload: 12.3 KiB / gzip: 4.5 KiB
Uploaded bower-api (1.11 sec)
Deployed bower-api triggers (0.44 sec)
  https://bower-api.stub-subdomain.workers.dev
Current Version ID: 00000000-0000-0000-0000-000000000000
EOF
    exit 0
    ;;
  secret)
    if [ "${2:-}" = put ]; then
      cat >/dev/null
      echo "Success! Uploaded secret ${3:-}"
      exit 0
    fi
    echo "wrangler stub: unhandled secret args: $*" >&2
    exit 90
    ;;
  *)
    echo "wrangler stub: unhandled args: $*" >&2
    exit 90
    ;;
esac
STUB

chmod +x "$STUBS"/*

# --- helpers -------------------------------------------------------------

CASE=''
STATE=''
API_DIR=''
RC=0
OUT=''

die() {
  echo "FAIL $CASE: $*" >&2
  [ -n "$STATE" ] && [ -f "$STATE/out.log" ] && { echo "--- out.log" >&2; cat "$STATE/out.log" >&2; }
  exit 1
}

# fixture_toml <kv_id> <vars_ok|vars_bad>: writes a wrangler.toml shaped
# like the real api/wrangler.toml, with the given KV id and vars.
fixture_toml() {
  local kv_id=$1 vars=$2 app_origin api_origin github_repo vapid_subject
  if [ "$vars" = vars_ok ]; then
    app_origin='https://app.bower-home.test'
    api_origin='https://api.bower-home.test'
    github_repo='alex/bower-home'
    vapid_subject='mailto:alex@bower-home.test'
  else
    app_origin='https://app.example.com'
    api_origin='https://api.example.com'
    github_repo='OWNER/bower-home'
    vapid_subject='mailto:you@example.com'
  fi
  cat >"$API_DIR/wrangler.toml" <<EOF
name = "bower-api"
main = "src/index.ts"
compatibility_date = "2026-08-22"

[[kv_namespaces]]
binding = "BOWER_KV"
id = "$kv_id"

[vars]
APP_ORIGIN = "$app_origin"
API_ORIGIN = "$api_origin"
APP_VERSION = "0.1.0"
GITHUB_REPO = "$github_repo"
VAPID_SUBJECT = "$vapid_subject"
DAILY_RUN_LIMIT = "20"
DEFAULT_MAX_TURNS = "30"
TEMPLATE_FOLDER_NAME = "Bower"
EOF
}

# run_case <name> <scenario> <kv_id> <vars_ok|vars_bad>: sets up a fresh
# scripts/+api/ pair under $WORK/<name> and runs `deploy-api.sh deploy`
# there, with the stubs first on PATH.
run_case() {
  CASE=$1
  local scenario=$2 kv_id=$3 vars=$4 repo
  STATE="$WORK/$CASE"
  mkdir -p "$STATE"
  repo="$STATE/repo"
  mkdir -p "$repo/scripts" "$repo/api"
  cp "$SCRIPT_SRC" "$repo/scripts/deploy-api.sh"
  chmod +x "$repo/scripts/deploy-api.sh"
  API_DIR="$repo/api"
  fixture_toml "$kv_id" "$vars"
  : >"$STATE/calls.log"
  set +e
  PATH="$STUBS:$PATH" STUB_SCENARIO="$scenario" STUB_STATE="$STATE" \
    bash "$repo/scripts/deploy-api.sh" deploy >"$STATE/out.log" 2>&1
  RC=$?
  set -e
  OUT=$(cat "$STATE/out.log")
}

calls() { cat "$STATE/calls.log" 2>/dev/null || true; }
expect_eq() { [ "$1" = "$2" ] || die "$3: expected [$2], got [$1]"; }
expect_contains() {
  printf '%s' "$OUT" | grep -qiF -- "$2" || die "$1: output does not contain [$2]"
}

# --- scenarios -------------------------------------------------------------

# 1. Not logged in: refuses before touching KV or deploying, exit 1.
run_case not_logged_in not-logged-in KV_NAMESPACE_ID vars_bad
expect_eq "$RC" 1 'exit code'
expect_contains 'login message' 'wrangler login'
expect_eq "$(calls | grep -c '^wrangler ')" 1 'wrangler calls (whoami only)'
echo "ok not logged in"

# 2. Placeholder KV id: the namespace is created and wrangler.toml updated.
run_case kv_placeholder ok KV_NAMESPACE_ID vars_ok
expect_eq "$RC" 0 'exit code'
grep -q 'id = "stub-new-kv-id-000111222"' "$API_DIR/wrangler.toml" ||
  die 'wrangler.toml not updated with the new kv id'
grep -q 'KV_NAMESPACE_ID' "$API_DIR/wrangler.toml" &&
  die 'placeholder kv id still present'
expect_eq "$(calls | grep -c '^wrangler kv namespace create BOWER_KV$')" 1 'kv namespace create calls'
expect_contains 'worker url' 'Worker URL'
echo "ok placeholder KV id creates the namespace"

# 3. Placeholder vars: refuses, never reaches kv or deploy.
run_case vars_placeholder ok stub-existing-kv-id vars_bad
expect_eq "$RC" 1 'exit code'
expect_contains 'placeholder message' 'placeholder'
expect_eq "$(calls | grep -c '^wrangler deploy$')" 0 'deploy calls'
expect_eq "$(calls | grep -c '^wrangler kv ')" 0 'kv calls'
echo "ok placeholder vars refuse to deploy"

# 4. Happy path: logged in, real KV id, real vars -> deploys and prints the URL.
run_case happy ok stub-existing-kv-id vars_ok
expect_eq "$RC" 0 'exit code'
expect_contains 'worker url' 'https://bower-api.stub-subdomain.workers.dev'
expect_eq "$(calls | grep -c '^wrangler deploy$')" 1 'deploy calls'
expect_eq "$(calls | grep -c '^wrangler kv ')" 0 'kv calls (id already set)'
echo "ok happy path deploys and prints the url"
