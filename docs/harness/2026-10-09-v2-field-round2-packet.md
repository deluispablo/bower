# Packet: v2-field fix round (TL-P4-22 addendum 3)

- **Entry:** `v2-field` (`ui: true`), a UI-only fix round after the designer's check at a78c360e. Worktree `/private/tmp/bower-v2-field2`, branch `v2-field` from `claude/p3`.
- **Ruling sweep:** TL-P4-22 addendum 3 (main 3e3935af); DEFECT_LOG `field-check-class-clash` and `field-error-loses-to-focus`; the v2-field packet's signed-off "What the person sees" table.
- **Starting model:** `bower-implementer` (Sonnet). Under the pruning trial there is no re-review: the notes say `review: skipped (TL-P4-22)`, and the designer's check follows.

## Contract

1. **Class clash.** `ui.module.css` has two `.check` rules: the menu indicator at :106 (menuCls.check, Explorer.tsx:465) and the new checkbox at :198. Give the checkbox its own class name. The menu indicator stays as it was before v2-field.
2. **Error over focus.** A focused invalid field shows the `--danger` edge, and the standard focus ring stays. Do this with selector order and specificity, not `!important`.

## Red

- `the sort menu tick keeps its own size and place`: in the desktop Files sort menu, the ticked item's indicator has its old size and sits at the right edge. Today it is a 24×24 box beside the label.
- `a focused invalid field keeps the danger edge`: after an invalid link and Enter in Add, while the link field still has focus, its computed border colour is `--danger`, and the focus ring still shows.

## Verify

The two reds, every v2-field verify, and axe on the touched screens. `pnpm check` must be green.

## Commits

The red (tests only), then the fix, then the notes addendum in its own commit, with `tests changed:` lines and `review: skipped (TL-P4-22)`. The card carries `worktree:`.
