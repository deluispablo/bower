#!/usr/bin/env bash
# Unit test for run.sh's bookkeeping after the session (R-SS-9, R-SS-10,
# R-SS-13; #967): runs the functions between run.sh's "bookkeeping" markers
# on the fixture index.md text in fixtures/bookkeeping/ (fake content) and
# on log.md text, and checks the recounted `## Tags` section, the
# `Tag added:` lines and the row check. Hermetic: no network, no claude.
#
# Prints "ok <case>" per case and exits non-zero on the first failure.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURES="$HERE/fixtures/bookkeeping"
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT

# The functions under test, exactly as run.sh defines them.
block=$(sed -n '/^# >>> bookkeeping (R-SS-9/,/^# <<< bookkeeping/p' "$HERE/../run.sh")
[ -n "$block" ] || { echo 'FAIL: no bookkeeping block in run.sh' >&2; exit 1; }
eval "$block"

CASE=''
die() {
  echo "FAIL $CASE: $*" >&2
  exit 1
}
expect_eq() {
  [ "$1" = "$2" ] || die "$3: expected
[$2]
got
[$1]"
}

WORK_DIR="$ROOT/work"
UPLOAD_FILE="$WORK_DIR/upload.txt"
RUN_LOG="$ROOT/run.log"
log() { printf '%s\n' "$*" >>"$RUN_LOG"; }
STAMP='2026-01-15 09:00'

# fresh <index file>: a vault holding that index.md and a log.md whose last
# line has no line break; an empty upload list and run log.
fresh() {
  rm -rf "$ROOT/vault" "$WORK_DIR"
  mkdir -p "$ROOT/vault" "$WORK_DIR"
  cp "$1" "$ROOT/vault/index.md"
  printf '%s\n%s' '# Log' "- 2026-01-10 08:00 · Filed: Lease.pdf → 1-Projects/Flat hunt" >"$ROOT/vault/log.md"
  : >"$UPLOAD_FILE"
  : >"$RUN_LOG"
}

CASE='recount'
expect_eq "$(recount_tags "$FIXTURES/index-after.md")" "$(cat "$FIXTURES/index-expected.md")" \
  'counts from the rows, a missing tag added, an unused tag kept at 0, sorted'
echo "ok $CASE"

CASE='tag added'
fresh "$FIXTURES/index-after.md"
book_tags "$ROOT/vault" "$FIXTURES/index-before.md" "$STAMP"
expect_eq "$(cat "$ROOT/vault/index.md")" "$(cat "$FIXTURES/index-expected.md")" 'index.md rewritten'
expect_eq "$(cat "$ROOT/vault/log.md")" "$(printf '%s\n' '# Log' \
  '- 2026-01-10 08:00 · Filed: Lease.pdf → 1-Projects/Flat hunt' \
  '- 2026-01-15 09:00 · Tag added: #job-offer' '- 2026-01-15 09:00 · Tag added: #salary')" \
  'one Tag added: line per tag not in the section before the run'
expect_eq "$(cat "$UPLOAD_FILE")" "$(printf '%s\n' index.md log.md)" 'both files go up'
expect_eq "$(cat "$RUN_LOG")" 'tags: 5 counted, 2 added' 'counts only in the run log'
# Run again: nothing changes, nothing is logged twice.
: >"$UPLOAD_FILE"
cp "$ROOT/vault/log.md" "$ROOT/log-once.md"
book_tags "$ROOT/vault" "$FIXTURES/index-before.md" "$STAMP"
expect_eq "$(cat "$ROOT/vault/index.md")" "$(cat "$FIXTURES/index-expected.md")" 'second pass: index.md unchanged'
expect_eq "$(cat "$ROOT/vault/log.md")" "$(cat "$ROOT/log-once.md")" 'second pass: no line twice'
expect_eq "$(cat "$UPLOAD_FILE")" '' 'second pass: nothing goes up'
echo "ok $CASE"

CASE='unchanged run'
fresh "$FIXTURES/index-before.md"
book_tags "$ROOT/vault" "$FIXTURES/index-before.md" "$STAMP"
expect_eq "$(cat "$ROOT/vault/index.md")" "$(cat "$FIXTURES/index-before.md")" 'index.md unchanged'
expect_eq "$(tail -n 1 "$ROOT/vault/log.md")" '- 2026-01-10 08:00 · Filed: Lease.pdf → 1-Projects/Flat hunt' \
  'no log line'
expect_eq "$(cat "$UPLOAD_FILE")" '' 'nothing goes up'
expect_eq "$(cat "$RUN_LOG")" 'tags: 3 counted, 0 added' 'counts only'
# Windows line ends, counts right: left as it is.
sed 's/$/\r/' "$FIXTURES/index-before.md" >"$ROOT/index-crlf.md"
fresh "$ROOT/index-crlf.md"
book_tags "$ROOT/vault" "$FIXTURES/index-before.md" "$STAMP"
cmp -s "$ROOT/vault/index.md" "$ROOT/index-crlf.md" || die 'a CRLF index.md with right counts was rewritten'
expect_eq "$(cat "$UPLOAD_FILE")" '' 'CRLF: nothing goes up'
echo "ok $CASE"

CASE='no section'
printf '%s\n' '# Index' '' '## Projects' '- [[a.pdf]] · PDF · #lease · A lease · filed by Bower' >"$ROOT/no-tags.md"
expect_eq "$(recount_tags "$ROOT/no-tags.md")" "$(printf '%s\n' '# Index' '' '## Projects' \
  '- [[a.pdf]] · PDF · #lease · A lease · filed by Bower' '' '## Tags' '- #lease · — · 1')" 'a section is added'
printf '%s\n' '# Index' '' '## Tags' '_(none yet)_' >"$ROOT/empty-tags.md"
expect_eq "$(recount_tags "$ROOT/empty-tags.md")" "$(cat "$ROOT/empty-tags.md")" 'no tag anywhere: unchanged'
printf '%s\n' '# Index' '- [[b.md]] · Note · #home · Home · your note' '' '## Tags' '_(none yet)_' >"$ROOT/placeholder.md"
expect_eq "$(recount_tags "$ROOT/placeholder.md")" "$(printf '%s\n' '# Index' \
  '- [[b.md]] · Note · #home · Home · your note' '' '## Tags' '- #home · — · 1')" 'the placeholder goes'
expect_eq "$(section_tags "$ROOT/missing.md")" '' 'no index before the run: no tags'
echo "ok $CASE"

CASE='row ok'
good=(
  '- [[1-Projects/Job hunt/Offer.pdf]] · PDF · #job-offer #salary · Offer from North Ltd · filed by Bower'
  '- [[1-Projects/Job hunt/Offer.md]] · Note · #job-offer · Text of the offer · filed by Bower · [[1-Projects/Job hunt/Offer.pdf]]'
  '- [[Answers/Which flat.md]] · Note · #a #b #c #d #e · Five tags · Bower wrote it when you asked'
  '- [[x.md]] · Note · #home-2026 · Short · YOURS'
  "- [[y.md]] · Note · #home · $(printf 'é%.0s' $(seq 1 100)) · drive"
  "- [[z.md]] · Note · #home · Windows line end · from your Drive, as Markdown"$'\r'
)
for row in "${good[@]}"; do
  row_ok "$row" || die "a good row was flagged: $row"
done
bad=(
  '- [[a.pdf]] · PDF · filed by Bower'
  '- [[a.pdf]] · PDF · #lease · filed by Bower'
  '- [[a.pdf]] · PDF · #lease · A lease · filed by Bower · not a link'
  '- [[a.pdf]] · PDF · #lease · A lease · filed by Bower · [[b.pdf]] · [[c.pdf]]'
  '- a.pdf · PDF · #lease · A lease · filed by Bower'
  '- [[a.pdf]] ·  · #lease · A lease · filed by Bower'
  '- [[a.pdf]] · PDF ·  · A lease · filed by Bower'
  '- [[a.pdf]] · PDF · #a #b #c #d #e #f · Six tags · filed by Bower'
  '- [[a.pdf]] · PDF · #Lease · Capital letter · filed by Bower'
  '- [[a.pdf]] · PDF · #job_offer · Underscore · filed by Bower'
  '- [[a.pdf]] · PDF · #job- · Trailing hyphen · filed by Bower'
  '- [[a.pdf]] · PDF · lease · No hash · filed by Bower'
  '- [[a.pdf]] · PDF · #lease ·   · filed by Bower'
  "- [[a.pdf]] · PDF · #lease · $(printf 'x%.0s' $(seq 1 101)) · filed by Bower"
  '- [[a.pdf]] · PDF · #lease · See [[b.pdf]] too · filed by Bower'
  '- [[a.pdf]] · PDF · #lease · A lease · by Bower'
)
for row in "${bad[@]}"; do
  ! row_ok "$row" || die "a bad row passed: $row"
done
echo "ok $CASE"

CASE='check rows'
# The fixture session adds three rows (two good, one with a bad tag) and
# leaves the v23 rows alone; a v23 row the agent changed is checked.
expect_eq "$(check_rows "$FIXTURES/index-before.md" "$FIXTURES/index-after.md")" '1 3' 'added rows only'
sed 's#^- \[\[1-Projects/Flat hunt/Lease.pdf\]\] · PDF · filed by Bower$#- [[1-Projects/Flat hunt/Lease.pdf]] · PDF · filed by Bower, moved#' \
  "$FIXTURES/index-before.md" >"$ROOT/v23-changed.md"
expect_eq "$(check_rows "$FIXTURES/index-before.md" "$ROOT/v23-changed.md")" '1 1' 'a changed v23 row is checked'
expect_eq "$(check_rows "$FIXTURES/index-before.md" "$FIXTURES/index-before.md")" '0 0' 'unchanged: nothing checked'
expect_eq "$(check_rows "$ROOT/missing.md" "$FIXTURES/index-before.md")" '2 4' 'no index before: every row'
echo "ok $CASE"

CASE='invalid section tag'
# A section line whose tag is not a valid tag (here one carrying wikilink
# brackets, and one over 64 characters) stays as it is, uncounted, and
# never reaches a `Tag added:` line.
long="#$(printf 'a%.0s' $(seq 1 64))"
printf '%s\n' '# Index' '- [[a.pdf]] · PDF · #lease · A lease · filed by Bower' '' '## Tags' \
  '- #Foo]]bar[[x · Not a tag · 3' "- $long · Too long · 1" >"$ROOT/invalid.md"
expect_eq "$(recount_tags "$ROOT/invalid.md")" "$(printf '%s\n' '# Index' \
  '- [[a.pdf]] · PDF · #lease · A lease · filed by Bower' '' '## Tags' \
  '- #Foo]]bar[[x · Not a tag · 3' "- $long · Too long · 1" '- #lease · — · 1')" \
  'invalid tag lines kept as they are, uncounted (before the first tag line, they stay first)'
expect_eq "$(section_tags "$ROOT/invalid.md")" '' 'no invalid tag is listed'
fresh "$ROOT/invalid.md"
book_tags "$ROOT/vault" /dev/null "$STAMP"
expect_eq "$(grep 'Tag added:' "$ROOT/vault/log.md")" '- 2026-01-15 09:00 · Tag added: #lease' \
  'only the valid tag is logged'
echo "ok $CASE"

CASE='two sections'
printf '%s\n' '# Index' '- [[a.pdf]] · PDF · #lease · A lease · filed by Bower' '' '## Tags' \
  '- #lease · Leases · 1' '' '## Tags' '- #second · Not read · 1' >"$ROOT/two.md"
expect_eq "$(section_tags "$ROOT/two.md")" '#lease' 'only the first section is read'
expect_eq "$(recount_tags "$ROOT/two.md")" "$(cat "$ROOT/two.md")" 'the second section is left alone'
echo "ok $CASE"

CASE='crlf kept'
sed 's/$/\r/' "$FIXTURES/index-after.md" >"$ROOT/after-crlf.md"
fresh "$ROOT/after-crlf.md"
book_tags "$ROOT/vault" "$FIXTURES/index-before.md" "$STAMP"
expect_eq "$(sed 's/$/\r/' "$FIXTURES/index-expected.md" | cmp -s - "$ROOT/vault/index.md" && echo same)" same \
  'a CRLF index.md is written back with CRLF'
echo "ok $CASE"

# --- the run report (#1000) ----------------------------------------------------
# The functions between run.sh's "run report" markers, on a kinds file and
# a moves file as the run writes them (fake paths only). jq is the real
# one when installed, otherwise the Node stand-in.
if ! command -v jq >/dev/null 2>&1; then
  mkdir -p "$ROOT/bin"
  cp "$HERE/jq-stand-in.js" "$ROOT/bin/jq.js"
  printf '#!/usr/bin/env bash\nexec node -e "$(cat %q)" -- "$@"\n' "$ROOT/bin/jq.js" >"$ROOT/bin/jq"
  chmod +x "$ROOT/bin/jq"
  PATH="$ROOT/bin:$PATH"
fi
block=$(sed -n '/^# >>> run report (#1000)/,/^# <<< run report/p' "$HERE/../run.sh")
[ -n "$block" ] || die 'no run report block in run.sh'
eval "$block"
KINDS_FILE="$ROOT/kinds.txt"
SET_ASIDE_FILE="$ROOT/set-aside.txt"
printf '%s\t%s\n' 0-Inbox/a.pdf file 0-Inbox/b.mp4 file 'Clippings/c d.md' file \
  '0-Inbox/Bower - 2026-01-15 0915-00 Context ab.md' context >"$KINDS_FILE"
# Two pending items moved, one renamed; a move of a file that was not
# pending (a note the agent wrote) is not an item.
printf '%s\t%s\n' 0-Inbox/a.pdf 2-Areas/Finance/a.pdf 0-Inbox/b.mp4 '3-Resources/Videos/2026-01-15 b.mp4' \
  3-Resources/Old.md 3-Resources/New.md >"$ROOT/moves.txt"

CASE='to only from a move'
items=$(items_json "$ROOT/moves.txt")
expect_eq "$items" "$(printf '[%s]' "$(paste -sd, - <<'JSON'
{"path":"0-Inbox/a.pdf","kind":"file","to":"2-Areas/Finance/a.pdf"}
{"path":"0-Inbox/b.mp4","kind":"file","to":"3-Resources/Videos/2026-01-15 b.mp4","renamedFrom":"b.mp4"}
{"path":"Clippings/c d.md","kind":"file"}
{"path":"0-Inbox/Bower - 2026-01-15 0915-00 Context ab.md","kind":"context"}
JSON
)")" 'every item, `to` only on the two that moved'
expect_eq "$(items_json "$ROOT/moves.txt" moved | grep -o '"path"' | grep -c .)" 2 'only the moved ones'
expect_eq "$(items_json)" "$(printf '[%s]' "$(paste -sd, - <<'JSON'
{"path":"0-Inbox/a.pdf","kind":"file"}
{"path":"0-Inbox/b.mp4","kind":"file"}
{"path":"Clippings/c d.md","kind":"file"}
{"path":"0-Inbox/Bower - 2026-01-15 0915-00 Context ab.md","kind":"context"}
JSON
)")" 'no moves file: no `to` at all'
echo "ok $CASE"

CASE='moved count'
expect_eq "$(moved_count "$ROOT/moves.txt")" 2 'the pending items that moved, not other moves'
: >"$ROOT/no-moves.txt"
expect_eq "$(moved_count "$ROOT/no-moves.txt")" 0 'nothing moved'
expect_eq "$(moved_count "$ROOT/missing.txt")" 0 'no moves file'
echo "ok $CASE"

CASE='set aside'
printf '%s\t%s\n' kept-not-read 0-Inbox/b.mp4 quarantined '0-Inbox/Bower - x.md' >"$SET_ASIDE_FILE"
expect_eq "$(set_aside_json)" \
  '[{"path":"0-Inbox/b.mp4","reason":"kept-not-read"},{"path":"0-Inbox/Bower - x.md","reason":"quarantined"}]' \
  'each with its reason'
: >"$SET_ASIDE_FILE"
expect_eq "$(set_aside_json)" '[]' 'nothing set aside'
# A kept-not-read item that moved is pruned; one that did not move, and
# any other reason, stay (#1000).
printf '%s\t%s\n' kept-not-read 0-Inbox/b.mp4 kept-not-read 0-Inbox/song.mp3 too-large 0-Inbox/a.pdf \
  quarantined '0-Inbox/Bower - x.md' >"$SET_ASIDE_FILE"
prune_set_aside "$ROOT/moves.txt"
expect_eq "$(set_aside_json)" \
  '[{"path":"0-Inbox/song.mp3","reason":"kept-not-read"},{"path":"0-Inbox/a.pdf","reason":"too-large"},{"path":"0-Inbox/Bower - x.md","reason":"quarantined"}]' \
  'the moved kept-not-read item pruned'
prune_set_aside "$ROOT/missing.txt"
expect_eq "$(grep -c . "$SET_ASIDE_FILE")" 3 'no moves file: nothing pruned'
echo "ok $CASE"

# Every failure tells the app why (#1000): each `fail` call in run.sh names
# a reason the app knows (app/src/run-failure.ts), so none reads "Something
# went wrong" for want of one. A call whose reason is computed must be the
# agent's exit code (agent_failure_reason).
CASE='fail reasons'
calls=$(grep -nE '(^|[^_[:alnum:]])fail "' "$HERE/../run.sh" | grep -vE '^[0-9]+:[[:space:]]*#' || true)
[ -n "$calls" ] || die 'no fail calls found'
bare=$(grep -vE 'fail "[^"]*" (drive_unavailable|timeout|model_unavailable|vault_changed|vault_missing|unknown)([[:space:]]|;|\)|$)' <<<"$calls" |
  grep -vF 'fail "$STEP: exit $agent_rc" "$(agent_failure_reason "$agent_rc")"' || true)
expect_eq "$bare" '' 'fail calls without a known reason'
known=$(sed -n '/^export const RUN_FAILURE_REASONS = \[/,/^\]/p' "$HERE/../../api/src/types.ts" |
  grep -oE "'[a-z_]+'" | tr -d "'" | LC_ALL=C sort | paste -sd ' ' -)
expect_eq "$known" 'drive_unavailable model_unavailable timeout unknown vault_changed vault_missing' \
  'the reasons the Worker accepts'
echo "ok $CASE"
