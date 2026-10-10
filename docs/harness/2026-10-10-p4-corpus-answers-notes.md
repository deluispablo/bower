# p4-corpus-answers implementation

implementer: codex

TL-P4-32 finding 7, preparatory corpus-driver entry. No product code changed and no Git writes were run.
The coordinator commits the following sets in order:

1. Red: `runner/test/corpus-driver.test.ts`.
2. Fix: `runner/test/corpus-run.ts`, `runner/src/corpus.ts`, `harness/corpus/README.md`.
3. Notes: `docs/harness/2026-10-10-p4-corpus-answers-notes.md`.

The driver now runs an explicit sequence of later presses on one pretend Drive. An answer selects exactly one
previously produced question, resolves its actual id, and calls the existing app `answerQuestion` with `DriveVault`.
The app writes its answer journal record; the next production admission and runner `main` read and consume it.
The test run-start port schedules a yes at the next corpus press with the app's scope and answer request key.
A no starts no answer run. This port never writes a result or note directly. A repeated submission records one answer.
Runtime imports follow the existing runner answer-loop test, keeping browser-only implementation types out of Node tsc.

Expected outcomes can cover each press, including typed pair/state subjects, plus the final press as before.
Protected front matter and personal heading ranges compare raw UTF-8 bytes with the seed, including CRLF and Unicode.
The existing ownership parser supplies front matter and Bower section spans; personal heading selection reuses its
code-fence helper. Missing notes/ranges fail. Drive properties are checked directly for absence or exact values,
including empty values. Existing substring checks and the pure scorer remain unchanged.

Replay restores the original active or archived request record by its exact journal id. Fresh tidy-ups get new ids;
the result exposes the request records actually admitted to each press. Tests distinguish those inputs after the
original request was completed and archived. A request the provider does not answer still waits normally.
The original two-press `between` form remains supported. Schema additions are documented in the corpus README.

Offline research reused `src/data/answer-loop.ts`, `src/data/vault/drive-vault.ts` and its journal writer, plus
`runner/test/ask-answer-loop.test.ts` for the Node/browser runtime boundary. This is the app's existing answer path,
not a second answer implementation. Byte comparison uses the standard
[Node Buffer.equals](https://nodejs.org/api/buffer.html#bufequalsotherbuffer), whose byte-equality contract was read
locally in `runner/node_modules/@types/node/buffer.d.ts`. No network was used.

Tests first: the initial added tests failed on assertions before the driver/schema changes. After correcting fixture
setup to use an admitted rule and the existing scripted request path, the final red file was also checked against the
unchanged HEAD driver and schema, temporarily replaced through filesystem writes and restored byte-for-byte.
Eight new assertions failed; the two original driver tests passed. No bound or tolerance was loosened.
The original test bodies, corpus cases and scorer tests are unchanged. The new tests use a frozen 2026 date and an
isolated device store, with no real timer waits, `.only` or `.skip`.

Named red/green evidence:
- `answers a pair question through the answer path between presses`: red had no prior runs; green checks three
  production runs, one archived yes record with the produced question id, one merge line, and no repeated update.
- `a protected range fails on one changed byte`: red accepted the changed byte; green rejects it and CRLF changes,
  while accepting a later Timeline addition outside the protected personal section.
- Additional reds cover Keep mine, first-press expectations, state kind/subject, front matter, properties and replay.

Logs:
- `/tmp/pca-red.log`: final baseline red run, 8 failed / 2 passed, all failures on assertions.
- `/tmp/pca-target.log`: targeted driver tests passed, including both exact verify names.
- `/tmp/pca-unit.log`: `pnpm -C runner exec vitest run test`, exit 0; 322 tests passed, 0 failed.
- `/tmp/pca-tsc.log`: `pnpm -C runner typecheck`, exit 0.
- `/tmp/pca-lint.log`: `pnpm -C runner lint`, exit 0.
- `git diff --check`: passed (read-only Git command).

The full green runner JSON report was preserved while reproducing the final baseline reds.
`pnpm check` was not run, as instructed. No app screens were touched; no screen e2e was run.

removed: none
left out: none

tests changed: runner/test/corpus-driver.test.ts: additive only; the vitest import line gains afterEach, beforeEach, describe and vi for the new answer, per-run, protected-range and replay tests; no existing test body changed.
tests changed: runner/test/corpus-run.ts: the corpus driver this entry owns (TL-P4-32 finding 7) gains answer steps, per-run expectations, protected ranges and replay; existing cases run as before.

## Fix round 1

implementer: codex

P4-74 blocked on the scripted corpus loop using the pure `score()` and silently ignoring `runs`,
`protectedRanges`, `properties` and `questionSubjects`. Its Minor findings were empty subject/property
expectations passing vacuously and an active-request replay returning without reporting that no record was written.
This non-escalated fix addresses all three findings. No network or Git writes were used; the coordinator commits.

The corpus loop now asserts `CaseRun.score`, produced by the existing `scoreCase` driver mechanism.
It retains the exact success contract (`pass: true`, `unmet: []`) and the independent successful runner-code assertion.
The pure scorer and its existing tests are unchanged. This choice keeps the driver-only checks in their existing
home: `scoreCase` calls the pure scorer for shared checks, then checks the extra snapshots and metadata once.
Adding a second implementation to the pure scorer, or duplicating field validation there, would create another home.

The loop's assertions were extracted unchanged into `assertScriptedCases` before the red run. Both the existing
scripted corpus test and the regressions call this same loop. Four regression cases each supply one unmet driver-only
expectation to a real scripted runner call and require the loop to reject it. Before the fix every promise resolved;
the cases therefore demonstrate the review's exact false pass, rather than merely testing the scorer helper.

The driver score now refuses a supplied empty `questionSubjects` list, property `absent` list or `equals` map with a
specific unmet-expectation message. Six regression cases cover the final score and per-run score; the property cases
also include a valid companion expectation, so an empty field cannot hide beside one that actually checks something.
Omitted fields keep their existing meaning. Existing non-empty expectations and assertion values are unchanged.

`addRequest` now returns `requestAction`, retained in the press result even if admission produces no manifest.
It reports replay `already-active` when it makes no write, replay `restored` after writing the archived record back,
and `tidy` after creating a fresh request id. First and answer presses have no action. Two regressions distinguish
these outcomes: the active replay preserves the exact record bytes with exactly one matching record, while the
archived replay checks the archived seed, admitted original id and subsequent fresh tidy-up id. The existing replay
test and its assertions are untouched. The README documents scoring, non-empty fields and request actions.

Offline research reused the driver's existing `scoreCase` composition and production runner path. The installed
Vitest declarations document awaited rejection assertions and deep equality, used to test this same loop without
another scoring implementation: `node_modules/.pnpm/@vitest+expect@4.1.11/node_modules/@vitest/expect/dist/index.d.ts`.
Source: [Vitest expect API](https://vitest.dev/api/expect.html), consulted through those local declarations;
no network lookup was performed.

Coordinator commit sets:
1. Red: `runner/test/corpus.test.ts`, `runner/test/corpus-driver.test.ts`.
   `/tmp/pca-r1-red.patch` preserves the exact red diff against the starting HEAD.
2. Fix: `runner/test/corpus.test.ts` (only the loop's score source changes after the red),
   `runner/test/corpus-run.ts`, `harness/corpus/README.md`.
3. Notes: `docs/harness/2026-10-10-p4-corpus-answers-notes.md`.

Red evidence: `pnpm -C runner exec vitest run test/corpus.test.ts test/corpus-driver.test.ts`
redirected to `/tmp/pca-r1-red.log`, exit 1; 12 assertion failures, 19 existing tests passed.
Exact red/green names:
- `the scripted corpus loop rejects an unmet %s expectation`: runs, protectedRanges, properties, questionSubjects;
  red resolved instead of rejecting, green rejects through the unchanged loop success assertion.
- `refuses empty %s`: questionSubjects, absent, equals, under both final and per-run scores;
  red scored true with no unmet lines, green returns the exact failure message.
- `reports an already-active replay without writing another request`: red had no requestAction, green reports already-active.
- `reports a restored replay and a newly written tidy-up separately`: red had no requestAction, green reports restored and tidy.

Green logs (read only failures; all requested commands exited 0):
- `/tmp/pca-r1-unit.log`: `pnpm -C runner exec vitest run test`, pass.
- `/tmp/pca-r1-tsc.log`: `pnpm -C runner typecheck`, pass.
- `/tmp/pca-r1-lint.log`: `pnpm -C runner lint`, pass.
- `git diff --check`: pass (read-only Git command).

No app screens changed; no screen e2e was run. The requested gates were the three runner commands above;
the app-wide `pnpm check` was not run. No existing assertion, bound or tolerance was loosened.

removed: the scripted corpus loop's bypass of the driver's full score
removed: vacuous success for supplied empty subject/property expectations
removed: the unreported active-request replay early return
left out: none

tests changed: runner/test/corpus.test.ts: extract the same loop assertions for shared regression coverage; use the driver's full score while preserving the exact expected result and runner-code assertion; add four unmet-field regressions.
tests changed: runner/test/corpus-driver.test.ts: additive empty-field and replay-outcome regressions plus the Expected type import; every existing test body and assertion is unchanged.
tests changed: runner/test/corpus-run.ts: return request creation/replay outcomes and refuse empty subject/property expectations in the existing driver scorer; keep the shared pure scorer and runner path unchanged.
