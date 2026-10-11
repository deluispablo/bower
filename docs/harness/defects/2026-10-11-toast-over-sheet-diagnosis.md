**toast-over-sheet — Important diagnosis**

Root cause and placement home:

- [src/ui/Dock.tsx:30](/Users/deluisp/Projects/bower-app/src/ui/Dock.tsx:30) owns placement: one stack containing `Toasts` and, on phone, the run chip. Toast markup lives at [src/ui/toast.tsx:128](/Users/deluisp/Projects/bower-app/src/ui/toast.tsx:128).
- [src/ui/ui.module.css:139](/Users/deluisp/Projects/bower-app/src/ui/ui.module.css:139) places the dock at **z-index 60**. The scrim is **50** at line 54; the sheet is **51** at line 60; menus are **55** at line 109. These are literal CSS values, not design tokens.
- Toasts have no portal. [src/ui/Sheet.tsx:36](/Users/deluisp/Projects/bower-app/src/ui/Sheet.tsx:36) uses Radix’s modal `Dialog.Portal`, whose default destination is `document.body`. Later portal insertion cannot beat the dock’s higher z-index. This is a CSS layer, not a native dialog top layer.
- At 375, the dock spans x=16–359 and ends **84 px + safe-area inset** above the viewport bottom: tab height 72 px ([src/styles/base.css:14](/Users/deluisp/Projects/bower-app/src/styles/base.css:14)) plus 12 px. Toasts stack upward.
- The phone sheet occupies that same region: fixed, full width, `bottom:0`, up to `92dvh` ([src/ui/ui.module.css:55](/Users/deluisp/Projects/bower-app/src/ui/ui.module.css:55)). Its opaque surface paints below the toast.
- `--dock-h` reserves space in the underlying page, not the portalled sheet ([src/app/shell.module.css:69](/Users/deluisp/Projects/bower-app/src/app/shell.module.css:69)). It cannot prevent this overlap.
- At 1440, the dock is absolute in the main column, 24 px above its bottom; the sheet starts at `12vh`. Overlap depends on sheet height, but the same incorrect layer order remains.
- The reported messages originate at [src/features/piles/Add.tsx:174](/Users/deluisp/Projects/bower-app/src/features/piles/Add.tsx:174); the warning body is at [src/features/settings/Settings.tsx:185](/Users/deluisp/Projects/bower-app/src/features/settings/Settings.tsx:185).

Modal knowledge:

- `Sheet` receives its own `open` state and passes it to Radix and `useBackCloses`.
- [src/ui/back.ts:32](/Users/deluisp/Projects/bower-app/src/ui/back.ts:32): `afterOverlaysClosed()` waits only for outstanding self-generated history backs. It can resolve while a sheet remains open; it is **not an open-modal signal**.
- `useUi` holds some overlay flags, but Settings’ sheets use local state. Dock/Toasts consume no aggregate modal state.
- Existing focus handling detects mounted layers through DOM roles ([src/ui/focus.ts:114](/Users/deluisp/Projects/bower-app/src/ui/focus.ts:114)); it is not a reactive toast subscription.

Spec status:

- [docs/design/specs/2026-10-09-v2.md:27](/Users/deluisp/Projects/bower-app/docs/design/specs/2026-10-09-v2.md:27): “Messages sit above the tab bar, full width, never over the work”.
- That spec defines normal placement, spacing and duration, but no sheet-open placement or suppression/queue policy. No corresponding layer token was found.
- [docs/design/specs/2026-10-10-questions-ui.md:23](/Users/deluisp/Projects/bower-app/docs/design/specs/2026-10-10-questions-ui.md:23) requires toast feedback after answering inside the tidy sheet; blanket dropping needs a ruling.

Options for lead/designer:

- **Smallest placement candidate:** change the shared `.dock` z-index from 60 to **40**: above tabs (30), below drawer scrim (44) and sheet scrim (50). One rule, no per-sheet offsets; the run chip follows it.
- **Suppress visually:** hide during modals; current timers would still expire unseen.
- **Queue:** defer presentation and pause/start expiry appropriately; preserve actions until the last modal closes.
- **Move:** adopt one shared modal-aware location. No existing spec defines that location.
- Underlay fixes covering; it does not guarantee feedback remains available after closing. Policy remains undecided.

Red outline:

- **Unit:** real Dock+Sheet lifecycle coverage: opening/closing preserves message identity/action and modal focus. For the CSS-only candidate these are regression checks; jsdom cannot provide a meaningful stacking red.
- **If suppression/queue wins:** fake-timer unit reds for existing/new messages, nested modals, final close, replacement, action validity and expiry.
- **E2E at 375 and 1440, demo and fake:** reproduce both messages through Add; open tidy confirmation with 24 things, and sign-out warning with two uploads held waiting.
- Assert button-centre hit testing and unobscured warning text using `elementsFromPoint` across the affected region; `toBeVisible()` alone misses this defect.
- Assert modal focus containment, dismissal, the chosen post-close message policy, and normal dock placement without a modal.
- Existing [e2e/v2-dock.spec.ts:32](/Users/deluisp/Projects/bower-app/e2e/v2-dock.spec.ts:32) covers normal placement; [e2e/c02-upload-reload.spec.ts:65](/Users/deluisp/Projects/bower-app/e2e/c02-upload-reload.spec.ts:65) covers sign-out but lacks occlusion assertions.

Read-only source diagnosis; no files changed, network used, or tests run.