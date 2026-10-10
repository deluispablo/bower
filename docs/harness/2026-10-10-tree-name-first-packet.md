# Packet: tree-name-first (DEFECTS new-folder-first-letters, ruling (b), entry 2 of 2)

- **Entry:** `tree-name-first`, after `create-named` lands. Worktree `/private/tmp/bower-tree-name-first`, branch `tree-name-first` from `claude/p3`. Codex red session, Codex implementation, Claude review, designer check once. `ui: true`.
- **Ruling:** DEFECTS new-folder-first-letters (b) on main; diagnosis `docs/harness/2026-10-10-new-folder-first-letters-diagnosis.md`. Standard: VS Code explorer name-first (`openExplorerAndCreate`/`setEditable`, fileActions.ts). It also closes the reopened `create-name-speed`.
- **Evidence:** e2e "New folder from the tree keeps the first letters typed" failed 9-11/20 (whole name lost or first letter lost): keys reach the tree's type-ahead while `act.create` awaits Drive and the journal (file-actions.ts:121-128, Explorer.tsx:172, 211-226).

## Contract

1. The tree's New folder (row menu and header button, Explorer.tsx:431 and the row menu) opens the name box synchronously, before any await, then on Enter or blur calls `createNamed` (from create-named) once. Nothing is created before the name.
2. Remove create-then-rename for new folders: `act.create`'s rename hand-off, `justMade`, `act.discard` and its quiet/partial branch, where nothing else uses them (`removed:` lines). One naming flow; no keystroke buffer (option (c) rejected).
3. Name rules from their one home (NameForm's), no copies. Focus hand-off stays in `src/ui/focus.ts` and the tree-menu rule.
4. Phone unchanged (NameSheet).

## What the person sees (designer signed 2026-10-10)

1. Pending row: inside the target folder, which opens if closed, first of its children, at child indent with the folder icon. Target: the row's folder (row menu); today's target (header button). The box is empty with placeholder "Name", accessible name "New folder in <folder>", focused at once, before anything awaits.
2. Escape: nothing is made, the row goes, focus returns to the row the menu came from or to the header button. Blur: a non-empty name makes the folder as Enter does; an empty box is dropped silently.
3. NameSheet's rules exactly: empty means Enter does nothing; slashes show the inline FieldError "Names cannot have slashes; Bower used a dash." and are made with a dash; a taken name or a leading dot as NameSheet does today, no new message.
4. Failed create: the box stays with the typed name, inline FieldError "The folder was not made. Try again.", Enter retries, no toast. After a create: the new row is selected and focused, the page shows the folder (as NameSheet's act.open), the folder is made once.

## Reds (a separate Codex session; the implementer may not change them)

- The moved e2e "New folder from the tree keeps the first letters typed" (from c5-remove-new-note ba8791a5; desktop, source=fake), stays as the permanent guard; it must pass 20/20 with `--repeat-each=20`.
- Class unit test (testing-library, as file-actions.test.tsx:58) with a `vault.create` that never resolves: for row menu and header New folder, right after the click with no await a focused box named "New folder in <folder>" exists; type, Enter, resolve: exactly one `create('<folder>','folder','Garden plans')`.
- One red per row above: Escape makes nothing and returns focus; blur with a name makes once, empty drops; slash FieldError and dash; failed create keeps the name with the FieldError and Enter retries once; after create the row is selected and the page opens. Each "nothing happens" red has a positive control.
- e2e with axe (WCAG 2.2, target-size) on the pending row, desktop.

## Verify

The reds by exact name, `pnpm check`, e2e qa6/qa7/qa9/v2-name-sheet and the new spec on demo and fake.

## Commits

Red (tests only), fix, notes (`docs/harness/2026-10-10-tree-name-first-notes.md`, line 3 `implementer: codex`); compatibility rows for src/features commits.
