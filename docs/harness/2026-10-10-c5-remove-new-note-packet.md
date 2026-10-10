# Packet: c5-remove-new-note (TL-P4-35 (1); Codex, UI, non-escalated)

- **Entry:** `c5-remove-new-note` (ui: true). Worktree `/private/tmp/bower-c5-remove-new-note`, branch `c5-remove-new-note` from `claude/p3` (after c5-empty-note-help lands).
- **Ruling:** DECISIONS TL-P4-35 (1): New note is removed everywhere it is offered; notes are made by Bower or outside the app (TL-P4-33 addendum 1). New folder stays.
- **Starting model:** Codex. Then a fresh Claude review and the designer's check (the remaining controls close up cleanly).

## Contract

1. Removed: the explorer's New note button (`src/features/files/Explorer.tsx:434`), its row-menu item (`:606`), the folder page's `NewNoteButton` (`src/features/files/FolderScreen.tsx:160`, `:209`), and the New note path of `NameSheet` (the sheet stays for New folder and rename, if it serves them).
2. New folder, rename and every other control are unchanged; the remaining controls close up with no gap or empty slot.
3. Code that only New note used goes (knip's unused gates must not grow; ideally they shrink): UI handlers, store fields (`src/app/ui-store.ts`), `file-actions.ts` helpers used only by it. **The data layer stays**: `vault.createNote`, the journal `create` kind and its contract fixtures (`src/data/contracts/fixtures/p2/journal-create.json`) serve Bower's own writes and stored journals; do not remove them unless knip proves nothing uses them, and then say so on the card.
4. Tests: a test whose subject is New note is removed (one `removed: <test name>` line each on the card and in the notes). A test that used New note only as setup (to get an empty note or a new file) switches to an existing demo/fake note or a seeded state, keeping its own assertion, with a `tests changed: <path>: <why>` line (exact form). Known users: e2e empty-note-help (it makes its empty note via New note), qa5, qa6, qa7 (:63), qa8, qa9, qa12, robustness, capabilities, v2-name-sheet, v2-targets; unit `file-actions.test.tsx`, `RunLinks.test.tsx`, `journal.test.ts` (grep "New note" and `newNote`). The c5-empty-note-help e2e must not depend on New note.

## Red

- An e2e `e2e/no-new-note.spec.ts`, named exactly `no New note control on desktop or phone`: on demo, the explorer (header button and a folder row's menu) and a folder page offer no control named New note (any role), at 1280 and 375; New folder is still offered. Axe with WCAG 2.2 and target-size.
- A unit test in the files feature that the row menu's items no longer include New note.

## Commits

1. The reds. 2. The removal (and the setup changes to other tests). 3. The notes (`docs/harness/2026-10-10-c5-remove-new-note-notes.md`, `compatibility: FIXSHA`).
