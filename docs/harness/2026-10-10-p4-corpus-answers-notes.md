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

tests changed: runner/test/corpus-driver.test.ts: additive only; the vitest import line gains describe/beforeEach for the new answer, per-run, protected-range and replay tests; no existing test body changed.
tests changed: runner/test/corpus-run.ts: the corpus driver this entry owns (TL-P4-32 finding 7) gains answer steps, per-run expectations, protected ranges and replay; existing cases run as before.
