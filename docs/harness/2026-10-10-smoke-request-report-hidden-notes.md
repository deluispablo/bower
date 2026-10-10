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
