# Packet: P4-76b delta review (c5-test-margin fix round 1, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c5-test-margin`. You may run the three test files there with `--maxWorkers=2`.

## What to review

- **Delta:** `git diff 83796148..HEAD` (fa997dac tests, ce74c40f notes). The first review (P4-76, packet `docs/harness/2026-10-10-p4-76-review-packet.md` on claude/p3) BLOCKED: undo-compensate random batches 1-2 sampled with `fc.sample` at collection with no fixed seed and ran five-run slices, losing fast-check's report (seed, counterexample, shrinking, replay). Minors: a tautological count check in engine.test.ts; sampling paid at collection even when filtered; a stale notes line.
- **Packet:** `docs/harness/2026-10-10-c5-test-margin-packet.md` on claude/p3 (`git -C /Users/deluisp/Projects/bower-app show claude/p3:docs/harness/2026-10-10-c5-test-margin-packet.md`).

## Look hardest at

- Each batch has a fixed seed, printed; a failing part reports seed, path/replay and the case; the 50 runs per batch are deterministic and the same cases every run; the new test that a deliberately failing stand-in part reports them.
- The count check is independent now; nothing weakened (cases, numRuns, assertions, bounds, timeouts); each part ≤ 1 s at idle per the notes; `tests changed:` lines match.

Already run by the coordinator: pnpm check green.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
