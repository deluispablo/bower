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
