# v2-name-sheet notes (d-v2-09)

- Sources: Finder, Windows Explorer and Android Files select a file name without its extension on rename (platform convention). The field already holds the name without its extension (`thingName`), so selecting all of it matches. Radix Dialog for the sheet.
- Port 5191 was held by the v2-targets worktree; ran with an untracked temp config on 5291, deleted after.
- The slash line shows live under the field (`FieldError`, `aria-invalid`); the existing toasts on save are unchanged.
- `tests changed: e2e/qa7.spec.ts: "New note in an empty folder" now also asserts the name sheet's "Name" field is focused and "Make the note" is shown (it opens the one NameSheet, not FolderScreen's own form).`
- `tests changed: e2e/v2-name-sheet.spec.ts: the red spec waits for the sheet's pop-in animation before axe (contrast read mid-fade); same assertions.`
- Left out: no desktop Rename sheet exists (desktop renames in the tree), so the desktop run of the rename test checks the same field in New note.
