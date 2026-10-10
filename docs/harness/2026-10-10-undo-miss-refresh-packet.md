# Packet: undo-miss-refresh (DEFECTS undo-compensate-counterexample, ruling option (1))

- **Entry:** `undo-miss-refresh`. Worktree `/private/tmp/bower-undo-miss-refresh`, branch `undo-miss-refresh` from `claude/p3`. Codex, non-escalated (one lookup path; no journal or Undo contract change), then a Claude review. `ui: false`.
- **Ruling:** DECISIONS (undo-compensate-counterexample, option (1)); diagnosis `docs/harness/2026-10-10-undo-compensate-counterexample-diagnosis.md`. Standard: cache-aside revalidation of a cached miss (cited in the diagnosis).

## Contract

1. On a missing rule id, `removeRule` (drive-vault.ts:1353) refreshes the listing once through the existing refresh path, then looks up again; only then `not-found`. One helper; any other journal-derived removal that reads the same cached listing uses it.
2. No change to FIFO, write-once reconciliation, `Journal.retract`, the lock or the inverse record. No extra listing on a hit (Drive-call goldens unchanged for hits).

## Red

A separately named fixed replay beside the property in `src/data/vault/undo-compensate.property.test.ts`: `replays undo-compensate-counterexample` with `{ seed: 752195386, path: '49', numRuns: 1, endOnFailure: true }`, keeping the spine, generator, oracle and assertions. Fails today with `not-found` at :244. Plus a unit test that a hit makes no extra listing call (positive control) and a miss makes exactly one.

## Verify

The reds by exact name, `pnpm check`.

## Commits

Red (tests only), fix, notes (`docs/harness/2026-10-10-undo-miss-refresh-notes.md`, line 3 `implementer: codex`, `removed:` lines).
