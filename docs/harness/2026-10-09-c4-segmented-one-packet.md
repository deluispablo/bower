# Packet: c4-segmented-one (stage 4, UI-only, pruning trial)

- **Entry:** `c4-segmented-one` (`ui: true`). Worktree `/private/tmp/bower-c4-seg`, branch `c4-segmented-one` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-22 addendum 10 (a) (main 3d6bcfec);
  - DEFECT_LOG `second-segmented-list-table`;
  - v2-targets: the one `Segmented` (src/ui/Segmented.tsx) and the 44 px phone rule in src/ui/.
- **Starting model:** `bower-implementer` (Sonnet). Pruning trial: no re-review. The notes say `review: skipped (TL-P4-22)`, and the designer's check follows.

## Today

- `features/files/FolderScreen.tsx:144-150`: the List / Table toggle is its own radiogroup, styled by `folder.module.css:12-14` (`.views`, 36 px buttons). This is a second segmented control.
- `folder.module.css:43-44`: `.bookmarks` buttons, 36 px tall at 375.

## Contract

1. The List / Table toggle uses `src/ui/Segmented.tsx`. Delete `.views` and its markup. Keep the view's storage (`VIEW_KEY`) and behaviour.
2. The Files bookmark chips reach 44 px on the phone through the v2-targets home, the one 44 px rule in src/ui/, not a per-screen `min-height`. If the chips are not a src/ui control today, name the src/ui rule or class they now use on your card.
3. Desktop sizes are unchanged and stay at least 24.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

| Place | Phone (375) | Desktop (1440) |
| --- | --- | --- |
| A folder's "List / Table" | The same Segmented as Settings and Tell Bower. Segments are at least 44 px tall, with the same look, labels and icons. The chosen view is kept as today. | The same control at the desktop size. |
| Bookmark chips at the top of Files | Each chip is at least 44 px tall. Same labels and fill. | Unchanged. |

No strings change.

## Red

- `the folder view toggle is the one segmented control`: today the toggle is `.views`, not Segmented, and 36 px.
- `the files bookmark chips are at least 44 px on the phone`: today they are 36.

## Verify

The two reds (e2e on fake, phone and desktop, with axe target-size). `pnpm check` must be green.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-c4-segmented-one-notes.md`), with `tests changed:` lines and `review: skipped (TL-P4-22)`. The card carries `worktree:`.
