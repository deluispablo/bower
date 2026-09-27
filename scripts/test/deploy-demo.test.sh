#!/usr/bin/env bash
# Hermetic test for scripts/deploy-demo.sh.
# wrangler and pnpm are stateful stubs on PATH: wrangler keeps Pages
# projects under $STUB_STATE, same as scripts/test/deploy.test.sh; pnpm
# fakes `-C app build:demo` by writing a dist/index.html and logging its
# env vars. Nothing reaches Cloudflare or the network.
#
# Prints "ok <case>" per case and exits non-zero on the first failure.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC=$(cd "$HERE/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

STUBS="$WORK/bin"
mkdir -p "$STUBS"

# --- stubs -------------------------------------------------------------

cat >"$STUBS/pnpm" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
echo "pnpm $*" >>"$STUB_STATE/calls.log"
dir=''
prev=''
for arg in "$@"; do
  if [ "$prev" = -C ]; then dir=$arg; fi
  prev=$arg
done
case " $* " in
  *' build:demo '*)
    echo "build:demo VITE_ABOUT_URL=${VITE_ABOUT_URL:-}" >>"$STUB_STATE/calls.log"
    if [ "${STUB_SCENARIO:-}" = no-dist ]; then exit 0; fi
    mkdir -p "$dir/dist"
    echo '<!doctype html>' >"$dir/dist/index.html"
    exit 0
    ;;
esac
echo "pnpm stub: unhandled args: $*" >&2
exit 90
STUB

cat >"$STUBS/wrangler" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
S="$STUB_STATE/wrangler"
mkdir -p "$S"
touch "$S/pages"
echo "wrangler $*" >>"$STUB_STATE/calls.log"
case "$1 ${2:-} ${3:-}" in
  'whoami  ' | whoami*)
    if [ "${STUB_SCENARIO:-}" = wrangler-logged-out ]; then
      echo "You are not authenticated. Please run \`wrangler login\`."
      exit 1
    fi
    echo "You are logged in with an OAuth token, associated with the email 'you@example.com'."
    ;;
  'pages project list')
    printf '| Project Name | Project Domains |\n'
    while read -r p; do printf '| %s | %s.pages.dev |\n' "$p" "$p"; done <"$S/pages"
    ;;
  'pages project create')
    if grep -qx "$4" "$S/pages"; then echo "A project with this name already exists" >&2; exit 1; fi
    echo "$4" >>"$S/pages"
    echo "Successfully created the '$4' project."
    ;;
  'pages deploy '*)
    echo "Deployment complete! Take a peek over at https://0000.stub.pages.dev"
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
REPO=''
RC=0
OUT=''

die() {
  echo "FAIL $CASE: $*" >&2
  [ -n "$STATE" ] && [ -f "$STATE/out.log" ] && { echo "--- out.log" >&2; cat "$STATE/out.log" >&2; }
  exit 1
}

# new_state <name>: a fresh stub account plus a throwaway copy of the repo
# (just the script and an empty app/, which is all this script touches).
new_state() {
  STATE="$WORK/$1"
  REPO="$STATE/repo"
  mkdir -p "$REPO/scripts" "$REPO/app" "$REPO/api"
  cp "$SRC/scripts/deploy-demo.sh" "$REPO/scripts/"
}

# run_script <case> <scenario> <stdin file> [args...]: runs deploy-demo.sh
# against the current state.
run_script() {
  CASE=$1
  local scenario=$2 input=$3
  shift 3
  : >"$STATE/calls.log"
  set +e
  PATH="$STUBS:$PATH" STUB_SCENARIO="$scenario" STUB_STATE="$STATE" VITE_ABOUT_URL="${VITE_ABOUT_URL:-}" \
    bash "$REPO/scripts/deploy-demo.sh" "$@" <"$input" >"$STATE/out.log" 2>&1
  RC=$?
  set -e
  OUT=$(cat "$STATE/out.log")
}

calls() { cat "$STATE/calls.log" 2>/dev/null || true; }
count() { calls | grep -c -- "$1" || true; }
expect_eq() { [ "$1" = "$2" ] || die "$3: expected [$2], got [$1]"; }
expect_contains() {
  printf '%s' "$OUT" | grep -qF -- "$2" || die "$1: output does not contain [$2]"
}

# --- prerequisites ---------------------------------------------------------

new_state wrangler_logged_out
run_script wrangler_logged_out wrangler-logged-out /dev/null
expect_eq "$RC" 1 'exit code'
expect_contains 'login message' 'wrangler login'
expect_eq "$(count 'build:demo')" 0 'no build before login check'
expect_eq "$(count '^wrangler pages')" 0 'no pages calls'
echo "ok wrangler not logged in stops before anything"

# --- first run: default project name --------------------------------------

new_state first
run_script first_run ok /dev/null
expect_eq "$RC" 0 'exit code'
expect_eq "$(count '^pnpm -C app build:demo$')" 1 'build call'
expect_eq "$(count '^wrangler pages project create bower-demo --production-branch main --force$')" 1 'pages project create'
expect_eq "$(count '^wrangler pages deploy app/dist --project-name bower-demo --branch main --commit-dirty=true$')" 1 'pages deploy'
expect_eq "$(count '^wrangler deploy')" 0 'never deploys the Worker'
expect_eq "$(count '^wrangler secret')" 0 'never touches secrets'
expect_eq "$(count '^wrangler kv')" 0 'never touches KV'
expect_contains 'no data message' 'Holds no data'
expect_contains 'demo url' 'https://bower-demo.pages.dev'
echo "ok first run builds, creates the Pages project and deploys"

# --- second run: project already exists ------------------------------------

run_script second_run ok /dev/null
expect_eq "$RC" 0 'exit code'
expect_eq "$(count '^wrangler pages project create')" 0 'project not recreated'
expect_eq "$(count '^wrangler pages deploy ')" 1 'deploy still runs'
expect_contains 'already exists' 'already exists'
echo "ok second run skips project creation and redeploys"

# --- VITE_ABOUT_URL passed through -----------------------------------------

new_state about_url
VITE_ABOUT_URL='https://bower.example/what-is-bower' run_script about_url ok /dev/null
expect_eq "$RC" 0 'exit code'
expect_eq "$(count 'build:demo VITE_ABOUT_URL=https://bower.example/what-is-bower$')" 1 'VITE_ABOUT_URL forwarded to the build'
echo "ok VITE_ABOUT_URL is forwarded to the demo build"

# --- --project NAME ---------------------------------------------------------

new_state custom_project
run_script custom_project ok /dev/null --project bower-demo-staging
expect_eq "$RC" 0 'exit code'
expect_eq "$(count '^wrangler pages project create bower-demo-staging --production-branch main --force$')" 1 'custom project created'
expect_eq "$(count '^wrangler pages deploy app/dist --project-name bower-demo-staging --branch main --commit-dirty=true$')" 1 'custom project deployed'
echo "ok --project overrides the Pages project name"

new_state bad_project
run_script bad_project ok /dev/null --project 'Not_Valid'
expect_eq "$RC" 1 'exit code'
expect_contains 'validation message' 'must be lower-case letters, digits and dashes'
expect_eq "$(count 'build:demo')" 0 'no build on a bad project name'
echo "ok an invalid --project name is rejected before building anything"

# --- build failure -----------------------------------------------------------

new_state no_dist
run_script no_dist no-dist /dev/null
expect_eq "$RC" 1 'exit code'
expect_contains 'build failure message' 'did not produce app/dist/index.html'
expect_eq "$(count '^wrangler pages')" 0 'no deploy attempted after a failed build'
echo "ok a build that produces no dist/index.html stops before deploying"
