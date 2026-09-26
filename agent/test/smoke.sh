#!/usr/bin/env bash
# Smoke test for agent/run.sh. Hermetic: rclone, claude and curl are stubs
# that record their calls and act per scenario, so nothing touches the
# network, Google or Claude. jq is the real one when installed (it is on
# GitHub's ubuntu runners); otherwise a small Node stand-in covers the three
# filters run.sh uses.
#
# Prints "ok <scenario>" per case and exits non-zero on the first failure.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
RUN_SH="$HERE/../run.sh"
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
STUBS="$ROOT/bin"
mkdir -p "$STUBS"

readonly API_URL='https://api.example.com'
readonly RUNNER_KEY='test-runner-key'
readonly DRIVE_TOKEN='test-drive-token-value'
readonly USER_API_KEY='test-user-api-key-value'

# --- stubs ------------------------------------------------------------------

cat >"$STUBS/curl" <<'STUB'
#!/usr/bin/env bash
# curl stub: GET answers the vault info, POST records the payload.
set -euo pipefail
out='' fmt='' method=GET data='' url='' auth=bad
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out=$2; shift 2 ;;
    -w) fmt=$2; shift 2 ;;
    -X) method=$2; shift 2 ;;
    -H)
      [ "$2" = "Authorization: Bearer $SMOKE_RUNNER_KEY" ] && auth=ok
      shift 2
      ;;
    --data-binary) data=$2; shift 2 ;;
    -*) shift ;;
    *) url=$1; shift ;;
  esac
done
echo "curl $method $url auth=$auth" >>"$SMOKE_STATE/calls.log"
if [ "$method" = POST ]; then
  [ "$data" = '@-' ] || { echo "curl stub: expected --data-binary @-" >&2; exit 90; }
  payload=$(cat)
  printf '%s\n' "$payload" >>"$SMOKE_STATE/posts.log"
  exit 0
fi
code=200
body='{"folderId":"FOLDER_ID","inboxFolderId":"INBOX_ID","driveAccessToken":"'"$SMOKE_DRIVE_TOKEN"'","expiresAt":"2030-01-01T00:00:00.000Z","maxTurns":30}'
case "$SMOKE_SCENARIO" in
  apikey)
    body='{"folderId":"FOLDER_ID","inboxFolderId":"INBOX_ID","driveAccessToken":"'"$SMOKE_DRIVE_TOKEN"'","expiresAt":"2030-01-01T00:00:00.000Z","maxTurns":30,"apiKey":"'"$SMOKE_USER_API_KEY"'"}'
    ;;
  reauth)
    code=409
    body='{"error":{"code":"reauth","message":"Google access was revoked"}}'
    ;;
esac
if [ -n "$out" ]; then printf '%s' "$body" >"$out"; else printf '%s' "$body"; fi
if [ "$fmt" = '%{http_code}' ]; then printf '%s' "$code"; fi
STUB

cat >"$STUBS/rclone" <<'STUB'
#!/usr/bin/env bash
# rclone stub: records calls; "sync vault: <dir>" fills <dir> per scenario.
set -euo pipefail
echo "rclone $*" >>"$SMOKE_STATE/calls.log"
if [ ! -f "$SMOKE_STATE/rclone-env.log" ]; then
  {
    echo "TYPE=${RCLONE_CONFIG_VAULT_TYPE:-}"
    echo "SCOPE=${RCLONE_CONFIG_VAULT_SCOPE:-}"
    echo "ROOT_FOLDER_ID=${RCLONE_CONFIG_VAULT_ROOT_FOLDER_ID:-}"
    echo "EXPORT_FORMATS=${RCLONE_CONFIG_VAULT_EXPORT_FORMATS:-}"
  } >"$SMOKE_STATE/rclone-env.log"
  printf '%s' "${RCLONE_CONFIG_VAULT_TOKEN:-}" >"$SMOKE_STATE/rclone-token.json"
fi
if [ "$1" = sync ] && [ "$2" = vault: ]; then
  dir=$3
  mkdir -p "$dir/0-Inbox/Processed" "$dir/Clippings"
  touch "$dir/0-Inbox/.gitkeep"
  [ "$SMOKE_SCENARIO" = nocfg ] || echo '# rules' >"$dir/CLAUDE.md"
  case "$SMOKE_SCENARIO" in
    empty | reauth) ;;
    *)
      echo pdf >"$dir/0-Inbox/a.pdf"
      echo old >"$dir/0-Inbox/Processed/old.pdf"
      echo note >"$dir/0-Inbox/_Inbox.md"
      echo clip >"$dir/Clippings/b.md"
      ;;
  esac
fi
echo "rclone stub output naming 0-Inbox/a.pdf"
STUB

cat >"$STUBS/claude" <<'STUB'
#!/usr/bin/env bash
# claude stub: records its flags and credentials, prints a summary, moves
# the inbox file to Processed/ like the real agent would.
set -euo pipefail
turns='' tools='' prompt=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -p) prompt=$2; shift 2 ;;
    --max-turns) turns=$2; shift 2 ;;
    --allowedTools) tools=$2; shift 2 ;;
    *) shift ;;
  esac
done
echo "claude max-turns=$turns rulebook=$([ -f CLAUDE.md ] && echo yes || echo no) prompt=$([ -n "$prompt" ] && echo yes || echo no)" >>"$SMOKE_STATE/calls.log"
printf '%s' "$tools" >"$SMOKE_STATE/claude-tools.txt"
echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-unset} CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN:-unset}" >"$SMOKE_STATE/claude-env.log"
echo "STDERR-MARKER while reading 0-Inbox/a.pdf" >&2
if [ "$SMOKE_SCENARIO" = fail ]; then
  exit 1
fi
[ ! -f 0-Inbox/a.pdf ] || mv 0-Inbox/a.pdf 0-Inbox/Processed/
printf '%s\n' 'Working on 0-Inbox/a.pdf' 'Reading Clippings/b.md' \
  'SUMMARY-MARKER 1 processed a.pdf' 'SUMMARY-MARKER 2 processed b.md' \
  'SUMMARY-MARKER 3' 'SUMMARY-MARKER 4' 'SUMMARY-MARKER 5'
STUB

if ! command -v jq >/dev/null 2>&1; then
  cat >"$STUBS/jq.js" <<'STUB'
// Stand-in for jq, covering only the filters run.sh uses:
// '$ARGS.named', '[inputs]' (with -R) and '.[$k] // empty' (with -r).
const fs = require('fs');
const args = process.argv.slice(1);
const named = {};
const flags = new Set();
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--arg') { named[args[i + 1]] = args[i + 2]; i += 2; }
  else if (a === '--argjson') { named[args[i + 1]] = JSON.parse(args[i + 2]); i += 2; }
  else if (/^-[a-zA-Z]+$/.test(a)) { for (const f of a.slice(1)) flags.add(f); }
  else rest.push(a);
}
const [filter, file] = rest;
const input = () => fs.readFileSync(file ?? 0, 'utf8');
if (filter === '$ARGS.named') {
  process.stdout.write(JSON.stringify(named) + '\n');
} else if (filter === '[inputs]' && flags.has('R')) {
  const lines = input().split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  process.stdout.write(JSON.stringify(lines) + '\n');
} else if (filter === '.[$k] // empty' && flags.has('r')) {
  const v = JSON.parse(input())[named.k];
  if (v !== undefined && v !== null && v !== false) {
    process.stdout.write((typeof v === 'string' ? v : JSON.stringify(v)) + '\n');
  }
} else {
  process.stderr.write('jq stand-in: unsupported filter\n');
  process.exit(3);
}
STUB
  cat >"$STUBS/jq" <<STUB
#!/usr/bin/env bash
exec node -e "\$(cat '$STUBS/jq.js')" -- "\$@"
STUB
fi

chmod +x "$STUBS"/*

# --- helpers ----------------------------------------------------------------

CASE=''
STATE=''
RC=0

die() {
  echo "FAIL $CASE: $*" >&2
  if [ -n "$STATE" ]; then
    for f in "$STATE"/calls.log "$STATE"/posts.log "$STATE"/out.log; do
      [ -f "$f" ] && { echo "--- $(basename "$f")" >&2; cat "$f" >&2; }
    done
  fi
  exit 1
}

# run_case <scenario> [NAME=value ...]: runs run.sh for an ingest with the
# stubs first on PATH; extra assignments are passed to env.
run_case() {
  CASE=$1
  shift
  STATE="$ROOT/$CASE"
  mkdir -p "$STATE/runner-temp"
  : >"$STATE/calls.log"
  : >"$STATE/posts.log"
  set +e
  env -u ANTHROPIC_API_KEY -u CLAUDE_CODE_OAUTH_TOKEN -u GITHUB_RUN_ID \
    -u BOWER_MAX_TURNS \
    PATH="$STUBS:$PATH" \
    RUNNER_TEMP="$STATE/runner-temp" \
    BOWER_API_URL="$API_URL" \
    BOWER_API_KEY="$RUNNER_KEY" \
    CLAUDE_CODE_OAUTH_TOKEN='test-oauth-token' \
    SMOKE_SCENARIO="$CASE" SMOKE_STATE="$STATE" \
    SMOKE_RUNNER_KEY="$RUNNER_KEY" SMOKE_DRIVE_TOKEN="$DRIVE_TOKEN" \
    SMOKE_USER_API_KEY="$USER_API_KEY" \
    "$@" bash "$RUN_SH" vault-1 ingest >"$STATE/out.log" 2>&1
  RC=$?
  set -e
}

# post <n> <js expression over p>: evaluates the expression on the n-th
# status payload; strings print raw, anything else as JSON.
post() {
  sed -n "${1}p" "$STATE/posts.log" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const p = JSON.parse(s);
      const v = new Function("p", "return " + process.argv[1])(p);
      process.stdout.write(typeof v === "string" ? v : JSON.stringify(v));
    });' -- "$2"
}

posts_count() { grep -c . "$STATE/posts.log" || true; }
calls() { grep "^$1 " "$STATE/calls.log" || true; }

expect_eq() { [ "$1" = "$2" ] || die "$3: expected [$2], got [$1]"; }

# The script's own output must never carry vault content or credentials.
expect_content_free() {
  for needle in a.pdf b.md SUMMARY-MARKER STDERR-MARKER "$DRIVE_TOKEN" \
    "$USER_API_KEY" test-oauth-token; do
    if grep -qF -- "$needle" "$STATE/out.log"; then
      die "script output contains [$needle]"
    fi
  done
}

# The work dir is removed at exit; only the private logs dir remains.
expect_cleaned_up() {
  local left
  left=$(find "$STATE/runner-temp" -mindepth 1 -maxdepth 1 -name 'bower.*' | wc -l | tr -d ' ')
  expect_eq "$left" 0 'work dirs left behind'
}

# --- scenarios --------------------------------------------------------------

# 1. Ingest happy path.
run_case happy GITHUB_RUN_ID=4242
expect_eq "$RC" 0 'exit code'
expect_eq "$(posts_count)" 2 'status posts'
expect_eq "$(post 1 p.state)" running 'first state'
expect_eq "$(post 1 p.runId)" 4242 'runId'
expect_eq "$(post 1 'p.processed === undefined')" true 'running has no processed'
expect_eq "$(post 2 p.state)" done 'second state'
expect_eq "$(post 2 p.runId)" 4242 'done runId'
expect_eq "$(post 2 p.processed)" '["0-Inbox/a.pdf","Clippings/b.md"]' 'processed'
expect_eq "$(post 2 'p.summary.split("\n").length')" 5 'summary lines'
expect_eq "$(post 2 'p.summary.split("\n")[0]')" 'SUMMARY-MARKER 1 processed a.pdf' 'summary start'
expect_eq "$(post 2 'p.summary.split("\n")[4]')" 'SUMMARY-MARKER 5' 'summary end'
expect_eq "$(calls curl | grep -c 'auth=ok')" 3 'curl calls with the runner key'
expect_eq "$(calls curl | sed -n 1p)" "curl GET $API_URL/runner/vaults/vault-1 auth=ok" 'vault info request'
expect_eq "$(calls curl | sed -n 2p)" "curl POST $API_URL/runner/vaults/vault-1/status auth=ok" 'status request'
rclone_calls=$(calls rclone)
expect_eq "$(printf '%s\n' "$rclone_calls" | wc -l | tr -d ' ')" 4 'rclone calls'
printf '%s\n' "$rclone_calls" | sed -n 1p | grep -q "^rclone sync vault: .* --exclude \.obsidian/\*\*$" ||
  die 'first rclone call is not the sync down'
printf '%s\n' "$rclone_calls" | sed -n 2p | grep -q '^rclone copy .* vault: ' ||
  die 'second rclone call is not the copy up'
printf '%s\n' "$rclone_calls" | sed -n 3p | grep -q '^rclone sync .*/0-Inbox vault:0-Inbox$' ||
  die 'third rclone call is not the 0-Inbox mirror'
printf '%s\n' "$rclone_calls" | sed -n 4p | grep -q '^rclone sync .*/Clippings vault:Clippings$' ||
  die 'fourth rclone call is not the Clippings mirror'
expect_eq "$(calls claude)" 'claude max-turns=30 rulebook=yes prompt=yes' 'claude call'
expect_eq "$(cat "$STATE/claude-tools.txt")" \
  'Read,Write,Edit,MultiEdit,Glob,Grep,LS,WebSearch,WebFetch,Bash(mv:*),Bash(mkdir:*),Bash(ls:*),Bash(cp:*),Bash(pandoc:*)' \
  'allowed tools'
expect_eq "$(cat "$STATE/rclone-env.log")" "$(printf '%s\n' TYPE=drive SCOPE=drive ROOT_FOLDER_ID=FOLDER_ID EXPORT_FORMATS=txt)" 'rclone env'
expect_eq "$(node -e '
  const t = JSON.parse(require("fs").readFileSync(0, "utf8"));
  process.stdout.write([t.access_token, t.token_type, t.expiry].join(" "));
' <"$STATE/rclone-token.json")" "$DRIVE_TOKEN Bearer 2030-01-01T00:00:00.000Z" 'rclone token'
grep -q STDERR-MARKER "$STATE/runner-temp/bower-logs/agent.err" || die 'agent stderr not kept in the logs dir'
expect_content_free
expect_cleaned_up
echo "ok happy path"

# 2. Empty inbox: only CLAUDE.md (and folder placeholders).
run_case empty
expect_eq "$RC" 0 'exit code'
expect_eq "$(posts_count)" 1 'status posts'
expect_eq "$(post 1 p.state)" done 'state'
expect_eq "$(post 1 p.processed)" '[]' 'processed'
post 1 p.runId | grep -Eq '^[0-9a-f]{16}$' || die 'random runId is not 16 hex characters'
expect_eq "$(calls claude)" '' 'claude calls'
expect_eq "$(calls rclone | wc -l | tr -d ' ')" 1 'rclone calls (sync down only)'
expect_content_free
expect_cleaned_up
echo "ok empty inbox"

# 3. The agent fails: copy up only, report failed, exit 2.
run_case fail
expect_eq "$RC" 2 'exit code'
expect_eq "$(posts_count)" 2 'status posts'
expect_eq "$(post 1 p.state)" running 'first state'
expect_eq "$(post 2 p.state)" failed 'second state'
post 2 p.error | grep -q '^agent run' || die 'error does not name the agent run step'
expect_eq "$(post 2 'p.processed === undefined && p.summary === undefined')" true 'failed has no processed or summary'
expect_eq "$(calls rclone | grep -c '^rclone copy ')" 1 'rclone copy calls'
expect_eq "$(calls rclone | grep -c '^rclone sync ')" 1 'rclone sync calls (sync down only)'
expect_content_free
expect_cleaned_up
echo "ok agent failure"

# 4. No CLAUDE.md: not a Bower folder, the agent never runs.
run_case nocfg
expect_eq "$RC" 2 'exit code'
expect_eq "$(posts_count)" 1 'status posts'
expect_eq "$(post 1 p.state)" failed 'state'
post 1 p.error | grep -q 'CLAUDE.md' || die 'error does not mention CLAUDE.md'
expect_eq "$(calls claude)" '' 'claude calls'
expect_eq "$(calls rclone | grep -c '^rclone copy ')" 0 'rclone copy calls'
expect_content_free
expect_cleaned_up
echo "ok missing CLAUDE.md"

# 5. The user's own API key replaces the operator's OAuth token.
run_case apikey
expect_eq "$RC" 0 'exit code'
expect_eq "$(cat "$STATE/claude-env.log")" \
  "ANTHROPIC_API_KEY=$USER_API_KEY CLAUDE_CODE_OAUTH_TOKEN=unset" 'claude credentials'
expect_content_free
expect_cleaned_up
echo "ok user API key"

# 6. Google access revoked (409 reauth): failed, nothing synced.
run_case reauth
expect_eq "$RC" 2 'exit code'
expect_eq "$(posts_count)" 1 'status posts'
expect_eq "$(post 1 p.state)" failed 'state'
post 1 p.error | grep -q '^fetch vault info' || die 'error does not name the fetch step'
expect_eq "$(calls rclone)" '' 'rclone calls'
expect_eq "$(calls claude)" '' 'claude calls'
expect_content_free
expect_cleaned_up
echo "ok reauth"
