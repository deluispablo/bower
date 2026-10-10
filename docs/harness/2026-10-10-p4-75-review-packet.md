# Packet: P4-75 review (shell-page-column, written by Codex; DEFECTS shell-page-column-squeeze)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-shell-page-column`. You may run `pnpm exec vitest run src/app src/ui` in that worktree.

## What to review

- **Diff:** `git diff claude/p3...shell-page-column`: `src/app/DesktopShell.tsx`, `shell.module.css`, `src/ui/Sheet.tsx`, `Button.tsx`, `ui.module.css`, the unit test, `e2e/shell-page-column.spec.ts`, the notes.
- **Packet:** `docs/harness/2026-10-10-shell-page-column-packet.md`. Its "What the person sees" section is signed by the designer: every width, label, aria value and behaviour is contract.

## Look hardest at

- **One home:** `docked(shellWidth, prefs)` is the only place that decides docking; measured on the shell's own width; nothing per screen. The overlay is the existing `Sheet` with an edge placement, not a second overlay component; the centred Sheet's other callers behave as before.
- **Prefs never rewritten** by folding, docking, or opening/closing an overlay.
- **The designer's table and rule:** 1440/1280 both docked; 1100/1024 right folded; 900 both folded; the general rule (52 + docked widths + 560); the folded toggle's label and `aria-expanded`; the docked toggle without `aria-expanded`; the overlay's name, close button first and focused, Escape, scrim, opening something inside closes it; focus back to the toggle; grows-while-open docks and focuses the toggle; shrinks-while-focused moves focus to the toggle; the drag clamp and `aria-valuemax`; reduced motion and "Bower moves".
- **Tests prove it:** the e2e covers the table and the overlay behaviours (red: 12 failed without the fix, 12 passed with it on demo and fake); no fixed waits, `.only`/`.skip`, or loosened bounds; no existing test changed.

Already run by the coordinator: the red e2e without the fix (12 failed), with the fix demo 12/12 and fake 12/12, pnpm check green.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
