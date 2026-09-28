#!/usr/bin/env bash
# Hermetic test for scripts/deploy.sh and scripts/new-instance.sh.
# wrangler, gh, pnpm and openssl are stateful stubs on PATH: wrangler keeps
# KV namespaces, secrets and Pages projects under $STUB_STATE, gh keeps the
# instance repo as a local bare git repo plus its secrets and variables. So
# nothing reaches Cloudflare, GitHub or the network, and a second run sees
# what the first one created. git and node are the real ones.
#
# Every secret the stubs hand out or the test types in is a known value;
# each run checks that none of them ever shows up in the script's output.
#
# Prints "ok <case>" per case and exits non-zero on the first failure.

set -euo pipefail
# Under pipefail, never pipe into grep -q: it exits at the first match, the
# writer can then die of SIGPIPE and fail the pipeline (#391). Use <<<"$x".

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC=$(cd "$HERE/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

STUBS="$WORK/bin"
mkdir -p "$STUBS"

# Known fake values: typed in by the test or handed out by the stubs.
GENERATED='ZmFrZS1nZW5lcmF0ZWQtc2VjcmV0LXZhbHVlLTAwMDAwMDAwMDA='
VAPID_PUBLIC='stub-vapid-public-value-0000'
VAPID_PRIVATE='stub-vapid-private-value-1111'
CLAUDE_TOKEN='stub-claude-oauth-value-2222'
CLIENT_ID='stub-google-client-id-3333'
CLIENT_SECRET='stub-google-client-secret-4444'
GH_TOKEN_VALUE='stub-github-token-5555'
SECRET_VALUES="$GENERATED $VAPID_PUBLIC $VAPID_PRIVATE $CLAUDE_TOKEN $CLIENT_ID $CLIENT_SECRET $GH_TOKEN_VALUE"

# --- stubs -------------------------------------------------------------

cat >"$STUBS/openssl" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = rand ]; then
  echo 'ZmFrZS1nZW5lcmF0ZWQtc2VjcmV0LXZhbHVlLTAwMDAwMDAwMDA='
  exit 0
fi
echo "openssl stub: unsupported args: $*" >&2
exit 90
STUB

cat >"$STUBS/pnpm" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
echo "pnpm $*" >>"$STUB_STATE/calls.log"
case " $* " in
  *' install '*) exit 0 ;;
  *' gen-vapid '*)
    printf 'VAPID_PUBLIC_KEY=stub-vapid-public-value-0000\nVAPID_PRIVATE_KEY=stub-vapid-private-value-1111\n\nSet them as Worker secrets.\n'
    exit 0
    ;;
  *' vite build '*)
    echo "vite build VITE_API_URL=${VITE_API_URL:-}" >>"$STUB_STATE/calls.log"
    dir=''
    prev=''
    for arg in "$@"; do
      if [ "$prev" = -C ]; then dir=$arg; fi
      prev=$arg
    done
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
mkdir -p "$S/secrets"
touch "$S/kv" "$S/pages"
echo "wrangler $*" >>"$STUB_STATE/calls.log"
case "$1 ${2:-} ${3:-}" in
  'whoami  ' | whoami*)
    if [ "${STUB_SCENARIO:-}" = wrangler-logged-out ]; then
      echo "You are not authenticated. Please run \`wrangler login\`."
      exit 1
    fi
    echo "You are logged in with an OAuth token, associated with the email 'you@example.com'."
    ;;
  'kv namespace list')
    node -e 'const fs=require("fs");const l=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(x=>{const[title,id]=x.split(" ");return{id,title}});console.log(JSON.stringify(l,null,2))' "$S/kv"
    ;;
  'kv namespace create')
    echo "bower-api-BOWER_KV stub-new-kv-id-000111222" >>"$S/kv"
    printf 'Success!\n[[kv_namespaces]]\nbinding = "BOWER_KV"\nid = "stub-new-kv-id-000111222"\n'
    ;;
  deploy*)
    echo "Deployed bower-api triggers"
    echo "  api.bower-home.test (custom domain)"
    touch "$S/worker"
    ;;
  'secret list'*)
    [ -f "$S/worker" ] || { echo "Worker not found" >&2; exit 1; }
    names=$(ls "$S/secrets")
    node -e 'console.log(JSON.stringify(process.argv.slice(1).filter(Boolean).map(name=>({name,type:"secret_text"}))))' $names
    ;;
  'secret put'*)
    value=$(cat)
    if [ -z "$value" ]; then echo "$3" >>"$STUB_STATE/empty-secrets"; fi
    printf '%s' "$value" >"$S/secrets/$3"
    echo "Success! Uploaded secret $3"
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

cat >"$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
S="$STUB_STATE/gh"
mkdir -p "$S/secrets" "$S/vars"
echo "gh $*" >>"$STUB_STATE/calls.log"
case "$1 ${2:-}" in
  'auth status')
    if [ "${STUB_SCENARIO:-}" = gh-logged-out ]; then
      echo "You are not logged into any GitHub hosts. To log in, run: gh auth login" >&2
      exit 1
    fi
    echo "Logged in to github.com account alex"
    ;;
  'repo view')
    [ -d "$S/remote.git" ] || { echo "GraphQL: Could not resolve to a Repository" >&2; exit 1; }
    echo "name: $3"
    ;;
  'repo create')
    git init -q --bare "$S/remote.git"
    git -C "$S/remote.git" symbolic-ref HEAD refs/heads/main
    echo "Created repository $3 on github.com"
    ;;
  'repo clone')
    git clone -q "$S/remote.git" "$4" 2>/dev/null
    ;;
  'secret list')
    ls "$S/secrets"
    ;;
  'secret set')
    value=$(cat)
    printf '%s' "$value" >"$S/secrets/$3"
    echo "Set Actions secret $3"
    ;;
  'variable set')
    body=''
    prev=''
    for arg in "$@"; do
      if [ "$prev" = --body ]; then body=$arg; fi
      prev=$arg
    done
    printf '%s' "$body" >"$S/vars/$3"
    ;;
  *)
    echo "gh stub: unhandled args: $*" >&2
    exit 90
    ;;
esac
STUB

chmod +x "$STUBS"/*

# git: the real one, but blind to this machine's own config.
cat >"$WORK/gitconfig" <<'EOF'
[user]
	name = Alex
	email = you@example.com
[init]
	defaultBranch = main
[core]
	autocrlf = false
[advice]
	detachedHead = false
EOF
export GIT_CONFIG_GLOBAL="$WORK/gitconfig" GIT_CONFIG_NOSYSTEM=1

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
# (scripts, api/wrangler.toml, agent files, an empty app/).
new_state() {
  STATE="$WORK/$1"
  REPO="$STATE/repo"
  mkdir -p "$REPO/scripts" "$REPO/api" "$REPO/app" "$REPO/agent/workflows" "$REPO/agent/prompts"
  cp "$SRC/scripts/deploy.sh" "$SRC/scripts/deploy-api.sh" "$SRC/scripts/new-instance.sh" "$REPO/scripts/"
  cp "$SRC/api/wrangler.toml" "$REPO/api/"
  cp "$SRC/agent/run.sh" "$SRC/agent/claude-settings.json" "$REPO/agent/"
  cp "$SRC"/agent/workflows/*.yml "$REPO/agent/workflows/"
  cp "$SRC"/agent/prompts/*.md "$REPO/agent/prompts/"
}

# run_script <case> <scenario> <script> <stdin file> [args...]: runs one of
# the copied scripts against the current state.
run_script() {
  CASE=$1
  local scenario=$2 script=$3 input=$4
  shift 4
  : >"$STATE/calls.log"
  set +e
  PATH="$STUBS:$PATH" STUB_SCENARIO="$scenario" STUB_STATE="$STATE" \
    bash "$REPO/scripts/$script" "$@" <"$input" >"$STATE/out.log" 2>&1
  RC=$?
  set -e
  OUT=$(cat "$STATE/out.log")
}

calls() { cat "$STATE/calls.log" 2>/dev/null || true; }
count() { calls | grep -c -- "$1" || true; }
expect_eq() { [ "$1" = "$2" ] || die "$3: expected [$2], got [$1]"; }
expect_contains() {
  grep -qF -- "$2" <<<"$OUT" || die "$1: output does not contain [$2]"
}
expect_no_secret_in_output() {
  local value
  for value in $SECRET_VALUES; do
    if grep -qF -- "$value" <<<"$OUT"; then die "a secret value appeared in the output"; fi
  done
}
wrangler_secret() { cat "$STATE/wrangler/secrets/$1" 2>/dev/null || true; }
gh_secret() { cat "$STATE/gh/secrets/$1" 2>/dev/null || true; }

# answers <file> <lines...>: one answer per line, in prompt order.
answers() {
  local file=$1
  shift
  printf '%s\n' "$@" >"$file"
}

# --- prerequisites ---------------------------------------------------------

new_state wrangler_logged_out
run_script wrangler_logged_out wrangler-logged-out deploy.sh /dev/null
expect_eq "$RC" 1 'exit code'
expect_contains 'login message' 'wrangler login'
expect_eq "$(count '^wrangler deploy')" 0 'deploy calls'
expect_eq "$(count '^gh repo')" 0 'gh repo calls'
echo "ok wrangler not logged in stops before anything"

new_state gh_logged_out
run_script gh_logged_out gh-logged-out deploy.sh /dev/null
expect_eq "$RC" 1 'exit code'
expect_contains 'login message' 'gh auth login'
expect_eq "$(count '^wrangler deploy')" 0 'deploy calls'
expect_eq "$(count '^gh repo')" 0 'gh repo calls'
[ -f "$REPO/api/wrangler.local.toml" ] && die 'config written before prerequisites passed'
echo "ok gh not logged in stops before anything"

# --- first run: everything is created ----------------------------------------

new_state account
# Config (4), Claude credential choice + value, then the Worker's prompted
# secrets in order; the first Google client id answer is empty and must be
# refused, not stored.
answers "$WORK/answers-first" \
  api.bower-home.test app.bower-home.test alex/bower-home alex@bower-home.test \
  '' "$CLAUDE_TOKEN" \
  '' "$CLIENT_ID" "$CLIENT_SECRET" "$GH_TOKEN_VALUE"
run_script first_run ok deploy.sh "$WORK/answers-first"
expect_eq "$RC" 0 'exit code'
expect_no_secret_in_output
# Cloudflare
expect_eq "$(count '^wrangler kv namespace create BOWER_KV -c wrangler.local.toml$')" 1 'kv create'
expect_eq "$(count '^wrangler deploy -c wrangler.local.toml$')" 1 'worker deploy'
expect_eq "$(count '^wrangler pages project create bower-app --production-branch main --force$')" 1 'pages project create'
expect_eq "$(count '^wrangler pages deploy app/dist --project-name bower-app --branch main --commit-dirty=true$')" 1 'pages deploy'
expect_eq "$(count '^vite build VITE_API_URL=https://api.bower-home.test$')" 1 'app build with VITE_API_URL'
expect_eq "$(calls | grep '^wrangler ' | grep -v '^wrangler whoami' | grep -v '^wrangler pages ' | grep -vc -- '-c wrangler.local.toml$' || true)" 0 'worker calls without the local config'
# Worker secrets: all nine, the right values, none empty.
for name in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SESSION_SECRET TOKEN_ENC_KEY BOWER_API_KEY GITHUB_TOKEN ADMIN_KEY VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY; do
  [ -n "$(wrangler_secret "$name")" ] || die "Worker secret $name not set"
done
[ -f "$STATE/empty-secrets" ] && die "an empty secret was stored: $(cat "$STATE/empty-secrets")"
expect_eq "$(wrangler_secret GOOGLE_CLIENT_ID)" "$CLIENT_ID" 'GOOGLE_CLIENT_ID value'
expect_eq "$(wrangler_secret GOOGLE_CLIENT_SECRET)" "$CLIENT_SECRET" 'GOOGLE_CLIENT_SECRET value'
expect_eq "$(wrangler_secret GITHUB_TOKEN)" "$GH_TOKEN_VALUE" 'GITHUB_TOKEN value'
expect_eq "$(wrangler_secret VAPID_PUBLIC_KEY)" "$VAPID_PUBLIC" 'VAPID_PUBLIC_KEY value'
expect_eq "$(wrangler_secret VAPID_PRIVATE_KEY)" "$VAPID_PRIVATE" 'VAPID_PRIVATE_KEY value'
expect_eq "$(wrangler_secret SESSION_SECRET)" "$GENERATED" 'SESSION_SECRET value'
# Instance repo
expect_eq "$(count '^gh repo create alex/bower-home --private$')" 1 'repo create'
files=$(git --git-dir="$STATE/gh/remote.git" ls-tree -r --name-only main)
for f in .github/workflows/ingest.yml .github/workflows/lint.yml agent/run.sh agent/claude-settings.json agent/prompts/ingest.md agent/prompts/lint.md; do
  grep -qx "$f" <<<"$files" || die "instance repo lacks $f"
done
expect_eq "$(gh_secret BOWER_API_KEY)" "$(wrangler_secret BOWER_API_KEY)" 'BOWER_API_KEY same in Worker and repo'
expect_eq "$(gh_secret CLAUDE_CODE_OAUTH_TOKEN)" "$CLAUDE_TOKEN" 'Claude token in repo'
expect_eq "$(cat "$STATE/gh/vars/BOWER_API_URL")" 'https://api.bower-home.test' 'BOWER_API_URL'
# ADMIN_KEY kept for the operator, never shown.
grep -qx "ADMIN_KEY=$GENERATED" "$REPO/api/.prod.secrets" || die 'ADMIN_KEY not saved to api/.prod.secrets'
expect_contains 'admin key location' 'api/.prod.secrets'
# What is left to do by hand.
expect_contains 'redirect uri' 'https://api.bower-home.test/auth/callback'
expect_contains 'privacy url' 'https://app.bower-home.test/privacy'
expect_contains 'pages custom domain' 'Custom domains'
expect_contains 'pages custom domain host' 'app.bower-home.test'
expect_contains 'hardening pointer' 'Hardening your instance'
echo "ok first run creates everything"

# --- second run: updates, skips what exists ------------------------------------

run_script second_run ok deploy.sh /dev/null
expect_eq "$RC" 0 'exit code'
expect_no_secret_in_output
expect_eq "$(count '^wrangler kv namespace create')" 0 'kv create'
expect_eq "$(count '^wrangler pages project create')" 0 'pages project create'
expect_eq "$(count '^gh repo create')" 0 'repo create'
expect_eq "$(count '^wrangler secret put')" 0 'secret puts'
expect_eq "$(count '^gh secret set')" 0 'gh secret sets'
expect_eq "$(count '^wrangler deploy -c wrangler.local.toml$')" 1 'worker deploy'
expect_eq "$(count '^wrangler pages deploy ')" 1 'pages deploy'
expect_eq "$(count '^gh variable set BOWER_API_URL')" 1 'variable refreshed'
expect_contains 'skipped secrets' 'already set'
expect_contains 'repo up to date' 'already up to date'
echo "ok second run updates and skips what exists"

# --- rotation ----------------------------------------------------------------

answers "$WORK/answers-rotate" '2' "$CLAUDE_TOKEN" "$CLIENT_ID" "$CLIENT_SECRET" "$GH_TOKEN_VALUE"
run_script rotate ok deploy.sh "$WORK/answers-rotate" --rotate
expect_eq "$RC" 0 'exit code'
expect_no_secret_in_output
expect_eq "$(count '^wrangler secret put')" 9 'secret puts'
expect_eq "$(count '^gh secret set BOWER_API_KEY')" 1 'BOWER_API_KEY to the repo'
expect_eq "$(gh_secret ANTHROPIC_API_KEY)" "$CLAUDE_TOKEN" 'API key choice'
expect_contains 'rotation warning' 'signs everyone out'
echo "ok --rotate sets every secret again"

# --- new-instance.sh on its own ----------------------------------------------

new_state standalone
answers "$WORK/answers-standalone" 'alex/bower-home' 'https://api.bower-home.test' '' "$CLAUDE_TOKEN"
run_script standalone ok new-instance.sh "$WORK/answers-standalone"
expect_eq "$RC" 0 'exit code'
expect_no_secret_in_output
expect_eq "$(count '^gh repo create alex/bower-home --private$')" 1 'repo create'
expect_eq "$(cat "$STATE/gh/vars/BOWER_API_URL")" 'https://api.bower-home.test' 'BOWER_API_URL'
expect_contains 'BOWER_API_KEY hint' 'scripts/deploy.sh sets it'
answers "$WORK/answers-standalone-again" 'api.bower-home.test'
run_script standalone_again ok new-instance.sh "$WORK/answers-standalone-again" alex/bower-home
expect_eq "$RC" 0 'exit code'
expect_eq "$(count '^gh repo create')" 0 'repo create'
expect_eq "$(count '^gh secret set')" 0 'gh secret sets'
expect_contains 'repo up to date' 'already up to date'
expect_contains 'credential skipped' 'already set'
echo "ok new-instance.sh works on its own and reruns cleanly"
