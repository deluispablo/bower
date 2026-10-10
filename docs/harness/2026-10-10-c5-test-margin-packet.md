# Packet: c5-test-margin (TL-P4-31 addendum 1; Codex, test, non-escalated)

- **Entry:** `c5-test-margin`. Worktree `/private/tmp/bower-c5-test-margin`, branch `c5-test-margin` from `claude/p3`.
- **Ruling:** TL-P4-31 addendum 1: the load timeouts are CPU contention (10 cores, load 14-19); split the slow tests, no diagnosis. Defects `startle-timeout-under-load`, `codex-run-test-timeout` (DEFECT_LOG) and the undo property batches.
- **Starting model:** Codex. Then a fresh Claude review.
- **Owned files, and only these:** `src/bird/engine.test.ts` (the test at :379), `src/data/vault/undo-compensate.property.test.ts` (random batches 1 and 2), `src/codex-run.test.ts` (the test at :136). A helper they share may go under `src/testing/`.

## Contract

1. Each of these tests runs in **≤ 1 s at idle**, by splitting into batches (more `it`s over the same cases) or by stubbing work that is not under test (e.g. a temp git repo built once per file and copied, rather than per test).
2. **Unchanged:** the number of cases and runs (property `numRuns`, seeds, every pose and kind covered), every assertion, every bound, and every timeout. Nothing is skipped, sampled down or made conditional on load.
3. Each split test keeps a name that says what it covers; the old names may become `describe`s. If a verify in `harness/features.json` names one of these tests, list it on the card (the coordinator updates the verify and re-proves).
4. No product code changes.

## Proof

- Before and after timings for each test at idle (`--maxWorkers=1`, alone), from the vitest JSON or reporter: every split part ≤ 1 s.
- The total case count is equal before and after (print or assert it).

## Commits

1. The test split (one commit: this entry has no red; it changes tests only). 2. The notes (`docs/harness/2026-10-10-c5-test-margin-notes.md`): one `tests changed: <path>: <why>` line per file (exact form, no line number), the timings, `removed:` lines.
