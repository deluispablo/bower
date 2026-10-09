# c4-new-pill-one

implementer: codex
review: skipped (TL-P4-22)
tests changed: none

## Change

The pill's one home is the `.freshPill` class in `src/ui/ui.module.css`, following the existing
shared CSS classes for marks and controls. It uses inline-flex with align-items: center,
height: 22px, padding: 0 9px, radius: 999px, background: var(--fresh),
color: var(--brand-line), font-size: 13px and font-weight: 600.

NoteScreen, Home, FolderScreen and MovePicker use that class. Note's local `.new` keeps
only margin-left: 8px and vertical-align: 1px; Home and folder keep only flex: none.
MovePicker uses the shared class directly and drops its folder.module.css import.
No strings changed. No data, route or stored format changed.

## Test-first evidence and verification

New source check: `feature CSS leaves the fresh pill look in ui` in `src/ui/pill.test.ts`.
Before the fix, its assertion expected no copies and received exactly these three rules:
files/folder.module.css: .new, home/home.module.css: .new, note/note.module.css: .new.
Red assertion log: `/tmp/c4-new-pill-one-red.log`.
After the fix, 1 test passed: `/tmp/c4-new-pill-one-green.log`.

New e2e: `the new pill has one look everywhere` in `e2e/c4-new-pill-one.spec.ts`.
It explicitly opens fake, tidies the default synthetic inbox through the screen, and checks
Home, folder, note and the Move sheet using the phone and desktop projects (375 / 1440).
It compares background-color, color, font-size, font-weight, border-radius and height,
asserts the designer's shape and brand colors, checks the shared class on each caller,
and uses only `expectAxeClean` from `e2e/axe.ts` for axe scans.

Passed: `pnpm exec tsc -p tsconfig.app.json --noEmit` (log `/tmp/c4-new-pill-one-tsc.log`).
Passed: eslint on both new tests and all four touched TSX callers
(log `/tmp/c4-new-pill-one-eslint.log`).

Per the dispatch instruction, no pnpm check or e2e was run. The new e2e, qa5, qa7,
v2-move-here, touched-screen e2e and designer verification remain for the coordinator.
No git write command, commit, push or other worktree access was performed.

## Commit groups

Tests (red):
- `e2e/c4-new-pill-one.spec.ts`
- `src/ui/pill.test.ts`

Source (fix):
- `src/ui/ui.module.css`
- `src/features/note/NoteScreen.tsx`
- `src/features/note/note.module.css`
- `src/features/home/Home.tsx`
- `src/features/home/home.module.css`
- `src/features/files/FolderScreen.tsx`
- `src/features/files/MovePicker.tsx`
- `src/features/files/folder.module.css`

Docs (notes):
- `docs/harness/2026-10-09-c4-new-pill-one-notes.md`
- `docs/harness/2026-10-07-p3-compatibility.md` (REDSHA and FIXSHA for the coordinator to replace)

## Sources

MDN's standard flex alignment reference: `align-items: center` centers items on the cross axis;
`display: inline-flex` makes the mark an inline flex container.
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Aligning_items_in_a_flex_container
- https://developer.mozilla.org/en-US/docs/Web/CSS/display

The dispatch supplies the exact canvas shape. MDN links are citations of the standard CSS approach;
the pages were not fetched because this worktree has no network.
