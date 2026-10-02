#!/usr/bin/env bash
# Unit test for run.sh's context pack (R-SS-5, R-SS-6, R-SS-17; #966): runs
# the functions between run.sh's "context pack" markers against the fixture
# rulebooks and the fixture folder in fixtures/context/ (fake content) and
# checks their exact output: the rulebook sections each kind of run gets,
# the system prompt, and the {{TAGS}}, {{FOLDERS}}, {{CORRECTIONS}},
# {{PENDING}} and {{BACKFILL}} blocks. Hermetic: no network, no claude.
#
# Prints "ok <case>" per case and exits non-zero on the first failure.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURES="$HERE/fixtures/context"
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT

# The functions under test, exactly as run.sh defines them.
block=$(sed -n '/^# >>> context pack/,/^# <<< context pack/p' "$HERE/../run.sh")
[ -n "$block" ] || { echo 'FAIL: no context pack block in run.sh' >&2; exit 1; }
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
VAULT_DIR="$FIXTURES/vault"
DOC_TEXT_MAP="$FIXTURES/doc-text-map.txt"
mkdir -p "$WORK_DIR"
cp "$FIXTURES/rulebook.md" "$WORK_DIR/rulebook.md"

printf -v FRONT '%s\n' '---' 'bower_rules_version: 24' '---' '' '# Rulebook (fixture)' '' 'Intro line.' ''
printf -v CORE '%s\n' '## Core one' 'core-one text' '```markdown' '## Not a heading in backticks' \
  '<!-- load: lint -->' '```' ''
printf -v KINDS '%s\n' '## Kinds' 'kinds text' '~~~' '## Not a heading in tildes' '~~~' ''
printf -v INSTRUCTIONS '%s\n' '## Instructions' 'instructions text' ''
printf -v ANSWER '%s\n' '## Answer' 'answer text' ''
printf -v LINT '%s\n' '## Lint' 'lint text' '````markdown' '```' '## Not a heading in a long fence' \
  '<!-- load: ingest -->' '```' '````' ''
printf -v RULES '%s\n' '## Rules' 'rules text'
# The parts above end with a line break; a plain string is one line. The
# result is compared with $(...), which drops the last line break.
join() {
  local part out=''
  for part in "$@"; do
    case "$part" in
      *$'\n') out+=$part ;;
      *) out+="$part"$'\n' ;;
    esac
  done
  printf '%s' "$out"
}

# 1. Core only: the text before the first heading and the unmarked sections;
#    a `##` line in a fence is not a heading, so the marker after it is text.
CASE='core only'
expect_eq "$(rulebook_for)" "$(join "$FRONT" "$CORE" "$RULES")" 'sections'
echo "ok $CASE"

# 2. An ingest: the core, Kinds and the ingest-and-instructions section.
CASE=ingest
expect_eq "$(rulebook_for ingest)" "$(join "$FRONT" "$CORE" "$KINDS" "$ANSWER" "$RULES")" 'sections'
echo "ok $CASE"

# 3. An ingest given an instruction note or a context note.
CASE='ingest instructions'
expect_eq "$(rulebook_for ingest instructions)" \
  "$(join "$FRONT" "$CORE" "$KINDS" "$INSTRUCTIONS" "$ANSWER" "$RULES")" 'sections'
echo "ok $CASE"

# 4. A lint: the core and Lint, with its fenced lines, nothing of an ingest.
CASE=lint
expect_eq "$(rulebook_for lint)" "$(join "$FRONT" "$CORE" "$LINT" "$RULES")" 'sections'
echo "ok $CASE"

# 5. No marker anywhere (rules version 23 or older): the whole file.
CASE='no markers'
cp "$FIXTURES/rulebook-v23.md" "$WORK_DIR/rulebook.md"
expect_eq "$(rulebook_for ingest)" "$(cat "$FIXTURES/rulebook-v23.md")" 'whole file'
cp "$FIXTURES/rulebook.md" "$WORK_DIR/rulebook.md"
echo "ok $CASE"

# 6. Fenced `##` lines: a `## ` line inside ``` , ~~~ or a longer fence
#    (closed only by a fence at least as long) never starts a section, so it
#    goes or stays with the section around it, and a marker after it never
#    counts; CRLF line ends change nothing.
CASE='fenced headings'
for modes in '' ingest lint 'ingest instructions'; do
  # shellcheck disable=SC2086 # the modes are words on purpose
  out=$(rulebook_for $modes)
  case "$modes" in
    lint) want=yes ;;
    *) want=no ;;
  esac
  got=no
  ! grep -Fq '## Not a heading in a long fence' <<<"$out" || got=yes
  expect_eq "$got" "$want" "long fence with modes [$modes]"
  case "$modes" in
    ingest*) want=yes ;;
    *) want=no ;;
  esac
  got=no
  ! grep -Fq '## Not a heading in tildes' <<<"$out" || got=yes
  expect_eq "$got" "$want" "tilde fence with modes [$modes]"
done
sed 's/$/\r/' "$FIXTURES/rulebook.md" >"$WORK_DIR/rulebook.md"
expect_eq "$(rulebook_for ingest | tr -d '\r')" "$(join "$FRONT" "$CORE" "$KINDS" "$ANSWER" "$RULES")" 'CRLF'
cp "$FIXTURES/rulebook.md" "$WORK_DIR/rulebook.md"
echo "ok $CASE"

# 7. The system prompt: the cut rulebook, then Rules.md, then About-Me.md,
#    each under its heading; a missing file reads (none). Nothing in it
#    changes from run to run.
CASE='system prompt'
SYS_VAULT="$ROOT/sys-vault"
mkdir -p "$SYS_VAULT"
printf -- '- Rent at most 1200 a month.\n' >"$SYS_VAULT/Rules.md"
VAULT_DIR=$SYS_VAULT
system=$(build_system_prompt ingest)
VAULT_DIR="$FIXTURES/vault"
expect_eq "$system" "$(join '# Your rulebook (CLAUDE.md)' '' "$FRONT" "$CORE" "$KINDS" "$ANSWER" "$RULES" '' \
  '# Rules.md' '' '- Rent at most 1200 a month.' '' '# About-Me.md' '' '(none)')" 'system prompt'
echo "ok $CASE"

# 8. {{TAGS}}: the `## Tags` lines, blank lines left out; (none yet) when the
#    section is empty or index.md is missing.
CASE=tags
expect_eq "$(tags_block "$VAULT_DIR/index.md")" \
  "$(join '- #rental-listing · A flat or room to rent · 1' '- #health · Doctors, dentists and insurance · 2')" 'tags'
printf '# Index\n\n## Tags\n' >"$ROOT/empty-index.md"
expect_eq "$(tags_block "$ROOT/empty-index.md")" '(none yet)' 'empty section'
expect_eq "$(tags_block "$ROOT/missing.md")" '(none yet)' 'no index'
echo "ok $CASE"

# 9. {{FOLDERS}}: one line per hub note (`<folder>/<name>/<name>.md`) and
#    folder note (`_<name>.md`), with its first descriptive line and its
#    statuses, flow or block list; a note that is neither is not listed.
CASE=folders
expect_eq "$(folders_block "$VAULT_DIR")" "$(join \
  '- 1-Projects/Flat hunt · Finding a two-bed flat near the station. · statuses: [new, to view, viewed, signed]' \
  '- 2-Areas/Health · Appointments and insurance. · statuses: [new, booked, done]' \
  "- 2-Areas/Home · The owner's own note about the house." \
  '- 3-Resources/Recipes')" 'folders'
mkdir -p "$ROOT/no-hubs/1-Projects"
expect_eq "$(folders_block "$ROOT/no-hubs")" '(none yet)' 'no hub notes'
long=$(printf 'é%.0s' $(seq 1 130))
mkdir -p "$ROOT/long/2-Areas/Long"
printf -- '---\ntags: [hub]\n---\n%s\n' "$long" >"$ROOT/long/2-Areas/Long/Long.md"
cut_desc=$(folders_block "$ROOT/long")
cut_desc=${cut_desc#- 2-Areas/Long · }
expect_eq "$(LC_ALL=C.UTF-8 bash -c 'printf "%s" "${#1}"' _ "$cut_desc")" 120 'description cut to 120 characters'
echo "ok $CASE"

# 10. {{CORRECTIONS}}: the Correction: lines counted per pair, first seen
#     first, a rename's tail ignored; (none) without any.
CASE=corrections
expect_eq "$(corrections_block "$VAULT_DIR/log.md")" \
  "$(join '- 2-Areas/Work -> 1-Projects/Job hunt: 2' '- 3-Resources -> 2-Areas/Home: 1')" 'pairs'
printf '# Log\n\n- 2026-01-01 · Vault created.\n' >"$ROOT/plain-log.md"
expect_eq "$(corrections_block "$ROOT/plain-log.md")" '(none)' 'no correction'
expect_eq "$(corrections_block "$ROOT/missing.md")" '(none)' 'no log'
echo "ok $CASE"

# 11. {{PENDING}}: one path per line; a converted document says where its
#     text is, a scan that it has no text layer; one that could not be
#     converted and a PDF with text say nothing more.
CASE=pending
expect_eq "$(pending_block "$FIXTURES/pending.txt")" "$(join \
  '- `0-Inbox/broken.odt`' '- `0-Inbox/plan.pdf`' '- `0-Inbox/report.docx` (text: `0-Inbox/report.md`)' \
  '- `0-Inbox/scan.pdf` (scanned: no text layer)' '- `Clippings/b.md`')" 'pending'
: >"$ROOT/none.txt"
expect_eq "$(pending_block "$ROOT/none.txt")" '(none)' 'nothing pending'
echo "ok $CASE"

# 12. {{BACKFILL}}: the rows with fewer than five fields, in file order, not
#     those of Meta or Tags; at most 50; (none) when every row is complete.
CASE=backfill
expect_eq "$(backfill_block "$VAULT_DIR/index.md")" "$(join \
  '- [[1-Projects/Flat hunt/Flat hunt]]' \
  '- [[1-Projects/Flat hunt/Old viewing.md]] · Note · filed by Bower' \
  '- [[2-Areas/Health/Dentist.pdf]] · PDF')" 'rows'
{
  printf '# Index\n\n## Resources\n'
  for n in $(seq 1 60); do printf -- '- [[3-Resources/n%s.md]] · Note\n' "$n"; done
} >"$ROOT/many.md"
rows=$(backfill_block "$ROOT/many.md")
expect_eq "$(grep -c . <<<"$rows")" 50 'at most 50 rows'
expect_eq "$(head -n 1 <<<"$rows")" '- [[3-Resources/n1.md]] · Note' 'oldest first'
printf '# Index\n\n## Areas\n- [[2-Areas/a.pdf]] · PDF · #health · A letter · filed by Bower\n' >"$ROOT/full.md"
expect_eq "$(backfill_block "$ROOT/full.md")" '(none)' 'every row complete'
echo "ok $CASE"

# 13. One pass (fill_placeholders): each line that is exactly a placeholder
#     gets its block; vault text that holds a placeholder, inline in a hub
#     description or as a line of its own in a block, stays literal.
CASE='one pass'
FILL_VAULT="$ROOT/fill-vault"
mkdir -p "$FILL_VAULT/2-Areas/Trap"
printf -- '---\ntags: [hub]\n---\nSee {{PENDING}} and {{BACKFILL}}\n' >"$FILL_VAULT/2-Areas/Trap/Trap.md"
FILL_DIR="$ROOT/fill"
mkdir -p "$FILL_DIR"
folders_block "$FILL_VAULT" >"$FILL_DIR/context-folders.txt"
printf '{{PENDING}}\n{{BACKFILL}}\n' >"$FILL_DIR/context-tags.txt"
printf -- '- `0-Inbox/a.pdf`\n' >"$FILL_DIR/context-pending.txt"
printf '(none)\n' >"$FILL_DIR/context-backfill.txt"
template=$(printf '%s\n' 'Tags:' '{{TAGS}}' 'Folders:' '{{FOLDERS}}' 'Pending:' '{{PENDING}}' \
  'Rows:' '{{BACKFILL}}' 'Kept: {{TAGS}} inline' '{{UNKNOWN}}')
expect_eq "$(fill_placeholders "$FILL_DIR" <<<"$template")" "$(join 'Tags:' '{{PENDING}}' '{{BACKFILL}}' \
  'Folders:' '- 2-Areas/Trap · See {{PENDING}} and {{BACKFILL}}' 'Pending:' '- `0-Inbox/a.pdf`' \
  'Rows:' '(none)' 'Kept: {{TAGS}} inline' '{{UNKNOWN}}')" 'filled prompt'
echo "ok $CASE"

# 14. The effort (choose_effort, #1000): high with the instructions sections
#     for an ingest given an instruction note the app wrote; medium, also
#     with the instructions sections (a context note's handling is in the
#     rulebook's Instructions section), when a pending context note is the
#     only reason; low with only the run's own mode otherwise, a lint
#     included. A context note no longer in the folder does not count.
CASE=effort
block=$(sed -n '/^is_context_note() {/,/^}/p' "$HERE/../run.sh")
[ -n "$block" ] || die 'no is_context_note in run.sh'
eval "$block"
EFFORT_LOW=L EFFORT_MEDIUM=M EFFORT_HIGH=H
EFFORT_VAULT="$ROOT/effort-vault"
mkdir -p "$EFFORT_VAULT/0-Inbox"
printf -- '---\nkind: context\n---\nReceipts for the flat\n\n## Applies to\n- a.pdf\n' \
  >"$EFFORT_VAULT/0-Inbox/Bower - 2026-01-15 0915-00 Context ab.md"
printf -- '---\nkind: note\n---\nkind: context\n' >"$EFFORT_VAULT/0-Inbox/plain.md"
echo pdf >"$EFFORT_VAULT/0-Inbox/a.pdf"
printf '%s\n' 0-Inbox/a.pdf 0-Inbox/plain.md >"$ROOT/effort-plain.txt"
printf '%s\n' 0-Inbox/a.pdf '0-Inbox/Bower - 2026-01-15 0915-00 Context ab.md' >"$ROOT/effort-context.txt"
printf '%s\n' 0-Inbox/a.pdf '0-Inbox/Bower - 2026-01-15 0915-00 Context gone.md' >"$ROOT/effort-gone.txt"
effort_of() {
  local VAULT_DIR=$EFFORT_VAULT
  choose_effort "$@"
  printf '%s %s' "$EFFORT" "${CONTEXT_MODES[*]}"
}
expect_eq "$(effort_of ingest 1 "$ROOT/effort-plain.txt")" 'H ingest instructions' 'instruction note'
expect_eq "$(effort_of ingest 1 "$ROOT/effort-context.txt")" 'H ingest instructions' 'instruction and context notes'
expect_eq "$(effort_of ingest 0 "$ROOT/effort-context.txt")" 'M ingest instructions' 'context note only'
expect_eq "$(effort_of ingest 0 "$ROOT/effort-plain.txt")" 'L ingest' 'plain tidy-up'
expect_eq "$(effort_of ingest 0 "$ROOT/effort-gone.txt")" 'L ingest' 'context note gone'
expect_eq "$(effort_of ingest 0 "$ROOT/none.txt")" 'L ingest' 'no pending list'
expect_eq "$(effort_of lint 0 '')" 'L lint' 'lint'
echo "ok $CASE"
