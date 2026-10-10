# smoke-request-report-hidden implementation

implementer: codex

Implemented ruling (a) from the packet and supplied diagnosis, offline, in the assigned worktree.
No git write commands, commits, network requests, servers or e2e runs were made.

## Standard solution and mechanism

The supplied diagnosis cites visibility of system status:
https://www.nngroup.com/articles/ten-usability-heuristics/
and the existing link pattern:
https://www.w3.org/WAI/ARIA/apg/patterns/link/
These citations were reused offline; no current online verification was attempted.
Reuse the existing run-words predicates, RunLinks renderer, runTitle/runDetail and runs.markSeen.
Home and TidySheet share reportWaiting, based on a finished, unseen report having any row.
Replay eligibility and status-bar replay dispatch remain unchanged.
The row check also recognizes the existing answered, alreadySaved and unconfirmed collections.
Requests, rulesWorded and yourChanges are summary metadata, not rows.
No second renderer, outcome policy, source scenario, app test hook, or UI string was introduced.

removed: Home's replay-only condition for report reachability.
removed: Home's separately composed report heading and detail; reuse runTitle/runDetail.
removed: TidySheet's watched-only restriction for a finished unseen report with rows.
removed: no files, persisted fields, replay rules or Bower bubble behavior.

## Files for separate coordinator commits

Test files (red commit):
- src/features/tidy/request-report-hidden.test.tsx
- src/features/home/Home.test.tsx
- e2e/request-report-hidden.spec.ts

Code files (fix commit):
- src/features/home/Home.tsx
- src/features/tidy/TidySheet.tsx
- src/features/tidy/run-words.ts

Notes file (notes commit):
- docs/harness/2026-10-10-smoke-request-report-hidden-notes.md

Tests and code stay in separate files. Nothing was staged or committed.

tests changed: src/features/home/Home.test.tsx: ruling (a) requires explicit reopening to show the unseen report.
The existing test still asserts Home never automatically opens a sheet, using the same unseen all-run fixture.
Its explicit Tidy up press now asserts the report title, Done and Watch, instead of old confirmation content.
No numeric bound or accessibility threshold was relaxed.

## Red evidence

Exact new component tests:
- request report: Home shows instructions leftAsWritten with today’s words and Got it alone
- request report: status bar reopens unseen instructions leftAsWritten instead of Nothing to tidy
- request report: all with filings retains Home replay and status bar replay
- request report: all with no rows has no Home card and opens Nothing to tidy
- request report: instructions with no rows has no Home card and opens Nothing to tidy
- request report: instructions report stays reachable for row %j (created, updated, setAside, questions)

Before app changes, the first two failed because the expected Home heading and reopened dialog were absent.
The all control failed the mandated runTitle heading assertion; row variants failed the Home heading assertion.
Both no-row controls passed. Final red run: 7 failed, 2 passed, all on missing-element assertions.
Initial fixture setup/timer errors were corrected before the recorded assertion red.
Log: tmp-logs/request-report-red.log.
The exact diagnosis sentence and one linked leftAsWritten row reproduce the request-only outcome.

## Green evidence and remaining coordinator gates

Targeted component command:
`pnpm exec vitest run src/features/tidy/request-report-hidden.test.tsx src/features/home/Home.test.tsx src/features/tidy/StatusBar.test.tsx --maxWorkers=2`
Log: tmp-logs/request-report-green.log (25 tests).
Feature command: `pnpm exec vitest run src/features --maxWorkers=2`.
Log: tmp-logs/features.log (33 files, 163 tests).
App TypeScript: `pnpm exec tsc -p tsconfig.app.json --noEmit`, tmp-logs/tsc-app.log.
ESLint: all six touched test/code files, tmp-logs/eslint.log.

E2e is authored for demo and fake, at 1440 and 375, with instructions, all and empty report fixtures.
It uses the existing c05-person-notes served-source-port technique and shared expectAxeClean helper.
Home and the reopened instructions/empty sheet use WCAG 2.2 tags with target-size enabled.
The all control preserves replay dispatch and scans its replay dialog.
The existing status action is desktop-only: phone-width sheet checks open through that action at 1440,
then resize with the shared shell-settling helper to 375. No new phone result entry was added.
E2e has not been executed: the owner prohibits ports and assigns execution to the coordinator.
The coordinator must run this new spec plus the packet's app, c05-person-notes and qa5 suites on both sources.
Full pnpm check was not run: the owner limited commands to component/features, app tsc and touched-file ESLint.
The coordinator must run pnpm check and arrange the designer's built-result verification before closing the entry.

## Red repair (designer findings)

Red-owning session, 2026-10-10, starting HEAD 9f9779de.
The designer did not verify the previous build. These findings supersede the earlier
Home-copy and first-press expectations above; the earlier green is historical evidence only.
Only the three test files listed below and this notes file were edited.
No network, git write commands, app-source edits, servers, full check or e2e execution.

Offline references: `git show fcd23584 -- src/features/home/Home.test.tsx` supplies the exact
regression repair; `git show claude/p3:src/features/home/Home.tsx` supplies the existing
replayable filing heading and landedSummary copy. Existing served-source fixtures and
Testing Library screen/within assertions are reused. The external citations above remain
unverified offline; this repair introduces no UI strings or second app mechanism.

tests changed: src/features/home/Home.test.tsx: restore the original first-press expectations exactly.
The comment and three assertions are restored from before fcd23584; the whole file has no diff
against fcd23584^. With an unseen all-run and one new pile, Done and Watch must be absent,
and the Tidy up 1 thing confirmation button must be visible.

tests changed: src/features/tidy/request-report-hidden.test.tsx: correct Home replay copy and fallback-detail expectations.
The existing instructions leftAsWritten Home test now requires the fallback detail to be absent.
The existing all-filings control requires the original exact `1 thing filed.` heading and
`Home got 1.` detail instead of runTitle/runDetail. Its replay buttons and status replay stay asserted.
Added an independent filing detail red so both wrong heading and wrong detail produce failures.
Added an instructions filing control with no replay, retaining runTitle/runDetail.
Added all/instructions no-replay fallback omission tests, with leftAsWritten rows still present.
Positive controls: both scopes without leftAsWritten keep `Everything has its place.`;
leftAsWritten with yourChanges keeps `1 change of yours read.`.
Added a new-pile instructions regression: first press asks `Tidy up 1 thing?`, Not now does
not acknowledge the report, and Last tidy-up alone reopens its existing leftAsWritten report.
Existing status-bar report, empty-report, and other row controls are retained.

tests changed: e2e/request-report-hidden.spec.ts: mirror the designer findings on demo and fake, at 1440 and 375.
The original all-filings case keeps the original Home title/detail and status replay.
Instructions/all leftAsWritten cases omit the Home fallback detail; no-left and non-fallback
controls retain their detail. A filing without replay retains runTitle/runDetail.
The new-pile regression checks the confirmation before reopening through Last tidy-up.
Reopened-sheet words and rows remain asserted; the omission ruling is for the Home card.
WCAG 2.2 and target-size checks remain, including confirmation and reopened report.
No bound, threshold, copy string, skip or only was introduced or relaxed.
E2e execution remains assigned to the coordinator.

### Final assertion red

Command:
`pnpm exec vitest run src/features/tidy/request-report-hidden.test.tsx src/features/home/Home.test.tsx src/features/tidy/StatusBar.test.tsx --maxWorkers=2`
Log: `tmp-logs/request-report-designer-red.log`.
Result: 7 failed, 26 passed, 3 component files. All failures are the intended assertions:

- `Home does not reopen a finished run sheet on load`: the old report's Done button exists instead of being absent.
- `request report: first press asks about a new pile; Last tidy-up alone reopens the old report`:
  expected `Tidy up 1 thing?`, received `Done. Bower read your changes`.
- `request report: all with filings retains Home replay and status bar replay`:
  `1 thing filed.` heading is missing; current heading is `Done. 1 thing filed`.
- `request report: filing with replay keeps Home got 1 detail`:
  `Home got 1.` is missing; current detail is `Everything has its place.`.
- `request report: Home shows instructions leftAsWritten with today’s words and Got it alone`:
  the fallback paragraph exists instead of being absent.
- `request report: all without replay omits fallback detail with leftAsWritten`:
  the fallback paragraph exists instead of being absent.
- `request report: instructions without replay omits fallback detail with leftAsWritten`:
  the fallback paragraph exists instead of being absent.

The no-replay filing, both no-left fallback controls, non-fallback leftAsWritten detail,
reopened instructions report, empty reports, other row types and StatusBar tests pass.
No failures are setup, timer, import or runtime errors.

### Repair checks

- `pnpm exec tsc -p tsconfig.app.json --noEmit`: pass;
  log `tmp-logs/request-report-designer-tsc.log`.
- `pnpm exec eslint src/features/home/Home.test.tsx src/features/tidy/request-report-hidden.test.tsx e2e/request-report-hidden.spec.ts`:
  pass; log `tmp-logs/request-report-designer-eslint.log`.
- `git diff fcd23584^ -- src/features/home/Home.test.tsx`: empty, exact original restoration.
- `git diff --check`: pass.

The first app tsc run caught two Testing Library ByRoleOptions uses of `exact` in the new test;
these were removed (string role names already match exactly), then component reds and checks
were rerun. The final logs above are for the corrected tests.
No implementation or green repair was attempted by this red-owning session.

## Fix round 1

Implemented the three designer findings from the committed red repair, without changing tests.
The original notes and red-repair section above remain intact.

The existing UI store's setTidy accepts an optional report run id. Ordinary Tidy up presses
clear that id and ask for confirmation; only StatusBar supplies it for an unseen report.
Replay dispatch, running/watched runs and stopped-run behavior retain their existing paths.
TidySheet acknowledges a dismissed finished report only when it actually showed that report,
so dismissing confirmation leaves the old report unseen. Confirm reuses the sheet's loaded
piles state instead of beginning a second read when the confirmation mounts.

Home uses the original filedWords/notesUpdated heading and landedSummary detail when hasReplay.
Finished cards without replay retain runTitle/runDetail. Only Home omits the fallback paragraph
when leftAsWritten rows exist and runDetail is exactly "Everything has its place.";
non-fallback detail, report rows and reopened-sheet words remain intact.
No new UI strings or second report renderer, predicate or replay mechanism were introduced.

removed: unconditional reportWaiting line from TidySheet's showRun expression.
removed: unconditional markSeen line for closing a sheet that had not shown the report.
removed: unconditional runTitle/runDetail lines from Home's replayable report card.
removed: duplicate usePiles read line inside Confirm and the duplicate closing comment line.
tests changed: none.

Offline sources: the original Home card was read using
`git show claude/p3:src/features/home/Home.tsx`; existing run-words helpers and UI store were reused.
The standard status/link references in this notes file remain the offline citations for this fix.

Red command (before code edits):
`pnpm exec vitest run src/features/tidy/request-report-hidden.test.tsx src/features/home/Home.test.tsx src/features/tidy/StatusBar.test.tsx --maxWorkers=2`
Log: `tmp-logs/fix-round-1-red.log`, exit 1, the same seven designer assertion failures listed above.
The first implementation run exposed an additional assertion failure: newly mounted Confirm
had not loaded its own piles yet. Reusing the already-loaded sheet state resolved that failure.

Final verification (all exit 0):
- The exact component command above: `tmp-logs/fix-round-1-components.log`.
- `pnpm exec vitest run src/features --maxWorkers=2`: `tmp-logs/fix-round-1-features.log`.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: `tmp-logs/fix-round-1-tsc-app.log`.
- ESLint on Home.tsx, TidySheet.tsx, StatusBar.tsx and src/app/ui-store.ts:
  `tmp-logs/fix-round-1-eslint.log`.
- `git diff --check`: pass; no test file has a working-tree diff.

Only the four code files above and this appended notes section changed in this round.
No network, git write command, commit, server, e2e or full pnpm check was run.
The coordinator retains the packet's full check, e2e and designer verification gates.
