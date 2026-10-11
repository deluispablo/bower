# Packet: P4-115 review (messages-wait-for-sheets)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-messages-wait-for-sheets`.

## What to review

- **Diff:** `git diff claude/p3...HEAD -- src e2e`. The red is 714b9707, the fix is 372eef51, and the e2e spec repair is c399c5cb/74a4ec34.
- **Contract:** the packet `docs/harness/2026-10-11-messages-wait-for-sheets-packet.md` and the spec `docs/design/specs/2026-10-11-messages-wait-for-sheets.md` (TL-P4-55 (2)).
- **Gates (coordinator):** pnpm check, plus e2e messages-wait-for-sheets, v2-dock and v2-name-sheet on demo and fake, run after the repair commit.

## Look hardest at

- One rule in one home. The Dock reads "a modal is open" from the existing overlay state (back.ts / Sheet), with no second registry, no z-index or CSS change, and no per-sheet code.
- Timers pause and resume with their remaining time. Holds, the three-at-most rule, and announcement on show all still hold.
- A sheet that closes another sheet as it opens (the tidy sheet handing over) leaves no stuck hidden Dock, and no stuck count after an error or an unmount.
- The e2e repair keeps every row's assertion and positive control. Nothing was weakened.
- You may run `pnpm exec vitest run src/ui --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to `docs/harness/2026-10-11-p4-115-review.md` in the worktree, uncommitted.
