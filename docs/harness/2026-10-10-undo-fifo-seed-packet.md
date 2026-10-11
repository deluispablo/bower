# Packet: undo-fifo-seed (test-model defect in the Undo property)

- **Entry:** `undo-fifo-seed`. Worktree `/private/tmp/bower-undo-property-seed`, branch `undo-property-seed`. Non-escalated: one Codex session (the pinned replay first, then the model change), then a fresh Claude review. `ui: false`. Tests only: no product file changes.
- **Defect and ruling:** DEFECT_LOG undo-fifo-seed; diagnosis `docs/harness/defects/2026-10-10-undo-fifo-seed-diagnosis.md`; the lead's ruling (b) (DECISIONS after f885992c): the product follows TL-P4-27 addendum 9 (2); the property model lacks a "settled without sending" state.
- **Owned files:** `src/data/vault/undo-compensate.property.test.ts` and, only for shared helpers, `src/data/vault/undo-compensate.test.ts`. No change to `src/data/vault/journal.ts` or any product file; no journal API change.

## Contract

1. One distinct terminal disposition in the property model for an inverse the drain retires without sending after its original is refused (a refused original plus the inverse gone from the outbox with no transport attempt). It is never counted as delivered. The three observer sites use it: the FIFO check at :128, the second FIFO check at :146–148 and inverse tracking at :89–95.
2. Seed -1937975690, path "40" pinned as a named replay test (`undo-fifo-seed: …`), beside the existing named replay.
3. A class table: refusal at inverse admission and refusal at a later flush, each same tab and cross tab: the original fails, the inverse is never attempted and leaves the outbox, and a later unrelated line may proceed.
4. Controls kept: a genuinely unresolved head still blocks later attempts. Every existing seed, budget and assertion is unchanged.

## Verify

`pnpm exec vitest run src/data/vault/undo-compensate.property.test.ts`, then `pnpm check`.

## Commits

The pinned replay (red), then the model change, then notes (`docs/harness/2026-10-10-undo-fifo-seed-notes.md`, line 3 `implementer: codex`, `tests changed:` lines).
