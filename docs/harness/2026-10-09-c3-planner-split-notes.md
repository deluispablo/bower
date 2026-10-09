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
