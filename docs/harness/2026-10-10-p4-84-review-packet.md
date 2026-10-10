# Packet: P4-84 review (undo-miss-refresh, written by Codex; DEFECTS undo-compensate-counterexample, option (1))

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-undo-miss-refresh`. You may run `pnpm exec vitest run src/data/vault --maxWorkers=2` there.

## What to review

- **Diff:** `git diff claude/p3...undo-miss-refresh`: `src/data/vault/drive-vault.ts` (`rulesForRemoval`), the replay red in `undo-compensate.property.test.ts`, the hit/miss unit red in `drive-vault.test.ts`, notes.
- **Contract:** `docs/harness/2026-10-10-undo-miss-refresh-packet.md`; the lead's ruling (option (1): one helper, refresh once on a miss); the diagnosis `docs/harness/2026-10-10-undo-compensate-counterexample-diagnosis.md`.

## Look hardest at

- One helper, used by every journal-derived removal that reads the cached listing; no refresh on a hit; exactly one on a miss; `not-found` only after it.
- No change to FIFO, write-once, `Journal.retract`, the lock or the inverse record; `refresh()` cannot race the lock or re-enter a listener.
- The replay is the exact seed/path with the unchanged spine, generator and oracle; the hit/miss red has its positive control.

Already run by the coordinator: pnpm check.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
