# Q1b questions UI: red handoff

implementer: codex

Entry: q1b-questions-ui. Red-only session. No application code, git writes, network, ports or node_modules changes.

## Tests changed

tests changed: src/features/home/Home.test.tsx: added 12 Q1b cases and imports; no existing assertion changed.
tests changed: src/features/tidy/TidySheet.test.tsx: new file with 10 Q1b cases using the existing source ports.
tests changed: src/features/piles/PileScreen.test.tsx: added 3 Q1b cases and imports; no existing assertion changed.
tests changed: e2e/q1-questions.spec.ts: new file with 26 browser cases; no existing e2e assertion changed.

## Signed table: exact red names and positive controls

| Red name | File | Positive control |
| --- | --- | --- |
| `Q1b A question with options on Home` | `Home.test.tsx` | Home loaded; state update and existing primary yes remain |
| `Q1b A yes/no question about an inbox thing or pile` | `Home.test.tsx` | primary yes and ghost no remain on both inbox subjects |
| `Q1b "Something else…" pressed` | `Home.test.tsx` | Home loaded; nonempty draft enables Tell Bower after the empty control |
| `Q1b Cancel` | `Home.test.tsx` | Home loaded; options reappear after leaving text mode |
| `Q1b An answer on Home, no run live` | `Home.test.tsx` | Home loaded; source answer and continuation record the option id |
| `Q1b A question during the run, sheet open` | `TidySheet.test.tsx` | original title, steps and Started clock render |
| `Q1b An answer during the run` | `TidySheet.test.tsx` | original run title/clock render; steps survive the answer |
| `Q1b The run ends with a question unanswered` | `TidySheet.test.tsx` | run transitions to Done; original RunLinks and detail render |
| `Q1b The pile row while a question waits` | `Home.test.tsx` | an unaffected row still says 1 thing |
| `Q1b After 2 rounds` | `Home.test.tsx` | an unaffected row still says 1 thing; full sentence covered on the pile too |
| `Q1b Over 1,000 characters typed` | `Home.test.tsx` | 1,000 trimmed characters enables submit; 1,001 is retained and rejected |
| `Q1b The last card in the sheet answered` | `TidySheet.test.tsx` | original title and clock render; false answer is recorded |
| `Q1b An answer in the sheet` | `TidySheet.test.tsx` | same asking exists on Home before answering; Home heading survives closing |
| `Q1b A tall sheet on a 1280×720 desktop (${source})` | `e2e/q1-questions.spec.ts` | original boot/run flow; 28 New notes links force overflow |

Every table row has its own Q1b test. The desktop row is e2e-only because jsdom cannot measure layout.
Browser names expand source to demo/fake; all other browser flows run at both 375 and 1440.

## Additional exact component names

- `Q1b Home text answer is trimmed and focus moves to the next question then the heading` (failed).
- `Q1b Home save failure retains the card and draft` (failed).
- `Q1b Upload error and readiness lines take priority over question projections` (passed).
- `Q1b Duplicate option labels answer by id` (failed).
- `Q1b After 2 rounds the pile page gives the words and Move sentence` (failed).
- `Q1b Changed pile words clear the exhausted sentence from the published projection` (failed).
- `Q1b A waiting pile and a damaged pile do not show exhaustion` (passed).
- `Q1b Run window includes askedAt at the start and orders stored questions by askedAt` (failed).
- `Q1b N more questions on Home counts this run and closes while navigating Home` (failed).
- `Q1b Sheet answer focuses the next earliest question` (failed).
- `Q1b Sheet save failure retains the card and draft` (failed).
- `Q1b Duplicate label ids across both cards` (failed).

## Verification and observed reds

Final targeted Vitest: 77 tests; 23 Q1b failures, 2 passing Q1b controls, and all 52 existing tests pass.
No import, matcher, timer-gate or positive-control failure remains. Failure queries identify missing options/text controls,
missing sheet question/label/more link, and missing waiting/exhausted copy. Failure details are in the temp logs.

Ran the complete Home, TidySheet and PileScreen files with `--maxWorkers=2`.
Invoked the existing Vitest CLI from a fresh OS-temp cwd, importing the repository Vite config into a temp config
and overriding only root/cacheDir. This keeps the unchanged timer gate and its CPU reports outside the repository.
All new component cases use fake timers and an injected source fixture; no real clock waits.

Command shape:
```sh
cd /tmp/q1b-red.<generated>
node /private/tmp/bower-q1b-questions-ui/node_modules/vitest/vitest.mjs run \
  src/features/home/Home.test.tsx src/features/tidy/TidySheet.test.tsx \
  src/features/piles/PileScreen.test.tsx --config /tmp/q1b-red.<generated>/vitest.config.mts \
  --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/q1b-questions-vitest.json \
  > /tmp/q1b-questions-vitest.log 2>&1
```

Logs:
- `/tmp/q1b-questions-vitest.log` and `/tmp/q1b-questions-vitest.json` (expected red exit 1).
- `/tmp/q1b-questions-types.log`: app TypeScript, noEmit/incremental false, pass.
- `/tmp/q1b-questions-e2e-types.log`: node/e2e TypeScript, noEmit/incremental false, pass.
- `/tmp/q1b-questions-lint.log`: ESLint on the four test files, pass.

E2e was written and statically checked, not executed: the coordinator owns the port-bound run.
`pnpm check` was not run in this red-only session; its normal scripts write repository artifacts.

## Rulings and fixture boundaries

TL-P4-44 addendum 9: requestedAt (the existing public run-clock start) is the inclusive run boundary.
The source fixture has no runId on Question and no alternate UI store; input ordering is deliberately shuffled.
Old askings remain on Home, are excluded from the sheet/count, and boundary askings precede phaseAt.
More counts only this window and is exercised from a non-Home route.
TL-P4-55: `Q1b An answer during the run` checks the card disappears while the sheet remains open,
the waits message is absent from the rendered Dock until close, then exactly one message appears.
This assertion depends on messages-wait-for-sheets; no toast or Dock implementation was changed.
Q-UI-3 owns the desktop sheet fix; Q1b checks the combined question/text/result stack under it.
Q1a owns durable answers, folder actions and words-reset semantics; fixtures assert the UI response to those ports.
Q1c owns storage/live merging and bounded publication; tests consume its public questions port.
Error labels, update labels and question headings are checked for duplicate DOM ids across Home and sheet.

## Contradictions and observations

Existing test assertions contradicting this packet: none found after reading and running all three targeted files.
No existing assertion was modified or removed.
Packet observation (not an existing-test contradiction): PileScreen.tsx:61 and PileScreen.tsx:92-100 have words,
Tidy up and Remove, but no standalone Move button. Positive controls use these actual existing actions.
The exact approved exhaustion sentence still says “or move it yourself”; no new Move button is requested by these reds.
The implementation/lead should confirm the intended existing shell Move entry point.

## Offline standard solution and reuse

No network was used. Reused local Button/Field/Sheet, the real answerQuestion path, subscriptions in DataProvider,
e2e/fixtures.ts, e2e/viewport.ts and e2e/axe.ts (WCAG 2.2 AA with target-size enabled, no disabled rules).
Served-module fixtures follow e2e/c05-person-notes.spec.ts and e2e/request-report-hidden.spec.ts;
they layer over each initialized demo/fake source without adding app hooks, source scenarios or persistence stores.
Reference patterns: Testing Library role queries (https://testing-library.com/docs/queries/byrole/),
WAI-ARIA modal dialog focus (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
and the locally existing axe helper backed by @axe-core/playwright (https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright).
References are citations for the reused local patterns; no current web verification was attempted.

## Left out

Implementation, commits (coordinator owns them), backend scenarios, pnpm check, executable e2e and designer verification.

## Implementation

Implemented Q-UI-1, Q-UI-2 and Q-UI-4 in the six owned application files only.
Home exports Questions, and RunView renders that component between its detail and steps/RunLinks.
QuestionCard is private to Home.tsx; both surfaces use Questions' one answer handler and answerQuestion.
Native Button, Field Textarea/FieldError, Sheet and existing tokens provide the controls and appearance.
No store, data-port write, runner, toast, Dock or global Sheet change was added.

Questions sort by askedAt, use id plus askedAt as React asking identity, and filter the sheet window
inclusively against RunState.requestedAt, for stored and live questions alike. The merged public
questions port remains the only source. Live display bounds reuse isQuestionSnapshot per asking;
overbound cards produce a console line and are omitted from the first ten sorted valid askings.
The overflow link counts all other open stored askings in this run's window, navigates Home and closes.
Unanswered cards remain at done. The existing answerToast preserves every answer-loop outcome.

Option answers carry option ids, text is trimmed, and inbox subjects alone offer Something else…,
including under yes/no. Unique useId ids label each textarea, error, update and Questions section.
Text mode focuses the textarea; Cancel restores controls and focuses Something else….
Tell Bower is disabled for empty/over-1,000 trimmed text and during a save. A failed save retains the draft.
The one answer handler settles focus immediately if the subscription has already rendered, or through
its Questions effect when it renders later. Focus selects direct card rows, then Home's heading or the
sheet's own aria-labelledby title, made focusable with tabIndex -1. The immediate settlement removes
an unnecessary timer race observed in the first full-suite run without changing any test.

Pile.question drives the Home waiting/exhausted sentences and the plain 17px exhaustion paragraph.
Existing readiness, note-lock, changed-item and upload states suppress those projections. The source
owns waiting precedence and words resets; existing words and removal controls are unchanged.
The packet's observation about the absence of a standalone Move button still applies; no button was added.

removed: Home's boolean-only private answer signature; the shared handler now accepts QuestionAnswer.
removed: fixed Questions heading/update ids; per-instance ids avoid collisions across Home and sheet.
removed: descendant li focus indexing; only direct question cards take part in focus settlement.
removed: zero-delay answer focus timer; immediate settlement plus the source-render effect owns it.
removed: descendant paragraph color override; FieldError keeps today's Field error color inside the form.
removed: no application mechanism, test, source port, runner path, toast or Dock behavior.
tests changed: none

### Verification setup and boundaries

All verification logs, JSON reports, Vite cache and timer-gate CPU reports are under
/tmp/q1b-implementation-4iimhjpd. Vitest starts from that OS-temp cwd with the repository root in a temp
config. Repository-relative reads in the full suite use temp links to source/config directories;
node_modules was never replaced or symlinked. The temp manifest contains no dependencies and the
final commands use npm_config_offline=true. No writing git command was issued by this session;
unchanged harness tests create their own disposable repositories as part of the requested src suite.

The first src run exposed missing cwd-relative fixture/script paths; the final run restores those
read paths in the OS-temp directory. Two intermediate invocations were stopped after copying the
full manifest caused pnpm to attempt dependency downloads; those requests failed DNS. The worktree's
dependencies were not changed. Those stopped invocations are not verification evidence.

Offline standard references and reuse remain those in the red handoff: Testing Library role queries,
WAI-ARIA APG modal-dialog focus and existing @axe-core/playwright patterns. Shared askingKey,
subjectOf, isQuestionSnapshot and answerQuestion are reused without an alternate implementation.
No network research, pnpm check, e2e, build, deployment or designer verification was performed.
pnpm check writes repository artifacts; the requested no-write verification uses the explicit gates instead.
The coordinator owns commits, e2e and the combined Q-UI-3 desktop stack check; the designer owns visual approval.

### Final verification results

- Committed reds reproduced before implementation: 77 tests, 23 Q1b assertion failures; 52 existing tests passed.
  Logs: `/tmp/q1b-implementation-4iimhjpd/red.log`, `red.json`.
- Final Home/TidySheet/PileScreen regressions and Q1b reds: **76/77 pass; 24/25 Q1b pass**.
  Logs: `/tmp/q1b-implementation-4iimhjpd/targeted-final.log`, `targeted-final.json`.
- Required `pnpm exec vitest run src --maxWorkers=2`: **5,710/5,715 pass**, 5 failed, 1 unhandled EPERM.
  Logs: `/tmp/q1b-implementation-4iimhjpd/src-final.log`, `src-final.json`, `failures.txt`.
  The final full run passes every Home and PileScreen test, all other TidySheet tests and all backend question tests.
- `pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false`: pass (`tsc-app.log`).
- `pnpm exec tsc -p tsconfig.node.json --noEmit --incremental false`: pass (`tsc-node.log`).
- ESLint on the three touched TSX files: pass (`eslint.log`). CSS and notes are outside this ESLint configuration.
- `node scripts/check-unused-gate.mjs`: pass for normal and production passes (`unused.log`).
- Read-only `git diff --check`: pass. Tests, spec, ports, runner, Dock and toast files unchanged.

Every final failure, with exact test and assertion location:

1. `src/features/tidy/TidySheet.test.tsx:106`, `Q1b An answer during the run`:
   the waits toast renders while the sheet is open. The answer is saved, the card is removed and steps remain.
   This is the signed amended row's **messages-wait-for-sheets** dependency. Q1b deliberately changes no Dock/toast code;
   this row may remain red until that entry merges, as the user authorized. All other Q1b rows pass.
2. `src/e2e-port.test.ts:37`, `a server from another worktree is never reused`:
   5,000ms timeout accompanied by `listen EPERM: operation not permitted 127.0.0.1` in the same file.
   This sandbox exception is expected by the user. No e2e command or server was started by the implementer;
   the unchanged required src test owns this port attempt.
3. `src/harness.test.ts:631`, `a test that passes only on retry fails a batch run`:
   its browser-free Playwright fixture cannot resolve `@playwright/test` from OS-temp `test-results/fx-*`.
4. `src/harness.test.ts:643`, `a quarantined test that passes on retry is reported, not failed`:
   the same OS-temp Playwright fixture resolution makes the spawned command exit 1.
   NODE_PATH is present but Node ESM package resolution does not use it. Keeping tests/results out of the repository
   and declining to replace/symlink node_modules leaves these environment failures recorded for the coordinator.
5. `src/docs.test.ts:134`, `every change since the P2 freeze is listed`:
   committed SHA `27280ef2` is missing from the change list. No implementation commit was made;
   shared history records are outside this packet's ownership and remain unchanged.

No frozen assertion contradicts the packet/ruling. No tests were changed to resolve these failures.
The first, cwd-incomplete full run and the interrupted intermediate commands are superseded by `src-final`.
No full gate is claimed green, and e2e/accessibility/desktop layout and designer verification remain with their owners.

### Changed application files

- `src/features/home/Home.tsx`
- `src/features/home/home.module.css`
- `src/features/tidy/TidySheet.tsx`
- `src/features/tidy/tidy.module.css`
- `src/features/piles/PileScreen.tsx`
- `src/features/piles/piles.module.css`

The only other change is this append-only Implementation section in the authorized notes file.
Commits: none; all git commands issued by the implementer were read-only.


## E2e repair

Implementer: codex. Read both coordinator logs: `/tmp/gates-q1b/e2e.log` (demo gate)
and `/tmp/gates-q1b/e2e-fake.log` (fake gate). Each contains the same 22 failures:
14 focus failures, six target-height failures, and two MWS visibility/not-found failures.
Both gates run Q1's explicit demo/fake fixtures in both Playwright projects.

### Cause for every failing row

- `e2e/q1-questions.spec.ts:158`, assertion `:162` via `stack:119`: **app defect**.
  Both explicit sources fail in the phone project resized to 1440: pointer remains coarse,
  but the shared sm Button's 44 px rule applies only below 900 px. Its measured height is 40 px.
  The spec correctly tests the packet's coarse-pointer requirement; its 44 px bound stays unchanged.
- `e2e/q1-questions.spec.ts:193`, assertion `:201` via `nativeTargets:152`: **app defect**.
  The same wide/coarse environment exposes 40 px yes/no/Something else controls. The yes/no layout,
  native button, full width, eight-pixel gap and all positive controls remain asserted.
- `e2e/q1-questions.spec.ts:214`: **two app defects**. Assertion `:225` via `stack:119`
  fails on the same wide/coarse 40 px targets (two failures per gate). Assertion `:234` fails
  on next-card focus in the other six project/source/width combinations per gate. After saving,
  subscriptions remove the focused control before answerQuestion's async continuation completes.
  Radix FocusScope's removal observer focuses the dialog itself. Questions.settle rejects every
  connected active element other than body, so it rejects that fallback and never focuses the next card.
  This is not a timeout or fixture failure: the next option is present throughout the five-second wait.
- `e2e/q1-questions.spec.ts:270`, assertion `:298`: **app defect**, eight failures per gate.
  The same Radix fallback prevents last-card focus from reaching the sheet title. The heading exists,
  the save-failure draft retention and successful retry controls already pass, and the answer is recorded.
  The correction allows the dialog container as a fallback; a focused real control still keeps focus.
- `e2e/messages-wait-for-sheets.spec.ts:121`, assertion `:126`: **spec locator defect**,
  two failures per gate. The fixed `section[aria-labelledby="qs"]` no longer exists because Questions
  uses per-instance useId labels. Query the named question region and its listitem role instead.
  Only that locator changes. All completion, hidden-message, uncovered-sheet and return assertions stay.

### Changes and evidence

Questions keeps its existing single answer/focus path; settle now accepts Radix's dialog-container
fallback as well as body, then focuses the next direct card or the existing sheet title.
The owned shared question-card stylesheet gives its buttons min-height 44 px on coarse pointers,
including wide touch screens and both Home/sheet surfaces. Fine-pointer sm buttons keep their current size.
No global Button/Sheet, data source, pile behavior, toast or Dock code changed.

Added two deterministic component regressions:
`Q1b Answer settles Radix removal focus after the continuation (next=false)` and `(next=true)`.
They hold the existing runs.start continuation with a promise, assert the answer is saved and the card
removed, assert Radix has focused the dialog, release the promise, and assert title/next-card focus.
Both fail on the target-focus assertion before the app change and pass afterward. No real timers.
The existing title, clock, steps and recorded-answer positive controls remain.

All 79 Home/TidySheet/PileScreen tests pass. App and e2e TypeScript noEmit/incremental-false checks pass;
ESLint on the changed TS/TSX files passes; read-only git diff --check passes.
Logs: `/tmp/q1b-repair-red.log`, `/tmp/q1b-repair-green.log`, `/tmp/q1b-repair-tsc-app.log`,
`/tmp/q1b-repair-tsc-e2e.log`, `/tmp/q1b-repair-eslint.log`.
The component test cwd, Vite cache, config and CPU reports are in the OS temp directory
`/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/q1b-e2e-repair-m58ln6q6`.

No e2e was run: the user assigns demo/fake browser verification and commits to the runner.
The supplied HEAD pnpm check/app.spec passes are prior coordinator evidence, not repair verification.
Standard pnpm check was not rerun because its test/build scripts write repository artifacts;
the user requires tests to write only to OS temp. No git write, network request, install,
node_modules replacement/symlink, server or harness-record edit was performed.

### Offline standard solution

Read installed `@radix-ui/react-focus-scope` 1.1.16, `dist/index.js:89-94`: its mutation observer
focuses the container when a focused descendant is removed and activeElement becomes body.
Reuse that existing dialog mechanism rather than adding a focus timer or replacement focus scope.
Official reference: https://www.radix-ui.com/primitives/docs/components/dialog
Role/name query reference: https://testing-library.com/docs/queries/byrole/
These cite locally inspected/reused patterns; no network or current web verification was used.

### Change accounting

tests changed: src/features/tidy/TidySheet.test.tsx: add two deferred-continuation focus regressions; shared fixture supports a promise gate. All existing assertions retained.
tests changed: e2e/messages-wait-for-sheets.spec.ts: replace the obsolete fixed Questions id with region/listitem roles and accessible name; all assertions retained.
tests changed: e2e/q1-questions.spec.ts: none; every signed row, assertion, bound and positive control remains unchanged.
removed: obsolete MWS fixed-id locator; connected-dialog exclusion from answer focus settlement.
removed: no test, assertion, positive control, focus mechanism, source port or behavior.

Changed files: src/features/home/Home.tsx; src/features/home/home.module.css;
src/features/tidy/TidySheet.test.tsx; e2e/messages-wait-for-sheets.spec.ts; this notes file.
Left out: runner-owned e2e verification/commits, full pnpm check rerun, designer verification.
