# Packet: c4-focus-return fix round (TL-P4-22 addendum 5)

- **Entry:** `c4-focus-return` (`ui: true`). This is a UI-only fix round after the designer's check at a4d092e7. Worktree `/private/tmp/bower-c4-focus2`, branch `c4-focus-return` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-22 addendum 5 (main 50d7409c);
  - DEFECT_LOG `menu-sheet-focus-to-heading`;
  - the c4-focus-return packet's signed-off "What the person sees" table, row "Any other sheet … → the control that opened it".
- **Starting model:** `bower-implementer` (Sonnet). The pruning trial applies, so there is no re-review: the notes say `review: skipped (TL-P4-22)`, and the designer's check follows.

## Contract

1. **One home, `src/ui/focus.ts`.** `openerNow` (:27) also keeps the opener of the layer (a menu sheet) that holds the focused control.
2. **Fallback order.** `returnFocusTo` (:41) tries the opener first, then that layer's opener, then the heading.
3. **No per-screen targets.** Sheet and the screens never pick a target themselves.

## Red

`a sheet opened from a menu sheet returns focus to the menu's opener`, on the phone:
- Note → "More for Car" → Rename → Escape: focus lands on "More for Car".
- Files → a row's menu → Rename → Escape: focus lands on that row.
- The same holds for Move.
- When both openers are gone, focus goes to the heading. This is a separate unit case.

## Verify

The red, plus every c4-focus-return verify, plus axe on the touched screens. `pnpm check` must be green.

## Commits

The red (tests only), then the fix, then the notes addendum in its own commit, with `tests changed:` lines and `review: skipped (TL-P4-22)`. The card carries `worktree:`.
