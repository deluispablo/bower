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

## What the person sees (signed by the designer, claude/design 15b29989, docs/design/specs/2026-10-10-shell-page-column-what-the-person-sees.md; contract)

Signed by the designer on 2026-10-10 (DEFECTS shell-page-column-squeeze). The desktop shell starts at 900 px; under 900 px the phone shell is unchanged. The widths are the defaults: ribbon 52 px, side panel 300 px, right panel 320 px. The page column never gets narrower than 560 px.

### Each width (both panels open in prefs, default widths)

| Shell width | Side panel | Right panel | Page column |
| --- | --- | --- | --- |
| 1440 | docked | docked | 768 px |
| 1280 | docked | docked | 608 px |
| 1100 | docked | folded | 748 px |
| 1024 | docked | folded | 672 px |
| 900 | folded | folded | 848 px |

The general rule, for any widths and prefs: dock the side panel and the right panel while 52 + the docked panels' widths + 560 fits. Fold the right panel first, then the side panel. With the defaults, the right panel folds below 1232 px, and the side panel also folds below 912 px. A panel closed in prefs is not shown and takes no room, as today. Folding and docking change nothing in prefs.

### A folded panel's button

| Situation | What shows |
| --- | --- |
| The button | It is the panel's existing toggle in the tab strip, same icon and place. Its label is "Show the side panel" or "Show the right panel", with `aria-expanded="false"`. |
| Pressing it | The panel opens as an overlay (below), and the button gets `aria-expanded="true"`. Prefs do not change. |
| A docked panel's button | Unchanged: "Hide the side panel" or "Hide the right panel", and pressing it closes the panel in prefs, as today. A docked panel's button has no `aria-expanded`. |

### The overlay

| Situation | What shows |
| --- | --- |
| Where | It slides in from the panel's own edge. The side panel opens beside the ribbon, where it docks; the right panel opens from the right edge. It is full height, over a scrim that covers the rest of the shell. Motion is the existing sheet motion; with reduced motion or "Bower moves" off it appears with no slide. |
| Width | The panel's width from prefs (300 or 320 px by default), never more than the shell width minus 52 px. |
| Name | A dialog named "Side panel" or "Right panel" (the title visually hidden). It holds the panel's own content, the same as when docked, with no grab handle. |
| Close | A close button comes first in the panel, at its top corner nearest the page: the existing small IconButton, 44 px target, labelled "Close the side panel" or "Close the right panel". The overlay also closes on Escape and on a press on the scrim. Opening a note, file or folder from inside it closes it, and the page goes there. |
| Focus | On open, focus goes to that close button. On close, focus goes back to the toggle that opened it. After opening something from inside, focus goes to the new page's heading, as any navigation does. |
| The window grows while it is open | The overlay closes and the panel docks in its place. Focus goes to the same toggle. |
| The window shrinks while a docked panel holds focus | The panel folds, and focus goes to its toggle, never to the page body. |

### Dragging at the limit

| Situation | What shows |
| --- | --- |
| Dragging a panel wider | The resizer stops at the width that leaves the page column 560 px. It doesn't bounce or snap, and the panel doesn't fold. The existing limits (220–480 px) still apply. |
| The keyboard on the resizer | The arrows stop at the same width. `aria-valuemax` is the current limit, the smaller of 480 and what leaves 560 px. |
| A folded panel | It has no resizer. Its overlay keeps its prefs width. |

**Sheet:** the existing `src/ui/Sheet.tsx` gains an edge placement (today a centred dialog on desktop); still one overlay home, owned by this entry.

## Commits

1. The reds. 2. The fix. 3. The notes (`docs/harness/2026-10-10-shell-page-column-notes.md`, with `compatibility: FIXSHA` if a commit touches src/features).
