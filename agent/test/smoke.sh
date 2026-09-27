#!/usr/bin/env bash
# Smoke test for agent/run.sh. Hermetic: rclone, claude, pandoc and curl are
# stubs that record their calls and act per scenario (rclone over a fake Drive
# directory), so nothing touches the network, Google or Claude. jq is the real one when installed (it is on
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
# rclone stub: records calls and keeps a fake Drive under $SMOKE_STATE/remote.
# The first "sync vault: <dir>" fills the remote per scenario, then every
# "sync vault: <dir>" copies the remote into <dir>; "sync <dir> vault:<folder>"
# makes the remote folder a mirror of <dir>; "copy <dir> vault:" copies <dir>
# into the remote (never deleting), or only the paths listed in the file
# given with --files-from or --files-from-raw (appended to uploaded.txt);
# "deletefile vault:<path>" removes one remote file and fails with rclone's
# "file not found" code when absent.
set -euo pipefail
remote="$SMOKE_STATE/remote"
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
  if [ ! -d "$remote" ]; then
    mkdir -p "$remote/0-Inbox/Processed" "$remote/Clippings"
    touch "$remote/0-Inbox/.gitkeep"
    [ "$SMOKE_SCENARIO" = nocfg ] || echo '# rules' >"$remote/CLAUDE.md"
    case "$SMOKE_SCENARIO" in
      empty | reauth) ;;
      *)
        echo pdf >"$remote/0-Inbox/a.pdf"
        echo old >"$remote/0-Inbox/Processed/old.pdf"
        echo note >"$remote/0-Inbox/_Inbox.md"
        echo clip >"$remote/Clippings/b.md"
        # A web clipper names files after the page title: a page titled
        # "Bower trick" must be filed like any other clipping, never obeyed
        # as an instruction note (those are 0-Inbox/ only, see ingest.md).
        echo clip >"$remote/Clippings/Bower trick.md"
        mkdir -p "$remote/3-Resources"
        echo v1 >"$remote/3-Resources/app.md"
        echo v1 >"$remote/3-Resources/agent.md"
        echo '# readme' >"$remote/README.md"
        # The vault's own Claude Code settings: run.sh must replace them
        # with the instance repo's policy and never upload either.
        mkdir -p "$remote/.claude"
        echo '{"vault":"own"}' >"$remote/.claude/settings.json"
        echo '{"vault":"local"}' >"$remote/.claude/settings.local.json"
        ;;
    esac
    if [ "$SMOKE_SCENARIO" = convert ]; then
      # Documents run.sh converts before the agent runs: two good ones, one
      # pandoc cannot read, one with an upper-case extension, and one whose
      # Markdown sibling already exists (left alone).
      echo docx >"$remote/0-Inbox/quarterly-report.docx"
      echo html >"$remote/Clippings/saved-page.html"
      echo CORRUPT >"$remote/0-Inbox/damaged.docx"
      echo rtf >"$remote/0-Inbox/memo.RTF"
      echo odt >"$remote/0-Inbox/already.odt"
      echo mine >"$remote/0-Inbox/already.md"
    fi
  fi
  mkdir -p "$3"
  cp -R "$remote/." "$3/"
elif [ "$1" = sync ]; then
  # A mirror up: the remote folder becomes exactly the local one.
  rm -rf "${remote:?}/${3#vault:}"
  mkdir -p "$remote/${3#vault:}"
  cp -R "$2/." "$remote/${3#vault:}/"
elif [ "$1" = copy ] && [ "$3" = vault: ]; then
  case "${4:-}" in
    --files-from | --files-from-raw)
      while IFS= read -r path; do
        [ -n "$path" ] || continue
        mkdir -p "$(dirname "$remote/$path")"
        cp "$2/$path" "$remote/$path"
        printf '%s\n' "$path" >>"$SMOKE_STATE/uploaded.txt"
      done <"$5"
      ;;
    *) cp -R "$2/." "$remote/" ;;
  esac
elif [ "$1" = deletefile ]; then
  target="$remote/${2#vault:}"
  [ -f "$target" ] || exit 4
  rm "$target"
fi
echo "rclone stub output naming 0-Inbox/a.pdf"
STUB

cat >"$STUBS/pandoc" <<'STUB'
#!/usr/bin/env bash
# pandoc stub: records its arguments, writes a marker Markdown file to the -o
# path, and fails (after writing a partial output) on an input that says
# CORRUPT, as the real one does on a file it cannot read.
set -euo pipefail
printf '%s\n' "$*" >>"$SMOKE_STATE/pandoc-calls.log"
out=''
input=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out=$2; shift 2 ;;
    --) input=$2; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$out" ] && [ -n "$input" ] || { echo 'pandoc stub: expected -o <out> -- <in>' >&2; exit 90; }
if grep -q CORRUPT "$input"; then
  echo partial >"$out"
  echo "PANDOC-MARKER cannot read $input" >&2
  exit 64
fi
echo 'converted by pandoc' >"$out"
STUB

cat >"$STUBS/claude" <<'STUB'
#!/usr/bin/env bash
# claude stub: records its flags and credentials, prints a summary, moves
# the inbox file to Processed/ like the real agent would. Meanwhile a file
# lands in each inbox folder of the fake Drive, as an Add from the app would.
#
# run.sh starts the real claude under env -i, so this stub cannot rely on
# SMOKE_STATE/SMOKE_SCENARIO reaching it as environment variables (that is
# the behaviour under test): it finds its own state through two marker
# files next to it instead, written by run_case() before each scenario.
set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SMOKE_STATE=$(cat "$HERE/../current-state")
SMOKE_SCENARIO=$(cat "$HERE/../current-scenario")
turns='' tools='' denied='' prompt=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -p) prompt=$2; shift 2 ;;
    --max-turns) turns=$2; shift 2 ;;
    --allowedTools) tools=$2; shift 2 ;;
    --disallowedTools) denied=$2; shift 2 ;;
    *) shift ;;
  esac
done
echo "claude max-turns=$turns rulebook=$([ -f CLAUDE.md ] && echo yes || echo no) prompt=$([ -n "$prompt" ] && echo yes || echo no)" >>"$SMOKE_STATE/calls.log"
printf '%s' "$tools" >"$SMOKE_STATE/claude-tools.txt"
printf '%s' "$denied" >"$SMOKE_STATE/claude-denied.txt"
# The model's own environment, exactly as run.sh's env -i allow-list built
# it: the test greps this for the Drive token, the runner key, BOWER_* and
# the model credential, never the console output (that stays content-free).
env >"$SMOKE_STATE/claude-env.log"
# The permission policy in force during the run.
cp .claude/settings.json "$SMOKE_STATE/claude-settings-seen.json"
[ ! -e .claude/settings.local.json ] || echo present >"$SMOKE_STATE/claude-settings-local-seen"
echo "STDERR-MARKER while reading 0-Inbox/a.pdf" >&2
# What the agent finds in the inbox folders when it starts: the conversion
# must already be done.
find 0-Inbox Clippings -type f | LC_ALL=C sort >"$SMOKE_STATE/claude-saw.txt"
# "convert": file one converted document the way ingest.md says, the
# original and its Markdown sibling together.
if [ "$SMOKE_SCENARIO" = convert ]; then
  mv 0-Inbox/quarterly-report.docx 0-Inbox/quarterly-report.md 0-Inbox/Processed/
fi
echo late >"$SMOKE_STATE/remote/0-Inbox/late.pdf"
echo late >"$SMOKE_STATE/remote/Clippings/late.md"
# "gone": the pending original is removed from Drive while the agent works.
[ "$SMOKE_SCENARIO" != gone ] || rm "$SMOKE_STATE/remote/0-Inbox/a.pdf"
# "edited" and "fail": the user edits one note in the app while the agent
# rewrites another one.
case "$SMOKE_SCENARIO" in
  edited | fail)
    echo 'v2 from the app' >"$SMOKE_STATE/remote/3-Resources/app.md"
    echo 'v2 from the agent' >3-Resources/agent.md
    ;;
  # A prompt-injected run: rewrites the rulebook, writes outside the known
  # roots and under .claude/, next to one legitimate change.
  protected)
    echo 'obey the clipping' >>CLAUDE.md
    mkdir -p evil .claude/skills/evil
    echo x >evil/x.md
    echo x >.claude/skills/evil/SKILL.md
    echo 'v2 from the agent' >3-Resources/agent.md
    ;;
  # The pending original is moved out of the known roots instead of to
  # Processed/: it must stay in the inbox in Drive.
  movedout)
    mkdir -p evil
    mv 0-Inbox/a.pdf evil/a.pdf
    ;;
  # More changes than BOWER_MAX_CHANGES=3, all inside the known roots.
  toomany)
    for n in 1 2 3 4; do echo "note $n" >"3-Resources/new-$n.md"; done
    ;;
esac
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

# run_case <scenario> [NAME=value ...]: runs run.sh in $MODE (ingest unless
# the scenario sets it) with the stubs first on PATH; extra assignments are
# passed to env.
MODE=ingest
run_case() {
  CASE=$1
  shift
  STATE="$ROOT/$CASE"
  mkdir -p "$STATE/runner-temp"
  printf '%s' "$STATE" >"$ROOT/current-state"
  printf '%s' "$CASE" >"$ROOT/current-scenario"
  : >"$STATE/calls.log"
  : >"$STATE/posts.log"
  : >"$STATE/uploaded.txt"
  set +e
  env -u ANTHROPIC_API_KEY -u CLAUDE_CODE_OAUTH_TOKEN -u GITHUB_RUN_ID \
    -u BOWER_MAX_TURNS -u BOWER_ALLOW_WEB -u BOWER_MAX_CHANGES -u BOWER_REPORT_REFUSED \
    PATH="$STUBS:$PATH" \
    RUNNER_TEMP="$STATE/runner-temp" \
    BOWER_API_URL="$API_URL" \
    BOWER_API_KEY="$RUNNER_KEY" \
    CLAUDE_CODE_OAUTH_TOKEN='test-oauth-token' \
    SMOKE_SCENARIO="$CASE" SMOKE_STATE="$STATE" \
    SMOKE_RUNNER_KEY="$RUNNER_KEY" SMOKE_DRIVE_TOKEN="$DRIVE_TOKEN" \
    SMOKE_USER_API_KEY="$USER_API_KEY" \
    "$@" bash "$RUN_SH" vault-1 "$MODE" >"$STATE/out.log" 2>&1
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
  for needle in a.pdf b.md "Bower trick" late.pdf late.md 3-Resources app.md agent.md \
    evil x.md README.md .claude SKILL.md new-1.md SUMMARY-MARKER STDERR-MARKER \
    quarterly-report saved-page damaged memo already PANDOC-MARKER \
    "$DRIVE_TOKEN" "$USER_API_KEY" test-oauth-token; do
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

# The claude stub's own environment (env -i's allow-list) must carry none of
# the Drive token, the runner key, folder ids or any RCLONE_CONFIG_*, and
# exactly the expected model credential. want_key/want_oauth are the
# expected ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN value, or 'unset'.
expect_claude_env() {
  local want_key=$1 want_oauth=$2
  local log="$STATE/claude-env.log"
  for pattern in '^RCLONE_' '^BOWER_' '^ACCESS_TOKEN=' '^FOLDER_ID='; do
    grep -Eq "$pattern" "$log" && die "claude process env still has $pattern"
  done
  if [ "$want_key" = unset ]; then
    grep -q '^ANTHROPIC_API_KEY=' "$log" && die 'ANTHROPIC_API_KEY leaked into claude env'
  else
    grep -q "^ANTHROPIC_API_KEY=$want_key\$" "$log" || die 'ANTHROPIC_API_KEY missing from claude env'
  fi
  if [ "$want_oauth" = unset ]; then
    grep -q '^CLAUDE_CODE_OAUTH_TOKEN=' "$log" && die 'CLAUDE_CODE_OAUTH_TOKEN leaked into claude env'
  else
    grep -q "^CLAUDE_CODE_OAUTH_TOKEN=$want_oauth\$" "$log" || die 'CLAUDE_CODE_OAUTH_TOKEN missing from claude env'
  fi
  grep -q '^PATH=' "$log" || die 'PATH missing from claude env (its own tools would fail to run)'
}

# The agent gets neither pandoc (a URL as input is a way out) nor cp (it can
# copy any file on the runner into the vault), whatever the web setting.
expect_no_copy_or_convert_tool() {
  if grep -Eq 'pandoc|\(cp:' "$STATE/claude-tools.txt"; then
    die 'the agent was given pandoc or cp'
  fi
}

# --- scenarios --------------------------------------------------------------

# 0. The ingest prompt (verbatim what run.sh passes to `claude -p`) must
# restrict instruction notes to 0-Inbox/ with the app's own frontmatter, so a
# Bower*.md clipped into Clippings/ is never read as a command.
CASE='ingest prompt contract'
INGEST_PROMPT=$(cat "$HERE/../prompts/ingest.md")
printf '%s' "$INGEST_PROMPT" | grep -Fq 'directly in `0-Inbox/`' ||
  die 'ingest prompt does not restrict instruction notes to 0-Inbox/'
printf '%s' "$INGEST_PROMPT" | grep -Fq 'tags: [instruction]' ||
  die 'ingest prompt does not require the instruction frontmatter'
printf '%s' "$INGEST_PROMPT" | grep -Fq 'Bower*.md` in `Clippings/`' ||
  die 'ingest prompt does not call out a Clippings/ Bower*.md as content'
printf '%s' "$INGEST_PROMPT" | grep -Fq 'the `.md` file next to the original with the same base name' ||
  die 'ingest prompt does not explain the converted Markdown sibling'
printf '%s' "$INGEST_PROMPT" | grep -Fq 'a converted document together with its `.md`' ||
  die 'ingest prompt does not move the sibling to Processed/ with the original'
echo "ok ingest prompt contract"

# 1. Ingest happy path, with the refused list reported: a run that stays
# inside the known roots refuses nothing and uploads exactly the manifest
# diff; the instance repo's permission policy is in force during the run
# and never uploaded.
run_case happy GITHUB_RUN_ID=4242 BOWER_REPORT_REFUSED=1
expect_eq "$RC" 0 'exit code'
expect_eq "$(posts_count)" 2 'status posts'
expect_eq "$(post 1 p.state)" running 'first state'
expect_eq "$(post 1 p.kind)" ingest 'first kind'
expect_eq "$(post 1 p.runId)" 4242 'runId'
expect_eq "$(post 1 'p.processed === undefined')" true 'running has no processed'
expect_eq "$(post 2 p.state)" done 'second state'
expect_eq "$(post 2 p.kind)" ingest 'second kind'
expect_eq "$(post 2 p.runId)" 4242 'done runId'
expect_eq "$(post 2 p.processed)" \
  '["0-Inbox/a.pdf","Clippings/Bower trick.md","Clippings/b.md"]' 'processed'
expect_eq "$(post 2 'p.summary.split("\n").length')" 5 'summary lines'
expect_eq "$(post 2 'p.summary.split("\n")[0]')" 'SUMMARY-MARKER 1 processed a.pdf' 'summary start'
expect_eq "$(post 2 'p.summary.split("\n")[4]')" 'SUMMARY-MARKER 5' 'summary end'
expect_eq "$(post 2 p.refused)" '[]' 'refused'
expect_eq "$(post 1 'p.refused === undefined')" true 'running has no refused'
expect_eq "$(cat "$STATE/uploaded.txt")" '0-Inbox/Processed/a.pdf' 'uploaded files (the manifest diff)'
cmp -s "$STATE/claude-settings-seen.json" "$HERE/../claude-settings.json" ||
  die 'the instance repo policy was not .claude/settings.json during the run'
[ ! -e "$STATE/claude-settings-local-seen" ] || die "the vault's .claude/settings.local.json was left in place"
expect_eq "$(cat "$STATE/remote/.claude/settings.json")" '{"vault":"own"}' "the vault's own settings in Drive"
expect_eq "$(calls curl | grep -c 'auth=ok')" 3 'curl calls with the runner key'
expect_eq "$(calls curl | sed -n 1p)" "curl GET $API_URL/runner/vaults/vault-1 auth=ok" 'vault info request'
expect_eq "$(calls curl | sed -n 2p)" "curl POST $API_URL/runner/vaults/vault-1/status auth=ok" 'status request'
rclone_calls=$(calls rclone)
expect_eq "$(printf '%s\n' "$rclone_calls" | wc -l | tr -d ' ')" 3 'rclone calls'
printf '%s\n' "$rclone_calls" | sed -n 1p | grep -q "^rclone sync vault: .* --exclude \.obsidian/\*\*$" ||
  die 'first rclone call is not the sync down'
printf '%s\n' "$rclone_calls" | sed -n 2p | grep -q '^rclone copy .* vault: --files-from-raw ' ||
  die 'second rclone call is not the changed-only copy up'
grep -q ' 1 files changed$' "$STATE/out.log" || die 'changed count not logged'
expect_eq "$(printf '%s\n' "$rclone_calls" | sed -n 3p)" 'rclone deletefile vault:0-Inbox/a.pdf' 'targeted delete'
remote="$STATE/remote"
[ ! -e "$remote/0-Inbox/a.pdf" ] || die 'processed original still in 0-Inbox/ in Drive'
[ -f "$remote/0-Inbox/Processed/a.pdf" ] || die 'processed original missing from 0-Inbox/Processed/ in Drive'
for f in 0-Inbox/late.pdf Clippings/late.md Clippings/b.md 0-Inbox/_Inbox.md 0-Inbox/Processed/old.pdf; do
  [ -f "$remote/$f" ] || die "a file that was not processed is gone from Drive: $f"
done
# A Bower*.md clipped into Clippings/ (a web clipper naming the file after
# the page title) is filed like any other clipping, not read as an
# instruction: it is listed in `processed` (checked above) but, exactly like
# Clippings/b.md, stays in place rather than being moved away as an
# instruction note would be.
[ -f "$remote/Clippings/Bower trick.md" ] ||
  die 'a Bower-named clipping was treated as an instruction note, not a clipping'
expect_eq "$(calls claude)" 'claude max-turns=30 rulebook=yes prompt=yes' 'claude call'
expect_eq "$(cat "$STATE/claude-tools.txt")" \
  'Read,Write,Edit,MultiEdit,Glob,Grep,LS,Bash(mv:*),Bash(mkdir:*),Bash(ls:*)' \
  'allowed tools (no web by default)'
expect_no_copy_or_convert_tool
[ ! -e "$STATE/pandoc-calls.log" ] || die 'pandoc ran with no document pending'
if grep -q 'convert documents' "$STATE/out.log"; then
  die 'conversion logged with no document pending'
fi
expect_eq "$(cat "$STATE/claude-denied.txt")" \
  'WebSearch,WebFetch,Bash(curl:*),Bash(wget:*)' \
  'disallowed tools (web denied by default)'
expect_eq "$(cat "$STATE/rclone-env.log")" "$(printf '%s\n' TYPE=drive SCOPE=drive ROOT_FOLDER_ID=FOLDER_ID EXPORT_FORMATS=txt)" 'rclone env'
expect_eq "$(node -e '
  const t = JSON.parse(require("fs").readFileSync(0, "utf8"));
  process.stdout.write([t.access_token, t.token_type, t.expiry].join(" "));
' <"$STATE/rclone-token.json")" "$DRIVE_TOKEN Bearer 2030-01-01T00:00:00.000Z" 'rclone token'
grep -q STDERR-MARKER "$STATE/runner-temp/bower-logs/agent.err" || die 'agent stderr not kept in the logs dir'
expect_claude_env unset test-oauth-token
expect_content_free
expect_cleaned_up
echo "ok happy path"

# 2. Empty inbox: only CLAUDE.md (and folder placeholders).
run_case empty
expect_eq "$RC" 0 'exit code'
expect_eq "$(posts_count)" 1 'status posts'
expect_eq "$(post 1 p.state)" done 'state'
expect_eq "$(post 1 p.kind)" ingest 'kind'
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
expect_eq "$(post 2 p.kind)" ingest 'failed kind'
post 2 p.error | grep -q '^agent run' || die 'error does not name the agent run step'
expect_eq "$(post 2 'p.processed === undefined && p.summary === undefined')" true 'failed has no processed or summary'
expect_eq "$(calls rclone | grep -c '^rclone copy ')" 1 'rclone copy calls'
expect_eq "$(calls rclone | grep -c '^rclone sync ')" 1 'rclone sync calls (sync down only)'
expect_eq "$(calls rclone | grep -c '^rclone deletefile ')" 0 'rclone deletefile calls'
[ -f "$STATE/remote/0-Inbox/a.pdf" ] || die 'original left 0-Inbox/ in Drive after a failure'
[ -f "$STATE/remote/0-Inbox/late.pdf" ] || die 'mid-run arrival gone from Drive after a failure'
expect_eq "$(cat "$STATE/remote/3-Resources/app.md")" 'v2 from the app' 'note edited in the app during a failed run'
expect_eq "$(cat "$STATE/remote/3-Resources/agent.md")" 'v2 from the agent' 'note the agent changed before failing'
expect_claude_env unset test-oauth-token
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
expect_claude_env "$USER_API_KEY" unset
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

# 7. A pending original leaves Drive mid-run while the agent moves it
# locally: the delete finds nothing, which counts as done.
run_case gone
expect_eq "$RC" 0 'exit code'
expect_eq "$(posts_count)" 2 'status posts'
expect_eq "$(post 2 p.state)" done 'second state'
expect_eq "$(post 2 p.processed)" \
  '["0-Inbox/a.pdf","Clippings/Bower trick.md","Clippings/b.md"]' 'processed'
expect_eq "$(post 2 'p.summary.split("\n").length')" 5 'summary lines'
expect_eq "$(post 2 'p.summary.split("\n")[0]')" 'SUMMARY-MARKER 1 processed a.pdf' 'summary start'
expect_eq "$(post 2 'p.summary.split("\n")[4]')" 'SUMMARY-MARKER 5' 'summary end'
expect_eq "$(calls rclone | grep -c '^rclone deletefile vault:0-Inbox/a.pdf$')" 1 'rclone deletefile calls'
[ ! -e "$STATE/remote/0-Inbox/a.pdf" ] || die 'original back in 0-Inbox/ in Drive'
[ -f "$STATE/remote/0-Inbox/late.pdf" ] || die 'mid-run arrival gone from Drive'
expect_claude_env unset test-oauth-token
expect_content_free
expect_cleaned_up
echo "ok original removed from Drive mid-run"

# 8. Scheduled lint: every report says kind lint, done carries the summary
# and no processed list, so the API keeps it apart from ingest runs.
MODE=lint
run_case lint GITHUB_RUN_ID=4343
MODE=ingest
expect_eq "$RC" 0 'exit code'
expect_eq "$(posts_count)" 2 'status posts'
expect_eq "$(post 1 p.state)" running 'first state'
expect_eq "$(post 1 p.kind)" lint 'first kind'
expect_eq "$(post 1 p.runId)" 4343 'runId'
expect_eq "$(post 2 p.state)" done 'second state'
expect_eq "$(post 2 p.kind)" lint 'second kind'
expect_eq "$(post 2 'p.processed === undefined')" true 'lint has no processed'
expect_eq "$(post 2 'p.summary.split("\n").length')" 5 'summary lines'
expect_eq "$(calls claude)" 'claude max-turns=30 rulebook=yes prompt=yes' 'claude call'
expect_claude_env unset test-oauth-token
expect_content_free
expect_cleaned_up
echo "ok lint"

# 9. The instance opts in to web access: WebSearch and WebFetch are allowed,
# network commands in Bash stay denied.
run_case web BOWER_ALLOW_WEB=1
expect_eq "$RC" 0 'exit code'
expect_eq "$(cat "$STATE/claude-tools.txt")" \
  'Read,Write,Edit,MultiEdit,Glob,Grep,LS,Bash(mv:*),Bash(mkdir:*),Bash(ls:*),WebSearch,WebFetch' \
  'allowed tools (web opted in)'
expect_no_copy_or_convert_tool
expect_eq "$(cat "$STATE/claude-denied.txt")" 'Bash(curl:*),Bash(wget:*)' 'disallowed tools (web opted in)'
expect_claude_env unset test-oauth-token
expect_content_free
expect_cleaned_up
echo "ok web opt-in"

# 10. A note is edited in the app while the agent rewrites another one: only
# what the agent added or changed is uploaded, so the app's edit survives.
run_case edited
expect_eq "$RC" 0 'exit code'
expect_eq "$(post 2 p.state)" done 'second state'
expect_eq "$(calls rclone | grep -c '^rclone copy .* --files-from-raw ')" 1 'changed-only copy calls'
grep -q ' 2 files changed$' "$STATE/out.log" || die 'changed count not logged'
remote="$STATE/remote"
expect_eq "$(cat "$remote/3-Resources/app.md")" 'v2 from the app' 'note edited in the app during the run'
expect_eq "$(cat "$remote/3-Resources/agent.md")" 'v2 from the agent' 'note the agent changed'
expect_eq "$(sort "$STATE/uploaded.txt" | tr '\n' ' ')" '0-Inbox/Processed/a.pdf 3-Resources/agent.md ' 'uploaded files'
expect_eq "$(post 2 p.refused)" '[]' 'refused is always in the report now (#182), empty when nothing was refused'
[ -f "$remote/0-Inbox/Processed/a.pdf" ] || die 'processed original missing from 0-Inbox/Processed/ in Drive'
[ ! -e "$remote/0-Inbox/a.pdf" ] || die 'processed original still in 0-Inbox/ in Drive'
expect_claude_env unset test-oauth-token
expect_content_free
expect_cleaned_up
echo "ok note edited in the app during a run"

# 11. Documents are converted before the agent runs: each Office, HTML or
# EPUB file pending gets a Markdown sibling, made by pandoc in sandbox mode;
# a file pandoc cannot read does not abort the run and leaves no sibling; a
# document whose sibling already exists is not converted again.
run_case convert
expect_eq "$RC" 0 'exit code'
expect_eq "$(post 2 p.state)" done 'second state'
expect_eq "$(grep -c . "$STATE/pandoc-calls.log")" 4 'pandoc calls'
while IFS= read -r args; do
  case " $args " in
    *' --sandbox '*) ;;
    *) die "pandoc ran without --sandbox: $args" ;;
  esac
  case " $args " in
    *' -t gfm '*) ;;
    *) die "pandoc did not write GitHub Markdown: $args" ;;
  esac
  case "$args" in
    *://*) die "pandoc was given a URL: $args" ;;
  esac
done <"$STATE/pandoc-calls.log"
grep -Fxq -- '--sandbox -f docx -t gfm --wrap=none -o 0-Inbox/quarterly-report.md -- 0-Inbox/quarterly-report.docx' \
  "$STATE/pandoc-calls.log" || die 'docx not converted to its sibling'
grep -Fxq -- '--sandbox -f html -t gfm --wrap=none -o Clippings/saved-page.md -- Clippings/saved-page.html' \
  "$STATE/pandoc-calls.log" || die 'html not converted to its sibling'
grep -Fxq -- '--sandbox -f rtf -t gfm --wrap=none -o 0-Inbox/memo.md -- 0-Inbox/memo.RTF' \
  "$STATE/pandoc-calls.log" || die 'upper-case extension not converted'
if grep -Fq already "$STATE/pandoc-calls.log"; then
  die 'a document with a sibling was converted again'
fi
saw="$STATE/claude-saw.txt"
for f in 0-Inbox/quarterly-report.md Clippings/saved-page.md 0-Inbox/memo.md \
  0-Inbox/quarterly-report.docx 0-Inbox/damaged.docx; do
  grep -Fxq "$f" "$saw" || die "the agent did not find $f when it started"
done
if grep -Fxq 0-Inbox/damaged.md "$saw"; then
  die 'a failed conversion left a sibling'
fi
grep -q ' convert documents: 3 converted, 1 could not be converted$' "$STATE/out.log" ||
  die 'conversion counts not logged'
grep -q PANDOC-MARKER "$STATE/runner-temp/bower-logs/pandoc.log" || die 'pandoc output not kept in the logs dir'
remote="$STATE/remote"
expect_eq "$(cat "$remote/0-Inbox/Processed/quarterly-report.md")" 'converted by pandoc' 'converted sibling filed in Drive'
[ -f "$remote/0-Inbox/Processed/quarterly-report.docx" ] || die 'original not filed with its sibling in Drive'
[ ! -e "$remote/0-Inbox/quarterly-report.docx" ] || die 'filed original still in 0-Inbox/ in Drive'
expect_eq "$(cat "$remote/Clippings/saved-page.md")" 'converted by pandoc' 'converted sibling uploaded to Drive'
[ -f "$remote/0-Inbox/damaged.docx" ] || die 'unconvertible original gone from Drive'
[ ! -e "$remote/0-Inbox/damaged.md" ] || die 'a failed conversion reached Drive'
expect_eq "$(cat "$remote/0-Inbox/already.md")" 'mine' 'existing sibling left alone'
expect_eq "$(post 2 'p.processed.some((f) => f.endsWith("quarterly-report.md") || f.endsWith("saved-page.md"))')" \
  false 'converted siblings are not reported as processed originals'
expect_no_copy_or_convert_tool
expect_claude_env unset test-oauth-token
expect_content_free
expect_cleaned_up
echo "ok documents converted before the run"

# 12. A prompt-injected run rewrites CLAUDE.md and writes evil/x.md (and a
# skill under .claude/): the audit reverts both, uploads neither, lists both
# in `refused`, and still saves the legitimate change. .claude/ is never
# uploaded, so it needs no refused entry.
run_case protected BOWER_REPORT_REFUSED=1
expect_eq "$RC" 0 'exit code'
expect_eq "$(post 2 p.state)" done 'second state'
expect_eq "$(post 2 p.refused)" '["CLAUDE.md","evil/x.md"]' 'refused'
remote="$STATE/remote"
expect_eq "$(cat "$remote/CLAUDE.md")" '# rules' 'rulebook in Drive'
[ ! -e "$remote/evil" ] || die 'a file outside the known roots reached Drive'
[ ! -e "$remote/.claude/skills" ] || die 'a file under .claude/ reached Drive'
expect_eq "$(sort "$STATE/uploaded.txt" | tr '\n' ' ')" '0-Inbox/Processed/a.pdf 3-Resources/agent.md ' 'uploaded files'
expect_eq "$(cat "$remote/3-Resources/agent.md")" 'v2 from the agent' 'accepted change'
grep -q ' 2 changes refused$' "$STATE/out.log" || die 'refused count not logged'
expect_claude_env unset test-oauth-token
expect_content_free
expect_cleaned_up
echo "ok protected paths and unknown roots reverted"

# 13. The pending original is moved out of the known roots: the move is
# refused and the original stays in the inbox in Drive.
run_case movedout BOWER_REPORT_REFUSED=1
expect_eq "$RC" 0 'exit code'
expect_eq "$(post 2 p.refused)" '["evil/a.pdf"]' 'refused'
expect_eq "$(calls rclone | grep -c '^rclone deletefile ')" 0 'rclone deletefile calls'
expect_eq "$(calls rclone | grep -c '^rclone copy ')" 0 'rclone copy calls'
[ -f "$STATE/remote/0-Inbox/a.pdf" ] || die 'original left the inbox in Drive'
[ ! -e "$STATE/remote/evil" ] || die 'a file outside the known roots reached Drive'
grep -q ' 1 originals kept in the inbox$' "$STATE/out.log" || die 'kept count not logged'
expect_content_free
expect_cleaned_up
echo "ok original moved out of the known roots kept"

# 14. More changes than BOWER_MAX_CHANGES: the whole run is reverted, nothing
# is uploaded or deleted, and the report says so.
run_case toomany BOWER_MAX_CHANGES=3 BOWER_REPORT_REFUSED=1
expect_eq "$RC" 0 'exit code'
expect_eq "$(post 2 p.state)" done 'second state'
expect_eq "$(post 2 p.refused)" '["*"]' 'refused'
post 2 p.summary | grep -q '^Refused: too many changes' || die 'summary does not say too many changes'
expect_eq "$(post 2 p.processed)" '[]' 'processed'
expect_eq "$(calls rclone | grep -c '^rclone copy ')" 0 'rclone copy calls'
expect_eq "$(calls rclone | grep -c '^rclone deletefile ')" 0 'rclone deletefile calls'
[ -f "$STATE/remote/0-Inbox/a.pdf" ] || die 'original left the inbox in Drive'
[ ! -e "$STATE/remote/3-Resources/new-1.md" ] || die 'a change reached Drive after a refused run'
expect_content_free
expect_cleaned_up
echo "ok too many changes"
