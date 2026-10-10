# Packet: P4-98 review (undo-fifo-seed, tests only, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-undo-property-seed`.

## What to review

- **Diff:** `git diff claude/p3...undo-property-seed -- src` (one commit 680212f6: the pinned replay and the model change together) with the notes `docs/harness/2026-10-10-undo-fifo-seed-notes.md`.
- **Contract:** the packet `docs/harness/2026-10-10-undo-fifo-seed-packet.md`; the diagnosis `docs/harness/defects/2026-10-10-undo-fifo-seed-diagnosis.md`; the lead's ruling (b) (DECISIONS after f885992c); TL-P4-27 addendum 9 (2).
- **Gates:** codex-run.sh: pnpm check pass.

## Look hardest at

- Tests only: no product file and no journal API changed.
- One distinct terminal state ("settled without sending") in the property model, used at all three observer sites; it never counts as delivered and never hides a genuinely unresolved head.
- The seed -1937975690 path "40" is pinned as a named replay; the class table covers refusal at inverse admission and at a later flush, same tab and cross tab.
- Every existing seed, budget and assertion unchanged; nothing loosened.
- You may run `pnpm exec vitest run src/data/vault/undo-compensate.property.test.ts --maxWorkers=2` with output to /tmp/p4-98-*.log.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
