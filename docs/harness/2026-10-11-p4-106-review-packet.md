# Packet: P4-106 review (c02-upload-count-ui, ui, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c02-upload-count-ui`.

## What to review

- **Diff:** `git diff claude/p3...c02-upload-count-ui -- src e2e`. Reds: 59d4dfbb and 46f07c59. Red repairs: 0b299ffd and edf47d4b. Implementation: ab3f9b32. Fix 1: 5c84961f. Notes: `docs/harness/2026-10-10-c02-upload-count-ui-notes.md`.
- **Contract:** the packet `docs/harness/2026-10-10-c02-upload-count-ui-packet.md`, the spec `docs/design/specs/2026-10-10-c02-upload-count.md`, and TL-P4-53 with addendum 1.
- **Gates (coordinator):** pnpm check passes; e2e app, capabilities, c02-upload-reload and c02-orphan-count pass on demo (71) and fake (95), with axe at 375 and 1440.

## Look hardest at

- Every row of the spec's test table, with its exact copy.
- The count comes from the vault's orphanSummary, and the pending count from the upload queue's one home.
- No count is computed in JSX, there is no second store, and unknown never shows as 0.
- The sheet appears only while something is sending:
  - it uses today's Sheet;
  - Keep sending is first and focused;
  - Escape keeps sending;
  - focus returns to Sign out;
  - Sign out waits for the overlay's history back, as Delete my account does.
- The sources/provider pass-through (`src/data/sources.ts`, `src/data/live/index.ts`) and the demo fixture (`src/data/demo/world.ts`): minimal, with no behaviour change elsewhere.
- Tokens only; UI copy rules (sentence case, no jargon).
- You may run `pnpm exec vitest run src/features/home src/features/settings --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to the path the coordinator names.
