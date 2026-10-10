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
