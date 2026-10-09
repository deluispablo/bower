# Packet: v2-name-sheet, d-v2-09 (stage 4, order 3, after v2-field)

- **Entry:** `v2-name-sheet` (`ui: true`). Worktree `/private/tmp/bower-v2-name`, branch `v2-name-sheet` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-21 order 3;
  - TL-P4-22 (2);
  - spec block [d-v2-09](../design/specs/2026-10-09-v2.md#d-v2-09-rename-and-other-sheet-fields-are-drawn-by-the-brand-2);
  - impact note block d-v2-09 ([impact](impact/2026-10-09-v2.md));
  - v2-field: the one field rule, `src/ui/Field.tsx`.
- **Starting model:** `bower-implementer` (Sonnet).

## Today (impact note, verified root cause)

- `features/files/NameSheet.tsx:61-77` uses `className={s.nameForm}`, where `s` is `files.module.css`, which has no `.nameForm`. That class lives in `folder.module.css:45-46`, so the input is unstyled.
- `features/files/FolderScreen.tsx:210-249` (`NewNoteButton`) is a second New-note form. It has its own state, its own `vault.create` call and its own error words. It sits beside NameSheet's New note (`Explorer.tsx:686-688`, then `NameSheet.tsx:29-51`).

## Contract

1. **NameSheet uses the field rule.** It is the one name-asking sheet for rename, new note and new folder.
   - The field spans the sheet's width, with the v2-field style.
   - The name is selected when the sheet opens.
   - A muted line sits under the field (rename of a note or a file only): "Links to this note keep working." or "Links to this file keep working." Folders get no line.
  - The selection covers the name without its extension.
   - Buttons: "Cancel" (outline) and "Rename" (primary), side by side, each half the width and 44 px tall. For new note and new folder, the primary keeps today's label.
2. **One New-note path.** `NewNoteButton` calls `setNaming({folder, type: 'note'})` and its own sheet is deleted. It gains NameSheet's slash rule and applied-path handling.
3. **Second-way risk:** do not style FolderScreen's copy as well; delete it.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

| Sheet and state | What shows |
| --- | --- |
| Rename (note or file), open | The field spans the sheet width, styled by v2-field, with the name selected without its extension ("Lease draft" in "Lease draft.pdf"; a note already shows its name without ".md"). Under it, a muted line: for a note "Links to this note keep working.", for a file "Links to this file keep working." Below that, "Cancel" (outline) and "Rename" (primary) side by side, each half the width and 44 px tall. |
| Rename, a name with "/" | Today's slash message, under the field in `--danger` at 13 px. The field gets the `--danger` edge and `aria-invalid`. |
| New note (from Explorer or from a folder's "New note") | The same sheet and field. The primary button keeps today's label. There is no muted links line. |
| New folder, or Rename of a folder | The same sheet and field, with today's label. There is no links line. |
| After the action | As today. Focus returns per c4-focus-return. |

The only new strings are "Links to this note keep working." and "Links to this file keep working." (the resolver follows former names for both).

**Signed off** by the designer on 2026-10-09 (69a41ec9), with the two additions above.

## Red

- At 375, Rename's input is about 160 px wide with a 13 px font. It must be at least 300 px wide with a 16 px font, and the name must be selected on open.
- FolderScreen's "New note" opens its own form today. It must open NameSheet.

## Verify (exact names)

- e2e, both projects:
  - `the rename field spans the sheet and selects the name`
  - `new note from a folder uses the name sheet`
- axe passes on the sheets.
- Update FolderScreen's existing "Make the note" e2e, with a `tests changed:` line.
- `pnpm check` is green.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-v2-name-sheet-notes.md`), with `tests changed:` lines. The card carries `worktree:`.

Reviewers are read-only. They never move the main checkout in any form.
