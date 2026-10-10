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

## Fix round 1

The coordinator reported `heading-order: section:nth-child(1) > h3` in the new
whole-page scan on `/files`. Static comparison with `claude/p3` identifies a
pre-existing finding: `FolderScreen.RootOverview` renders the h1 "Your Bower
folder" with no h2; `DesktopShell` renders `RightPanel` after main, outside it;
on a files route `RightPanel` selects Bower, whose first section has the h3 "Now".
`DesktopShell.tsx`, `RightPanel.tsx` and `BowerPanel.tsx` have no entry diff.
The root overview's markup is also unchanged. No heading was removed by this entry;
the removed New note controls were buttons/menu items, not headings.
This establishes the same heading-order mechanism on the base's same page from
markup; no browser or axe execution on either revision was possible here.

Scoped the initial scan to `main`, matching `shell-page-column.spec.ts` and
`folder-table.spec.ts` for files pages. WCAG 2.2 and target-size remain enabled;
the opened tree menu/phone dialog and the final empty-folder main retain their
separate scans. The unrelated right-panel heading-order finding is recorded here
and remains outside this entry's scope.
Local primary reference: `node_modules/@axe-core/playwright/README.md`,
`AxeBuilder#include`, which defines including elements by CSS selector;
https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright#axebuilderincludeselector-string--string
No network request was made.

tests changed: e2e/no-new-note.spec.ts: Scope the initial files-page axe scan to main, as existing folder specs do, excluding the unchanged pre-existing right-panel heading-order finding; preserve all absence, menu, sheet, empty-folder and WCAG 2.2 target-size checks.
tests changed: e2e/qa7.spec.ts: Restore create-name-speed's still-required New folder half as a desktop test on explicit source=fake; type immediately after the tree menu action with no field wait/fill, press Enter, and assert the exact full folder path and displayed name.

new test: New folder from the tree keeps the first letters typed
The new test skips only the phone project because it requires the desktop tree;
its explicit `source=fake` makes the desktop check use the pretend Drive in either suite.

Verified the remaining `v2-name-sheet` test, "the rename field spans the sheet and
selects the name", still exists and its file is byte-for-byte unchanged from HEAD
by this fix round. Its earlier desktop setup adaptation remains as documented above;
it is not identical to claude/p3. `capabilities.spec.ts` is byte-for-byte identical
to HEAD and claude/p3, including c4-e2e-sync's "write it shows the state written,
re-asks on a clash and settles as an answered row" test. Neither file was edited.

Coordinator verify replacements (features.json was not edited):
- create-name-speed: `-g "New folder from the tree keeps the first letters typed"`
  in `bash scripts/e2e-both.sh e2e/qa7.spec.ts` (qa5's removed note-only name goes).
- v2-name-sheet: `-g "the rename field spans the sheet and selects the name"`
  with the existing source and spec command.
- c4-e2e-sync: `-g "New folder from the tree keeps the first letters typed|write it shows the state written"`
  with its existing fake desktop command and qa7/capabilities spec list. The second
  unique substring selects the unchanged full capabilities test name above.

Offline validation, output redirected; only failures read:
- `pnpm exec tsc -p tsconfig.app.json`: exit 0; /tmp/rnn-fix1-tsc-app.log.
- `pnpm exec tsc -p tsconfig.node.json`: exit 0; /tmp/rnn-fix1-tsc-node.log (includes e2e).
- `pnpm exec eslint e2e/no-new-note.spec.ts e2e/qa7.spec.ts`: exit 0; /tmp/rnn-fix1-eslint.log.
Red evidence is the coordinator's axe failure and missing New folder coverage;
the new e2e cannot be run here (no ports). Coordinator must run the revised e2e
and full gates. No server, e2e, pnpm check, network, commit or git write was run.

## Fix round 2

### Evidence and test fixes

Read the coordinator's /tmp/rnn-r1-demo.log and /tmp/rnn-r1-fake.log failures.
Both sources failed the no-new-note heading assertion in both projects. The
remaining desktop and phone error-context.md files both show the second-width
heading "Empty one (2) More for Empty one (2)". The two widths share the page's
kept data, so making "Empty one" again correctly picks a free name. Each width
now makes its own name, "Empty at 1280" or "Empty at 375". All absence, menu,
sheet, New folder, empty-state and WCAG 2.2/target-size checks remain. The phone
heading's exact accessible name includes its nested "More for" button, as the
snapshot and FolderScreen's h1 show. Its exact visible text is also asserted.

tests changed: e2e/no-new-note.spec.ts: Give each width its own folder name and assert the exact desktop/phone heading name plus exact visible folder text; retain every existing check.
tests changed: e2e/qa6.spec.ts: Add the surviving New folder Escape cancellation test; leave all existing tests unchanged.
tests changed: e2e/qa7.spec.ts: Add the surviving empty-folder New folder naming test; leave the immediate-typing test and all other existing tests unchanged.
tests changed: e2e/qa9.spec.ts: Add New folder dot/slash and note rename extension coverage through the existing name sheet; leave all existing tests unchanged.

### qa7 immediate typing: blocked pending missing snapshot

The demo log fails "New folder from the tree keeps the first letters typed" at
the exact path Resources/Garden plans; the fake log passes that same test. Both
runs use the test's explicit source=fake. The demo log names
test-results/qa7-New-folder-from-the-tree-keeps-the-first-letters-typed-desktop/error-context.md,
but that snapshot is absent from this worktree and the available local results.
The later fake run passed and left only the no-new-note snapshots. No snapshot
showing the actual failed folder name was available. A preserved local path was
requested; do not infer lost letters or change the test from the timeout alone.

Static diagnosis: the tree row menu passes node.path (Resources) to act.create;
that awaits vault.create, then opens ancestors(path), sets justMade and renaming.
The inline RenameInput keeps the typed name and quiet rename retains its parent.
The expected path is correct; creation explicitly opens Resources, so there is
no demonstrated path/expansion error to repair in the test. NameSheet is used
for phone creation, whereas this desktop action uses the inline input.
Before asynchronous creation finishes, the tree retains focus and its printable
key handler does type-ahead rather than buffering a pending name. This is a
possible product race, not proof of what happened in this failed run. The full
failed snapshot (especially the created row's name, input and expanded state)
is required to distinguish that from another failure. The existing test stays
unchanged: no field wait, fill, delay, retry or relaxed path assertion was added.
No product code was changed. If the snapshot shows a truncated name, stop and
send this product finding to the lead for a ruling; do not mask it in this entry.

Local primary reference: Playwright's installed playwright-core/types/types.d.ts,
Keyboard.type: sends keyboard events to the focused element, with zero delay by
default. https://playwright.dev/docs/api/class-keyboard#keyboard-type
The reference was read locally; no network request was made.

### Closed-entry verify replacements for the coordinator

features.json was not edited. The current check-harness failure is recorded in
/tmp/rnn-r1-check.log: each of the four old greps matches no test. Replace the
whole verify string with the commands below, preserving weak-tests' unit half.
These are proposed commands, not green evidence; the coordinator must run them.

- new-note-opens: creating/opening a note from New note and its creation toast
  are withdrawn. Help for an empty note remains on NoteScreen and is already
  pinned by "empty-note help and Open in Drive at 375px" and its 1440px case,
  seeded through Add. The existing no-new-note test pins the withdrawn controls.
  Replacement:
  `bash scripts/e2e-both.sh e2e/no-new-note.spec.ts e2e/empty-note-help.spec.ts -g "no New note control on desktop or phone|empty-note help and Open in Drive"`
- new-note-escape: the note action is withdrawn, but Escape discarding a newly
  made folder remains in Explorer's RenameInput and act.discard. No surviving
  e2e pinned it. Added "Escape on a new folder's name takes it back": type a
  name, Escape, assert both provisional and typed paths absent, no input,
  tree focus and the unchanged root page. This test waits for its input because
  its subject is cancellation; the distinct immediate-typing test does not.
  Replacement:
  `bash scripts/e2e-both.sh e2e/qa6.spec.ts -g "Escape on a new folder's name takes it back"`
- weak-tests: its note creation case is withdrawn. Asking for a name before
  creation and then opening the result survives on the empty folder's New folder
  menu through NameSheet. Added "New folder in an empty folder asks for a name,
  then opens the folder": real empty-folder setup, blank focused name, disabled
  submit, parent route unchanged before naming, exact child route/title after.
  Replacement:
  `pnpm vitest run src/features/files src/data/demo src/data/live src/data/vault/drive-vault.test.ts -t "ConfirmBin|repeats a rule|toured|late file" && bash scripts/e2e-both.sh e2e/qa7.spec.ts -g "New folder in an empty folder asks for a name, then opens the folder"`
- namesheet-names: creation of notes is withdrawn. A folder keeps its complete
  dotted name, slashes are explained and replaced with dashes, and note rename
  still avoids doubling .md. Existing v2-name-sheet covers the slash error while
  renaming, qa12 covers leading-dot rejection and dotted folder creation, and
  qa8 covers plain note rename. None pins all the typed .md/save/slash results.
  Added "the New folder name sheet preserves dots and explains slashes" and
  "the rename name sheet keeps one note extension": exact saved paths, visible
  titles, inline slash explanation, aria-invalid, save toast and reopened rename
  stem. Both exercise the real phone sheet on each project and source.
  Replacement:
  `bash scripts/e2e-both.sh e2e/qa9.spec.ts -g "the New folder name sheet preserves dots and explains slashes|the rename name sheet keeps one note extension"`

The new Escape test exercises desktop width in both projects; the three new
sheet tests exercise phone width in both projects. None adds skip/only.
Round 1's create-name-speed/c4-e2e-sync grep replacements still apply, but their
immediate-typing check is unresolved until the failed demo snapshot is restored.

### Offline validation

All output was redirected; only exit status and failures were read.
- `pnpm exec tsc -p tsconfig.app.json`: exit 0; /tmp/rnn-fix2-tsc-app.log.
- `pnpm exec tsc -p tsconfig.node.json`: exit 0; /tmp/rnn-fix2-tsc-node.log.
- `pnpm exec eslint e2e/no-new-note.spec.ts e2e/qa6.spec.ts e2e/qa7.spec.ts e2e/qa9.spec.ts`:
  exit 0; /tmp/rnn-fix2-eslint.log.
- `git diff --check`: exit 0 (read-only).

No server, e2e, pnpm check, network, commit or git write was run. No new test is
claimed green without the coordinator's run. Commits, verify replacements,
full checks, e2e and the missing qa7 snapshot diagnosis remain with coordinator.
