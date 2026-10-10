# Packet: P4-75b delta review (shell-page-column fix rounds 1 and 2, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-shell-page-column`. You may run `pnpm exec vitest run src/app src/ui --maxWorkers=2` there.

## What to review

- **Delta:** `git diff 78256094..HEAD` (round 1: 56776700 reds, f862bd5c fix; round 2: bf4e37b4 reds, fd0be973 fix; notes). The first review: `docs/harness/2026-10-10-p4-75-review-packet.md`; its BLOCK: Sheet's `still` was not gated on `placement`, so every Sheet caller lost its animation with "Bower moves" off, and a JS reduced-motion check duplicated base.css:104. Minors: `src/ui` imported `@/app/prefs`; the first render folded both panels (width 0); `setOverlay` during render.
- **Round 2 (lead rulings):** the reduced-motion e2e branch restated as "no visible slide" (duration ≤ 0.01 ms or name none) with a positive motion control; resizer `aria-valuenow` rounded; a real `page.mouse` drag guard test (DEFECTS panel-resize-drag-stops, not reproduced).
- **Packet:** `docs/harness/2026-10-10-shell-page-column-packet.md` (designer-signed section is contract).

## Look hardest at

- Centred and bottom sheets keep today's motion in every setting; only the edge placement holds still with Bower moves off; reduced motion has one mechanism (base.css).
- The restated e2e assertion is not looser than the contract ("appears with no slide"), and the new control proves the edge sheet does slide otherwise. `tests changed:` lines match.
- First render docks per the table without a fold-then-dock flip; no setState in render.

Already run by the coordinator: e2e demo 16/16 and fake 16/16; pnpm check green.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
