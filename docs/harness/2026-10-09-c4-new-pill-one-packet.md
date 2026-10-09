# Packet: c4-new-pill-one (stage 4, UI-only, pruning trial; Codex slot)

- **Entry:** `c4-new-pill-one` (`ui: true`). Worktree `/private/tmp/bower-c4-pill`, branch `c4-new-pill-one` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-22 addendum 16 (main b8b21a8b);
  - DEFECT_LOG `new-pill-three-copies`;
  - v2-move-here (d-v2-18), which uses folder's copy for "Now here".
- **Starting model:** Codex (TL-P4-23). Pruning trial: there is no re-review, and the notes say `review: skipped (TL-P4-22)`. The designer's check follows.

## Today

The "New" pill's look is defined three times:
- `src/features/note/note.module.css:54`: inline-block, margin-left 8px, padding 0 8px, vertical-align 1px;
- `src/features/home/home.module.css:51`: flex none, padding 1px 9px;
- `src/features/files/folder.module.css:22`: flex none, padding 1px 9px. It is used by FolderScreen and by MovePicker's "Now here".

All three share: border-radius 999px, background `--fresh`, color `--brand-line`, 13px and weight 600.

## Contract

1. **One home for the look.** The pill's look (radius, fill, colour, size, weight and its own padding) lives once in `src/ui/`, as a class in `ui.module.css` or a tiny `Pill` component. Use whichever matches how src/ui exposes similar marks today, and say which on the card.
2. **Placement stays with each caller:** note's `margin-left` and `vertical-align`, and `flex: none` in home and folder. Each caller keeps only its placement rule, or none.
3. **Same pixels.** Pick one padding and name it on the card. The designer checks whether the 1px difference between note (0 8px) and home/folder (1px 9px) is visible.
4. **Callers:** NoteScreen, Home, FolderScreen and MovePicker's "Now here". MovePicker drops its import of `folder.module.css`.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

| Place | Phone (375) | Desktop (1440) |
| --- | --- | --- |
| "New" on Home's recent rows | Unchanged | Unchanged |
| "New" on a folder's rows | Unchanged | Unchanged |
| "New" on a note's lines | Unchanged (padding per point 3) | Unchanged |
| "Now here" in the Move sheet | Unchanged | Unchanged |

No strings change.

## Red

`the new pill has one look everywhere`: an e2e on fake, phone and desktop. On Home, a folder, a note and the Move sheet, the pill's computed background, colour, font size, weight and border radius are equal and match the `src/ui` home. A unit or source check also asserts that no feature CSS module defines the pill's fill (`--fresh` with `--brand-line` on a pill rule). That check fails today.

## Verify

The red, plus qa5, qa7, v2-move-here and the screens that show "New", on phone and desktop with axe. `pnpm check` is green.

## Commits

The coordinator makes the commits for Codex: the red, then the fix, then the notes (`docs/harness/2026-10-09-c4-new-pill-one-notes.md`) with `tests changed:` lines and `review: skipped (TL-P4-22)`. Every commit under src/features needs a compatibility row, the red included.
