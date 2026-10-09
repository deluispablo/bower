# v2-dock notes

- Mechanism: `src/ui/Dock.tsx`, one per shell (PhoneShell above the tab bar, DesktopShell in `.center`). It holds `Toasts` and a slot (the run chip) and publishes `--dock-h` (stack height plus its gap to the edge: 12 px phone, 24 px desktop) on `html` with a ResizeObserver.
- Readers of `--dock-h`: `.phone` padding-bottom, desktop `main.view` padding-bottom, and one `html` `scroll-padding-bottom` rule under 900 px.
- Removed: `--toast-bottom`, the chip's fixed rule, the `Toasts` mount in `Shell.tsx`.
- The chip is brand-filled in every state (spec row); stopped and error keep a raised fill so their text stays legible.
- tests changed: e2e/qa11.spec.ts: the Bin line now reads "<name> is in your Drive's Bin."
- tests changed: e2e/qa5.spec.ts: same Bin line, regex follows the new words
- tests changed: e2e/qa8.spec.ts: same Bin line, regex follows the new words
- qa10:149, qa9:18, capabilities:177 needed no change: `role=status` is kept on the toast list and they pass.
- Axe on the desktop dock is scoped to the dock: the tab strip's close buttons (22 px) fail target-size today, not this entry.
- Port 5191 was taken by another worktree; ran e2e on a temporary config at 5291, deleted.
- Sources: WCAG 2.4.11 and technique C43 (scroll-padding), MDN ResizeObserver.
- Left out: top scroll-padding for a sticky header (none exists on the phone shell); chip on desktop (the status bar keeps it).
