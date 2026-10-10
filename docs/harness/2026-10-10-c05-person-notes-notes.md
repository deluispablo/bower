# C05 person notes: red session

implementer: codex

Scope: tests, restored corpus, the requested method verdict row and these notes only. No app implementation changed.
No network, server, e2e execution or git write command. The coordinator owns commits; notes need their own commit.
compatibility: not applicable to this red-only change; the fix session must record compatibility: FIXSHA.

## Reds

All 33 new unit/runner tests below were executed and failed for the listed assertions or missing rendered element.
All files loaded. No unhandled/import errors, real-timer failures, .only or .skip. Existing controls passed.
Lifecycle reds state their missing prerequisite honestly: on this build personal notes are absent from planner context.
Once the prerequisite is built, the tests proceed through main, the existing checkpoint and the real answer entry point.

| File | Exact test name | Why it fails now |
| --- | --- | --- |
| `src/features/tidy/c05-person-notes.test.tsx` | `C05 person notes: result links row 5, leaves row 7 unlinked and counts neither as updated` | The existing New notes control renders; RunLinks omits Left as you wrote them, so its labelled list is missing. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: one bound sourced append preserves every other byte and CRLF` | The owned-note control passes; the bound personal append returns not-bower rather than the exact CRLF output. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: no binding is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: wrong target is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: wrong request is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: two lines is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: no source is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: unanswered state is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: adoption is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: link rewrite is refused not-bower beside the admitted append` | The bound positive append is refused; additionally the unrelated personal link rewrite succeeds instead of not-bower. |
| `src/data/contracts/c05-person-notes.test.ts` | `C05 person notes: rule wording is refused not-bower beside the admitted append` | The owned control passes and the negative check executes; the adjacent valid bound append is still refused not-bower. |
| `src/data/contracts/c05-person-reports.test.ts` | `C05 person notes: old reports remain readable and leftAsWritten survives report validation` | The legacy fixture passes; the additive collection is rejected with shape by the closed validator. |
| `src/data/contracts/c05-person-reports.test.ts` | `C05 person notes: leftAsWritten survives a pending checkpoint with older checkpoints still readable` | The legacy fixture passes; the additive collection is rejected with shape by the closed validator. |
| `src/data/contracts/c05-person-reports.test.ts` | `C05 person notes: leftAsWritten survives the manifest report plan without becoming an update` | The legacy fixture passes; the additive collection is rejected with shape by the closed validator. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: title grammar case and punctuation shows the named note before hubs` | The first shown note is Hub 0, rather than the explicitly named personal note; the sourced append is missing. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: title grammar the article shows the named note before hubs` | The first shown note is Hub 0, rather than the explicitly named personal note; the sourced append is missing. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: title grammar my article shows the named note before hubs` | The first shown note is Hub 0, rather than the explicitly named personal note; the sourced append is missing. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: title grammar Unicode NFC shows the named note before hubs` | The first shown note is Hub 0, rather than the explicitly named personal note; the sourced append is missing. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: longest whole title wins and source-only or partial mentions grant nothing` | The requested longest personal title is not shown and its line is missing; source-only and partial-title refusals execute. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: row 6 files the source and lists 2 same-title notes by id and folder without asking` | The personal-note proposal is refused lineNote; the source is not filed and the per-id, per-folder collection is absent. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: row 6 files the source and lists 3 same-title notes by id and folder without asking` | The personal-note proposal is refused lineNote; the source is not filed and the per-id, per-folder collection is absent. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: row 7 files the source but four named notes produce one unlinked row and zero updates` | Three valid named targets cannot append; four targets yield no overflow row or filing because personal notes are unshown. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: consent refuses unrelated request id through main beside a legitimate append` | The legitimate personal append is missing and no runner-derived tuple reaches the author to corrupt (counter 0). |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: consent refuses unrelated target id through main beside a legitimate append` | The legitimate personal append is missing and no runner-derived tuple reaches the author to corrupt (counter 0). |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: consent refuses citation not filed in this run through main beside a legitimate append` | The legitimate personal append is missing and no runner-derived tuple reaches the author to corrupt (counter 0). |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: row 5 missing Timeline is byte-identical, linked in leftAsWritten and never counted updated` | The proposal is refused lineNote before the new refusal-report path; filing and the linked leftAsWritten row are absent. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: row 8 unparseable Timeline is byte-identical, linked in leftAsWritten and never counted updated` | The proposal is refused lineNote before the new refusal-report path; filing and the linked leftAsWritten row are absent. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: corpus first append, protected ranges, state question, replay and later non-adoption score per run` | scoreCase reports missing first-run filing, Timeline append and typed state question, plus missing history on later presses. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: state answer true changes only the shown bullet or writes nothing and is never re-asked` | No personal append or Write it / Keep mine state question is produced. The real answer lifecycle begins once that assertion holds. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: state answer false changes only the shown bullet or writes nothing and is never re-asked` | No personal append or Write it / Keep mine state question is produced. The real answer lifecycle begins once that assertion holds. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: state changed before Write it re-asks and preserves the new personal bullet` | The initial typed state question is missing. The guarded real edit/answer path cannot begin on this build. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: append clash retries on the next main call with the fresh personal text and original citation` | No append plan is persisted, so the after-manifest clash injection is not reached; the fresh-text retry append is missing. |
| `runner/test/c05-person-notes.test.ts` | `C05 person notes: landed append with lost answer and failed read-back resumes then replays exactly once` | The first append never lands (0), so read-back fault count is 0; resume replans and the exactly-one-line assertion fails. |

## Verify

Copy the 33 exact names above into the entry verify. The shared selection pattern is `-t "C05 person notes:"`
(unanchored, because Vitest matches the suite name too). The restored case id is `c05-note-not-written-by-bower`.
Also retain the existing driver-scored checks `the C05 corpus cases score green with scripted proposals` and
`the corpus scorer passes on the scripted provider outputs`, and the method check
`the C04 to C15 rubrics agree with the method`.

Executed commands (output redirected; only failure details inspected):

```sh
pnpm exec vitest run src/data/contracts/c05-person-notes.test.ts src/data/contracts/c05-person-reports.test.ts src/features/tidy/c05-person-notes.test.tsx --maxWorkers=2
pnpm -C runner exec vitest run test/c05-person-notes.test.ts test/c05-incorporation.test.ts test/corpus test/second-brain-method.test.ts --maxWorkers=2
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
pnpm -C runner exec tsc --noEmit -p .
pnpm exec eslint src/data/contracts/c05-person-notes.test.ts src/data/contracts/c05-person-reports.test.ts src/features/tidy/c05-person-notes.test.tsx e2e/c05-person-notes.spec.ts
pnpm -C runner exec eslint test/c05-person-notes.test.ts test/c05-incorporation.test.ts
```

Results: app 14/14 expected reds; runner 21 failed, 38 passed (19 new reds and 2 existing corpus loops now include the restored case).
All three TypeScript projects and ESLint on every touched TypeScript file pass. No pnpm check or broader suite was run.

Logs: `/tmp/c05-person-notes-unit.log`, `/tmp/c05-person-notes-runner.log`,
`/tmp/c05-person-notes-tsc-app.log`, `/tmp/c05-person-notes-tsc-node.log`, `/tmp/c05-person-notes-tsc-runner.log`,
`/tmp/c05-person-notes-eslint-app.log`, `/tmp/c05-person-notes-eslint-runner.log`,
`/tmp/c05-person-notes-eslint-e2e.log`, `/tmp/c05-person-notes-eslint-screen.log`.

## Screen coverage (written, not executed)

File: `e2e/c05-person-notes.spec.ts`. Exact names:

- `C05 person notes: designer row 1 on Home and the result with working links and WCAG 2.2 (demo)`
- `C05 person notes: designer row 2 on Home and the result with working links and WCAG 2.2 (demo)`
- `C05 person notes: designer row 5 on Home and the result with working links and WCAG 2.2 (demo)`
- `C05 person notes: designer row 6 on Home and the result with working links and WCAG 2.2 (demo)`
- `C05 person notes: designer row 1 on Home and the result with working links and WCAG 2.2 (fake)`
- `C05 person notes: designer row 2 on Home and the result with working links and WCAG 2.2 (fake)`
- `C05 person notes: designer row 5 on Home and the result with working links and WCAG 2.2 (fake)`
- `C05 person notes: designer row 6 on Home and the result with working links and WCAG 2.2 (fake)`

These are screen-port fixtures over each initialized demo/fake source. They render production Home, TidySheet,
RunLinks and NoteScreen; the production runner behavior is covered independently by the runner/corpus tests.
The source wrapper changes only the served module in the test browser. No production test hook or scenario was added.
A test-controlled phase notification replaces timers. Each test first proves the existing tidy-up and New notes control.
Each checks the exact designer copy, working result/Home note links, the state proposal and existing answer labels
where relevant, and uses the shared expectAxeClean helper with wcag22 (including target-size) on both surfaces.
Rows 1 and 2 exercise the existing rendering parts; rows 5 and 6 require the new collection. E2e failure status is unclaimed.

## Corpus and boundary choices

The preserved note, letter, explicit sentence and sourced news are retained. The request is now the single admitted
`change-1` journal line (rather than duplicating it in pile words), so the driver can replay that exact identity.
The source is a single loose file. The additional My words section makes the prose byte range explicit.
Every press checks the first-run append or its preservation, protected front matter/Current state/My plans/My words,
and absence of by, bower_state and bowerMd5 appProperties. Markdown ownership marks are also forbidden.
Press 2 replays change-1; press 3 is a new generic tidy-up. The first press checks the typed state subject separately.
The answer tests use corpus presses to submit Write it / Keep mine through answerQuestion and DriveVault.answer;
yes preserves the other bullet including its trailing spaces, no adds no result, and later presses adopt nothing.
Changed-before-answer reuses the existing stable state-question id and exact re-ask copy.

The additive test wire convention for the author boundary is `timeline-append.consent` with
`{ requestId, targetFileId, sourceFileId }`; recordIds retains the original request id. The runner must derive this
from admitted words and exact ids. The model replies contain no permission field. Consent fault injection only
corrupts a runner-created tuple before delegating to the unchanged real author; its counter forbids a vacuous refusal.
The corruptions use another admitted request (change-2), a real unrelated note id, and a real older filed source id.
No binding author calls exist on the current build. The negative checks are retained beside a legitimate positive append.

Append-clash injection changes personal prose immediately after the production manifest is saved, preserving Timeline grammar.
The next main call must retain the original filed citation and append exactly once to those fresh bytes without asking.
Lost-answer injection lets the real PATCH land, then loses its answer and refuses its note read-back. Same-run resume
must not call the planner again; a later exact request replay offering different wording must add nothing.
Neither fault is reached until personal append admission exists; no effect is fabricated by the tests.

## Files

- `src/data/contracts/c05-person-notes.test.ts`
- `src/data/contracts/c05-person-reports.test.ts`
- `src/features/tidy/c05-person-notes.test.tsx`
- `runner/test/c05-person-notes.test.ts`
- `runner/test/c05-incorporation.test.ts`
- `e2e/c05-person-notes.spec.ts`
- `harness/corpus/c05-note-not-written-by-bower/` (case, expected, replies, rubric, note, letter)
- `docs/harness/2026-10-08-p4-method-rubric-changes.md`
- `docs/harness/2026-10-10-c05-person-notes-notes.md`

tests changed: runner/test/c05-incorporation.test.ts: P4-74b uses scoreCase so per-run, protected-range, property and subject checks count; no expectation was weakened.

## Sources

Offline reuse: installed Vitest and Playwright READMEs link their official documentation
([Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/)).
The established corpus driver and its README supply the real runner/answer/replay pattern;
existing note-edit tests supply the byte oracle pattern, and e2e/axe.ts supplies WCAG 2.2 and target-size scanning.
No external query was made.

Left out: implementation, commits, pnpm check and e2e execution, as assigned.
