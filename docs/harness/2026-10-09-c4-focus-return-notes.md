# c4-focus-return notes

Sources: WAI-ARIA APG modal dialog pattern (on close, focus returns to the element that opened it); Radix Dialog docs, `onCloseAutoFocus` (preventDefault, then focus by hand).

- `src/ui/focus.ts` is the one home: `openerNow`, `closeFocus` (for `onCloseAutoFocus`) and `returnFocusTo`, now timer-free (its watch ends when the opener goes or focus lands elsewhere). `Sheet` records its opener in a layout effect.
- All 8 sheet uses are covered through `Sheet`. Palette, Replay and toasts already used `returnFocusTo` and now lose its 3 s timer.
- Tree menu: focus returns to the tree in `onOpenChange(false)` and before a menu action runs (Radix calls `onCloseAutoFocus` in a later task, which is the qa10 window). The 30 ms and 0 ms timers in `Explorer.tsx` are gone.
- Red: 4 of 4 tidy-sheet e2e failed on `toBeFocused`; qa10 `Delete on a folder asks` failed 3 of 20 with 5 workers (`/tmp/c4f-red-qa10.log`); green 20 of 20.
- `focusRouteHeading` keeps its timers and its five `real-timers.json` names (belongs to `c4-test-timers`). `focusMain` keeps its 0 ms timer for the non-close uses (after a bin, a dismiss).
- Not done: Undo-restored effect in Explorer (no timer) still focuses the tree on its own.
- Known, not this entry: axe `target-size` on the desktop tab strip close button (`._tabX_`); the new e2e scope axe to `main` and the dialog.

tests changed: e2e/focus-after-close.spec.ts: added the two tidy-sheet focus-return tests (d-v2-04) and the axe helper; no existing test changed.
tests changed: src/ui/focus.test.ts: added the `focus returns on close with no timer` group; no existing test changed.
