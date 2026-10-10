# c5-remove-new-note implementation

implementer: codex

Ruling: TL-P4-35 (1), TL-P4-33 addendum 1. Base: a850c00c413b249be621e9c1487edb6e4f232d52.
compatibility: 9040d9bf

The coordinator commits red, fix and notes separately, then substitutes the fix commit SHA above.
No git write commands, server, e2e, pnpm check or network requests were run.

## Changed

Removed the explorer toolbar control, shared folder-row menu item, phone sheet action,
empty-folder button, note-making NameSheet path, note UI naming variant and unused icon/CSS.
The shared row menu, rename and folder creation mechanisms stay in place. The toolbar and
empty folder render only the remaining elements, with no placeholder or reserved slot.
justMade, discard and quiet rename still serve New folder; they cannot be removed.
The data layer, createNote, journal create kind and journal-create fixture remain unchanged.

## Research

Reused the existing useNodeMenu item list and React JSX composition, removing the offered
item and element at their existing homes. Primary reference: React's conditional rendering
and omission of JSX, https://react.dev/learn/conditional-rendering.
Research was local because this entry forbids network access; the reference was not fetched.

## Evidence

Red: the folder row menu has New folder and no New note.
Expected labels not to include New note; the assertion failed before the removal.
Log: /tmp/rnn-red-unit.log (1 failed, 104 passed).
The named e2e red was authored before the fix but cannot run in this worker's environment.
Its desktop and phone checks cover toolbar, folder row actions, empty-folder page, New folder
creation, and axe WCAG 2.2 with target-size, at 1280 and 375.

Green commands (all offline; output redirected):
- pnpm exec vitest run src/features/files src/app src/features/tidy src/data/vault/journal.test.ts --maxWorkers=2
  /tmp/rnn-unit.log: exit 0; the row-menu red and existing targeted tests pass.
- pnpm exec tsc -p tsconfig.app.json
  /tmp/rnn-tsc.log: exit 0.
- pnpm exec eslint src e2e
  /tmp/rnn-eslint.log: exit 0; 26 existing warnings, no errors.
- pnpm exec knip
  /tmp/rnn-knip.log: exit 1; only the four existing harness/unused-baseline.json findings:
  COOKIE_ROUTES, genericRateLimit, rateLimit (api/src/security.ts),
  RUN_STEPS=ACTIVE_PHASES (src/data/contracts/run-phases.ts).
  No new unused findings; no data-layer removal was indicated.

## Removed tests

removed: a new note opens and says how to write in it
removed: Escape on a new note's name takes it back
removed: New note in an empty folder asks for a name, then opens the note
removed: the page menu on the phone makes a named note in a folder
removed: the name sheet takes a name as typed: no doubled .md, and a slash is explained
removed: New note from the right-click menu asks for its name
removed: new note from a folder uses the name sheet
removed: phone creation refuses a leading dot and retries a dotted name (note)

## Existing tests changed

tests changed: e2e/qa5.spec.ts: Removed the test whose subject is creation and opening of a new note.
tests changed: e2e/qa6.spec.ts: Removed the test whose subject is cancelling a newly created note.
tests changed: e2e/qa7.spec.ts: Removed the test whose subject is creating a note in an empty folder.
tests changed: e2e/qa8.spec.ts: Removed the test whose subject is phone menu note creation.
tests changed: e2e/qa9.spec.ts: Removed the test whose subject is names for newly created notes.
tests changed: e2e/robustness.spec.ts: Removed the test whose subject is right-click note creation.
tests changed: e2e/qa12.spec.ts: Removed only the note creation case; kept folder name rejection and retry assertions.
tests changed: e2e/v2-name-sheet.spec.ts: Removed note creation subject; desktop field layout setup now opens New folder via phone menu, then restores viewport; all field assertions remain.
tests changed: e2e/v2-targets.spec.ts: Measure the remaining New folder and sort toolbar controls at the original 44 and 24 px thresholds.
tests changed: e2e/empty-note-help.spec.ts: Seed an empty Markdown file through Add using the upload setup from qa9/qa26; navigate within the app to its Inbox tree row; retain every help, wrap, gap, target, axe and Drive-toast assertion.
tests changed: src/features/files/file-actions.test.tsx: Exercise partial creation through New folder; keep the applied-route, single create call, warning and closed-sheet assertions.

The empty note is seeded with an empty synthetic Soup ideas.md upload through the existing
Add UI. DemoWorld.syncInbox already creates a note entry for each uploaded Markdown item,
and noteFor gives this unseeded, non-Bower entry empty body/summary/state/timeline. No new
fixture or data mechanism is needed. The spec retains its explicit demo source and toast.
capabilities.spec.ts and RunLinks.test.tsx match the result heading "New notes", not a
creation control; they remain unchanged. journal.test.ts matches a stored create line and
remains unchanged for compatibility. Final New note/newNote grep is limited to absence
assertions, result headings and stored-journal fixtures/tests.

## E2e specs

Coordinator: run these on demo and fake. empty-note-help explicitly selects demo (as before),
and v2-name-sheet retains its existing fake-only applicability. No new skip/only or waits.
- e2e/no-new-note.spec.ts
- e2e/empty-note-help.spec.ts
- e2e/qa12.spec.ts
- e2e/qa5.spec.ts
- e2e/qa6.spec.ts
- e2e/qa7.spec.ts
- e2e/qa8.spec.ts
- e2e/qa9.spec.ts
- e2e/robustness.spec.ts
- e2e/v2-name-sheet.spec.ts
- e2e/v2-targets.spec.ts

## Files per commit

red:
- e2e/no-new-note.spec.ts
- src/features/files/no-new-note.test.tsx

fix:
- e2e/empty-note-help.spec.ts
- e2e/qa12.spec.ts
- e2e/qa5.spec.ts
- e2e/qa6.spec.ts
- e2e/qa7.spec.ts
- e2e/qa8.spec.ts
- e2e/qa9.spec.ts
- e2e/robustness.spec.ts
- e2e/v2-name-sheet.spec.ts
- e2e/v2-targets.spec.ts
- src/app/ui-store.ts
- src/features/files/Explorer.tsx
- src/features/files/FolderScreen.tsx
- src/features/files/NameSheet.tsx
- src/features/files/file-actions.test.tsx
- src/features/files/file-actions.ts
- src/features/files/folder.module.css
- src/ui/Icon.tsx

notes:
- docs/harness/2026-10-10-c5-remove-new-note-notes.md

## Left out

Coordinator full checks/e2e, fresh Claude review, designer check and the three commits.
