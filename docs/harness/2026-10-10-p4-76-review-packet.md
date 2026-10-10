# Packet: P4-76 review (c5-test-margin, written by Codex; TL-P4-31 addendum 1)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c5-test-margin`. You may run the three test files there with `--maxWorkers=2`.

## What to review

- **Diff:** `git diff claude/p3...c5-test-margin`: `src/bird/engine.test.ts`, `src/data/vault/undo-compensate.property.test.ts`, `src/codex-run.test.ts`, the notes.
- **Packet:** `docs/harness/2026-10-10-c5-test-margin-packet.md`.

## Look hardest at (the whole point is "faster, never weaker")

- **Same cases:** the startle test's full cadence × entry product and its geometry; each undo property batch's seed, numRuns 50 and its model-run body (does sampling with `fc.sample` then running five-run slices cover exactly the same 50 cases per batch as before, with the same shrinking/reporting on failure? If shrinking is lost, is the failure still reported with its case?); each codex-run refusal case.
- **Same assertions, bounds and timeouts:** nothing dropped, nothing made conditional, no `.skip`.
- **Each part ≤ 1 s at idle** per the notes' timings; the case counts equal before and after.
- `tests changed:` lines match the diff. The c5-codex-run verify (`-t "...refuses guarded paths, secrets and addresses..."`) still selects the split tests.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
