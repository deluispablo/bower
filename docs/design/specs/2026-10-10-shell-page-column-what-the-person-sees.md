# Shell page column: what the person sees (designer's section for the shell-page-column packet)

Signed by the designer on 2026-10-10 (DEFECTS shell-page-column-squeeze). The desktop shell starts at 900 px; under 900 px the phone shell is unchanged. The widths are the defaults: ribbon 52 px, side panel 300 px, right panel 320 px. The page column never gets narrower than 560 px.

## Each width (both panels open in prefs, default widths)

| Shell width | Side panel | Right panel | Page column |
| --- | --- | --- | --- |
| 1440 | docked | docked | 768 px |
| 1280 | docked | docked | 608 px |
| 1100 | docked | folded | 748 px |
| 1024 | docked | folded | 672 px |
| 900 | folded | folded | 848 px |

The general rule, for any widths and prefs: dock the side panel and the right panel while 52 + the docked panels' widths + 560 fits. Fold the right panel first, then the side panel. With the defaults, the right panel folds below 1232 px, and the side panel also folds below 912 px. A panel closed in prefs is not shown and takes no room, as today. Folding and docking change nothing in prefs.

## A folded panel's button

| Situation | What shows |
| --- | --- |
| The button | It is the panel's existing toggle in the tab strip, same icon and place. Its label is "Show the side panel" or "Show the right panel", with `aria-expanded="false"`. |
| Pressing it | The panel opens as an overlay (below), and the button gets `aria-expanded="true"`. Prefs do not change. |
| A docked panel's button | Unchanged: "Hide the side panel" or "Hide the right panel", and pressing it closes the panel in prefs, as today. A docked panel's button has no `aria-expanded`. |

## The overlay

| Situation | What shows |
| --- | --- |
| Where | It slides in from the panel's own edge. The side panel opens beside the ribbon, where it docks; the right panel opens from the right edge. It is full height, over a scrim that covers the rest of the shell. Motion is the existing sheet motion; with reduced motion or "Bower moves" off it appears with no slide. |
| Width | The panel's width from prefs (300 or 320 px by default), never more than the shell width minus 52 px. |
| Name | A dialog named "Side panel" or "Right panel" (the title visually hidden). It holds the panel's own content, the same as when docked, with no grab handle. |
| Close | A close button comes first in the panel, at its top corner nearest the page: the existing small IconButton, 44 px target, labelled "Close the side panel" or "Close the right panel". The overlay also closes on Escape and on a press on the scrim. Opening a note, file or folder from inside it closes it, and the page goes there. |
| Focus | On open, focus goes to that close button. On close, focus goes back to the toggle that opened it. After opening something from inside, focus goes to the new page's heading, as any navigation does. |
| The window grows while it is open | The overlay closes and the panel docks in its place. Focus goes to the same toggle. |
| The window shrinks while a docked panel holds focus | The panel folds, and focus goes to its toggle, never to the page body. |

## Dragging at the limit

| Situation | What shows |
| --- | --- |
| Dragging a panel wider | The resizer stops at the width that leaves the page column 560 px. It doesn't bounce or snap, and the panel doesn't fold. The existing limits (220–480 px) still apply. |
| The keyboard on the resizer | The arrows stop at the same width. `aria-valuemax` is the current limit, the smaller of 480 and what leaves 560 px. |
| A folded panel | It has no resizer. Its overlay keeps its prefs width. |
