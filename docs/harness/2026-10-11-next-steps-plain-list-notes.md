# next-steps-plain-list: red evidence (TL-P4-55 (1))

implementer: codex

Scope: red-owning session only. No app code, existing assertion, dependency link,
git write, network request, server or e2e run was changed or performed.
The coordinator owns commits, implementation and the browser run.

tests changed: src/features/note/markdown.test.tsx: added NSPL no Bower region and its positive control; existing assertions unchanged.
tests changed: src/features/note/next-steps-plain-list.test.tsx: new production-screen reds for owned lists, personal indexes and first-checkbox isolation.
tests changed: e2e/next-steps-plain-list.spec.ts: new three-row, first-tick and WCAG 2.2 matrix with positive controls, demo/fake at 375/1440.

## Exact unit names and controls

| Spec row | Exact test name | Positive control | Baseline result |
| --- | --- | --- | --- |
| A Bower project note with Next steps | `NSPL Bower plain list` | Ordinary unordered bullet; the person's checked item still has `md-done`; real v2 ownership has two personal identities. | Red: Bower items still have inputs and `md-task`. |
| The person's own task list in the same note | `NSPL personal tasks` | Untick Water mint through NoteScreen; the complete fetched note changes only that line, with one note write and no errors. | Red: renderer emits index 4 instead of personal index 1 and exposes five checkboxes instead of two. |
| A note with no Bower region | `NSPL no Bower region` | Ordinary list bullet has no control; personal tasks under Next steps and Notes retain working open/done checkboxes. | Green regression: callback positions are 0, 1, 2. |
| Additional first-task requirement | `NSPL first personal tick` | Tick/untick Buy a pot by its accessible name, checking the entire fetched note both times. | Red: the first visible checkbox targets a Bower item; Buy a pot stays unchanged and the screen logs one refusal. |

Row 3 already meets the spec on the baseline. Its contract test is deliberately
green; manufacturing an assertion failure would contradict "As today". All four
names have the requested prefix and all controls passed before the red assertions.

The project fixture uses the existing strict serializer and ownership parser,
with Bower tasks in both Goal and Next steps and personal tasks in Notes. There is
no region parser in these tests. The renderer spy delegates to the real Markdown
function and only records its callback positions. The task mutation spy delegates
to the real DriveVault; clicks use the actual screen controls. Full raw-string
comparisons protect framing, every other task and all other note content.

## Existing callback-contract contradictions

The complete note suite ran before this list was finalized. Both existing B6a
tests pass on the baseline and were left intact. They inject global body task
positions into the captured Markdown callback, which conflicts with the spec's
new requirement that tick positions count only personal tasks:

- `src/features/note/b6a-task-regions.test.tsx:87`: the positive test injects index 1
  for Buy a pot via the helper at line 71, although it is personal index 0.
  Its associated raw-write assertions are at lines 88, 90 and 91.
- `src/features/note/b6a-task-regions.test.tsx:99`: the refusal test injects index 0
  for Plant mint, although the new renderer callback's index 0 denotes Buy a pot.
  Its unchanged/no-write/error assertions are at lines 100, 101, 102, 103 and 104.

The underlying Bower-write refusal remains required. These are conflicts in the
screen callback injection, not permission to weaken the mutation protection.
The lead/coordinator must rule on the existing tests before changing their
assumptions; this session has changed none of their assertions.
No other existing note assertion contradicting the rows was found.

## Browser matrix, written only

For each source in demo/fake and each width in 375/1440, the spec defines:

- `NSPL a Bower project note with Next steps has plain bullets and muted struck done items (<source>, <width>)`
- `NSPL the person task list in the same note keeps working checkboxes and isolated ticks (<source>, <width>)`
- `NSPL a note with no Bower region stays as today (<source>, <width>)`
- `NSPL ticking the first person task changes only its line beside Bower Next steps (<source>, <width>)`
- `NSPL project note passes axe WCAG 2.2 with plain list semantics (<source>, <width>)`

Twenty matrix cases, selected in either existing Playwright project. The spec
uses fixtures.test, resize and expectAxeClean with wcag22 enabled, no rule
exclusions. It checks actual list markers, the done text's strike and its color
against today's personal done item. It rejects controls, including disabled
ones, in the Bower list items.

The browser fixture follows c05-person-notes' served-module technique. Each
requested original demo/fake source still boots its shell and session. Only the
two new fixture notes and their tree entries are routed through a real
DriveVault over an in-memory FakeDrive; this is a UI fixture, not a claim to cover
DemoWorld's mutation implementation. No renderer or task mutation is simulated.
A browser-only read observer returns stored text by file id. Plain and owned
notes have identical body headings, so a heading-only ownership shortcut fails
the personal-note case. No browser test writes a local file.

E2e was not run: this session cannot bind ports. The coordinator runs this spec
and the existing note-screen e2e through the heavy-run lock, with Playwright's
output directory, reports and redirected logs in the OS temp folder.

## Offline research and mechanism reuse

No network was used. Standards and library precedents were available locally:

- `src/data/contracts/note-templates.ts` cites CommonMark list items:
  https://spec.commonmark.org/0.31.2/#list-items
- The same file cites GFM task-list semantics:
  https://github.github.com/gfm/#task-list-items-extension-
- The installed Testing Library README demonstrates role queries and real
  events, and links to https://testing-library.com/react
- `e2e/axe.ts` is the shared WCAG 2.2 scan mechanism; `e2e/viewport.ts` is the
  shell-settling resize helper; c05-person-notes is the local UI-fixture precedent.
- B6a's production ownership parser, serializer and task mutation supply the
  region identities and write protections. No second ownership mechanism added.

## Verification and reproducibility

Final note-suite command (temporary config keeps the normal app config and timer
gate, redirects Vite caches, and omits only the repository-writing CPU reporter):

```sh
nspl_run_dir=$(cat /tmp/next-steps-plain-list-run-dir)
pnpm exec vitest run src/features/note --maxWorkers=2 \
  --config "$nspl_run_dir/vitest.config.mjs" --configLoader runner \
  --fsModuleCachePath "$nspl_run_dir/module-cache" \
  --reporter=default --reporter=json --outputFile /tmp/nspl-red.json \
  > /tmp/nspl-red.log 2>&1
```

Result: 22 tests, 19 passed, three named NSPL assertion failures, no skipped
tests. All 18 existing note tests passed, including both B6a tests. The new
no-Bower-region regression passed. Logs: `/tmp/nspl-red.log` and
`/tmp/nspl-red.json`. Initial targeted runs used the same --maxWorkers=2 setting.
The initial fixture omitted required creation metadata and was corrected to the
existing B6a shape before accepting the assertion-level red evidence.

Static checks passed: ESLint on the three changed test files, the app TypeScript
check with its build-info file redirected to temp, and a separate strict
TypeScript check of the new e2e spec. Their logs are in the directory named by
`/tmp/next-steps-plain-list-run-dir`: `eslint.log`, `app-typecheck.log` and
`e2e-typecheck.log`. `git diff --check` passed. No node_modules replacement or
symlink was made. All test results, caches, config scaffolding and logs stayed
in the OS temp folder.

`pnpm check` was not run: this is an intentionally red, test-only delivery, and
the repository's gate writes repository reports/marks. Implementation, green,
coordinator commits, the e2e run and designer verification remain outside this
session's authorized scope.

## Implementation

Status: blocked before app edits. The owned UI files cannot reuse B6a's
per-region task identity with the current data boundary. No alternative region
parser, guessed ownership, synthetic framing or callback compatibility shim was
added.

The existing identity is `DisplayTask` and `templateProjection` in
`src/data/contracts/note-format.ts:169-197`. Both are private. `parseNote` uses
only the projected body in its returned model (`:290-293`), and `Note` has no
region/task identities or fetched bytes (`src/data/contracts/types.ts:51-75`).
`DriveVault.note` returns that model with links and a checksum, not the fetched
text (`src/data/vault/drive-vault.ts:315`). Those data files are outside the
packet's owned files. The read-only ownership parser needs original bytes,
which neither owned UI file receives. Serializing the display model would not
recover the fetched ownership framing. Headings and `byBower` alone cannot
distinguish Bower-owned payloads from personal content.

The data boundary must first expose B6a's existing projection to the note view.
That needs a lead ruling and an expanded packet (or a prerequisite data entry).
The UI can then consume the identities in the existing Markdown renderer, emit
personal indexes, and translate them to the current mutation API's body indexes
in the owned NoteScreen tick wiring. No mutation protection needs weakening.

The two existing callback contradictions remain as listed above:
`src/features/note/b6a-task-regions.test.tsx:87` and `:99` inject global body
indexes; the NSPL contract requires personal indexes. Both B6a tests remain
unchanged. Their injection contract needs a lead ruling before a compliant
NoteScreen callback can replace it.

removed: none; no app code changed because the required mechanism is private.
tests changed: none

Offline standard precedent: CommonMark list-item semantics, already cited by
the existing note-template contract:
https://spec.commonmark.org/0.31.2/#list-items
The required done styling remains the existing `md-done`; no component or copy
was added. No network, git write, dependency installation or node_modules
replacement/symlink was performed.

Verification uses the existing OS-temp Vitest config documented above. It keeps
the app config and timer gate, redirects caches to temp, and omits only the
repository-writing CPU reporter.

- NSPL reds rerun: three assertion failures (`NSPL Bower plain list`,
  `NSPL personal tasks`, `NSPL first personal tick`); `NSPL no Bower region`
  passes. Logs: `/tmp/nspl-implementation-red.log`,
  `/tmp/nspl-implementation-red.json`.
- App and node TypeScript checks pass; build-info paths were redirected to the
  OS-temp run directory. Logs: `/tmp/nspl-implementation-tsc-app.log`,
  `/tmp/nspl-implementation-tsc-node.log`.
- ESLint passes on the two candidate UI files (`markdown.tsx`, `NoteScreen.tsx`).
  Log: `/tmp/nspl-implementation-eslint.log`.
- `node scripts/check-unused-gate.mjs` passes both baseline comparisons.
  Log: `/tmp/nspl-implementation-unused.log`.
- Full requested src unit run: 5,694 tests; 5,689 pass and five fail, no skips.
  The complete note suite has 22 tests: 19 pass and the three NSPL reds fail.
  Both existing B6a tests pass unchanged. The other two failures are
  `src/docs.test.ts:134` (`every change since the P2 freeze is listed`,
  missing commit `9c8e61b0`) and `src/e2e-port.test.ts:37`
  (`a server from another worktree is never reused`, timeout following the
  expected `listen EPERM` on 127.0.0.1). The latter also produces one unhandled
  EPERM. No app or test edits caused either failure. Logs:
  `/tmp/nspl-implementation-src.log`, `/tmp/nspl-implementation-src.json`.
- E2e not run; coordinator owns it. `pnpm check` not run because it writes
  repository reports/marks; the user requested the separate checks above.

Full src command (exit 1):

```sh
nspl_run_dir=$(cat /tmp/next-steps-plain-list-run-dir)
pnpm exec vitest run src --maxWorkers=2 \
  --config "$nspl_run_dir/vitest.config.mjs" --configLoader runner \
  --fsModuleCachePath "$nspl_run_dir/module-cache" \
  --reporter=default --reporter=json \
  --outputFile /tmp/nspl-implementation-src.json \
  > /tmp/nspl-implementation-src.log 2>&1
```

`git diff --check` passes. The notes file is the only changed file.
