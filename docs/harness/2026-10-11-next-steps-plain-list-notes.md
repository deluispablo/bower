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

## Red repair (addendum 1)

Scope: the owner's red-repair session, under the packet's
"Ruled (TL-P4-55 addendum 1)". Only the three authorized NSPL test files and
these notes changed. No app code, B6a test, dependency link or harness record
changed. No network, git write, install, server or e2e run occurred.

The ruling supersedes the personal-index assumptions and the blocked/contradiction
conclusions in the historical sections above. Toggles keep global body indexes.
In this fixture, Buy a pot is body index 3 and Water mint is body index 4;
their personal ownership identities remain 0 and 1 inside B6a. Bower tasks
still occupy body indexes 0, 1 and 2 even when they render without controls.
Both existing B6a tests remain unchanged and pass. No remaining note-suite
assertion contradicts the addendum.

tests changed: src/features/note/markdown.test.tsx: added supplied-region coverage with interleaved Bower/personal tasks and callback indexes 0, 2, 4; existing tests unchanged.
tests changed: src/features/note/next-steps-plain-list.test.tsx: repaired NSPL personal tasks from personal index 1 to body index 4; repaired the first-checkbox comment and added body indexes 3, 3, 3 without relaxing its byte-isolation assertions.
tests changed: src/features/note/next-steps-plain-list.test.tsx: extracted the unchanged strict project fixture for parser/source reds and added the optional-field compatibility row; NSPL Bower plain list assertions unchanged.
tests changed: e2e/next-steps-plain-list.spec.ts: added an observer of real mutation calls and body-index assertions 4, 1 and 3, 3, 3 to the existing demo/fake and phone/desktop rows; all previous assertions retained.

The additive optional field is called `taskRegions` in the new tests: an array
of `bower` / `personal`, one entry per body task in body order. No mutation
offset or personal-index mapping is exposed or recreated. The Markdown red
passes this projection directly, with Bower items under Notes, so headings
cannot stand in for ownership and the normal bullet cannot consume a task index.

The parser red rearranges the serializer's complete Goal/Next steps blocks into
B6a's supported stored-file order (appended after the personal section). The
production ownership parser accepts it, while the existing display projection
puts Goal/Next steps before Notes. Thus the region array must follow the
projected body, rather than file order or the personal task list. These are
fixture slices of real serialized blocks, not a second region parser.

The DriveVault red checks the actual returned Note and preserves fetched bytes.
The demo and fake reds place the same strict mixed-region project fixture in
the existing seeded project entry in memory, restoring it in `finally`.
DemoWorld's real note source and seedFakeDrive plus DriveVault's real fake
source are used without replacing their reads. This adds native source coverage
beyond the browser fixture's DriveVault overlay. The models currently omit the
new field in all three sources.

The compatibility row supplies a typed old-shape Note with no `taskRegions`,
`byBower: true`, and the same project headings. NoteScreen renders all five
tasks as enabled personal checkboxes and emits body indexes 0 through 4.
Only that row's note response and mutation sink are mocked: it verifies the
display/callback boundary for an old consumer, not write authority. Real
write protections remain covered by the unchanged B6a tests and the existing
NSPL full-byte mutation checks. This row is green on the baseline, as required;
inventing a red would contradict the absence-field fallback.

### Exact assertion-level reds

| Exact test name | Remaining baseline assertion failure |
| --- | --- |
| `NSPL supplied task regions keep each personal checkbox body index` | Five controls instead of three; Bower rows retain checkboxes and `md-task`. Callback indexes 0, 2, 4 pass. |
| `NSPL Bower plain list` | Bower list items still contain inputs and `md-task`. |
| `NSPL personal tasks` | Five controls instead of Buy a pot and Water mint only. The repaired body index 4 and full-byte mutation assertions pass. |
| `NSPL first personal tick` | First visible checkbox is still Bower's: indexes 3, 3, 0 instead of 3, 3, 3, unchanged personal task and one refusal. |
| `NSPL Note task regions follow B6a projection in body order` | Missing `taskRegions`; production framing and display-order controls pass. |
| `NSPL drive-vault fills Note task regions from B6a projection` | Missing `taskRegions`; body, checksum and unchanged fetched bytes pass. |
| `NSPL demo fills Note task regions from B6a projection` | Missing `taskRegions`; Bower identity and all five task labels pass. |
| `NSPL fake fills Note task regions from B6a projection` | Missing `taskRegions`; Bower identity and all five task labels pass. |

Green regressions: `NSPL no Bower region`,
`NSPL Note without task regions renders every task as personal`, and all
18 existing note tests, including both unchanged B6a tests. No unrelated reds,
skips, import failures or unhandled errors in the final note-suite run.

### Verification

The existing OS-temp config retains the app config and timer gate, redirects
Vite/module caches to temp, and uses explicit default/JSON reporters. Tests
write no repository artifacts.

```sh
nspl_run_dir=$(cat /tmp/next-steps-plain-list-run-dir)
pnpm exec vitest run src/features/note/markdown.test.tsx \
  src/features/note/next-steps-plain-list.test.tsx \
  src/features/note/b6a-task-regions.test.tsx --maxWorkers=2 \
  --config "$nspl_run_dir/vitest.config.mjs" --configLoader runner \
  --fsModuleCachePath "$nspl_run_dir/module-cache" \
  --reporter=default --reporter=json --outputFile /tmp/nspl-addendum1-red.json \
  > /tmp/nspl-addendum1-red.log 2>&1
pnpm exec vitest run src/features/note --maxWorkers=2 \
  --config "$nspl_run_dir/vitest.config.mjs" --configLoader runner \
  --fsModuleCachePath "$nspl_run_dir/module-cache" \
  --reporter=default --reporter=json --outputFile /tmp/nspl-addendum1-note.json \
  > /tmp/nspl-addendum1-note.log 2>&1
```

Targeted run: 15 tests, seven pass and eight intended NSPL reds (exit 1).
Full note suite: 28 tests, 20 pass and the same eight intended NSPL reds
(exit 1). The compatibility fixture initially spread a proxy source and lost
its methods; it was corrected to use the real DriveVault before accepting
the final assertion-level results.

ESLint passes on all three test files (`/tmp/nspl-addendum1-eslint.log`).
App TypeScript passes with build-info redirected to the OS-temp run directory
(`/tmp/nspl-addendum1-tsc.log`). The e2e spec passes a separate strict TypeScript
check with its config in `/tmp/nspl-addendum1-e2e-tsconfig.json`
(`/tmp/nspl-addendum1-e2e-tsc.log`). Its first temp config incorrectly resolved
package type entries from temp; explicit local declarations corrected that
config without touching dependencies. `git diff --check` passes.

`pnpm check` and e2e were not run: this session repairs reds only, and the
repository-writing gates are outside the owner's authorized scope. Green
implementation, runner commits, browser execution and designer verification
remain for their assigned sessions.

Offline standard/reuse precedent is unchanged: CommonMark list items
(https://spec.commonmark.org/0.31.2/#list-items) and GFM task lists
(https://github.github.com/gfm/#task-list-items-extension-), cited by the local
note-template contract. All ownership/projection checks use B6a's existing
parser and serializer; no new production mechanism is introduced.

## Implementation (addendum 1)

Implemented the expanded packet's ruling. `Note.taskRegions` is an additive
optional array of `personal` / `bower`, one entry per displayed body task.
`parseNote` derives it directly from B6a's existing `templateProjection.tasks`,
whose order is already the displayed body's order. The field is display
metadata, not a mutation offset or a new source of write authority.

`DriveVault.note` already spreads the parsed model at its return boundary, so
it carries the new field without an additional transformation or file edit.
The fake source uses that same DriveVault read after `seedFakeDrive` serializes
the demo notes. Both real source reds now pass. DemoWorld builds seeded
template notes through the existing serializer/parser and keeps the projected
body together with its task regions. Legacy seeds retain their existing body.
No heading inference, second region parser or index mapping was introduced.

NoteScreen passes the regions straight to Markdown. Markdown counts every
body task, including Bower's, and retains each personal checkbox's body index.
Bower items use ordinary `li` semantics with a text span, no control or
`md-task`. Done Bower items use `md-done` on the list item, so the existing
`.md-done span` rule supplies today's muted and struck appearance. Missing
regions leave every task as a personal checkbox, even with `byBower: true`
and project headings. The production tick callback and mutation protections
are unchanged, including both B6a tests.

Owned files changed:

- `src/data/contracts/types.ts`
- `src/data/contracts/note-format.ts`
- `src/data/demo/world.ts`
- `src/features/note/markdown.tsx`
- `src/features/note/NoteScreen.tsx` (region prop wiring only)
- `docs/harness/2026-10-11-next-steps-plain-list-notes.md`

removed: the unconditional checkbox rendering for Bower-region body tasks.
removed: none of B6a's projection, mutation guards, indexes or stored framing.
tests changed: none

### Contract compatibility draft row

| Contract | Draft change | Compatibility and storage | Evidence |
| --- | --- | --- | --- |
| `Note` returned by `parseNote` / `VaultSource.note` | Add optional `taskRegions?: Array<'personal' \| 'bower'>`, in displayed body task order; populated only from B6a's projection. | Old producers may omit it: all tasks render as personal and emit unchanged global body indexes. Existing consumers can ignore it. No stored format, bytes, write identity or serializer framing changes. | `NSPL Note without task regions renders every task as personal`; `NSPL no Bower region`; parser, DriveVault, demo and fake NSPL source rows; unchanged B6a refusal/isolation rows. |

### Research and verification

Offline standard precedent remains the local note-template contract's
CommonMark list items (https://spec.commonmark.org/0.31.2/#list-items) and
GFM task lists (https://github.github.com/gfm/#task-list-items-extension-).
Reused the existing renderer, Checkbox, `md-done`, serializer and B6a
projection. No network request was made.

The unchanged targeted suite first reproduced all eight assertion-level NSPL
reds listed in "Red repair (addendum 1)"; seven regressions passed, including
both B6a tests. Logs: `/tmp/nspl-impl1-red.log`, `/tmp/nspl-impl1-red.json`.
After implementation, all 15 targeted tests pass, with no skips or unhandled
errors. Logs: `/tmp/nspl-impl1-target.log`, `/tmp/nspl-impl1-target.json`.

Commands use the existing OS-temp Vitest config named by
`/tmp/next-steps-plain-list-run-dir`, with default/JSON reporters, Vite/module
caches in temp and the existing timer gate retained. No tests changed.

```sh
nspl_run_dir=$(cat /tmp/next-steps-plain-list-run-dir)
pnpm exec vitest run src/features/note/markdown.test.tsx \
  src/features/note/next-steps-plain-list.test.tsx \
  src/features/note/b6a-task-regions.test.tsx --maxWorkers=2 \
  --config "$nspl_run_dir/vitest.config.mjs" --configLoader runner \
  --fsModuleCachePath "$nspl_run_dir/module-cache" \
  --reporter=default --reporter=json --outputFile /tmp/nspl-impl1-target.json \
  > /tmp/nspl-impl1-target.log 2>&1
pnpm exec vitest run src --maxWorkers=2 \
  --config "$nspl_run_dir/vitest.config.mjs" --configLoader runner \
  --fsModuleCachePath "$nspl_run_dir/module-cache" \
  --reporter=default --reporter=json --outputFile /tmp/nspl-impl1-src.json \
  > /tmp/nspl-impl1-src.log 2>&1
pnpm exec tsc -p tsconfig.app.json \
  --tsBuildInfoFile /tmp/nspl-impl1-app.tsbuildinfo > /tmp/nspl-impl1-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json \
  --tsBuildInfoFile /tmp/nspl-impl1-node.tsbuildinfo > /tmp/nspl-impl1-tsc-node.log 2>&1
pnpm exec eslint src/data/contracts/types.ts src/data/contracts/note-format.ts \
  src/data/demo/world.ts src/features/note/markdown.tsx \
  src/features/note/NoteScreen.tsx > /tmp/nspl-impl1-eslint.log 2>&1
node scripts/check-unused-gate.mjs > /tmp/nspl-impl1-unused.log 2>&1
```

App/node TypeScript and touched-file ESLint pass. The unused-code gate passes
both baseline comparisons (2 all-code findings, 29 production findings).
The complete requested src run finishes with 5,700 tests: 5,698 passed,
two failed, no skips. The full note suite passes, including the ten NSPL
cases and both unchanged B6a cases. The two failures are outside this diff:

- `src/docs.test.ts:134`, `every change since the P2 freeze is listed`:
  commit rows `4de03d64` and `9c8e61b0` are missing from the shared list.
  No commit or shared harness record is changed in this implementation.
- `src/e2e-port.test.ts:37`, `a server from another worktree is never reused`:
  expected sandbox `listen EPERM` on `127.0.0.1`, followed by the test's
  5,000 ms timeout and one unhandled EPERM. The owner's request explicitly
  anticipates this port failure.

Full src logs: `/tmp/nspl-impl1-src.log`, `/tmp/nspl-impl1-src.json` (exit 1).
Logs are the paths in the commands above. No installation or node_modules
replacement/symlink occurred. No git write command was run; the runner owns
the commits. `pnpm check` was not run because it writes repository reports
and marks; the owner's separate requested checks are run above. Browser e2e
and designer verification remain for their assigned sessions.

## E2e repair

Scope: the owner's offline repair of the coordinator's HEAD browser failures.
Only the owned e2e spec and these notes changed. No app code, existing spec,
B6a assertion, dependency link or harness record changed. No network, git write,
install, server or e2e run occurred. The runner owns commits and browser gates.

### Cause of each failing row (original line numbers)

| Row | Cause and evidence | Repair |
| --- | --- | --- |
| `e2e/next-steps-plain-list.spec.ts:130` | Spec timing: `own.uncheck()` immediately verifies an uncontrolled-style state change, before Water mint's asynchronous content write and note refresh finish. The log fails at line 136, before the byte or index assertions. | Click once, retain the complete raw-byte comparison and `[4]`, then wait for the named checkbox to be unchecked. All positive controls remain. |
| `e2e/next-steps-plain-list.spec.ts:144` | Spec timing: `own.check()` makes the same immediate-state assumption for Plant mint, without Bower ownership framing. The log fails at line 152, before the byte or `[1]` assertions. | Assert the initial unchecked state, click once, poll the complete personal-note bytes and wait for the checked state. All headings, checkbox-count and checked-item controls remain. |
| `e2e/next-steps-plain-list.spec.ts:157` | Spec timing: the first named `check()` fails at line 161. Its later `uncheck()` and first-checkbox `check()` have the same race. Waiting for bytes alone between clicks would still race the note refresh. | Replace all three actions with single clicks, waiting for both unchanged full-byte assertions and the named checkbox state before the next action. Keep `[3, 3, 3]` and the first-visible-checkbox isolation assertion. |
| `e2e/next-steps-plain-list.spec.ts:172` | Fixture scope: the project note was seeded at the folder root. `parentOf(path)` is empty, and PhoneBar renders `crumbs(folder)` without the desktop fallback. Axe reports `link-name` and `target-size` on `._phoneCrumb_skam3_4` at width 375. This is an actual root-note breadcrumb defect outside the owned tick wiring, not a task/index defect. | Seed both fixture notes inside the named `NSPL garden` folder, and positively assert its breadcrumb before scanning the same full `main article` at WCAG 2.2. The project-note contract, all matrix cells, rule set and plain-list assertions remain. No rule or element is excluded. |

Both supplied logs show the four `toEqual` failures in `axe.ts:44`, reached
from the original line 176, not in `toggleIndexes`. The index assertions appear
in nearby source excerpts in checkbox failures; none reports an index mismatch.
`/tmp/gates-nspl/e2e.log` contains 24 immediate checkbox-state failures and four
axe failures; `/tmp/gates-nspl/e2e-fake.log` contains 23 and four respectively
(one no-Bower-region cell succeeds). Both commands exercise the spec's explicit
demo/fake and 375/1440 matrix under both Playwright projects.

The production wiring is correct for these rows. Markdown counts all body
tasks, captures each checkbox's body index, and passes it unchanged through
NoteScreen to `vault.toggleTask`. DriveVault awaits its content write, updates
the cached parsed note, records the journal line and emits the refresh. React's
controlled Checkbox therefore retains the fetched state until that refresh.
No optimistic state, index mapping or second task mechanism was added.
The unchanged B6a tests exercise the production screen callback, await the real
mutation inside `act`, check whole-note isolation and refuse a Bower-region
identity with no write. Both pass in this repair's targeted run.

The separate root-note breadcrumb defect is logged here for lead diagnosis and
ruling; it remains unfixed. NoteScreen's authorized scope is tick wiring only.
The fixture repair limits this entry's accessibility row to its promised
project-note case with a named containing folder, like the existing note-screen
browser fixtures. It does not claim root-note accessibility coverage.

tests changed: e2e/next-steps-plain-list.spec.ts: replace all five synchronous check/uncheck actions with click plus written-state waits; retain every byte, body-index, isolation assertion and positive control; add initial/final checkbox-state assertions.
tests changed: e2e/next-steps-plain-list.spec.ts: seed the same two notes under a named parent folder and assert its breadcrumb; retain the entire article WCAG 2.2 scan and all demo/fake, phone/desktop cells.
removed: only check/uncheck actions and the root-level fixture placement; no assertion, positive control, matrix cell, accessibility rule or app mechanism removed.

### Offline precedent and verification

The installed Playwright type documentation describes `check` and `uncheck`
as clicking and immediately ensuring the resulting checked state, throwing
when it has not changed. Its assertion documentation recommends retrying
`expect(locator).toBeChecked()` for observable checkbox state:
https://playwright.dev/docs/api/class-locator#locator-check
https://playwright.dev/docs/api/class-locator#locator-uncheck
https://playwright.dev/docs/test-assertions
These were read locally; no browsing or network request occurred.
`e2e/v2-field.spec.ts:155-164` is the existing task-control precedent: a real
interaction (focus and Space), followed by a retrying checked-state assertion.
The repaired spec uses click plus the same retrying assertion, while retaining
its stronger complete stored-byte comparisons. `e2e/empty-note-help.spec.ts`
uses a containing folder and the same full-article WCAG 2.2 scan.

Verification: 15/15 targeted tests pass in the three files below, including
both unchanged B6a tests and all NSPL component/source/compatibility tests.
Strict node/e2e TypeScript and touched-spec ESLint pass. `git diff --check`
passes. All logs, reports, module caches and build-info files are in OS temp.

```sh
nspl_run_dir=$(cat /tmp/next-steps-plain-list-run-dir)
pnpm exec vitest run src/features/note/markdown.test.tsx \
  src/features/note/next-steps-plain-list.test.tsx \
  src/features/note/b6a-task-regions.test.tsx --maxWorkers=2 \
  --config "$nspl_run_dir/vitest.config.mjs" --configLoader runner \
  --fsModuleCachePath /tmp/nspl-e2e-repair-module-cache \
  --reporter=default --reporter=json --outputFile /tmp/nspl-e2e-repair-unit.json \
  > /tmp/nspl-e2e-repair-unit.log 2>&1
pnpm exec tsc -p tsconfig.node.json \
  --tsBuildInfoFile /tmp/nspl-e2e-repair-node.tsbuildinfo \
  > /tmp/nspl-e2e-repair-tsc.log 2>&1
pnpm exec eslint e2e/next-steps-plain-list.spec.ts \
  > /tmp/nspl-e2e-repair-eslint.log 2>&1
```

E2e was not run, as instructed; browser green remains for the runner on demo
and fake. `pnpm check` was not rerun because it writes reports and marks into
the repository, contrary to this session's instruction. The owner reports
`pnpm check` and the four existing browser specs passed on the supplied HEAD.

## Close (coordinator)

done.sh could not take 1465a126 off cleanly: the same commit carries notes lines that later commits touched. The reds were proved at their tests-only commits.
- The NSPL reds failed on 9c8e61b0 and 4de03d64 before the fix 1465a126 (red cards: 3 reds, then 8 intended reds).
- After the fix, all were green on de8ffea7: check, plus e2e NSPL on demo and fake. Coordinator gates also passed on 2b0ca0f9 (app, capabilities, c05-person-notes, empty-note-help).
P4-117 PASS, and the designer verified. Closed with --known-green.
