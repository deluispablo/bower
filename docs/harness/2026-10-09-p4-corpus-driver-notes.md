# p4-corpus-driver — implementation evidence and blocked handoff

Status: ready for coordinator commits under TL-P4-28 addendum 2. Case 6 removed from this entry entirely.
Its complete material and exact proposal are preserved in `docs/harness/2026-10-09-c05-open-question-person-notes.md`.
It is a product-policy question for the designer and owner, not a defect. Cases 1–5 and expectations are unchanged.
No git-writing commands, network, pnpm check, servers or e2e were run.

## Research and the one mechanism

Read the packet, worker card, preparation, `runner/test/corpus-run.ts`, `runner/src/corpus.ts`,
`runner/test/c05-incorporation.test.ts`, `runner/test/second-brain-method.test.ts`, and `runner/src/provider.ts` first.
The offline standard is the existing C05 test's structured intent reply, fed through `runWithClaude`, the runner's
`main`, the Claude provider's validation, `planScripted`, and the fenced runner operations. The default demo provider
continues to serve older scripted cases. `replies.json` supplies only deterministic replies at the existing provider
boundary; it neither plans nor writes. No production provider or note-write mechanism was changed.

Local references: `runner/src/claude.ts` (prompt shape, grounding and `notesShown`),
`src/data/contracts/questions.ts` (`subjectOf`, the one typed subject parser),
`src/data/contracts/note-edit.ts` (ownership refusal), and `src/data/spine/scripted.ts` (existing planner).
No external source was fetched because the assignment explicitly forbids network access.

## Contract and evidence

- `questionsExactly` and typed `pairSubject: { kind: 'pair', notes: [path, path] }` are optional report expectations.
  `ScoreInput.pathsById` resolves the existing report question's pair ids to the actual shown paths. It never matches
  names or substrings. Old expected files and old scorer calls retain their behavior. A reversed pair is the same pair.
- Optional `between` holds personal edits (`kind: edit`, path, text) or moves (`kind: move`, path, to). An omitted
  field is one run; an empty list is two runs without a personal edit. Both presses use the same fake Drive.
  The driver records a new personal request before the second press and admits the current folder again. Admission
  time and run id advance deterministically, so the normal older-view barrier accepts the second report. The fake
  Worker wire gained an optional run id with the old default unchanged. No real timer was added.
- Reply bindings are exact admitted file names (`$file:NAME`), resolved to the actual file ids shown by the provider.
  A missing binding throws. A retry receives the same reply for the same provider cwd/press; it cannot consume the
  next run's reply. The original four C05 SCRIPTS remain; all cases with reply files join that same table, and the
  equality assertion still checks the entire C05 case list.
- Case 1 begins without a Current state. The first source is filed and the real planner writes the initial state
  and original committee history. The personal edit's bytes were captured from that actual write and retain its
  `bower_state: ad0d49f0788bfc33` mark while changing its section and adding My plans. Run 2 preserves the exact personal
  block and both prior history lines, files the new source, appends one line and asks exactly once. The supplemental
  test verifies the actual first write and the complete shown replacement lines in the generated permission question.
- Case 2 requires exactly one typed pair question with the two real paths and byte-identical notes and hub.
- Case 3 uses the prep's legacy seeded no and exact empty intent; all notes and links remain identical and no question
  is reported. Generated yes/no/replay lifecycle variants in the preparation remain unimplemented at this blocked
  boundary; the legacy snapshot is not claimed as proof of those variants.
- Case 4 keeps the old state, personal kitchen prose and original history, then appends a single cited contradiction
  naming both attributed rents. C07 resolution is not assumed.
- Case 5 establishes ownership with a real first write, then uses the exact second garden proposal. Its state changes,
  personal prose and both original history lines survive, and no permission question appears. The supplemental test
  inspects persisted JSON undo evidence for a state rewrite retaining the exact previous lines.

Every added case has a real method-log judgement: all agree with sourced history, personal permission, duplicate
consent, or attribution as applicable. No fixture facts use real people, places or non-2026 dates.
No expected count, threshold, existing golden, or failure was loosened.

## Scope ruling

TL-P4-28 addendum 2 removes case 6: its folder, README and method-log rows are gone. SCRIPTS registers
reply files from corpus folders, so deleting the folder removes its entry without changing the registration mechanism.
The packet and prep now point to the open-question document rather than carrying the deferred case id.
No recommendation or production policy change accompanies the preserved material.

Generated merge yes/no and replay variants, replay/no-adoption variants, late read-to-write interference variants
and direct move coverage remain outside the delivered evidence; they are not claimed as proven.

## Red and gates

Initial `/tmp/corpus-driver-red.log`: all three required named tests failed assertions:

1. `the scorer counts questions exactly and checks a pair's subject`: expected false, got true.
2. `a case's between step runs between two runs`: expected two provider calls, got one.
3. `the C05 corpus cases score green with scripted proposals`: full seven-case list differed from four SCRIPTS keys.

All three named assertions are now green after the addendum-2 scope ruling.
`/tmp/corpus-driver-contract.log` records the scorer, between edit, actual ownership and undo evidence tests passing.
`pnpm -C runner exec vitest run > /tmp/corpus-driver-runner.log 2>&1`: 312 passed, 2 failed, 314 tests.
The two failures are the C05 whole-list scorer and the general scripted-corpus scorer, both solely for case 6.
The golden tests passed with exactly 78 and 88 Drive calls; their files and expectations were untouched.
`pnpm exec tsc -p tsconfig.app.json > /tmp/corpus-driver-app-types.log 2>&1`: passed.
`pnpm exec tsc -p runner/tsconfig.json > /tmp/corpus-driver-runner-types.log 2>&1`: passed.
`git diff --check`: passed. pnpm check and e2e are deferred to the coordinator's lock by explicit owner instruction.

Addendum-2 final verification: `/tmp/corpus-driver-runner2.log`: 40 test files, 314 tests passed.
Unchanged golden assertions passed at exactly 78 and 88 Drive calls.
`pnpm exec tsc -p tsconfig.app.json` passed; log `/tmp/corpus-driver-app-types2.log`.
Read-only `git diff --check` passed. The two record patches reconstruct both documentation files exactly.
The case-id search now finds only preserved material in the open-question document.
No pnpm check or e2e ran, as explicitly instructed. Earlier red results above are historical evidence.

## Coordinator commit order and file sets

No commits were made. All changes are unstaged. The addendum-2 ruling authorizes this delivery.
The following groups preserve the packet's order. Shared documentation rows are split into two exact patches outside
this checkout, so the coordinator can stage the corresponding hunks without combining cases 1–3 with cases 4–5.
The patches were generated from read-only `git show HEAD:<path>` and contain no git-index operations.

1. **Red:** `runner/test/corpus-driver.test.ts` only. Its fixture now uses the words-only pair case so the second
   press is a genuine successful production run; the original failure remains the same two-call assertion.
2. **Scorer/driver:** `runner/src/corpus.ts`, `runner/test/corpus-run.ts`, `runner/test/drive-v3.ts`,
   `runner/test/corpus.test.ts`, `runner/test/c05-incorporation.test.ts`. The C05 table generically registers reply
   files, so case-specific replies stay wholly in their respective case folders rather than sharing test hunks.
3. **Cases 1–3:** all changed/new files under `harness/corpus/c05-person-edited-between-runs/`,
   `harness/corpus/c05-merge-question-first/`, `harness/corpus/c05-merge-answer-no/`;
   `runner/test/c05-between.test.ts`; and the README/method rows in `/tmp/corpus-driver-03-records.patch`.
4. **Cases 4–5:** all files under `harness/corpus/c05-conflicting-fact-kept/`,
   `harness/corpus/c05-marked-state-keeps-history/`;
   `runner/test/c05-marked-history.test.ts`; and the README/method rows in `/tmp/corpus-driver-04-records.patch`.
5. **Notes and scope:** `docs/harness/2026-10-09-p4-corpus-driver-notes.md`,
   `docs/harness/2026-10-09-c05-open-question-person-notes.md`,
   `docs/harness/2026-10-09-p4-corpus-driver-packet.md`, `docs/harness/2026-10-09-c05-prep.md`.

The two patches sequentially reconstruct the current `harness/corpus/README.md` and
`docs/harness/2026-10-08-p4-method-rubric-changes.md`. The new case directories include case.json, expected.json,
replies.json, rubric.md, the synthetic source files and initial note files. No generated vitest report is a delivery file.

## Existing tests changed

- tests changed: runner/test/c05-incorporation.test.ts: register case reply files in SCRIPTS and pass stable id/path evidence
  to the one scorer; retain the full-list equality and every existing outcome assertion.
- tests changed: runner/test/corpus.test.ts: pass stable id/path evidence alongside the run to verify typed pair subjects;
  retain all original structural assertions and the full scripted case set.
- tests changed: runner/test/drive-v3.ts: optional run id defaults to the original id; fake Worker endpoints support distinct
  sequential presses on one Drive. This is a test helper, not a modified assertion or golden.
- tests changed: runner/test/corpus-run.ts: reuse the production runner for sequential presses and deterministic replies;
  existing one-run cases retain their original provider behavior. This is a helper, not a weakened test.
