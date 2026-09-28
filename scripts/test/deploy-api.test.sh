#!/usr/bin/env bash
# Hermetic test for scripts/deploy-api.sh's `deploy` subcommand. wrangler
# and openssl are stubs on PATH, so nothing reaches Cloudflare's API or a
# real account. Each case copies the real script into a throwaway
# scripts/+api/ pair (deploy-api.sh finds "its" api/ next to itself), so a
# case that writes wrangler.local.toml never touches a real one.
#
# Prints "ok <case>" per case and exits non-zero on the first failure.

set -euo pipefail
# Under pipefail, never pipe into grep -q: it exits at the first match, the
# writer can then die of SIGPIPE and fail the pipeline (#391). Use <<<"$x".

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT_SRC="$HERE/../deploy-api.sh"
TEMPLATE_SRC="$HERE/../../api/wrangler.toml"
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
    if [ "${2:-}" = namespace ] && [ "${3:-}" = list ]; then
      if [ "${STUB_SCENARIO:-}" = kv-exists ]; then
        printf '[\n  {\n    "id": "stub-existing-kv-id-333",\n    "title": "bower-api-BOWER_KV",\n    "supports_url_encoding": true\n  }\n]\n'
      else
        echo '[]'
      fi
      exit 0
    fi
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
  api.bower-home.test (custom domain)
Current Version ID: 00000000-0000-0000-0000-000000000000
EOF
    exit 0
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

# fixture_local <kv_id> <vars_ok|vars_bad>: writes a wrangler.local.toml
# shaped like the one deploy-api.sh generates, with the given KV id and vars.
fixture_local() {
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
  cat >"$API_DIR/wrangler.local.toml" <<EOF
name = "bower-api"
main = "src/index.ts"
compatibility_date = "2026-08-22"
workers_dev = false
routes = [{ pattern = "api.bower-home.test", custom_domain = true }]

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

# run_case <name> <scenario> <kv_id|none> <vars_ok|vars_bad> [stdin file]:
# sets up a fresh scripts/+api/ pair under $WORK/<name> (the real
# api/wrangler.toml, plus a wrangler.local.toml unless kv_id is "none") and
# runs `deploy-api.sh deploy` there, with the stubs first on PATH.
run_case() {
  CASE=$1
  local scenario=$2 kv_id=$3 vars=$4 input=${5:-/dev/null} repo
  STATE="$WORK/$CASE"
  mkdir -p "$STATE"
  repo="$STATE/repo"
  mkdir -p "$repo/scripts" "$repo/api"
  cp "$SCRIPT_SRC" "$repo/scripts/deploy-api.sh"
  chmod +x "$repo/scripts/deploy-api.sh"
  API_DIR="$repo/api"
  cp "$TEMPLATE_SRC" "$API_DIR/wrangler.toml"
  if [ "$kv_id" != none ]; then fixture_local "$kv_id" "$vars"; fi
  : >"$STATE/calls.log"
  set +e
  PATH="$STUBS:$PATH" STUB_SCENARIO="$scenario" STUB_STATE="$STATE" \
    bash "$repo/scripts/deploy-api.sh" deploy <"$input" >"$STATE/out.log" 2>&1
  RC=$?
  set -e
  OUT=$(cat "$STATE/out.log")
}

calls() { cat "$STATE/calls.log" 2>/dev/null || true; }
expect_eq() { [ "$1" = "$2" ] || die "$3: expected [$2], got [$1]"; }
expect_contains() {
  grep -qiF -- "$2" <<<"$OUT" || die "$1: output does not contain [$2]"
}
# Every wrangler call but whoami must read the local config, never the
# tracked wrangler.toml.
expect_local_config_everywhere() {
  local missing
  missing=$(calls | grep '^wrangler ' | grep -v '^wrangler whoami' | grep -v -- '-c wrangler.local.toml$' || true)
  [ -z "$missing" ] || die "wrangler calls without -c wrangler.local.toml: $missing"
}

# --- scenarios -------------------------------------------------------------

# 1. Not logged in: refuses before touching KV or deploying, exit 1.
run_case not_logged_in not-logged-in KV_NAMESPACE_ID vars_bad
expect_eq "$RC" 1 'exit code'
expect_contains 'login message' 'wrangler login'
expect_eq "$(calls | grep -c '^wrangler ')" 1 'wrangler calls (whoami only)'
echo "ok not logged in"

# 2. Placeholder KV id: the namespace is created and wrangler.local.toml
#    updated; the tracked wrangler.toml is left alone.
run_case kv_placeholder ok KV_NAMESPACE_ID vars_ok
expect_eq "$RC" 0 'exit code'
grep -q 'id = "stub-new-kv-id-000111222"' "$API_DIR/wrangler.local.toml" ||
  die 'wrangler.local.toml not updated with the new kv id'
grep -q 'KV_NAMESPACE_ID' "$API_DIR/wrangler.local.toml" &&
  die 'placeholder kv id still present'
cmp -s "$TEMPLATE_SRC" "$API_DIR/wrangler.toml" || die 'wrangler.toml was modified'
expect_eq "$(calls | grep -c '^wrangler kv namespace create BOWER_KV')" 1 'kv namespace create calls'
expect_local_config_everywhere
expect_contains 'worker url' 'Worker deployed: https://api.bower-home.test'
echo "ok placeholder KV id creates the namespace"

# 3. KV namespace already in the account (lost local id): reused, not created.
run_case kv_exists kv-exists KV_NAMESPACE_ID vars_ok
expect_eq "$RC" 0 'exit code'
grep -q 'id = "stub-existing-kv-id-333"' "$API_DIR/wrangler.local.toml" ||
  die 'wrangler.local.toml not updated with the existing kv id'
expect_eq "$(calls | grep -c '^wrangler kv namespace create')" 0 'kv namespace create calls'
echo "ok existing KV namespace is reused"

# 4. Placeholder vars: refuses, never reaches kv or deploy.
run_case vars_placeholder ok stub-existing-kv-id vars_bad
expect_eq "$RC" 1 'exit code'
expect_contains 'placeholder message' 'placeholder'
expect_eq "$(calls | grep -c '^wrangler deploy')" 0 'deploy calls'
expect_eq "$(calls | grep -c '^wrangler kv ')" 0 'kv calls'
echo "ok placeholder vars refuse to deploy"

# 5. Happy path: logged in, real KV id, real vars -> deploys.
run_case happy ok stub-existing-kv-id vars_ok
expect_eq "$RC" 0 'exit code'
expect_contains 'wrangler output' 'api.bower-home.test (custom domain)'
expect_eq "$(calls | grep -c '^wrangler deploy -c wrangler.local.toml$')" 1 'deploy calls'
expect_eq "$(calls | grep -c '^wrangler kv ')" 0 'kv calls (id already set)'
echo "ok happy path deploys"

# 6. No wrangler.local.toml: asks for the values and writes it, with the
#    custom domain at the top level (not under [vars]).
printf '%s\n' 'https://API.bower-home.test/' 'app.bower-home.test' 'alex/bower-home' 'alex@bower-home.test' >"$WORK/answers-local"
run_case creates_local ok none vars_ok "$WORK/answers-local"
expect_eq "$RC" 0 'exit code'
LOCAL="$API_DIR/wrangler.local.toml"
[ -f "$LOCAL" ] || die 'wrangler.local.toml not created'
cmp -s "$TEMPLATE_SRC" "$API_DIR/wrangler.toml" || die 'wrangler.toml was modified'
grep -qx 'APP_ORIGIN = "https://app.bower-home.test"' "$LOCAL" || die 'APP_ORIGIN not set'
grep -qx 'API_ORIGIN = "https://api.bower-home.test"' "$LOCAL" || die 'API_ORIGIN not set'
grep -qx 'GITHUB_REPO = "alex/bower-home"' "$LOCAL" || die 'GITHUB_REPO not set'
grep -qx 'VAPID_SUBJECT = "mailto:alex@bower-home.test"' "$LOCAL" || die 'VAPID_SUBJECT not set'
routes_line=$(grep -n '^routes = \[{ pattern = "api.bower-home.test", custom_domain = true }\]$' "$LOCAL" | cut -d: -f1)
workers_dev_line=$(grep -n '^workers_dev = false$' "$LOCAL" | cut -d: -f1)
first_table_line=$(grep -n '^\[' "$LOCAL" | sed -n 1p | cut -d: -f1)
[ -n "$routes_line" ] && [ -n "$workers_dev_line" ] || die 'routes or workers_dev missing'
[ "$routes_line" -lt "$first_table_line" ] && [ "$workers_dev_line" -lt "$first_table_line" ] ||
  die 'routes and workers_dev must be top-level, before the first table'
grep -q 'stub-new-kv-id-000111222' "$LOCAL" || die 'kv id not written'
expect_local_config_everywhere
echo "ok missing wrangler.local.toml is created from answers"

# 7. No wrangler.local.toml and no answers: refuses, writes nothing.
run_case no_answers ok none vars_ok /dev/null
expect_eq "$RC" 1 'exit code'
[ -f "$API_DIR/wrangler.local.toml" ] && die 'wrangler.local.toml written without answers'
expect_eq "$(calls | grep -c '^wrangler deploy')" 0 'deploy calls'
echo "ok no answers refuses"
