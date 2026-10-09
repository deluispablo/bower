# c3-planner-split: implementer notes (part 1, staged stop)

Branch `c3-planner-split`, from claude/p3 12b9d054, with claude/p3 baadeb7d merged in (177f8a93).
Stopped at a green step at about 540 changed production lines (TL-P4-14 addendum 23 point 4). Contract
items 2-5 are done. Item 1 (the capture, decide and build split) is left for part 2, along with the
reduction of `grounded()`.

## Commits

| sha | kind | what |
|---|---|---|
| f9b658c6 | red | report rows by op id; every Timeline line has its own row; the live path imports no demo fixture; the claude provider path cannot reach the fixture modules; answers reach the model path (passed before the fix: a guard) |
| 053e710c | fix | `materialize` ties a set-aside row to its move by its position in `requires`. `reportContradictions` traces rows through their contribution, so names are no longer matched. One `updated` row per line written; grounding claims each line once; readers count distinct paths (`notesUpdated`) |
| f13e9b70 | fix | `Decisions` is now the one reply type the planner reads. `modelDecisions` adapts the model's intent, and `src/data/demo/script.ts` (the scripted provider) owns the fixtures. A dependency-cruiser rule `claude-provider-reaches-no-fixture` is added, and the KNOWN line is deleted |
| c1de99be | red | one map from records to the operations they need |
| 9c6068c4 | fix | `needs` (record id -> held, lines, edits, derived) replaces the five filters and the `editsFrom`/`fromAnswer` maps. `RunPlan.needs` holds each record's archive dependencies |
| 177f8a93 | merge | claude/p3 baadeb7d |

## Verify tests (exact names)

- `two moves with the same name get their own rows by op id` (src/data/spine/report.test.ts)
- `every Timeline line a run writes has its own report row` (runner/test/c05-incorporation.test.ts): the live shape,
  2 lines on Flat hunt, now gives 2 rows (was 1)
- `the live path imports no demo fixture` (src/dependency-rules.test.ts)
- `the claude provider path cannot reach the fixture modules` (src/architecture.test.ts; it runs the gate on a fixture tree)
- `one map from records to the operations they need` (src/data/spine/scripted.test.ts)
- `answers reach the model path` (runner/test/ask-answer-loop.test.ts, through the Claude provider and real-world wiring)
- `the C04 run makes the golden number of Drive calls per step`: 78, and 88 with 25 earlier runs. Unchanged.

Gates: `pnpm check` passed (/tmp/c3-plan-check.log). The C05 e2e passed on desktop and phone (/tmp/c3-plan-e2e-c05.log).
`pnpm e2e:fake` passed: 257 passed, 61 skipped (/tmp/c3-plan-e2e-fake.log).

## Production lines (f9b658c6..9c6068c4, tests excluded): +347 / -193 (removed: 193)

scripted.ts +59 (+207 -148), demo/script.ts +85 (new), report.ts -9, grounded.ts +2, fake-runner.ts +6,
run-words.ts +5, fixture.ts -2, .dependency-cruiser.cjs +7, dependency-exceptions.cjs -1, corpus.ts +1,
provider.ts +1, claude.ts 0, barrier.ts 0, Home.tsx 0, Replay.tsx 0.

## Fixture symbols on the model path: before and after (live-uses-fixtures)

- `wordRule`: **live behaviour changed.** Before, a rule typed on live that matched one of the demo's four canned
  phrases (for example "anything from the dentist goes in health") was written as the demo's canned sentence. Every other rule got
  the person's words, tidied. After, every rule on live gets the person's words, tidied (`tidiedRule`: a capital
  first letter and a full stop). The model reply has no rule wording, so this is the "not done" case. **Ruling point:** I read "not done"
  as "no rewording", not as "the rule line waits forever". If the lead means the line should wait, `Decisions.wordRule`
  undefined should leave rule lines in `left`, which is a one-line change.
- `DISAGREEMENTS` / `disagreementAnswer` (old :717-723): no observable live change. Only the demo path ever asked a
  `q-flat-3-rent-*` question, so no live folder can hold its answer. Now `Decisions.said` is scripted-only.
- `PLAN_BY_NAME` (:1034-1035, :1864): no live change. A model run always had a `place`, so neither lookup was reached.
  It now lives in `demo/script.ts`, and the module load no longer builds it on the live path.
- `NOT_LOOKED_UP` and `scriptedRequest` (:704, :1130, :1402): no live change. The model path already left requests
  waiting (the journal filter), so these never ran. Without `Decisions.request`, requests wait.

## Compatibility rows

- 053e710c is in `docs/harness/2026-10-07-p3-compatibility.md`. `RunReport.updated` keeps `{path, what}`, and a note with
  N new lines has N rows. The counts on Home, Replay and the run summary are unchanged (they count distinct paths).
- f13e9b70 and 9c6068c4 touch neither src/data/contracts nor src/features. Wire shapes are unchanged:
  `ReportContribution`, the manifest and `last-run.json`. `RunPlan` (in-process only) gains `needs`.

## Left out (part 2)

- Contract 1: `planScripted` is still one function. Decisions are now read through one interface, but the split into
  `capture`, `decide` and `build` would move about 1,100 lines. Re-planning by recursion stays (:539, :749, :964, :976,
  :1532).
- Contract 5, rest: `grounded()` is not yet reduced to the structural check. Its row-by-row checks are pinned by about 30
  tamper assertions in fake-worker.test.ts, which need rewriting with it.
- `NoteScreen.tsx:219` still marks "New" by matching the text of `what`. Each line now has its own row, so every new
  line is marked. Matching it by op id needs a wire field.

## Sources

- Functional core, imperative shell (Gary Bernhardt, "Boundaries"):
  https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell. The planner reads a
  reply (decisions) and builds operations; the providers own the reply.
- dependency-cruiser `reachable` rules: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md#reachable

# Part 2 (staged stop)

Branch `c3-planner-split-2`, from claude/p3 a1bf5b9a (part 1 merged). Stopped at a green step after items 2-4: the
change is +120 / -546 production lines (666 changed, past the ~600 stop), mostly the removal from `grounded()`.
Item 1 (the capture, decide and build split) is left for part 3.

## Commits

| sha | kind | what |
|---|---|---|
| a189e639 | red | grounded checks structure only; a set-aside row names its op; the New mark follows the row's op, not its text; one distinct-path count; guard: a rule waits in the one map for the Rules.md it makes (passed before the fix) |
| 09d0127d | fix | `grounded()` is structural: every row names ops of the plan (at least one); a rejected row names one op and one set-aside row; every op the person is told about has a row (a member's move or Bin for both outcomes, a generated note, an edit with a Timeline line or Current state, a kept note's Bin, an archive move). The plan's own places stay checked (archive moves, runner files made again at their path and holding their shape, generated notes under a main folder, a filing move to a verified destination). `materialize` drops the position pairing: a set-aside row is its contribution's one op's |
| 7f569779 | fix | `distinctPaths` (spine/report.ts) is the one count: `notesUpdated`, `runLinkRows`, the corpus scorer |
| 895bfe15 | fix | `newLineIndexes` (features/note/new-lines.ts): each updated row marks one Timeline line, the last unclaimed one with its words |
| 167297dc | fix | `RulesPlan.held` goes: the made Rules.md is `derive`d for each rule line it words, in `needs` |
| 5e5a8f19 | chore | duplication baseline lowered to 20 clones (the gate asks for it when clones fall) |

## Verify tests (new, exact names)

- `grounded checks structure only` (src/data/spine/grounded.test.ts): reworded rows still grounded; an unknown op, an
  empty `requires`, an edit or a filing move with no row are not.
- `a set-aside row names its op` (src/data/spine/report.test.ts): rows listed in the other order are never said to
  be another row's op's outcome; such a plan is not grounded.
- `the New mark follows the row's op, not its text` (src/features/note/new-lines.test.ts).
- `one distinct-path count` (src/features/tidy/run-words.test.ts).
- `a rule waits in the one map for the Rules.md it makes` (src/data/spine/scripted.test.ts): a guard, green before.
- Part 1's `two moves with the same name get their own rows by op id` and `a run with confirmed and unconfirmed moves
  counts each on its own line` now set the two moves aside with one contribution each, as the planner emits them.

Gates: `pnpm check` passed after the baseline commit (/tmp/c3p2-check.log failed only on the ratchet; the gates
after it re-run: /tmp/c3p2-dup2.log, -unused, -deps, -harn, -bundle, -land). C05 e2e on desktop and phone passed
(/tmp/c3p2-e2e-c05.log). `pnpm e2e:fake`: 257 passed, 61 skipped (/tmp/c3p2-e2e-fake.log). Goldens unchanged: C04 78,
25 runs 88 (runner suite green, /tmp/c3p2-verify.log).

## Tests rewritten with grounding

Removed, since `grounded()` no longer reads a row's words: fake-worker.test.ts tamper assertions on a question's
askedAt, an updated row's path and words, a saved link's note path and created rows, a link's row names, a merge row
without its edit; the tests "refuses the filed-on-its-own row anywhere but on a merge that fell back, and in any
other words" and "grounds a merged thing's note only on a line carrying the answer that asked for it"; fake-runner's
comparison note path. Kept: rows with no row for an edit or a create, runner files at their paths (now also by
shape), the root as a filing destination, generated notes only under main folders, `groundedKeys`.

## Production lines

Part 2 (a1bf5b9a..5e5a8f19, tests excluded): +120 / -546, removed 546. grounded.ts -455 (+58 -513), report.ts +7,
scripted.ts +2, corpus.ts +3, NoteScreen.tsx +2, new-lines.ts +17 (new), run-words.ts -2.
Entry so far (part 1 + part 2): +467 / -739, net -272. scripted.ts +61, demo/script.ts +85, grounded.ts -453,
report.ts -2, fake-runner.ts +6, run-words.ts +3, fixture.ts -2, .dependency-cruiser.cjs +7,
dependency-exceptions.cjs -1, corpus.ts +4, provider.ts +1, NoteScreen.tsx +2, new-lines.ts +17.

## Compatibility rows

a189e639, 7f569779 and 895bfe15 are in `docs/harness/2026-10-07-p3-compatibility.md`. Wire shapes unchanged: the
manifest, `ReportContribution`, `RunReport` and `last-run.json`. 895bfe15 changes what the note screen marks: one
line per row, so an earlier line with the same words is no longer marked New.

## Left out (part 3 and rulings)

- Contract 1: `planScripted` is still one function; re-planning by recursion stays (orphans, keep, waiting piles,
  the edit-cap retry).
- The New mark ties each row to one line, but still finds it by its words from the end of the Timeline: an exact
  tie (op id or line index on the row) needs a field on `RunReport.updated`, a wire change, so a ruling.
- A set-aside row carries its op through its contribution (`requires`, one op), not a field on the row: same reason.
- scripted.ts still captures the note a fallen-back merge could not join "grounding its row's name"; grounding no
  longer reads it, but dropping it changes the capture, so it waits for the split.
- wordRule on live (m5) still awaits the lead's ruling.

## Sources

- Functional core, imperative shell: the report rows are data the core builds from operations; the check is
  structural (https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell).
- jscpd ratchet as the repo's gate (`scripts/check-duplication-gate.mjs`).
