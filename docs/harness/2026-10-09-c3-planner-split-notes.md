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

## Part 2 fix round (P4-45b BLOCK, finding 1 Important; Minors 3 and 5)

Merge of claude/p3: 2a77dcaf (no conflict). Red 91e7663f, fix 7037f139.

- `grounded()` structure now includes multiplicity and identity. A row names each op once. Per op: a captured thing's
  move or Bin with rows has exactly one filed (or already saved) row and one set-aside row; an edit has one row per
  Timeline line it writes (one for a Current state alone; a kept note may have fewer, its carried lines are the keep's
  one row); a generated note has one created row, and one set-aside row unless a filing move or the requests.json
  write waits for it (a link's note, a request's note); a kept-as-one note's Bin one set-aside row; an archive move
  one row. Every other op has no set-aside row. A filed row's `to` is its member move's place (or its note's create's),
  its `note` the note made or edited (else in `to`); a created or updated row's path is its first op's note.
- report.ts: the "rows naming several moves" branch goes; a set-aside row with one move gets the move's cause, any
  other (ungrounded) contribution's rows are pushed as they are (`a set-aside row names its op` still holds).
- Compatibility rows for 09d0127d and 167297dc (src/data only, no wire change).
- Left as is: the New-mark tie by words (wire-field ruling pending with the lead).

New tests (src/data/spine/grounded.test.ts): `grounded refuses a missing Timeline-line row`, `grounded refuses a
missing generated-note set-aside row` (default seed plus a pile of words), `grounded refuses a duplicated filed row`,
`grounded refuses a row whose path disagrees with its op` (filed `to`, updated path, created path, filed `note`).

Gates: `pnpm check` pass (/tmp/c3p2r-check.log; runner 236/236, goldens C04 78 and 25 runs 88 green); unit
src/data + src/features 3712/3712 (/tmp/c3p2r-unit.log); C05 e2e desktop and phone pass (/tmp/c3p2r-e2e-c05.log).

Production lines this round: grounded.ts +69 -24, report.ts +10 -10 (+79 -34). Part 2 after the round:
+199 / -580, net -381.

# Part 3 (last)

Branch `c3-planner-split-3`, from claude/p3 a7c2ee04 (parts 1 and 2 merged).

## Commits

| sha | kind | what |
|---|---|---|
| 44135607 | red | three steps; the New mark follows the row's op id; an old report without row op ids still reads; each updated row carries its edit's op id and its line; a merge that fell back captures no note it could not join |
| f68c6d49 | red | grounded refuses an updated row without its op or its own line |
| 33c7c0eb | fix | `planScripted` = `capture` -> `decide` -> `build`, looped while a step asks to try again (no recursion) |
| bced533f | fix | the note a fallen-back merge could not join is no longer captured |
| 0549a761 | fix | `RunReport.updated` rows gain optional `op` and `line`; grounding checks them; the note screen marks by them |
| 71c96fd2 | docs | compatibility rows for 44135607 and 0549a761 |

## Contract 1: the three steps

- `capture(drive, rootId, opts)`: the listing, the journal lines taken, the inbox, readiness (`capturePiles`), things
  already saved, Bower's own files (requests.json, hashes.json). Read once per plan; never reads the reply.
- `decide(drive, captured, opts, attempt)`: the one `Decisions` type (model or scripted) applied to the capture, with
  the reads it names (pile notes, members' digests, notes to edit, link texts, questions.json, keep notes, compared
  notes, and the before-content of the runner files it will write and the hashes list). Ends `decided`, `plan`
  (nothing ready) or `again`.
- `build(decided)`: operations, report rows, manifest guard, grounding. No Drive and no reply (test: a watched reply
  shows every use in decide; the read count does not move in build).
- Re-planning: `planScripted` loops `decide` and `build` with an `Attempt` (`editCap`, `held`), never recursion.
  Each case, and why it stays a try again rather than a single pass:
  - orphans (a copy whose kept thing is not filed): holding its pile changes which piles are captured, which comes
    before; a try again.
  - keep, notes missing or unnameable: now decided up front from the listing (no try again needed).
  - keep that cannot go whole (lines, relinks or the other note's edit): known only after the edits are planned; a
    try again with `keep:<answer>` held.
  - waiting piles (merge line past the cap): known only after the cap; the pile is held whole, a try again.
  - edit-cap retry (manifest too big): known only after build; a try again with one edit fewer.
  - The folder is no longer listed again on a try again (fewer Drive calls on those rare runs; goldens unchanged).

## TL-P4-19 addendum 3: rows by op id

- `UpdatedRow = { path, what, op?, line? }` (contracts/types.ts), in `RunReport` and the manifest's report rows.
  `op` is the edit that wrote the row (also the keep row: the kept note's edit); `line` is the row's Timeline line
  counted from the end (0 = last), since one edit appends several lines and the note's lines carry no id. A line
  comes only with its op. **Ruling point:** the addendum names only the op id; `line` was added beside it because an op
  id alone cannot say which of an edit's lines a row is (a kept note's carried lines have no row). If the lead wants
  only `op`, the New mark has no way to locate a line without words.
- Readers: run-manifest and run-checkpoint parse both as optional (old records read: fixture test); layout's
  last-run reader is lenient already; `fixedReport` keeps them. Grounding: every updated row's `op` is its
  contribution's first op; an edit's own rows each name a distinct line below its entry count; a Current state's row
  names none.
- New mark: `newLineIndexes(timeline, rows)` marks `timeline.length - 1 - line` for rows with op and line. A report
  from before marks no line until the next tidy-up (deploy app and runner together).
- Set-aside rows: already tied by op id through their contribution's one op (part 2, `materialize`); no field added.

## Verify tests (new, exact names)

- `the planner runs capture, decide and build as three steps` (src/data/spine/scripted.test.ts)
- `the New mark follows the row's op id` (src/features/note/new-lines.test.ts; replaces part 2's "follows the row's
  op, not its text")
- `an old report without row op ids still reads` (src/data/contracts/run-checkpoint.test.ts, fixture 04)
- `each updated row carries its edit's op id and its line` (src/data/fake/fake-worker.test.ts, through the service view)
- `a merge that fell back captures no note it could not join` (src/data/fake/fake-worker.test.ts)
- `grounded refuses an updated row without its op or its own line` (src/data/spine/grounded.test.ts)
- Updated to the rule: fake-worker and fake-runner row assertions (`toMatchObject`, or op and line), runner
  `every Timeline line a run writes has its own report row` (lines 1 and 0) and keep-one-note (op, no line).

Gates: `pnpm check` pass (/tmp/c3p3-check.log; goldens C04 78 and 25 runs 88 in the runner suite). C05 e2e desktop
and phone pass (/tmp/c3p3-e2e-c05.log). `pnpm e2e:fake`: 257 passed, 61 skipped (/tmp/c3p3-e2e-fake.log).

## Production lines

Part 3 (a7c2ee04..71c96fd2, tests and docs excluded): +215 / -128, removed 128, net +87. scripted.ts +67 (+173 -106),
grounded.ts +6, types.ts +7, run-manifest.ts +4, run-checkpoint.ts +3, barrier.ts 0, NoteScreen.tsx 0, new-lines.ts 0.
Entry (parts 1-3): +762 / -902, net -140. scripted.ts +128, grounded.ts -402, demo/script.ts +85, new-lines.ts +17,
report.ts -2, types.ts +7, .dependency-cruiser.cjs +7, fake-runner.ts +6, run-manifest.ts +4, corpus.ts +4,
run-words.ts +3, run-checkpoint.ts +3, NoteScreen.tsx +2, provider.ts +1, dependency-exceptions.cjs -1, fixture.ts -2,
claude.ts, barrier.ts, Home.tsx, Replay.tsx 0.

## Left out

- `line` beside the op id (ruling point above). wordRule on live (m5) still awaits the lead's ruling.

## Sources

- Functional core, imperative shell (Gary Bernhardt): build is the core over decided data; capture and decide are the
  shell. https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell
- Tolerant reader (Martin Fowler): optional fields added, old records still read. https://martinfowler.com/bliki/TolerantReader.html

## Fix round (TL-P4-19 addendum 4): blocked before red

- Merged claude/p3 (67a9ae1e), no conflict. No code changed.
- Blocker: the New mark cannot "find the op's lines by the op". A Timeline line in the note carries no op id
  (`TimelineEntry` = date, text, source; note-edit.ts `lineOf` writes `- date · text · [[source]]`), the parsed
  `Note` the screen gets carries no file metadata, and the write stamp `bowerOp` is a hash of scope and intent on the
  file, not per line. So given (op, ordinal) the app can locate the op's block only by a place in the note (rejected by
  the ruling) or by words (rejected). Writer and grounded can switch to the ordinal (`c.lines` index), but the reader
  then has nothing to anchor on; changing the writer alone would mark wrong lines.
- Ways the lead could rule (each a design choice, not mine):
  1. The note carries the op on each line Bower appends (e.g. a hidden `<!-- op -->` tail in Bower's Timeline
     section): a note format change, parser and edit refusals touched, old notes have none (mark none).
  2. The app marks only when the note is as the op left it (file stamp is the op's and md5 equals what it wrote;
     needs the op's md5 or stamp on the row and file metadata on the note read), the op's lines being then its last
     k Timeline lines; a person's later line drops the mark rather than moving it. k needs the op's line count.
  3. The row also keeps the op's first line counted from the Timeline start (stable when the person appends at the
     end, shifts if they edit earlier lines): a position, which the ruling rejects for `line`.
- The updatedRow one-home minor is independent and waits for the same round.
