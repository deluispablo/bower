# tree-name-first: red-session evidence

implementer: codex

Red session only, 2026-10-10. Worktree `/private/tmp/bower-tree-name-first`, branch `tree-name-first`,
base `dc4aec2f`. The coordinator commits. No app code, git writes, network requests or servers were used.
The implementer must preserve these reds. No implementation or green claim is part of this delivery.

## Files

- `src/features/files/tree-name-first.test.tsx`: 15 unit reds through the actual Explorer and file-actions.
- `e2e/qa7.spec.ts`: append the original first-letters guard unchanged.
- `e2e/tree-name-first.spec.ts`: desktop pending-row axe, including its slash-error state.
- `docs/harness/2026-10-10-tree-name-first-notes.md`: this evidence, for a separate notes commit.

## Reds

Every unit row below was run and failed on a matcher assertion, without a load error, timer-gate failure,
unhandled rejection or fixture error. The e2e rows were written but not run: no ports are available.
Their failure descriptions are expected behaviour from the packet and diagnosis, not new browser evidence.

| File | Exact test name | Why it fails now |
| --- | --- | --- |
| `src/features/files/tree-name-first.test.tsx` | `row menu New folder focuses its name before an unresolved create` | Immediately after clicking, the named field is null and create has already received Resources and folder without a name. |
| `src/features/files/tree-name-first.test.tsx` | `header New folder focuses its name before an unresolved create` | Immediately after clicking, the named field is null and create has already received Projects and folder without a name. |
| `src/features/files/tree-name-first.test.tsx` | `row menu pending row is the first child with folder icon, Name placeholder and immediate focus` | The field contains New folder, lacks Name and the signed accessible name, sorts after Alpha, has no folder icon, and follows an existing write. |
| `src/features/files/tree-name-first.test.tsx` | `header pending row is the first child with folder icon, Name placeholder and immediate focus` | The field contains New folder, lacks Name and the signed accessible name, sorts after Existing, has no folder icon, and follows an existing write. |
| `src/features/files/tree-name-first.test.tsx` | `row menu Escape drops the pending row without a write and returns focus to its opener` | Escape has already incurred create and calls trash. The fresh named-submission control still creates without the name. |
| `src/features/files/tree-name-first.test.tsx` | `header Escape drops the pending row without a write and returns focus to its opener` | Escape has already incurred create and calls trash; focus returns to the tree rather than the header button. |
| `src/features/files/tree-name-first.test.tsx` | `blur with a name makes that folder once` | The single create call omits Garden plans; blur renames the previously made folder. |
| `src/features/files/tree-name-first.test.tsx` | `empty blur drops the pending row silently and a named blur still creates` | The already-created row remains after empty blur, create was called, and a toast is emitted. |
| `src/features/files/tree-name-first.test.tsx` | `empty Enter makes nothing and keeps the field until a named Enter creates` | Create was called before typing; empty Enter removes the field and emits a toast. |
| `src/features/files/tree-name-first.test.tsx` | `slashes show the inline FieldError and create with dashes while a plain name has no error` | No inline alert or aria-invalid exists; create omits the name and rename receives the slash-containing name. |
| `src/features/files/tree-name-first.test.tsx` | `failed create keeps the name and inline FieldError; Enter retries once without a toast` | Enter removes the field and produces a toast without a FieldError. The armed named-create refusal is bypassed by rename. |
| `src/features/files/tree-name-first.test.tsx` | `taken name keeps the name and inline FieldError; Enter retries once without a toast` | Enter removes the field and produces a toast without a FieldError. The source's named-create conflict is bypassed by rename. |
| `src/features/files/tree-name-first.test.tsx` | `leading dot keeps the name and inline FieldError; Enter retries once without a toast` | Enter removes the field and produces a toast without a FieldError. The source's named-create dot refusal is bypassed by rename. |
| `src/features/files/tree-name-first.test.tsx` | `after create the new row is selected and focused and its folder page opens` | The made row remains unselected and the route remains /files; the create call omits Garden plans. |
| `src/features/files/tree-name-first.test.tsx` | `Enter followed by blur and another Enter makes the named folder once` | There is one unnamed create rather than one create with Garden plans. |
| `e2e/qa7.spec.ts` | `New folder from the tree keeps the first letters typed` | Not run here. Diagnosis records 9/20 failures: input mounts after the write, losing the whole name or its first letter. |
| `e2e/tree-name-first.spec.ts` | `desktop pending New folder row passes WCAG 2.2 and target-size axe` | Not run here. The current field has New name for New folder rather than New folder in Resources, so the pending-row assertion should fail before axe. |

## Controls and test boundaries

Both class cases use a deferred create promise: no await, timer advance, field wait or fill intervenes
between the production click and the field/focus assertions. Once fixed, typing Garden plans and Enter
must call create exactly once with the target and name, before manually resolving that promise.
Resources is deliberately closed for the row menu; Projects is selected for the header. These different
targets detect a hard-coded Resources fallback. Placement checks compare the pending row with the
loaded parent and its existing child, including DOM order, aria-level and indent.

Each test establishes enabled entry points and real loaded targets. Cancellation and empty-name cases
also have fresh non-empty submission controls. Slash validation first checks a plain name without an
error. Refusal cases first establish a working input, arm the named create refusal, preserve its text and
accessible FieldError, then retry or correct the name with exactly one additional write. Source conflict
and leading-dot refusals are injected, so these reds test delegation and the screen's response rather
than copying source validation. Navigation starts on /files and checks the selected new row and route.
The duplicate-submit case holds the named write unresolved across Enter, blur and another Enter,
then manually publishes and resolves the created row. Negative assertions use soft matchers so paired
controls can execute; absent/detached fields return only after recording a failing assertion.

All new unit cases use fake timers, explicit promise resolution and React act to flush microtasks;
there is no waitFor, polling or real-clock sleep. No new test uses .only or .skip. The restored qa7
block retains its original desktop test.skip verbatim because the owner explicitly required an
unchanged restoration. Its text was compared byte for byte against git show ba8791a5:e2e/qa7.spec.ts.
The new e2e returns on mobile and otherwise uses the shared expectAxeClean helper with wcag22: true,
which enables the WCAG 2.2 AA tags and target-size rule. It scans the actual tree in the empty pending
and slash-error states, verifies the error description, and cancels/reopens as a positive control.

## Verification

- `pnpm exec vitest run src/features/files --maxWorkers=2 > tmp-logs/tnf-red.log 2>&1`: exit 1,
  exactly 15 new assertion reds; the other 13 unit tests pass (four existing files).
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: pass; `tmp-logs/tnf-tsc-app.log`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit`: pass; `tmp-logs/tnf-tsc-node.log`.
- ESLint on all three touched test files: pass; `tmp-logs/tnf-eslint.log`.
- `git diff --check`: pass. Read-only git inspection only; init was not run because it can write git state.
- No e2e run, repeat run, pnpm check, commit or integration in this red-only session.
  Coordinator/implementer must run the restored guard 20/20 and the packet's full verification.

The requested tmp-logs directory is untracked evidence, not source for the tests-only commit.

tests changed: e2e/qa7.spec.ts: appended the exact original first-letters guard from ba8791a5; existing tests unchanged.

## Standard and reuse

The supplied diagnosis identifies VS Code's name-first explorer: openExplorerAndCreate adds the
in-memory row and setEditable opens its box before a write. Source:
https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileActions.ts
No network research was attempted under the owner's no-network constraint. The tests reuse the
file-actions.test.tsx testing-library/provider/router pattern and the repository's one axe helper.

## Left out

Implementation, removed-flow compatibility rows, commits, integration and browser execution belong
to later sessions. No production files or unrelated tests were modified.

## Delivery card

```text
status: done
commits: none; coordinator commits
red: blur with a name makes that folder once: create omits Garden plans
green: tsc app/node pass; eslint pass; 15 assertion reds; logs tmp-logs/tnf-red.log
worktree: /private/tmp/bower-tree-name-first
files: docs/harness/2026-10-10-tree-name-first-notes.md#files
sources: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileActions.ts
left out: e2e and 20/20 run (no ports); pnpm check; implementation; commits
tokens: unknown
```


## Implementation

Implemented in this worktree without git writes, network requests, servers or test edits.
The observed HEAD was `0bbe0daa02e61cc68a51c87bf707dc3092f7a8d0` (rather than the supplied
red SHA `cda855c6`); all three supplied red files are present and unchanged in this delivery.
The coordinator owns the fix commit, the separate notes commit and compatibility-record insertion.

### What changed

Product files: `src/app/ui-store.ts`, `src/features/files/Explorer.tsx`,
`src/features/files/NameSheet.tsx`, `src/features/files/NameForm.tsx`,
`src/features/files/name-rules.ts`, `src/features/files/explorer.module.css`,
`src/features/files/file-actions.ts`.

- `file-actions.askFolderName` sets the existing naming state synchronously and opens the target
  and its ancestors for inline naming. It does not call the source or await anything.
- The desktop tree header and row menu request that inline flow. The menu explicitly identifies
  itself as desktop, rather than relying on the media query to choose the naming surface.
- Explorer inserts the pending folder immediately after its parent, before its existing children,
  at the child indent with the existing folder icon. Even an empty parent reads open while naming.
  The empty, autofocused field has placeholder `Name` and accessible name `New folder in <folder>`.
- Enter and non-empty blur pass the trimmed, slash-normalized name to `createNamed`. A synchronous
  in-flight guard blocks Enter/blur/Enter duplicates; a failed write releases it for retry.
  Escape and empty blur remove the pending row without create, rename or trash.
- Escape/empty cancellation use `returnFocusTo` from `src/ui/focus.ts` with the saved header or tree
  opener. The tree-menu close rule leaves the pending field focused. Success uses the same focus
  home to return to the tree, with the new row selected and its path as the active descendant.
- `createNamed` still owns the one named folder source write and `act.open` navigation. Its optional
  response callbacks deliver a refused create's sentence to the field instead of a toast; details
  go to `console.error`. The typed name and box stay, with `The folder was not made. Try again.`.
  With no callbacks, NameSheet retains its existing close, navigation and reporting behavior.
  An already-applied create opens its reported path once and preserves its journal warning through
  the existing report home, rather than offering a second create for something already made.
- NameForm was extracted into `NameForm.tsx`; both surfaces share its `NameField` and its extracted
  `name-rules.ts` rules. The slash sentence and replacement live once; dot/taken-name refusals stay
  in the source. Phone naming uses NameSheet. There is no keystroke buffer or second source-create path.
- Pending-row styling keeps the field 24px high and puts a wrapping inline FieldError beneath it.
  Browser layout and axe remain for the coordinator because this session cannot open ports.

### Removed flow and retained callers

removed: Explorer header and row-menu `act.create(folder, 'folder')` calls.
removed: folder support in `act.create`; its type now accepts only `note`.
removed: new-folder rename hand-off, `justMade`, `discard`, quiet rename and partial-rename participation.
removed: Explorer's create-then-rename folder welcome/navigation branch; the retained helper welcomes notes only.
removed: duplicated NameSheet slash notice/replacement rules; NameForm's extracted rules are shared.

The conditional removal clause matters on this checkout: New note still exists in the tree header
and row menu and calls `act.create(..., 'note')`. It still uses `justMade`, `act.discard`, quiet rename
and the partial-rename callback, so those helpers cannot be deleted without changing another entry.
The comment claiming discard creates no Bin/journal line was corrected to describe its actual use.

P4-81's `making.type` removal is not applicable here: NameSheet still supports New note, including the
unchanged existing test `a named thing made before its journal warning opens once without a retry prompt`.
Its folder/note branch remains live. Remove that branch and the note-only helpers when the entry that
removes New note is present; this change does not silently remove existing note behavior.
The red scaffolding in `file-actions.test.tsx` was left unchanged under the no-test-edits instruction.

tests changed: none (including the create-named scaffold and all three supplied red files).

### Verification and logs

- Before product changes, the requested targeted run failed on the 15 supplied matcher reds;
  the other 57 tests passed. Log: `tmp-logs/tnf-implementation-red.log`.
- Final `pnpm exec vitest run src/features/files src/app --maxWorkers=2`: exit 0;
  13 files, 72 tests pass, including all 15 exact tree-name-first rows listed in the Reds table above.
  Log: `tmp-logs/tnf-implementation-green.log`.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: exit 0;
  `tmp-logs/tnf-implementation-tsc-app.log`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit`: exit 0;
  `tmp-logs/tnf-implementation-tsc-node.log`.
- ESLint on every touched TypeScript/TSX production file: exit 0, no errors;
  `tmp-logs/tnf-implementation-eslint.log`. The existing Explorer `useNodeMenu` export still emits
  the fast-refresh warning; the extracted NameForm has no new warning.
- `git diff --check`: exit 0; `tmp-logs/tnf-implementation-diff-check.log`.
- No `pnpm check`, e2e, repeat run, commit or integration: the owner restricted this session to
  targeted tests, tsc and touched-file ESLint, and ports are unavailable. The coordinator must run
  packet qa6/qa7/qa9/v2-name-sheet/new-spec verification on demo and fake, the qa7 typing guard with
  `--repeat-each=20`, full check, and the designer's built-UI verification before closing the entry.

### Compatibility-row draft for src/features commits

Replace the SHA placeholders after the coordinator commits; these are drafts, not edits to a shared record.

| Commit | Entry | Accepted behavior / intentional change | Evidence |
| --- | --- | --- | --- |
| `<red commit SHA>` (supplied as `cda855c6`) | `tree-name-first` | Tests only; production behavior unchanged. Permanent immediate-typing guard restored unchanged. | Red table above; 15 matcher failures in `tmp-logs/tnf-implementation-red.log`; browser reds await coordinator. |
| `<fix commit SHA>` | `tree-name-first` | Intentional desktop New folder change: name first, one named create, no cancellation write, signed placement/errors/focus. NameSheet and note-only create/rename callers remain compatible. | All 15 tree-name-first reds and 57 other files/app tests pass; app/node tsc and touched-file ESLint pass. Browser/axe/repeat verification pending. |

Notes-only commit needs no src/features row. No stored format, source API, conflict policy, content write
precondition, journal format, hard-delete behavior or deployment changed. `createNamed`'s existing
2-argument `Promise<void>` call remains compatible; the inline response is optional.

### Research and reuse

The supplied diagnosis's standard is VS Code's in-memory pending explorer item and synchronous
`setEditable`, followed by create only on completion:
https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileActions.ts
No network research was attempted under the owner's no-network constraint. This implementation
reuses existing naming state, NameForm rules, Input/FieldError, createNamed, act.open, Icon and focus return.

## Merge with claude/p3 (remove-new-note)

Resolved the four conflicted production files for the in-progress merge, preserving both accepted
entries. No git command wrote state, no network request was made, and no test was edited.
The coordinator must stage the resolved files and commit the merge; the unmerged index is untouched.

- Explorer retains the synchronous `askFolderName` call for its header and row menu, the pending
  row, immediate focus, shared name rules, one `createNamed` write, cancellation and retry behavior.
- NameSheet retains the extracted NameForm and name-rules home and excludes inline naming state.
  Its creation path now handles folders only through `act.createNamed`; existing rename behavior stays.
- Naming state accepts only `type: 'folder'`, retaining `inline` for the tree.
- Ordinary rename still follows applied paths and reports its existing messages. Only the options
  and callbacks used by the removed create-then-rename flow went away.

removed: Explorer's New note header button and row-menu item.
removed: NameSheet's note-create branch, extension handling, direct source write and note-only imports.
removed: naming state's note type, justMade/setJustMade and its sign-out reset.
removed: the now-unused act.create helper; all New folder callers use askFolderName/createNamed.
removed: act.discard and its create-cancellation Bin write.
removed: rename's quiet/onPartial options and Explorer's new-item welcome/navigation branches.
removed: RenameInput's typed callback argument, used only by the removed new-item flow.

The earlier Implementation section's retained-note caveats describe the pre-merge checkout.
This merge supplies remove-new-note, so those retained callers and branches are now gone.
The unnamed `create(folder)` from claude/p3 also has no caller after preserving name-first creation;
keeping it would retain the rejected create-then-rename mechanism. No creation-type argument remains.
There is no other behavior change. Tests from both accepted branches remain untouched.

### Merge verification

- `pnpm exec vitest run src/features/files src/app --maxWorkers=2 > tmp-logs/tnf-merge.log 2>&1`:
  exit 0, including the tree-name-first and no-new-note guards.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: exit 0; `tmp-logs/tnf-merge-tsc-app.log`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit`: exit 0; `tmp-logs/tnf-merge-tsc-node.log`.
- ESLint on the four conflicted files: exit 0; `tmp-logs/tnf-merge-eslint.log`.
- Read-only `git diff --check`: exit 0; `tmp-logs/tnf-merge-diff-check.log`.
- Conflict-marker scan: no markers remain. Unstaged test/e2e diff: empty.
- No pnpm check, e2e, staging, commit or integration in this merge-resolution session,
  as instructed. The coordinator owns the remaining integration gates and merge commit.

tests changed: none in this merge-resolution session.
sources: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileActions.ts
Research reused the packet's cited standard under the explicit no-network constraint.
