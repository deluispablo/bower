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
