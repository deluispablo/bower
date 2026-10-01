#!/usr/bin/env bash
# Unit test for run.sh's session stats and summary (R-SS-2): feeds recorded
# stream-json transcripts (fake content, fixtures/stream/) to the functions
# between run.sh's "session stats" markers and checks the exact `agent
# stats:` numbers, that they carry no path and no text from the stream, and
# the summary text taken from the result event. Hermetic: jq is the real one
# when installed, otherwise the Node stand-in (jq-stand-in.js).
#
# Prints "ok <case>" per case and exits non-zero on the first failure.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURES="$HERE/fixtures/stream"
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT

if ! command -v jq >/dev/null 2>&1; then
  mkdir -p "$ROOT/bin"
  cp "$HERE/jq-stand-in.js" "$ROOT/bin/jq.js"
  cat >"$ROOT/bin/jq" <<STUB
#!/usr/bin/env bash
exec node -e "\$(cat '$ROOT/bin/jq.js')" -- "\$@"
STUB
  chmod +x "$ROOT/bin/jq"
  PATH="$ROOT/bin:$PATH"
fi

# The functions under test, exactly as run.sh defines them.
block=$(sed -n '/^# >>> session stats (R-SS-2)/,/^# <<< session stats/p' "$HERE/../run.sh")
[ -n "$block" ] || { echo 'FAIL: no session stats block in run.sh' >&2; exit 1; }
eval "$block"

CASE=''
die() {
  echo "FAIL $CASE: $*" >&2
  exit 1
}
expect_eq() { [ "$1" = "$2" ] || die "$3: expected [$2], got [$1]"; }

# 1. A whole session: the numbers of the result event, each tool_use block
#    counted once by name (a block repeated in a later event, same id, is
#    one call), sorted by name; a name that is not a plain word counts as
#    `other`; a line that is not JSON is skipped.
CASE=session
stats=$(agent_stats "$FIXTURES/session.jsonl")
expect_eq "$stats" \
  'turns=7 api_ms=52345 in=21 out=678 cache_read=89012 cache_write=4567 tools=Bash:1,Edit:1,Grep:1,Read:2,other:1' \
  'stats line'
for needle in / 0-Inbox Offer Alex .pdf .md 'Job hunt' 'Example Corp' index STREAM-TEXT-MARKER \
  STREAM-RESULT-MARKER Processed test-model 00000000 tmp; do
  case "$stats" in
    *"$needle"*) die "stats line carries [$needle]" ;;
  esac
done
summary=$(agent_result_text "$FIXTURES/session.jsonl")
expect_eq "$(tail -n 6 <<<"$summary")" "$(printf '%s\n' 'Processed: 1 files' 'Filed: 1 files' \
  'Created: 0 notes' 'Updated: 1 notes' 'Rules: unchanged' 'Problems: none')" 'summary'
expect_eq "$(head -n 1 <<<"$summary")" 'STREAM-TEXT-MARKER Done.' 'summary start'
echo "ok $CASE"

# 2. A session cut short (a timeout, a crash): no result event, so every
#    number is `-` and there is no summary; the tool calls made still count.
CASE=cut
head -n 4 "$FIXTURES/session.jsonl" >"$ROOT/cut.jsonl"
printf '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_9","name":"Wri' >>"$ROOT/cut.jsonl"
expect_eq "$(agent_stats "$ROOT/cut.jsonl")" \
  'turns=- api_ms=- in=- out=- cache_read=- cache_write=- tools=Grep:1,Read:2' 'stats line'
expect_eq "$(agent_result_text "$ROOT/cut.jsonl")" '' 'summary'
echo "ok $CASE"

# 3. No output at all: all `-`, no summary, no error.
CASE=empty
: >"$ROOT/empty.jsonl"
expect_eq "$(agent_stats "$ROOT/empty.jsonl")" \
  'turns=- api_ms=- in=- out=- cache_read=- cache_write=- tools=-' 'stats line'
expect_eq "$(agent_result_text "$ROOT/empty.jsonl")" '' 'summary'
echo "ok $CASE"

# 4. A result event with values of the wrong type: `-` for each, never the
#    value itself; the last result event wins.
CASE=types
printf '%s\n' \
  '{"type":"result","num_turns":1,"result":"first"}' \
  '{"type":"result","num_turns":"7 turns in 0-Inbox","duration_api_ms":null,"usage":"lots","result":"second"}' \
  >"$ROOT/types.jsonl"
expect_eq "$(agent_stats "$ROOT/types.jsonl")" \
  'turns=- api_ms=- in=- out=- cache_read=- cache_write=- tools=-' 'stats line'
expect_eq "$(agent_result_text "$ROOT/types.jsonl")" 'second' 'summary'
echo "ok $CASE"
