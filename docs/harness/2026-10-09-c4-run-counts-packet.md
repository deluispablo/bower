# Packet: c4-run-counts (stage 4, TL-P4-22 addendum 2)

- **Entry:** `c4-run-counts` (perf, runner only). Worktree `/private/tmp/bower-c4-counts`, branch `c4-run-counts` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-22 addendum 2 (main b61acefe), option (b);
  - DEFECT_LOG `stage-3-live-slower`, with its [diagnosis](defects/2026-10-09-stage-3-live-slower.md);
  - TL-P4-08 and its addenda: the Drive-call goldens never rise.
- **Starting model:** `bower-implementer` (Sonnet).

## Today

- Timing phases have one home, `runner/src/timing.ts:9`.
- `drive-calls-golden.test.ts:30-83` infers each call's phase by itself. That is a second attribution of calls to phases.
- The runner logs no Drive-call count, and no region.

## Contract

1. **Count in the one transport.** The transport (RunnerDrive's fetch hook, `runner/src/drive.ts:~90`) counts each call and its bytes (request and response) under the current timing phase. The phase comes from timing.ts; the transport keeps no phase list of its own.
2. **Print the counts.** The `timing:` line adds, for each phase, the calls and bytes. It also adds the runner's region, read from the environment the executor provides; cite which variable. Existing fields keep their names and order, and the new fields go at the end.
3. **The golden asserts timing's counts.** `drive-calls-golden.test.ts` drops its own phase inference. It asserts the counts that timing.ts collected, with the same numbers: C04 78 and 25-runs 88. Add a `tests changed:` line.
4. **Scope.** No app code changes. lastWritten needs no change, since it shows in the reads count.

## Red

`the timing line counts calls and bytes per phase and names the region`: today the line has neither.

## Verify (exact names)

- `the timing line counts calls and bytes per phase and names the region` (runner).
- The Drive-call goldens, under their existing names, now assert timing's counts. Name them on your card.
- `pnpm check` is green.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-c4-run-counts-notes.md`), with `tests changed:` lines. Put a `worktree:` line on the card.

Reviewers are read-only. They never move the main checkout in any form.
