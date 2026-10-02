#!/usr/bin/env bash
# Unit test for run.sh's filing sheet (#978, rules v25): runs the functions
# between run.sh's "filing sheet" markers on a small fake vault built here
# (fake content only) and checks the parser, each check a line goes
# through, and what a usable sheet writes: the moves in the local copy, the
# hub lines, the index rows, a new folder's hub note and the `## Tags`
# lines. Hermetic: no network, no claude, no rclone.
#
# Prints "ok <case>" per case and exits non-zero on the first failure.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT

# The functions under test, exactly as run.sh defines them.
block=$(sed -n '/^# >>> filing sheet (#978)/,/^# <<< filing sheet/p' "$HERE/../run.sh")
[ -n "$block" ] || { echo 'FAIL: no filing sheet block in run.sh' >&2; exit 1; }
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
yes_() { "$@" || die "refused: $*"; }
no_() { if "$@"; then die "accepted: $*"; fi; }

V="$ROOT/vault"
PENDING="$ROOT/pending.txt"
BEFORE="$ROOT/manifest-before.txt"
DAY=2026-01-15
T=$'\t'

# fresh: a vault with an inbox, a clipping, an existing project with its
# hub note, an existing area folder with no hub note, a note filed before
# the run, and an index; the pending list and the manifest before the run.
fresh() {
  rm -rf "$V"
  mkdir -p "$V/0-Inbox/Processed" "$V/Clippings" "$V/1-Projects/Flat hunt" "$V/2-Areas/Finance" \
    "$V/3-Resources" "$V/.bower" "$V/Answers"
  echo pdf >"$V/0-Inbox/scan0001.pdf"
  echo photo >"$V/0-Inbox/receipt.jpg"
  echo docx >"$V/0-Inbox/offer.docx"
  echo 'offer text' >"$V/0-Inbox/offer.md"
  echo clip >"$V/Clippings/page.md"
  echo old >"$V/0-Inbox/Processed/old.pdf"
  echo 'not pending' >"$V/0-Inbox/later.pdf"
  printf -- '---\ntags: [hub, project]\nby: bower\n---\n\n# Flat hunt\n\n## Notes & documents\n- [[Lease.pdf]] The lease\n\nMore text.\n' \
    >"$V/1-Projects/Flat hunt/Flat hunt.md"
  echo lease >"$V/1-Projects/Flat hunt/Lease.pdf"
  echo 'kept as it was' >"$V/3-Resources/Old.md"
  echo 'twin' >"$V/2-Areas/Finance/twin.md"
  printf -- '%s\n' '# Index' '' '## Projects' \
    '- [[1-Projects/Flat hunt/Lease.pdf]] · PDF · #flat · The lease · filed by Bower' '' \
    '## Areas' '_(none yet)_' '' '## Resources' '_(none yet)_' '' '## Tags' \
    '- #flat · Flat hunt papers · 1' >"$V/index.md"
  printf '%s\n' 0-Inbox/scan0001.pdf 0-Inbox/receipt.jpg 0-Inbox/offer.docx Clippings/page.md >"$PENDING"
  (cd "$V" && find . -type f -exec cksum {} + | sed 's|^\([0-9]* [0-9]*\) \./|\1 |' | LC_ALL=C sort) >"$BEFORE"
}

# --- paths, names and fields ---------------------------------------------------
CASE='paths'
yes_ sheet_path_ok '1-Projects/Flat hunt'
yes_ sheet_path_ok '1-Projects/Flat hunt/Arlington Road, listing.pdf'
for bad in '' '../x' '1-Projects/../../etc' '1-Projects/./x' '/etc/passwd' 'C:/x' 'c:x' \
  '1-Projects\x' '1-Projects//x' '1-Projects/' '.claude/settings.json' '.obsidian/app.json' \
  '.bower/filing.tsv' '1-Projects/.hidden' 'CLAUDE.md' '1-Projects/a/claude.MD' \
  '1-Projects/a[1]' '1-Projects/a|b' '1-Projects/a#b' '1-Projects/a^b' '1-Projects/a · b' \
  '1-Projects/ x' '1-Projects/x ' '1-Projects/x.' "1-Projects/a${T}b" $'1-Projects/a\nb'; do
  no_ sheet_path_ok "$bad"
done
# A pending path as the runner listed it may hold link characters; never a traversal.
yes_ sheet_path_ok '0-Inbox/Invoice #12 [copy].pdf' pending
no_ sheet_path_ok '0-Inbox/../CLAUDE.md' pending
no_ sheet_path_ok '.claude/x' pending
echo "ok $CASE"

CASE='names'
yes_ sheet_name_ok 'Arlington Road, listing.pdf' scan0001.pdf
yes_ sheet_name_ok 'Receipt.JPG' receipt.jpg
yes_ sheet_name_ok "$(printf 'a%.0s' {1..56}).pdf" scan.pdf
no_ sheet_name_ok "$(printf 'a%.0s' {1..57}).pdf" scan.pdf
# A changed name over 60 characters is shortened instead (#995).
yes_ sheet_name_long "$(printf 'a%.0s' {1..57}).pdf" scan.pdf
no_ sheet_name_long "$(printf 'a%.0s' {1..56}).pdf" scan.pdf
no_ sheet_name_long "$(printf 'a%.0s' {1..57}).pdf" "$(printf 'a%.0s' {1..57}).pdf"
no_ sheet_name_long "$(printf 'a%.0s' {1..57}).docx" scan.pdf
no_ sheet_name_long "$(printf 'a%.0s' {1..57}) [1].pdf" scan.pdf
no_ sheet_name_ok 'listing.docx' scan0001.pdf
no_ sheet_name_ok 'listing' scan0001.pdf
no_ sheet_name_ok 'sub/listing.pdf' scan0001.pdf
no_ sheet_name_ok 'sub\listing.pdf' scan0001.pdf
no_ sheet_name_ok 'CLAUDE.md' page.md
no_ sheet_name_ok '../listing.pdf' scan0001.pdf
echo "ok $CASE"

CASE='tags and text'
yes_ sheet_tags_ok '#rental-listing #flat-hunt'
yes_ sheet_tags_ok '#a #b #c #d #e'
no_ sheet_tags_ok '#a #b #c #d #e #f'
no_ sheet_tags_ok ''
no_ sheet_tags_ok '-'
no_ sheet_tags_ok '#Flat'
no_ sheet_tags_ok 'flat'
no_ sheet_tags_ok '#flat_hunt'
no_ sheet_tags_ok '#flat--hunt'
no_ sheet_tags_ok '#$(touch x)'
yes_ sheet_text_ok 'Listing for a two-bed flat' 100
yes_ sheet_text_ok "$(printf 'é%.0s' {1..100})" 100
no_ sheet_text_ok "$(printf 'a%.0s' {1..101})" 100
no_ sheet_text_ok "$(printf 'a%.0s' {1..81})" 80
no_ sheet_text_ok 'a · b' 100
no_ sheet_text_ok 'see [[Lease]]' 100
no_ sheet_text_ok '-' 100
no_ sheet_text_ok '' 100
echo "ok $CASE"

CASE='types'
for pair in 'a.md Note' 'a.PDF PDF' 'a.jpg Photo' 'a.heic Photo' 'a.gif Image' 'a.xlsx Spreadsheet' \
  'a.csv Spreadsheet' 'a.docx Document' 'a.txt Document' 'a.mp3 Audio' 'a.mov Video' 'a.zip File' 'a File'; do
  expect_eq "$(sheet_type_of "${pair% *}")" "${pair#* }" "type of ${pair% *}"
done
echo "ok $CASE"

CASE='split'
sheet_split "file${T}0-Inbox/a.pdf${T} 1-Projects/X ${T}${T}#a${T}desc"$'\r'
expect_eq "${#SHEET_FIELDS[@]}" 6 'an empty field is kept'
expect_eq "${SHEET_FIELDS[2]}|${SHEET_FIELDS[3]}|${SHEET_FIELDS[5]}" '1-Projects/X||desc' 'fields trimmed, CR dropped'
echo "ok $CASE"

CASE='destinations'
fresh
expect_eq "$(sheet_dest_kind "$V" '1-Projects/Flat hunt')" existing 'an existing folder'
expect_eq "$(sheet_dest_kind "$V" '1-Projects/Job hunt')" new 'a new direct subfolder'
expect_eq "$(sheet_dest_kind "$V" 0-Inbox/Processed)" processed 'Processed'
for bad in 1-Projects 3-Resources '1-Projects/Job hunt/Offers' 0-Inbox 0-Inbox/Quarantine Answers \
  Clippings '5-Other/x' '1-Projects/../0-Inbox' '.bower' "1-Projects/$(printf 'a%.0s' {1..61})"; do
  no_ sheet_dest_kind "$V" "$bad"
done
echo "ok $CASE"

# --- file lines ------------------------------------------------------------------
CASE='file line refused'
fresh
file_line() { sheet_file_line "$V" "$PENDING" "$BEFORE" "$DAY" "$@"; }
refused() {
  local rc=0
  file_line "$@" || rc=$?
  expect_eq "$rc" 1 "refused line ($*)"
}
refused 0-Inbox/later.pdf '1-Projects/Flat hunt' later.pdf '#flat' 'Not pending'
refused 0-Inbox/gone.pdf '1-Projects/Flat hunt' gone.pdf '#flat' 'Not there'
refused ../escape.pdf '1-Projects/Flat hunt' escape.pdf '#flat' 'Traversal'
refused 0-Inbox/scan0001.pdf '../../outside' scan0001.pdf '#flat' 'Traversal out'
refused 0-Inbox/scan0001.pdf '1-Projects/../../outside' scan0001.pdf '#flat' 'Traversal through'
refused 0-Inbox/scan0001.pdf '/tmp' scan0001.pdf '#flat' 'Absolute'
refused 0-Inbox/scan0001.pdf '.claude' scan0001.pdf '#flat' 'Protected'
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' '../../scan.pdf' '#flat' 'Name traversal'
refused Clippings/page.md '1-Projects/Flat hunt' CLAUDE.md '#flat' 'Rulebook name'
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' Lease.pdf '#flat' 'Overwrite'
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' "$(printf 'a%.0s' {1..57}).docx" '#flat' 'Long name, other extension'
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' "$(printf 'a%.0s' {1..57})/x.pdf" '#flat' 'Long name, two segments'
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' 'Listing.docx' '#flat' 'Changed extension'
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' 'Listing.pdf' '#Flat' 'Bad tag'
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' 'Listing.pdf' '#flat' 'Bad · description'
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' 'Listing.pdf' '-' '-'
refused 0-Inbox/scan0001.pdf 0-Inbox/Processed scan0001.pdf '#flat' 'Tags for Processed'
refused 0-Inbox/scan0001.pdf 0-Inbox/Processed old.pdf - -
refused 0-Inbox/scan0001.pdf 1-Projects scan0001.pdf '#flat' 'A PARA folder itself'
[ -f "$V/0-Inbox/scan0001.pdf" ] && [ -f "$V/Clippings/page.md" ] || die 'a refused line moved a file'
[ ! -e "$ROOT/escape.pdf" ] && [ ! -e "$ROOT/outside" ] && [ ! -e "$ROOT/scan.pdf" ] || die 'a file left the vault'
expect_eq "$(cat "$V/1-Projects/Flat hunt/Lease.pdf")" lease 'the existing file is untouched'
echo "ok $CASE"

CASE='file line filed'
file_line 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' 'Arlington Road, listing.pdf' '#rental-listing  #flat' \
  'Listing for a two-bed flat on Arlington Road'
[ -f "$V/1-Projects/Flat hunt/Arlington Road, listing.pdf" ] && [ ! -e "$V/0-Inbox/scan0001.pdf" ] ||
  die 'not moved in the local copy'
expect_eq "$(sed -n '/^## Notes & documents$/,$p' "$V/1-Projects/Flat hunt/Flat hunt.md")" "$(printf '%s\n' \
  '## Notes & documents' '- [[Lease.pdf]] The lease' \
  '- [[Arlington Road, listing.pdf]] Listing for a two-bed flat on Arlington Road' '' 'More text.')" \
  'the hub line under the list'
expect_eq "$(sed -n '/^## Projects$/,/^$/p' "$V/index.md")" "$(printf '%s\n' '## Projects' \
  '- [[1-Projects/Flat hunt/Lease.pdf]] · PDF · #flat · The lease · filed by Bower' \
  '- [[1-Projects/Flat hunt/Arlington Road, listing.pdf]] · PDF · #rental-listing #flat · Listing for a two-bed flat on Arlington Road · filed by Bower' '')" \
  'the v24 row under the section'
echo "ok $CASE"

CASE='new folder'
file_line 0-Inbox/receipt.jpg '2-Areas/Car' 'Garage receipt.jpg' '#car' 'Receipt for the garage'
expect_eq "$(cat "$V/2-Areas/Car/Car.md")" "$(printf '%s\n' '---' 'tags: [hub, area, car]' 'by: bower' \
  "created: $DAY" '---' '' '# Car' '' '## Notes & documents' '- [[Garage receipt.jpg]] Receipt for the garage')" \
  'the new hub note'
expect_eq "$(sed -n '/^## Areas$/,/^$/p' "$V/index.md")" "$(printf '%s\n' '## Areas' \
  '- [[2-Areas/Car/Garage receipt.jpg]] · Photo · #car · Receipt for the garage · filed by Bower' '')" \
  'the row, the placeholder dropped'
# An existing folder with no hub note gets none.
file_line 0-Inbox/offer.docx 2-Areas/Finance 'Offer letter.docx' '#job-offer' 'Offer from North Ltd'
[ ! -e "$V/2-Areas/Finance/Finance.md" ] || die 'a hub note for a folder that had files'
echo "ok $CASE"

CASE='processed'
file_line Clippings/page.md 0-Inbox/Processed page.md - -
[ -f "$V/0-Inbox/Processed/page.md" ] || die 'not moved to Processed'
if grep -q 'page.md' "$V/index.md"; then die 'a row for Processed'; fi
echo "ok $CASE"

# --- long names (#995) ---------------------------------------------------------------
LONG90='Example Corp is hiring a data analyst in Leeds, for a hybrid role, apply by 17 October.pdf'
CASE='kept long names'
expect_eq "$(sheet_chars "$LONG90")" 90 'the long name'
yes_ sheet_name_ok "$LONG90" "$LONG90"
long200="$(printf 'a%.0s' {1..196}).pdf"
long250="$(printf 'a%.0s' {1..246}).pdf"
yes_ sheet_name_ok "$long200" "$long200"
no_ sheet_name_ok "$long250" "$long250"
no_ sheet_name_ok "Job ad, $LONG90" "$LONG90"
# Kept, but still a safe single segment.
no_ sheet_name_ok 'Invoice #12.pdf' 'Invoice #12.pdf'
no_ sheet_name_ok 'a/b.pdf' 'a/b.pdf'
fresh
echo ad >"$V/0-Inbox/$LONG90"
printf '%s\n' "0-Inbox/$LONG90" >>"$PENDING"
printf 'file\t0-Inbox/%s\t1-Projects/Job hunt\t%s\t#job-ad\tA data analyst role in Leeds\n' "$LONG90" "$LONG90" \
  >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_FILED $SHEET_SKIPPED" '1 0' 'the kept long name is filed'
[ -f "$V/1-Projects/Job hunt/$LONG90" ] && [ ! -e "$V/0-Inbox/$LONG90" ] || die 'the kept long name not moved'
grep -qF -- "- [[1-Projects/Job hunt/$LONG90]] · PDF · #job-ad · A data analyst role in Leeds · filed by Bower" \
  "$V/index.md" || die 'no row for the kept long name'
echo "ok $CASE"

CASE='shortened names'
SHORT='Example Corp is hiring a data analyst in Leeds, for a.pdf'
SHORT_STEM='Example Corp is hiring a data analyst in Leeds, for'
SHORT2="$SHORT_STEM (2).pdf"
expect_eq "$(sheet_name_short "$LONG90" "$ROOT/none")" "$SHORT" 'cut at the last word that fits'
expect_eq "$(sheet_chars "$SHORT2")" 59 'the second name'
# Trailing punctuation trimmed, a first word that does not fit cut by characters.
expect_eq "$(sheet_name_short "$(printf 'a%.0s' {1..50}), bbbbbbbbbb.pdf" "$ROOT/none")" \
  "$(printf 'a%.0s' {1..50}).pdf" 'the comma trimmed'
expect_eq "$(sheet_name_short "$(printf 'é%.0s' {1..70}).pdf" "$ROOT/none")" "$(printf 'é%.0s' {1..56}).pdf" \
  'a long word cut by characters'
expect_eq "$(sheet_name_short "$(printf 'word %.0s' {1..20})end" "$ROOT/none")" \
  "$(printf 'word %.0s' {1..11})word" 'no extension'
fresh
echo ad1 >"$V/0-Inbox/scan0002.pdf"
echo ad2 >"$V/0-Inbox/scan0003.pdf"
echo ad3 >"$V/0-Inbox/scan0004.pdf"
printf '%s\n' 0-Inbox/scan0002.pdf 0-Inbox/scan0003.pdf 0-Inbox/scan0004.pdf >>"$PENDING"
# The note Bower wrote for the first ad, with links to the name it chose.
printf -- '---\nby: bower\n---\nSee [[%s]] and [[%s|the ad]].\nAlso [[Lease]].\n' "${LONG90%.pdf}" "$LONG90" \
  >"$V/1-Projects/Flat hunt/Job ad summary.md"
{
  printf 'file\t0-Inbox/scan0002.pdf\t1-Projects/Flat hunt\t%s\t#job-ad\tThe first ad\n' "$LONG90"
  printf 'file\t0-Inbox/scan0003.pdf\t1-Projects/Flat hunt\t%s\t#job-ad\tThe second ad\n' "${LONG90/role/job}"
  # The same long name again for this folder: refused, its links go to the first.
  printf 'file\t0-Inbox/scan0004.pdf\t1-Projects/Flat hunt\t%s\t#job-ad\tThe third ad\n' "$LONG90"
  printf 'note\t1-Projects/Flat hunt/Job ad summary.md\t1-Projects/Flat hunt/%s\t#job-ad\tSummary of the ad\n' "$LONG90"
} >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_FILED $SHEET_NOTES $SHEET_SKIPPED" '2 1 1' 'shortened, the repeated long name skipped'
expect_eq "$(cat "$V/1-Projects/Flat hunt/$SHORT")" ad1 'the first ad under the short name'
expect_eq "$(cat "$V/1-Projects/Flat hunt/$SHORT2")" ad2 'the second ad with (2)'
[ -f "$V/0-Inbox/scan0004.pdf" ] || die 'a repeated long name was filed'
expect_eq "$SHEET_SKIP_REASONS" '1 name' 'the repeated long name is a name'
[ ! -e "$V/1-Projects/Flat hunt/$LONG90" ] || die 'filed under the long name'
grep -qF -- "- [[$SHORT]] The first ad" "$V/1-Projects/Flat hunt/Flat hunt.md" || die 'the hub line'
grep -qF -- "- [[1-Projects/Flat hunt/$SHORT2]] · PDF · #job-ad · The second ad · filed by Bower" "$V/index.md" ||
  die 'the row of the second ad'
grep -qF -- "- [[1-Projects/Flat hunt/Job ad summary.md]] · Note · #job-ad · Summary of the ad · filed by Bower · [[1-Projects/Flat hunt/$SHORT]]" \
  "$V/index.md" || die 'the note row points to the short name'
expect_eq "$(sed -n '4,5p' "$V/1-Projects/Flat hunt/Job ad summary.md")" \
  "$(printf 'See [[%s]] and [[%s|the ad]].\nAlso [[Lease]].' "${SHORT%.pdf}" "$SHORT")" 'the links follow the rename'
if grep -qF -- "$LONG90" "$V/index.md"; then die 'the long name in index.md'; fi
# A file already there under the agent's long name: refused as name before
# any shortening, and a note linking that name keeps its link.
fresh
echo old >"$V/1-Projects/Flat hunt/$LONG90"
printf -- '---\nby: bower\n---\nSee [[%s]].\n' "${LONG90%.pdf}" >"$V/1-Projects/Flat hunt/Old ad.md"
{
  printf 'file\t0-Inbox/scan0001.pdf\t1-Projects/Flat hunt\t%s\t#job-ad\tA new ad\n' "$LONG90"
  printf 'note\t1-Projects/Flat hunt/Old ad.md\t1-Projects/Flat hunt/%s\t#job-ad\tThe old ad\n' "$LONG90"
} >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_FILED $SHEET_NOTES $SHEET_SKIP_REASONS" '0 1 1 name' 'refused as name, the note booked'
[ -f "$V/0-Inbox/scan0001.pdf" ] && [ ! -e "$V/1-Projects/Flat hunt/$SHORT" ] || die 'shortened past an existing file'
grep -qF -- "See [[${LONG90%.pdf}]]." "$V/1-Projects/Flat hunt/Old ad.md" || die 'a link to the existing file changed'
grep -qF -- "· [[1-Projects/Flat hunt/$LONG90]]" "$V/index.md" || die 'the note row lost the existing original'
echo "ok $CASE"

CASE='repeated long names'
# Suffixes stop at (9).
fresh
mkdir -p "$ROOT/full"
: >"$ROOT/full/$SHORT"
for n in 2 3 4 5 6 7 8; do : >"$ROOT/full/$SHORT_STEM ($n).pdf"; done
expect_eq "$(sheet_name_short "$LONG90" "$ROOT/full")" "$SHORT_STEM (9).pdf" 'the last suffix'
: >"$ROOT/full/$SHORT_STEM (9).pdf"
no_ sheet_name_short "$LONG90" "$ROOT/full"
# A repeated long-name line is shortened at most once: each attempt is
# counted through a wrapper around sheet_name_short.
eval "real_$(declare -f sheet_name_short)"
sheet_name_short() {
  echo try >>"$ROOT/short-tries"
  real_sheet_name_short "$@"
}
# Every candidate taken, the line 50 times: tried once, nothing filed, and
# far from the job's time limit (the bound is loose for slow test machines;
# most of the time is the checks every line goes through).
fresh
: >"$ROOT/short-tries"
for f in "$ROOT"/full/*; do : >"$V/1-Projects/Flat hunt/${f##*/}"; done
for n in $(seq 50); do
  printf 'file\t0-Inbox/scan0001.pdf\t1-Projects/Flat hunt\t%s\t#job-ad\tThe ad\n' "$LONG90"
done >"$V/.bower/filing.tsv"
start=$SECONDS
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
[ $((SECONDS - start)) -le 600 ] || die "50 repeated lines took $((SECONDS - start)) s"
expect_eq "$SHEET_FILED $SHEET_SKIPPED" '0 50' 'every name taken: nothing filed'
expect_eq "$(grep -c . "$ROOT/short-tries")" 1 'one shortening attempt'
[ -f "$V/0-Inbox/scan0001.pdf" ] || die 'moved with every name taken'
# Names free, the line three times: filed once.
fresh
: >"$ROOT/short-tries"
for n in 1 2 3; do
  printf 'file\t0-Inbox/scan0001.pdf\t1-Projects/Flat hunt\t%s\t#job-ad\tThe ad\n' "$LONG90"
done >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_FILED $SHEET_SKIPPED" '1 2' 'filed once'
expect_eq "$(grep -c . "$ROOT/short-tries")" 1 'one shortening attempt'
[ -f "$V/1-Projects/Flat hunt/$SHORT" ] || die 'not filed under the short name'
eval "$(declare -f real_sheet_name_short | sed '1s/^real_//')"
echo "ok $CASE"

# --- converted siblings (#995) -------------------------------------------------------
CASE='converted siblings'
fresh
CONVERTED="$ROOT/converted.txt"
printf '%s\n' 0-Inbox/offer.md >"$CONVERTED"
printf 'file\t0-Inbox/offer.docx\t1-Projects/Job hunt\tOffer letter.docx\t#job-offer\tOffer from North Ltd\n' \
  >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY" "$CONVERTED"
expect_eq "$SHEET_FILED $SHEET_NOTES $SHEET_SKIPPED" '1 1 0' 'the copy is booked as a note'
[ ! -e "$V/0-Inbox/offer.md" ] || die 'the copy stayed in the inbox'
expect_eq "$(cat "$V/1-Projects/Job hunt/Offer letter.md")" 'offer text' 'the copy next to its original'
grep -qF -- '- [[1-Projects/Job hunt/Offer letter.md]] · Note · #job-offer · Offer from North Ltd · filed by Bower · [[1-Projects/Job hunt/Offer letter.docx]]' \
  "$V/index.md" || die 'the row of the copy, with its original'
expect_eq "$(sed -n '/^## Notes & documents$/,$p' "$V/1-Projects/Job hunt/Job hunt.md")" "$(printf '%s\n' \
  '## Notes & documents' '- [[Offer letter.docx]] Offer from North Ltd' '- [[Offer letter]] Offer from North Ltd')" \
  'the hub lines'
# A .md the runner did not make stays where it is.
fresh
: >"$CONVERTED"
printf 'file\t0-Inbox/offer.docx\t1-Projects/Job hunt\tOffer letter.docx\t#job-offer\tOffer\n' >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY" "$CONVERTED"
expect_eq "$SHEET_FILED $SHEET_NOTES" '1 0' 'not the runner'"'"'s copy'
[ -f "$V/0-Inbox/offer.md" ] && [ ! -e "$V/1-Projects/Job hunt/Offer letter.md" ] || die 'a copy the runner did not make moved'
# Set aside in Processed: the copy goes with it, with no row.
fresh
printf '%s\n' 0-Inbox/offer.md >"$CONVERTED"
printf 'file\t0-Inbox/offer.docx\t0-Inbox/Processed\toffer.docx\t-\t-\n' >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY" "$CONVERTED"
expect_eq "$SHEET_FILED $SHEET_NOTES" '1 0' 'Processed'
[ -f "$V/0-Inbox/Processed/offer.md" ] && [ ! -e "$V/0-Inbox/offer.md" ] || die 'the copy did not follow to Processed'
if grep -q 'offer' "$V/index.md"; then die 'a row for Processed'; fi
# A taken name: the copy stays where it was.
fresh
printf '%s\n' 0-Inbox/offer.md >"$CONVERTED"
mkdir -p "$V/1-Projects/Job hunt"
echo 'the agent wrote this' >"$V/1-Projects/Job hunt/offer letter.MD"
printf 'file\t0-Inbox/offer.docx\t1-Projects/Job hunt\tOffer letter.docx\t#job-offer\tOffer\n' >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY" "$CONVERTED"
expect_eq "$SHEET_FILED $SHEET_NOTES" '1 0' 'a taken name'
[ -f "$V/0-Inbox/offer.md" ] || die 'the copy overwrote a file'
expect_eq "$(cat "$V/1-Projects/Job hunt/offer letter.MD")" 'the agent wrote this' 'the taken file is untouched'
echo "ok $CASE"

# --- no orphans (#995) ----------------------------------------------------------------
CASE='original unlinked'
fresh
mkdir -p "$V/1-Projects/Job hunt"
printf -- '---\nby: bower\n---\nA summary.\n' >"$V/1-Projects/Job hunt/Offer summary.md"
printf -- '---\nby: bower\n---\nAnother.\n' >"$V/1-Projects/Job hunt/Other.md"
{
  # The original's line is refused (a changed extension): it stays in the inbox.
  printf 'file\t0-Inbox/offer.docx\t1-Projects/Job hunt\tOffer letter.pdf\t#job-offer\tOffer\n'
  printf 'note\t1-Projects/Job hunt/Offer summary.md\t1-Projects/Job hunt/Offer letter.pdf\t#job-offer\tSummary of the offer\n'
  printf 'note\t1-Projects/Job hunt/Other.md\t../../outside.pdf\t#job-offer\tAnother note\n'
} >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_FILED $SHEET_NOTES $SHEET_SKIPPED" '0 2 1' 'the notes are booked, the file line skipped'
expect_eq "$SHEET_SKIP_REASONS" '1 name, 2 original-unlinked' 'counted as original-unlinked'
grep -qxF -- '- [[1-Projects/Job hunt/Offer summary.md]] · Note · #job-offer · Summary of the offer · filed by Bower' \
  "$V/index.md" || die 'the row with original -'
grep -qxF -- '- [[1-Projects/Job hunt/Other.md]] · Note · #job-offer · Another note · filed by Bower' "$V/index.md" ||
  die 'the row of a note whose original is a traversal'
grep -qxF -- '- [[Offer summary]] Summary of the offer' "$V/1-Projects/Job hunt/Job hunt.md" || die 'the hub line'
if grep -qF -- 'outside' "$V/index.md"; then die 'the refused original was written'; fi
[ -f "$V/0-Inbox/offer.docx" ] || die 'the refused file moved'
echo "ok $CASE"

# --- note and tag lines -------------------------------------------------------------
CASE='note lines'
fresh
note_line() { sheet_note_line "$V" "$BEFORE" "$DAY" "$@"; }
refused_note() {
  local rc=0
  note_line "$@" || rc=$?
  expect_eq "$rc" 1 "refused note ($*)"
}
mkdir -p "$V/1-Projects/Job hunt"
mv "$V/0-Inbox/offer.docx" "$V/1-Projects/Job hunt/Offer.docx"
mv "$V/0-Inbox/offer.md" "$V/1-Projects/Job hunt/Offer.md"
printf -- '---\nby: bower\n---\nA summary.\n' >"$V/1-Projects/Job hunt/Offer summary.md"
mv "$V/2-Areas/Finance/twin.md" "$V/3-Resources/twin.md"
echo 'one more line' >>"$V/1-Projects/Flat hunt/Flat hunt.md"
refused_note '3-Resources/Old.md' - '#flat' 'Not changed in this run'
refused_note '3-Resources/twin.md' - '#flat' 'Moved from another folder'
refused_note '3-Resources/Missing.md' - '#flat' 'Not there'
refused_note '0-Inbox/receipt.jpg' - '#flat' 'Not a note'
refused_note '0-Inbox/new.md' - '#flat' 'Outside the folders'
refused_note '.claude/x.md' - '#flat' 'Protected'
refused_note '1-Projects/../CLAUDE.md' - '#flat' 'Traversal'
# An original not there does not save a line that is bad for another reason.
refused_note '1-Projects/Job hunt/Offer summary.md' '1-Projects/Job hunt/Gone.docx' '#Job' 'Bad tag'
refused_note '1-Projects/Job hunt/Offer summary.md' - '#Job' 'Bad tag'
refused_note '1-Projects/Job hunt/Offer summary.md' - '#job' ''
[ ! -e "$V/1-Projects/Job hunt/Job hunt.md" ] || die 'a refused note made a hub note'
note_line '1-Projects/Job hunt/Offer summary.md' '1-Projects/Job hunt/Offer.docx' '#job-offer' 'Summary of the offer'
# A converted document's .md, moved by Bower from the inbox (rules v25).
note_line '1-Projects/Job hunt/Offer.md' '1-Projects/Job hunt/Offer.docx' '#job-offer' 'Text of the offer'
# A changed note.
note_line '1-Projects/Flat hunt/Flat hunt.md' - '#flat' 'The flat hunt'
expect_eq "$(sed -n '/^## Projects$/,/^$/p' "$V/index.md")" "$(printf '%s\n' '## Projects' \
  '- [[1-Projects/Flat hunt/Lease.pdf]] · PDF · #flat · The lease · filed by Bower' \
  '- [[1-Projects/Job hunt/Offer summary.md]] · Note · #job-offer · Summary of the offer · filed by Bower · [[1-Projects/Job hunt/Offer.docx]]' \
  '- [[1-Projects/Job hunt/Offer.md]] · Note · #job-offer · Text of the offer · filed by Bower · [[1-Projects/Job hunt/Offer.docx]]' \
  '- [[1-Projects/Flat hunt/Flat hunt.md]] · Note · #flat · The flat hunt · filed by Bower' '')" 'note rows'
expect_eq "$(sed -n '/^## Notes & documents$/,$p' "$V/1-Projects/Job hunt/Job hunt.md")" "$(printf '%s\n' \
  '## Notes & documents' '- [[Offer summary]] Summary of the offer' '- [[Offer]] Text of the offer')" \
  'hub lines in the new project hub note'
grep -q '^## Goal$' "$V/1-Projects/Job hunt/Job hunt.md" || die 'the project hub has no Goal section'
if grep -q '\[\[Flat hunt\]\]' "$V/1-Projects/Flat hunt/Flat hunt.md"; then die 'a hub note linked to itself'; fi
echo "ok $CASE"

CASE='tag lines'
fresh
no_ sheet_tag_line "$V" '#Flat' 'Capitals'
no_ sheet_tag_line "$V" 'flat' 'No hash'
no_ sheet_tag_line "$V" '#new-tag' "$(printf 'a%.0s' {1..81})"
no_ sheet_tag_line "$V" '#new-tag' 'a · b'
yes_ sheet_tag_line "$V" '#flat' 'Already there'
yes_ sheet_tag_line "$V" '#job-offer' 'Job offers and contracts'
expect_eq "$(sed -n '/^## Tags$/,$p' "$V/index.md")" "$(printf '%s\n' '## Tags' \
  '- #flat · Flat hunt papers · 1' '- #job-offer · Job offers and contracts · 1')" 'the new tag line'
echo "ok $CASE"

# --- the whole sheet ----------------------------------------------------------------
CASE='empty sheet'
fresh
: >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_FILED $SHEET_NOTES $SHEET_TAGS $SHEET_SKIPPED" '0 0 0 0' 'an empty sheet'
apply_filing_sheet "$V" "$V/.bower/none.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_FILED $SHEET_NOTES $SHEET_TAGS $SHEET_SKIPPED" '0 0 0 0' 'no sheet'
echo "ok $CASE"

CASE='whole sheet'
fresh
# Bower writes the companion note at its final path (the folder appears with it).
mkdir -p "$V/1-Projects/Job hunt"
printf -- '---\nby: bower\n---\nA summary.\n' >"$V/1-Projects/Job hunt/Offer summary.md"
{
  printf 'note\t1-Projects/Job hunt/Offer summary.md\t1-Projects/Job hunt/Offer letter.docx\t#job-offer\tSummary of the offer\r\n'
  printf 'file\t0-Inbox/offer.docx\t1-Projects/Job hunt\tOffer letter.docx\t#job-offer\tOffer from North Ltd\r\n'
  printf '\r\n'
  printf 'tag\t#job-offer\tJob offers and contracts\r\n'
  printf 'file\t0-Inbox/scan0001.pdf\t../../outside\tscan0001.pdf\t#flat\tTraversal\r\n'
  printf 'file\t0-Inbox/receipt.jpg\t2-Areas/Finance\treceipt.jpg\t#receipt\r\n'
  printf 'move\t0-Inbox/receipt.jpg\t2-Areas/Finance\r\n'
  printf 'file\tClippings/page.md\t0-Inbox/Processed\tpage.md\t-\t-\r\n'
  printf 'file\tClippings/page.md\t0-Inbox/Processed\tpage.md\t-\t-\r\n'
  printf 'tag\t#bad tag\tNo\r\n'
} >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_FILED $SHEET_NOTES $SHEET_TAGS $SHEET_SKIPPED" '2 1 1 5' 'counts'
[ -f "$V/1-Projects/Job hunt/Offer letter.docx" ] && [ -f "$V/0-Inbox/Processed/page.md" ] || die 'not filed'
[ -f "$V/0-Inbox/scan0001.pdf" ] && [ -f "$V/0-Inbox/receipt.jpg" ] || die 'a skipped file moved'
[ -f "$V/1-Projects/Job hunt/Job hunt.md" ] || die 'no hub note for the folder new in this run'
expect_eq "$(grep -c 'Job hunt/' "$V/index.md")" 2 'two rows in the new folder'
grep -qF -- '- #job-offer · Job offers and contracts · 1' "$V/index.md" || die 'the tag line'
echo "ok $CASE"

CASE='line ends'
fresh
printf '%s\r\n' '# Index' '' '## Projects' '_(none yet)_' '' '## Tags' >"$V/index.md"
printf 'file\t0-Inbox/scan0001.pdf\t1-Projects/Flat hunt\tscan0001.pdf\t#flat\tA scan\n' >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$(grep -c $'\r$' "$V/index.md")" "$(grep -c '' "$V/index.md")" 'Windows line ends kept'
grep -qF -- '- [[1-Projects/Flat hunt/scan0001.pdf]] · PDF · #flat · A scan · filed by Bower' "$V/index.md" ||
  die 'no row'
echo "ok $CASE"

CASE='no shell'
fresh
printf 'file\t0-Inbox/scan0001.pdf\t1-Projects/$(touch pwned)\tx.pdf\t#flat\t$(touch pwned2) `touch pwned3`\n' \
  >"$V/.bower/filing.tsv"
(cd "$ROOT" && apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY")
[ ! -e "$ROOT/pwned" ] && [ ! -e "$ROOT/pwned2" ] && [ ! -e "$ROOT/pwned3" ] && [ ! -e "$V/pwned" ] ||
  die 'a field ran as a command'
echo "ok $CASE"

# --- hardening (security review of #982) ---------------------------------------------
CASE='memory files'
fresh
for bad in 1-Projects/Claude 1-Projects/CLAUDE.local '2-Areas/claude.LOCAL'; do
  no_ sheet_dest_kind "$V" "$bad"
done
for bad in '1-Projects/a/Claude.Local.MD' 'claude.local.md' '1-Projects/claude/x.pdf'; do
  no_ sheet_path_ok "$bad"
done
no_ sheet_path_ok '0-Inbox/CLAUDE.local.md' pending
no_ sheet_name_ok 'claude.local.md' page.md
# may_write, as run.sh defines it: a memory file in any letter case is never written.
eval "$(sed -n '/^in_known_root() {/,/^}/p; /^may_write() {/,/^}/p; /^is_memory_file() {/,/^}/p' "$HERE/../run.sh")"
RULES_WRITABLE=0
for bad in CLAUDE.md claude.md 1-Projects/x/Claude.md 3-Resources/CLAUDE.local.md 2-Areas/claude.local.MD; do
  no_ may_write "$bad"
done
yes_ may_write '3-Resources/Claude notes.md'
echo "ok $CASE"

CASE='windows names and format characters'
for bad in '1-Projects/a:b' '1-Projects/a*b' '1-Projects/a?b' '1-Projects/a"b' '1-Projects/a<b' '1-Projects/a>b' \
  '1-Projects/CON' '1-Projects/con.pdf' '1-Projects/x/Nul.txt' '1-Projects/LPT1.pdf' '1-Projects/com9' 'AUX' \
  $'1-Projects/a​b' $'1-Projects/a‮b.pdf' $'1-Projects/a⁦b' $'1-Projects/﻿a' \
  $'1-Projects/a­b' $'1-Projects/a\xf3\xa0\x81\x81b'; do
  no_ sheet_path_ok "$bad"
done
yes_ sheet_path_ok '1-Projects/Console notes'
yes_ sheet_path_ok '1-Projects/Café menu.pdf'
no_ sheet_name_ok 'CON.pdf' scan.pdf
no_ sheet_name_ok $'list‮ing.pdf' scan.pdf
no_ sheet_name_ok 'a:b.pdf' scan.pdf
no_ sheet_text_ok $'A note​' 100
echo "ok $CASE"

CASE='reserved names'
for bad in index.md INDEX.MD log.md Rules.md rules.md README.md About-Me.md about-me.MD CLAUDE.md; do
  no_ sheet_path_ok "1-Projects/Flat hunt/$bad"
  no_ sheet_path_ok "$bad"
done
fresh
echo changed >"$V/3-Resources/index.md"
rc=0
sheet_note_line "$V" "$BEFORE" "$DAY" 3-Resources/index.md - '#flat' 'An index' || rc=$?
expect_eq "$rc" 1 'a note named index.md'
echo "ok $CASE"

CASE='other letter case'
fresh
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' lease.pdf '#flat' 'Same name, other case'
refused 0-Inbox/scan0001.pdf 2-Areas/finance scan0001.pdf '#flat' 'Same folder, other case'
[ -f "$V/0-Inbox/scan0001.pdf" ] || die 'moved'
echo "ok $CASE"

CASE='processed and failed moves'
fresh
rm -rf "$V/0-Inbox/Processed"
echo file >"$V/0-Inbox/Processed"
refused Clippings/page.md 0-Inbox/Processed page.md - -
fresh
rm -rf "$V/4-Archives"
echo 'not a folder' >"$V/4-Archives"
refused 0-Inbox/scan0001.pdf 4-Archives/Old scan0001.pdf '#flat' 'mkdir fails'
[ -f "$V/0-Inbox/scan0001.pdf" ] || die 'moved after a failed mkdir'
echo "ok $CASE"

CASE='hub and index paths'
fresh
# The new hub note's path is taken by a folder: the line is skipped.
mkdir -p "$V/1-Projects/Job hunt/Job hunt.md"
refused 0-Inbox/scan0001.pdf '1-Projects/Job hunt' Offer.pdf '#job' 'Hub path taken'
[ -f "$V/0-Inbox/scan0001.pdf" ] || die 'moved with no hub note to write'
# An existing hub path that is not a plain file.
fresh
rm "$V/1-Projects/Flat hunt/Flat hunt.md"
mkdir "$V/1-Projects/Flat hunt/Flat hunt.md"
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' Scan.pdf '#flat' 'Hub is a folder'
# index.md that is not a plain file.
fresh
rm "$V/index.md"
mkdir "$V/index.md"
refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' Scan.pdf '#flat' 'Index is a folder'
no_ sheet_tag_line "$V" '#new' 'A new tag'
# Links, where the system makes real ones.
fresh
ln -s "$ROOT" "$V/link-test" 2>/dev/null || true
if [ -L "$V/link-test" ]; then
  rm "$V/link-test"
  mv "$V/index.md" "$ROOT/outside-index.md"
  ln -s "$ROOT/outside-index.md" "$V/index.md"
  refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' Scan.pdf '#flat' 'Index is a link'
  no_ sheet_tag_line "$V" '#new' 'A new tag'
  if grep -q 'Scan.pdf\|#new' "$ROOT/outside-index.md"; then die 'wrote through a linked index.md'; fi
  fresh
  mv "$V/1-Projects/Flat hunt/Flat hunt.md" "$ROOT/outside-hub.md"
  ln -s "$ROOT/outside-hub.md" "$V/1-Projects/Flat hunt/Flat hunt.md"
  refused 0-Inbox/scan0001.pdf '1-Projects/Flat hunt' Scan.pdf '#flat' 'Hub is a link'
  if grep -q 'Scan.pdf' "$ROOT/outside-hub.md"; then die 'wrote through a linked hub note'; fi
  echo "ok $CASE (links included)"
else
  echo "ok $CASE (no links on this system)"
fi

CASE='size caps'
fresh
{
  printf 'tag\t#ok\t%s\n' "$(printf 'a%.0s' {1..3000})"
  printf '\xff\xfe not text\n'
  printf 'tag\t#job-offer\tJob offers and contracts\n'
} >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_TAGS $SHEET_SKIPPED" '1 2' 'a long line and a line that is not text are skipped and counted'
fresh
filler=$(printf 'x%.0s' {1..1800})
{
  for _ in $(seq 1 600); do printf 'junk\t%s\n' "$filler"; done
  printf 'tag\t#job-offer\tJob offers and contracts\n'
} >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_TAGS $SHEET_SKIPPED" '0 601' 'nothing past 1 MiB is read, all of it counted'
expect_eq "$SHEET_SKIP_REASONS" '601 other' 'unread lines count as other'
echo "ok $CASE"

# --- long texts and skip reasons (#978 follow-up) -----------------------------------
CASE='long texts'
long='Résumé of the offer at Example Corp in Leeds, hybrid, salary between 36,000 and 40,000 a year, apply by 17 October, compared with two others'
expect_eq "$(sheet_chars "$long")" 140 'the long description'
fit=$(sheet_text_fit "$long" 100)
expect_eq "$fit" 'Résumé of the offer at Example Corp in Leeds, hybrid, salary between 36,000 and 40,000 a year…' \
  'cut at the last word that fits, the comma dropped, … added'
[ "$(sheet_chars "$fit")" -le 100 ] || die 'over 100 characters'
expect_eq "$(sheet_text_fit 'Short enough' 100)" 'Short enough' 'a text that fits stays as it is'
expect_eq "$(sheet_text_fit 'The search for a flat to rent near the station, with two bedrooms and a garden, in Leeds' 80)" \
  'The search for a flat to rent near the station, with two bedrooms and a garden…' 'a long meaning'
no_ sheet_text_fit "$(printf 'a%.0s' {1..101})" 100
no_ sheet_text_fit "$long · more" 100
no_ sheet_text_fit "$long [[Lease]]" 100
no_ sheet_text_fit '' 100
no_ sheet_text_fit '-' 100
fresh
mkdir -p "$V/1-Projects/Job hunt"
printf -- '---\nby: bower\n---\nA summary.\n' >"$V/1-Projects/Job hunt/Example Corp, data analyst.md"
{
  printf 'file\t0-Inbox/offer.docx\t1-Projects/Job hunt\tOffer letter.docx\t#job-offer\t%s\n' "$long"
  printf 'note\t1-Projects/Job hunt/Example Corp, data analyst.md\t1-Projects/Job hunt/Offer letter.docx\t#job-offer #career\t%s\n' "$long"
  printf 'tag\t#job-offer\tA job offer or a job ad, from a company or an agency, for a role Alex might apply to\n'
} >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_FILED $SHEET_NOTES $SHEET_TAGS $SHEET_SKIPPED" '1 1 1 0' 'long texts are shortened, not skipped'
grep -qF -- "- [[1-Projects/Job hunt/Example Corp, data analyst.md]] · Note · #job-offer #career · $fit · filed by Bower · [[1-Projects/Job hunt/Offer letter.docx]]" \
  "$V/index.md" || die 'the note row with the shortened description'
grep -qF -- "- [[Offer letter.docx]] $fit" "$V/1-Projects/Job hunt/Job hunt.md" || die 'the hub line'
grep -qF -- '- #job-offer · A job offer or a job ad, from a company or an agency, for a role Alex might… · 1' \
  "$V/index.md" || die 'the shortened meaning'
echo "ok $CASE"

CASE='skip reasons'
fresh
{
  printf 'file\t0-Inbox/scan0001.pdf\t1-Projects/Flat hunt\tscan0001.pdf\t#flat\t%s\n' "$(printf 'a%.0s' {1..120})"
  printf 'file\t0-Inbox/scan0001.pdf\t../outside\tscan0001.pdf\t#flat\tA scan\n'
  printf 'file\t0-Inbox/receipt.jpg\t1-Projects/Flat hunt\treceipt.pdf\t#flat\tA receipt\n'
  printf 'file\t0-Inbox/offer.docx\t1-Projects/Flat hunt\toffer.docx\t#Flat\tAn offer\n'
  printf 'move\t0-Inbox/scan0001.pdf\n'
} >"$V/.bower/filing.tsv"
echo 'changed' >>"$V/3-Resources/Old.md"
printf 'note\t3-Resources/Old.md\t3-Resources/Gone.pdf\t#flat\tChanged\n' >>"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_SKIPPED $SHEET_NOTES" '5 1' 'five lines skipped, the note booked'
expect_eq "$SHEET_SKIP_REASONS" '1 description, 1 path, 1 name, 1 tag, 1 original-unlinked, 1 other' \
  'counted per reason'
fresh
: >"$V/.bower/filing.tsv"
apply_filing_sheet "$V" "$V/.bower/filing.tsv" "$PENDING" "$BEFORE" "$DAY"
expect_eq "$SHEET_SKIP_REASONS" '' 'no reason when nothing is skipped'
echo "ok $CASE"
