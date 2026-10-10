# B3a hot reduction: red delivery

implementer: codex

Entry: `b3a-hot-reduce`. This is the red-owning session only.
Worktree: `/private/tmp/bower-b3a-hot-reduce`.

## Scope

Added `runner/test/b23-hot.test.ts`. No implementation file was created.
No git commands, commits, network requests, real clocks or timers were used.
Every render fixture passes a made-up `today`; all identities and content are made up.
Existing tests changed: none.

The dynamic import uses the `../src/hot.ts` target through a string variable so
the absent implementation does not cause static resolution or TypeScript errors.
Missing-target errors become `expect.fail` assertions bearing the test's pinned
reason. Other import errors are rethrown. All three required exports are checked.

## Reds

Each item is an exact test name, followed by its positive control and contract assertions.

1. `B3a hot: exact section order and headings`
   - Control: an ordinary question appears in the output.
   - Pins the title, supplied date, all headings and section order, formatted rows,
     repeatable output, and unchanged inputs.
2. `B3a hot: empty inputs leave three bare headings`
   - Control: one ordinary question produces one row.
   - Empty evidence keeps all three headings with no rows or fabricated provenance.
3. `B3a hot: row caps keep 10 threads 5 hubs and 10 changes with marks`
   - Control: exactly 10 questions, 5 hubs and 10 changes produce no omission marks.
   - Over-cap evidence keeps those counts and reports 3 questions, 2 hubs and 3
     changes omitted. The capped questions remain in authoritative input order.
4. `B3a hot: day 30 is in day 31 and null are out`
   - Control: yesterday's settled hub appears.
   - Today and day 30 appear; day 31, even late that day, and null do not.
5. `B3a hot: newest first breaks ties by path and id`
   - Control: two differently dated changes appear newest first.
   - Unsorted evidence orders hubs by timestamp then path and changes by timestamp
     then id, including different times on the same day; question order is retained.
6. `B3a hot: de-duplicates identities without merging equal text`
   - Control: distinct question/change ids with equal text both appear; distinct
     hub paths both appear.
   - Repeated ids/paths produce exactly the same text and provenance as unique inputs.
     Duplicate evidence is identical, avoiding an unruled conflicting-duplicate policy.
7. `B3a hot: multiline and heading text stays one row`
   - Control: an ordinary one-line question is preserved.
   - Newlines, tabs, CRLF, leading/trailing whitespace and embedded heading/bullet
     syntax collapse within each question, path and change row; no headings are added.
8. `B3a hot: 300 words cuts changes then focus then threads with full counts`
   - Controls: short evidence stays intact; exactly 300 whole-text words stay intact.
   - 301 words triggers a row cut. Larger fixtures pin bottom-row cuts in Recent
     changes first, then Current focus, then Open threads; marks count omitted rows.
   - The thread count includes rows omitted by the 10-row cap: 12 inputs, 8 shown,
     4 waiting on Home. A single 400-word question is omitted with a truthful mark.
   - Every result counts headings, date and marks toward the 300-word maximum.
9. `B3a hot: provenance lists only displayed identities`
   - Control: one shown question, hub and change each has its own provenance list.
   - Caps, duplicates, stale hubs and word-cut rows never contribute omitted ids.
     Also pins empty focus/change provenance after the word budget reaches threads.
   - The packet does not name provenance keys, so assertions inspect its lists
     without requiring particular key spellings.
10. `B3a hot: sameExceptDate ignores only the updated line`
    - Controls: identical texts and a date-only change compare equal in both orders.
    - Changed thread text, headings and a date-like line inside a list compare unequal;
      identical unstamped text compares equal and different unstamped text does not.
11. `B3a hot: boundHot caps 3999 4000 4001 and preserves surrogate pairs`
    - Controls: short, 3,999-character and 4,000-character texts are unchanged;
      a complete surrogate pair at the uncut edge is unchanged.
    - 4,001 characters are bounded to 4,000 including the explicit mark line.
      Oversized inputs put a pair across both the raw cutoff and the cutoff after
      reserving mark space; output remains a source prefix with no lone surrogate.
    - Empty, omitted, undefined and null text return an empty string.

## Observed red evidence

Final run collected all 11 tests and failed all 11 with `AssertionError` from
the missing-target `expect.fail`, each bearing its own stated reason and
`missing runner/src/hot.ts implementation`. There was no suite load error.
The failure log confirms every exact test listed above. No behavior assertion or
positive control can execute until the implementation session provides `hot.ts`;
this red delivery does not claim those assertions have passed.

## Verification

- `pnpm -C runner exec vitest run test/b23-hot.test.ts --maxWorkers=2`
  - Exit 1, expected: 11 assertion reds.
  - Log: `tmp-logs/b3a-hot-reds.log`.
- `pnpm -C runner exec tsc --noEmit -p .`
  - Exit 0. Log: `tmp-logs/b3a-hot-tsc.log`.
- `pnpm -C runner exec eslint test/b23-hot.test.ts`
  - Exit 0. Log: `tmp-logs/b3a-hot-eslint.log`.

Only failure records were read from gate output. Checks were repeated after adding
the exact 300/301-word boundary and further provenance assertions.
`pnpm check`, e2e, implementation and commits are left to their owning sessions,
as instructed for this red-only delivery. The coordinator commits the tests and
notes separately under the packet's commit order.

## Sources

Offline standard references; no pages were fetched during this no-network session:

- [Redux: prerequisite reducer concepts](https://redux.js.org/usage/structuring-reducers/prerequisite-concepts)
  describes pure functions with no side effects or argument mutation. The tests
  use typed already-read evidence, supplied dates, repeatability and input retention.
- [CommonMark 0.31.2: ATX headings](https://spec.commonmark.org/0.31.2/#atx-headings)
  and [list items](https://spec.commonmark.org/0.31.2/#list-items) define the heading
  and bullet syntax. Collapsing input whitespace keeps embedded syntax within one row.

## Left out

`runner/src/hot.ts`, hot I/O, maintain/prompt integration, corpus changes, pending
stores and note parsers. No app screens were touched.

## Implementation

Implemented `runner/src/hot.ts` only; this section records the implementation
session after the red delivery above. The existing reds remain untouched.

- `renderHot` projects typed, already-read inputs into the three ordered sections.
  It keeps the first occurrence of each identity, retains authoritative question
  order, sorts timestamps newest first with deterministic path/id ties, and
  selects hub calendar dates from today through day 30 inclusive.
- All question, hub-path and change text collapses whitespace into a single line.
  Row caps and bottom-row word cuts share section totals, so omission marks count
  all excluded rows and count toward the 300-word budget. Provenance uses
  `questionIds`, `hubPaths` and `changeIds` for only the retained rows.
- `sameExceptDate` compares exact text after replacing the first standalone,
  correctly shaped updated stamp; list text stays significant. When either text
  has no such stamp, only identical text compares equal.
- `boundHot` reserves the cut mark within 4,000 UTF-16 code units and backs up
  one code unit if its boundary falls inside a surrogate pair. Missing text adds
  nothing. Inputs already within the cap are returned verbatim.
- No imports, dependencies, I/O, current clock, model, note parser, tree or store.
  Date parsing uses only supplied dates. Inputs are never mutated.

removed: none

tests changed: none

### Implementation verification

All output was redirected under `tmp-logs/`; only failures were read.

- Before implementation, the pinned hot command exited 1 with 11 assertions
  naming the missing implementation, not a suite-load error.
  `tmp-logs/b3a-implementation-red.log` records each exact test name from Reds.
- `pnpm -C runner exec vitest run test/b23-hot.test.ts --maxWorkers=2`: exit 0.
  Log: `tmp-logs/b3a-implementation-verify.log`. All 11 exact Reds tests passed.
- `pnpm -C runner exec vitest run --maxWorkers=2`: exit 0, including the pinned
  hot tests after the final date-comparison guard.
  Log: `tmp-logs/b3a-implementation-suite.log`.
- `pnpm -C runner exec tsc --noEmit -p .`: exit 0.
  Log: `tmp-logs/b3a-implementation-tsc.log`.
- `pnpm -C runner exec eslint src/hot.ts`: exit 0.
  Log: `tmp-logs/b3a-implementation-eslint.log`.

No packet/red contradiction was found. Per the implementation-session instruction,
no `pnpm check`, e2e, network or git-writing command ran. The coordinator owns
commits; notes and the fix are ready for its separate commits. Integration,
maintenance and prompt wiring remain outside this pure-module entry.

### Implementation sources

The offline standard references in Sources above informed the implementation;
no pages were fetched. Redux's prerequisite reducer concepts describe a pure
projection over supplied inputs without effects or input mutation. CommonMark
0.31.2 ATX headings and list items supply the generated Markdown syntax.

## Red repair

The packet's numbered contract controls this repair. Its point 2 reserves the
cap mark for Open threads; the earlier cap red and implementation notes above
incorrectly required marks for capped focus and recent rows. Point 4 still requires
`- (N more)` when the 300-word cut removes rows. That word-cut red is unchanged.

tests changed: runner/test/b23-hot.test.ts: empty inputs now assert exact text, rejecting blank-line padding.
tests changed: runner/test/b23-hot.test.ts: cap expectations now require marks only for Open threads (packet point 2).
tests changed: runner/test/b23-hot.test.ts: added leading-block and exact 300-word cap regressions (points 3 and 4).

- `B3a hot: empty inputs leave three bare headings` compares the entire string
  against the title, supplied date and three adjacent headings, with no trailing
  newline. Its ordinary-question control and empty provenance assertion remain.
- `B3a hot: row caps keep 10 threads 5 hubs and 10 changes with only a thread mark`
  retains the original inputs, bounds and positive control, and requires five
  focus rows and ten recent rows with no cap marks. Open threads still reports
  three waiting on Home. A soft focus assertion lets the log expose both failures;
  it still fails the test.
- `B3a hot: 6 hubs and 11 changes keep exactly 300 capped words without marks`
  uses hubs H0 through H5 and changes c00 through c10, all dated 2026-10-09.
  c00 has 243 words; every other change has one. The expected complete text is
  explicitly counted as 300 words. The control with only five hubs and ten changes
  matches it exactly. Adding the over-cap inputs must preserve that text and its
  displayed provenance, without marks or lost retained changes.
- Added two parameterized test families:
  `B3a hot: question $label starts literally in one top-level row` and
  `B3a hot: hub $label starts literally in one top-level row`.
  Each has the ordinary-row control and eleven labels: ATX heading, level-one
  heading, hyphen list, asterisk list, plus list, ordered list, block quote,
  backtick fence, tilde fence, heading after newline, and list after newline.
  They cover `## Injected`, `# x`, `- Extra row`, `* x`, `+ x`, `1. x`, `> x`,
  both fenced-code openers, and syntax preceded by collapsed whitespace/newlines.
  The line parser requires exactly one top-level row and the exact remaining
  document lines. Its content must not begin the covered CommonMark blocks;
  decoding valid ASCII punctuation escapes must recover the collapsed input
  (plus the hub date). This accepts different valid escape placements rather
  than pinning one spelling such as `- \## Injected`.
  The existing multiline question, hub and change assertions are unchanged.

### Red repair evidence

Final pinned run collected 34 tests: 24 expected assertion failures and 10 passes.
All 22 question/hub syntax cases fail because their row content still begins
an unescaped CommonMark block marker. The ordinary-row controls pass first.

The corrected cap test fails on the extra focus `- (2 more)` and recent
`- (3 more)` marks. The boundary test's exactly-300-word control passes, but its
over-cap result adds focus `- (1 more)` and displays only eight changes:
change-8 and change-9 disappear in favor of `- (3 more)`. Both section failures
are visible in the log. These reproduce the adversarial review's two blockers.
The strengthened empty-input assertion passes against the current implementation;
it now rejects the padding that the previous helper would have filtered away.

- `pnpm -C runner exec vitest run test/b23-hot.test.ts --maxWorkers=2`: exit 1, expected assertion reds.
  Log: `tmp-logs/b3a-red-repair-vitest.log`.
- `pnpm -C runner exec tsc --noEmit -p .`: exit 0.
  Log: `tmp-logs/b3a-red-repair-tsc.log`.
- `pnpm -C runner exec eslint test/b23-hot.test.ts`: exit 0.
  Log: `tmp-logs/b3a-red-repair-eslint.log`.

The pinned run was repeated after enabling both cap assertions to report their
failures. The final TypeScript and ESLint checks passed after that test change.
Only failure records were read. No broader tests, pnpm check, e2e, network access,
git writes or implementation edits ran; the coordinator owns commits.

Offline standard reference supplied by the repair instruction:
[CommonMark 0.31.2 §2.4: backslash escapes](https://spec.commonmark.org/0.31.2/#backslash-escapes).
No page was fetched. The assertion decodes only ASCII punctuation escapes and
checks heading/list/quote/fence syntax at the start of each parsed row's content.

## Fix round 1

Changed only `runner/src/hot.ts` for the two adversarial blockers; this section
records the repair. The amended tests were not changed.

- The existing one-line projection now escapes leading block punctuation after
  collapsing whitespace. Ordered markers escape their period or closing
  parenthesis, since CommonMark backslash escapes apply to ASCII punctuation,
  not digits. Questions, hub paths and change text reuse the same pure helper.
- Focus and recent section totals start at their capped row counts. Their caps
  add no mark; later word-budget removals produce `- (N more)` counting those
  removed rows. Threads retain the full input count and their Home mark.
- The exactly-300-word over-cap fixture now keeps all five focus rows and ten
  recent rows. Provenance still names only displayed identities. No I/O, model,
  clock, dependencies or additional mechanism were added.

removed: focus and recent cap-only omission marks.
removed: unescaped leading block markers after whitespace collapse.
tests changed: none

### Fix round 1 verification

Output is under `tmp-logs/`; only failure records were read.

- Before the fix, `pnpm -C runner exec vitest run test/b23-hot.test.ts --maxWorkers=2`
  exited 1: 24 assertion failures and 10 passes. The 22 leading-block cases,
  corrected cap case and exactly-300-word case reproduce both blockers.
  Log: `tmp-logs/b3a-fix-round-1-red.log`.
- After the fix, the same pinned command exited 0; all 34 amended tests passed.
  Log: `tmp-logs/b3a-fix-round-1-verify.log`.
- `pnpm -C runner exec vitest run --maxWorkers=2`: exit 0.
  Log: `tmp-logs/b3a-fix-round-1-suite.log`.
- `pnpm -C runner exec tsc --noEmit -p .`: exit 0.
  Log: `tmp-logs/b3a-fix-round-1-tsc.log`.
- `pnpm -C runner exec eslint src/hot.ts`: exit 0.
  Log: `tmp-logs/b3a-fix-round-1-eslint.log`.

No network, git-writing command, `pnpm check` or e2e ran, as instructed for this
fix round. The coordinator owns commits; the fix and notes remain separate files.

### Fix round 1 sources

Offline references already supplied by the packet and Red repair:
[CommonMark 0.31.2 §2.4: backslash escapes](https://spec.commonmark.org/0.31.2/#backslash-escapes)
and [Redux: prerequisite reducer concepts](https://redux.js.org/usage/structuring-reducers/prerequisite-concepts).
No pages were fetched. The same typed, deterministic projection remains pure.

## Red repair 2

tests changed: runner/test/b23-hot.test.ts: extend point 3 to all seven CommonMark HTML-block starts in question, hub and change text, including collapsed whitespace and newlines; require a literal escaped opener.

The shared block fixtures now include HTML-block types 1 through 7:
`<script>injected</script>`, `<pre>`, `<style>`, `<textarea>`, `<!-- x`,
`<?x`, `<!DOCTYPE`, `<![CDATA[`, `<div>` and `<custom-tag>`.
Each is tested directly, after spaces/tabs, and after spaces/tabs/LF/CRLF,
with trailing whitespace also collapsed. All four type-1 tags are covered.
Question and hub families retain their ordinary-row positive controls and exact
document-line assertions. A new change family runs every existing block fixture
and every HTML fixture, with an ordinary-change control and exact document lines.

The row helper retains its single-row, block-marker rejection and lossless
ASCII-escape decoding assertions. It additionally rejects an unescaped leading
`<` and explicitly requires HTML input content to start with `\<`. For changes,
the generated date prefix is checked and removed before checking input content;
the date cannot mask unsafe input. Hub dates remain part of the exact expected
content. No previous assertion, numeric bound, tolerance or fixture was loosened.

### Red repair 2 evidence

Against the unchanged current `runner/src/hot.ts`, all 90 new HTML cases fail
on `row content must not start a CommonMark block`: 30 questions, 30 hubs and
30 changes. Every type and whitespace variant appears in the failure records.
The received content begins with unescaped `<`, including the reported script
question and newline-prefixed div hub. No unexpected failing test is present.
The ordinary controls execute before these failures. The 11 additional change
cases for existing heading/list/quote/fence fixtures produce no failure records.

- `pnpm -C runner exec vitest run test/b23-hot.test.ts --maxWorkers=2`: exit 1, expected assertion reds.
  Log: `tmp-logs/b3a-red-repair-2-vitest.log`.
- `pnpm -C runner exec tsc --noEmit -p .`: exit 0.
  Log: `tmp-logs/b3a-red-repair-2-tsc.log`.
- `pnpm -C runner exec eslint test/b23-hot.test.ts`: exit 0.
  Log: `tmp-logs/b3a-red-repair-2-eslint.log`.

Only failure records were read from test output. No other test command,
`pnpm check`, e2e, network request, git-writing command or implementation edit
ran. The coordinator owns commits; tests and notes are ready for separate commits.

Offline references supplied by the instruction, without fetching pages:
[CommonMark 0.31.2 §4.6: HTML blocks](https://spec.commonmark.org/0.31.2/#html-blocks)
and [§2.4: backslash escapes](https://spec.commonmark.org/0.31.2/#backslash-escapes).

## Fix round 2

Changed only `runner/src/hot.ts` in the implementation: the existing one-line
helper now also backslash-escapes a leading `<` after collapsing whitespace.
Questions, hub paths and change text share this helper, so all seven CommonMark
HTML-block starts remain literal, including whitespace and newline variants.
The projection remains pure; no I/O, clock, dependencies or second mechanism
were added.

tests changed: none

### Fix round 2 verification

All output is under `tmp-logs/`; only failure records were read.

- Before the fix, `pnpm -C runner exec vitest run test/b23-hot.test.ts --maxWorkers=2`
  exited 1: 90 HTML-case assertion failures among 135 tests. The script question
  failed on `row content must not start a CommonMark block`, as in Red repair 2.
  Log: `tmp-logs/b3a-fix-round-2-red.log`.
- After the fix, the same pinned command exited 0; all 135 tests passed.
  Log: `tmp-logs/b3a-fix-round-2-verify.log`.
- `pnpm -C runner exec vitest run --maxWorkers=2`: exit 0.
  Log: `tmp-logs/b3a-fix-round-2-suite.log`.
- `pnpm -C runner exec tsc --noEmit -p .`: exit 0.
  Log: `tmp-logs/b3a-fix-round-2-tsc.log`.
- `pnpm -C runner exec eslint src/hot.ts`: exit 0.
  Log: `tmp-logs/b3a-fix-round-2-eslint.log`.

No network, git-writing command, `pnpm check` or e2e ran, as instructed.
The coordinator owns commits; the implementation and notes are separate files.

### Fix round 2 sources

Offline references supplied by Red repair 2, without fetching pages:
[CommonMark 0.31.2 §2.4: backslash escapes](https://spec.commonmark.org/0.31.2/#backslash-escapes)
and [§4.6: HTML blocks](https://spec.commonmark.org/0.31.2/#html-blocks).
The existing pure projection uses the same helper and no additional mechanism.
