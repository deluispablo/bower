# create-named implementation

implementer: codex

## Scope and result

Implemented option (b), first half, from the packet and diagnosis. `useFileActions`
now exposes `createNamed(folder, name)` beside `create`. NameSheet delegates its
folder create to it after the same trim, slash replacement, sheet close, zero-delay
handoff and overlay close. Its note create and rename still follow their existing
paths. The shared `open` implementation serves both public `open` and `createNamed`;
selection, navigation, tabs and mark-seen behaviour have one home.

The named folder action preserves one `vault.create(folder, 'folder', name)` call,
opens the returned path, opens a BowerError's applied path before reporting its
original message, and otherwise reports `The folder was not made. Try again.`.
It adds no validation or name transformation. NameSheet retains the name rules,
strings, field focus and close-before-navigation ordering.

## Red, before product edits

Exact test name: `createNamed creates once and reports NameSheet's refused-create sentence`

Command: `pnpm exec vitest run src/features/files --maxWorkers=2`

Log: `tmp-logs/create-named-red.log`. Exit 1: one failing test and 12 passing tests.
The module loaded successfully; the assertion at `file-actions.test.tsx:77` failed
with `expected 'undefined' to be 'function'`. It checks the action exposed by the
module's exported hook without importing a nonexistent named export.

Only the test file was edited before this run. It also asserts the exact once-only
create call, successful folder route and selection, no success toast, and the
unchanged refused-create sentence. Existing tests were not edited.

tests changed: src/features/files/file-actions.test.tsx: added the packet's red; existing tests unchanged.

The red was frozen before product edits. Its SHA-256 is recorded in
`tmp-logs/create-named-red.sha256`; the final checksum verification exited 0
(`tmp-logs/create-named-red-unchanged.log`). No test edit followed the red run.

## Green and checks

- `pnpm exec vitest run src/features/files --maxWorkers=2`: exit 0;
  `tmp-logs/create-named-green.log`. Includes the exact red above and all existing
  NameSheet tests, including `rename starts with a plain file name or the whole folder name`
  and `a named thing made before its journal warning opens once without a retry prompt`.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: exit 0; `tmp-logs/create-named-tsc.log`.
- `pnpm exec eslint src/features/files/file-actions.test.tsx src/features/files/file-actions.ts src/features/files/NameSheet.tsx`:
  exit 0; `tmp-logs/create-named-eslint.log`.

Test output went to files; only the red failure and failure counts were read.
No network, pnpm check, e2e, git write, commit or shared harness edit was performed.
The owner's explicit commands override the skill and packet's broader gate list.

## Files per coordinator commit

Commits remain for the coordinator, in this order:

| Commit | Files |
| --- | --- |
| red (tests only) | `src/features/files/file-actions.test.tsx` |
| fix (product code only) | `src/features/files/file-actions.ts`, `src/features/files/NameSheet.tsx` |
| notes | `docs/harness/2026-10-10-create-named-notes.md` |

`tmp-logs/` contains local evidence, not implementation files to commit.

removed: NameSheet's direct folder create, folder refusal handling and folder navigation; moved to createNamed.
removed: folder/note conditional expressions in NameSheet's remaining note-only create and refusal branch.
removed: the inline object-method body of open; moved unchanged to the closure shared with createNamed.
removed: no name rule, string, existing test, focus mechanism or tree create flow.

## Compatibility row drafts

Following `docs/harness/2026-10-07-p3-compatibility.md`, replace placeholders with
the coordinator's src/features commit SHAs. Do not include the notes-only commit.

| Commit | Entry | What it changes for the accepted app's files |
| --- | --- | --- |
| `b6fb31c0` | create-named | none: refactor |
| `cf04e6ae` | create-named | none: refactor |

## Source and left out

The provided diagnosis cites VS Code's standard name-first creation pattern:
[VS Code fileActions.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileActions.ts).
This offline entry reuses the app's existing NameSheet creation and open behaviour;
the source citation comes from the diagnosis and was not fetched over the network.

The tree's create-then-rename flow and its focus defect belong to option (b)'s second
entry. No visible UI change is included. Broader gates and commits are left to the
coordinator under the owner's instructions.
