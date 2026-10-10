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
