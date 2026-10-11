# undo-fifo-seed implementation

implementer: codex

Scope: test-model defect only; no product file or journal API changed. No network or writing git command used.

## Red evidence

Added the named replay beside `replays undo-compensate-counterexample` before changing the model:
`undo-fifo-seed: seed -1937975690 path 40 settles the retired inverse without a FIFO break`.
`fc.assert` uses seed -1937975690, path "40", numRuns 1 and endOnFailure true.

Ran `pnpm exec vitest run src/data/vault/undo-compensate.property.test.ts --maxWorkers=2 -t 'undo-fifo-seed:'`.
It exited 1: one failure at the original `invariants` assertion at line 128, `expect(r.fifoViolations).toEqual([])`.
Received `2026-10-09T10-00-00.168Z-pn5pgh passed 2026-10-09T10-00-00.164Z-0punge`.
The reported seed/path were -1937975690/40, undoAll false; no shrinking occurred.
The .164Z inverse was retired without an attempt after its original was refused, as the diagnosis describes.
The red output was recorded in tmp-logs/replay-red.log; this evidence is retained here before temporary logs are removed.

## Model and coverage

One `settled-without-sending` disposition is shared by inverse tracking and both FIFO observers.
Its evidence is an observed inverse of a refused original, absence from the stored outbox, and no transport attempt.
It never enters confirmed, arrivals, or the sent outcome, and does not make `undone` report delivery.
The outbox is used only for verifying retirement; the person-state oracle still replays raw Drive bytes.

The four class cases cover inverse admission/later flush, each same tab/cross tab.
Each asserts the original failed, the inverse left the outbox without an attempt or arrival,
the terminal disposition is separate from delivery, and a later unrelated change proceeds.
Later-flush cases also assert the inverse is pending and still queued before refusal.
Two controls keep an unresolved sign-in head ahead of later same-tab/cross-tab changes,
then assert both arrive in order after recovery. Existing command generation, seeds, budgets and assertions stay.

tests changed: src/data/vault/undo-compensate.property.test.ts: classify verified no-send retirement at all three observers; add the exact replay, four refusal classes and two unresolved-head controls without weakening FIFO or delivery assertions.

Research was offline: the installed fast-check README documents the model-based testing approach
and seed/path failure replay; the existing `fc.asyncModelRun`/`fc.assert` mechanism is reused.
Source: https://fast-check.dev/docs/advanced/model-based-testing/
The local journal drain at journal.ts:393-396 and TL-P4-27 addendum 9(2) establish the no-send retirement rule.

## Verification

- `pnpm exec vitest run src/data/vault/undo-compensate.property.test.ts --maxWorkers=2`: exit 0, 36/36 passed.
- `pnpm exec vitest run src/data/vault/undo-compensate.test.ts --maxWorkers=2`: exit 0, 25/25 passed.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: exit 0.
- `pnpm exec eslint src/data/vault/undo-compensate.property.test.ts`: exit 0.
- `git diff --check`: exit 0 (read-only).
- `pnpm check`: exit 1 after acquiring the shared heavy-run lock. Root lint and typecheck passed;
  the root test suite finished with 163 passing files, 5,493 passing tests, one failing test and one unhandled error.
  The sole failing test was `src/e2e-port.test.ts:37`, `a server from another worktree is never reused`:
  its server listen failed with `EPERM: operation not permitted 127.0.0.1`, and the test timed out at 5,000 ms.
  This is a sandbox restriction unrelated to the property model. Later check stages did not run.
  No test contradicts the packet or the ruling; the sandbox-dependent gate test is unchanged.
- No e2e: tests-only entry, ui false, no screen changed.

All requested command output was redirected under tmp-logs/; the directory is removed before delivery.
The final test-code adjustment after the 36-test green only binds the same journal locally for TypeScript narrowing.
The unit file is unchanged. No seed, run count, generation budget, existing assertion or timeout was removed or relaxed.

## Commit handoff

The replay and model change share the test file, so the test file belongs only to the requested second commit,
as requested. There is no separate red commit: the runner rejects empty files lists (codex-run.sh:174),
and both changed payload files must belong to the second commit. The manifest therefore contains that one commit.
Its message is `undo-fifo-seed: settled-without-sending state in the property model`; the red evidence is above.
The notes accompany the model change, following the owner's explicit instruction overriding the packet's separate notes commit.
`.codex-commits.json` is the handoff control file; the runner consumes it rather than committing it as a payload file.
No changed payload file is listed in more than one entry. Commits are delegated to harness/codex-run.sh.

## Known-green close (coordinator)

The fix is a test-only commit (680212f6) that adds the pinned replay and the model state together, so done.sh cannot revert it and keep the replay. The red is proved: before the model change the named replay failed on the :128 FIFO invariant (this notes file), as the same seed did alone on claude/p3 (DEFECT_LOG undo-fifo-seed). After it: property 36/36, unit 25/25; codex-run.sh pnpm check pass; P4-98 PASS.
