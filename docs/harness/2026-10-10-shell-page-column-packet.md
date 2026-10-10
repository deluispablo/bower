# Packet: shell-page-column (DEFECTS shell-page-column-squeeze; Codex, UI, non-escalated)

- **Entry:** `shell-page-column` (ui: true). Worktree `/private/tmp/bower-shell-page-column`, branch `shell-page-column` from `claude/p3`.
- **Ruling:** DECISIONS "DEFECTS shell-page-column-squeeze" (the lead verified the cause; no separate diagnosis). The designer's spec is the ruling.
- **Starting model:** Codex. Then a fresh Claude review and the designer's check.

## Cause

The desktop grid (`src/app/shell.module.css:5`, `52px var(--lw) minmax(0, 1fr) var(--rw)`) gives the page column no minimum, and `src/app/DesktopShell.tsx:73` sets the panel widths from the prefs (`prefs.ts:38-39`, 300 and 320) whatever the window width. At 900 px with both panels open the page column is 228 px.

## Contract (one home: the desktop shell's layout, never per screen)

1. One pure function in DesktopShell's module, `docked(shellWidth, prefs)`, decides which open panels dock. The page column is never narrower than 560 px: the right panel folds first, then the side panel. It is measured on the shell's own width (a ResizeObserver, or the existing `useMedia` in `src/ui/media.ts`), never per screen.
2. Folding never rewrites the person's prefs (`leftOpen`, `rightOpen`, the widths), so widening the window docks the panels again.
3. A folded panel opens from its existing toggle button as an overlay through the existing `src/ui/Sheet.tsx` (no second overlay). It closes on Escape or an outside press, and focus returns to the button.
4. Dragging a panel wider is clamped by the same 560 px rule.
5. Research first: cite the standard (multi-pane layouts collapsing secondary panes to overlays below a breakpoint; e.g. Material 3 canonical layouts / list-detail, VS Code's sidebar behaviour).

## Reds

- Unit: a table for `docked()` at shell widths 900, 1024, 1100, 1280 and 1440 with both prefs open (and the widths from prefs), giving which panels dock; plus the drag clamp.
- E2E (demo, desktop project, both panels open in prefs) at the same widths: the page column is ≥ 560 px; the List/Table control is on one line; a folded panel opens as an overlay from its button; Escape closes it and focus returns to the button; widening the window docks it again with prefs unchanged. Axe with WCAG 2.2 and target-size.

## What the person sees (the designer writes and signs this section before dispatch)

- Each width (900, 1024, 1100, 1280, 1440): which panels are docked and which are folded.
- A folded panel's button: its label and state (`aria-expanded`), and what pressing it does.
- The overlay: where it opens, its width, its name, how it closes, and where focus goes.
- Dragging at the limit: what the person sees.

## Commits

1. The reds. 2. The fix. 3. The notes (`docs/harness/2026-10-10-shell-page-column-notes.md`, with `compatibility: FIXSHA` if a commit touches src/features).
