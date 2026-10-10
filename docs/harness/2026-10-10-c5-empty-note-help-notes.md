# c5-empty-note-help implementation

implementer: codex

Implemented the packet's exact empty-note copy under the unchanged condition: whitespace-only body,
no summary, no Current state, and no Timeline. Added the adjacent small ghost Button with the Drive icon.
It calls the existing useFileActions().openInDrive(path), whose sole opening mechanism is openDrive.
The demo toast remains in that mechanism; no new Drive opening code was added.

The note's CSS module uses one flex row, wrapping, a 12 px gap, and a paragraph basis of 280 px.
The button stays left-aligned on its wrapped row and has minimum width and height of 44 px.
The existing Button supplies the small size and ghost styling.

removed: the empty-note promise that writing here comes in a later version.
removed: the old suggestion to write directly from Google Drive.
removed: none of the existing Drive actions, note content, or empty-note conditions.

Research and reuse (offline, as instructed): inspected the existing FileView Drive button,
useFileActions, openDrive, Button, and the folder screen's wrapping flex layout before implementation.
Standard layout reference: https://developer.mozilla.org/en-US/docs/Web/CSS/flex-wrap
This reference was not fetched because network use was prohibited; existing local code supplied the pattern.

Red: an empty note says how to write in it and offers Open in Drive
The targeted suite failed because the exact contracted sentence was absent (1 failed, 15 passed).
The clean assertion-only red is preserved in /tmp/enh-red-unit.log.
During test authoring, the initial asynchronous missing-copy lookup also triggered the timer gate;
the recorded red instead awaits the loaded title and checks the sentence synchronously.
Final assertions compare the source by identity to avoid deep comparison of the existing source Proxy.

Green: pnpm exec vitest run src/features/note --maxWorkers=2
Exit 0; all 7 files and 16 tests pass. Log: /tmp/enh-unit.log.
The exact named component test checks copy, adjacent action, icon, and openDrive source/path/call count.
Four additional cases check that each of body, summary, Current state, and Timeline hides the help and action.
No pre-existing tests were changed.

Green: pnpm exec tsc -p tsconfig.app.json
Exit 0. Log: /tmp/enh-tsc.log.
Green: pnpm exec eslint src/features/note e2e/empty-note-help.spec.ts
Exit 0; no errors. Log: /tmp/enh-eslint.log.
Three existing react-refresh/only-export-components warnings remain in markdown.tsx (131, 136, 145).
git diff --check passed.

E2e: e2e/empty-note-help.spec.ts authored, not run; the coordinator runs it because ports are prohibited.
It creates a synthetic Soup ideas note through New note in the demo, then checks at 375 and 1440 px:
exact copy, visible adjacent action, 12 px gap, phone wrapping and left alignment, desktop single row,
44 px minimum height and width, WCAG 2.2 axe with target-size, and the existing demo toast on activation.
No fixed waits, .only, or .skip were added.
pnpm check was not run: the owner restricted this worker to the three targeted commands above.
Designer verification and integration gates remain with the coordinator.

Commit grouping (coordinator commits; no git write commands were run):
red: src/features/note/empty-note-help.test.tsx; e2e/empty-note-help.spec.ts
fix: src/features/note/NoteScreen.tsx; src/features/note/note.module.css
notes: docs/harness/2026-10-10-c5-empty-note-help-notes.md
The packet file was already untracked on entry and is outside these groups.

compatibility: c1f845cc
FIXSHA is the requested placeholder; the coordinator replaces it with the fix commit SHA before committing notes.

Left out: no additional UI changes; e2e execution, pnpm check, designer check, and commits are pending coordinator work.
