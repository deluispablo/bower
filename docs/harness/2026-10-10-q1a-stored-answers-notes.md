# Q1a stored answers — red-side delivery

implementer: codex

Date: 2026-10-10. Role: red owner only, TL-P4-29. Worktree: `/private/tmp/bower-q1a-stored-answers`.
Branch: `q1a-stored-answers`. Verified unchanged production HEAD: `18b347a10126f9b4448f48c86a4ce7cdf6808ebf`.
The coordinator owns commits. No git write, network call, app change, existing-test change or corpus addition.

removed: none
tests changed: none (only a new test file)

## Scope and ruling ledger

Read WORKER, the Q1a packet, TL-P4-44, its DECISIONS addenda 1–2, and the prep's fixtures, reds and file ledger.
The DECISIONS sweep for `q1a` and `TL-P4-44` found TL-P4-43, TL-P4-44 and addenda 1–2.
Every stored-answer ruling is covered below; Q1c publication and Q1b UI remain with their assigned entries.
Implementation still follows B1a integration as the packet requires. This delivery is tests and notes only.

| Contract | Reds and controls |
| --- | --- |
| 1 / Q1 / P3 | Stored `file-to` action by folder id; duplicate labels and renamed folder; only option id saved; 2–4 visible candidates; fifth, fabricated id, model option id/payload, outside folder and file-as-folder refused. Legacy yes/no plus state/pair/folder scope are controls. |
| 2 / Q5 / P4/P9 | Boolean/option/text values, asking identity, later record, older asking isolated, trimmed non-empty text, LF/CRLF, 1,000 accepted, 1,001 and non-line-break controls refused. Saved legacy yes/no is the control. |
| 3 / Q3 / P6 | Newly saved asking, unchanged rerun, validation retry, save refusal/recovery, dispatch replay, two distinct request ids, second unresolved answer, no third, persistent exhaustion, reupload hash, words reset and leaving. First durable yes/no asking is the control. |
| 4 / Q4/Q8 / P5 | Actual /process token manifest, production main, new same-pile sibling admitted, filed sibling and other pile excluded, later arrival excluded, all readable journal still admitted. Two answers batch once; lost response and duplicate requests replay once. Existing admission and legacy continuation are controls. |
| 5 / Q7 / P4 | Person words arrive as answer data with file/pile identity, outside Rules; document instructions cannot create answers or change the personal note. Stored option grants only its action. Legacy grounded answer and unchanged personal bytes are controls. |
| 6 / Q10 / P8 | Listed/full waiting; exhausted across reload; waiting wins; upload progress, readiness and error retained; words and leaving clear markers. Ordinary, damaged and uploading pile states are controls. |
| 7 / P9 | Frozen P2 questions, journal, manifest, checkpoint, report and last-run readers; new report action exclusion; modifiedTime and name/place capture; race before effects. Legacy production main and literal P2 fixtures are controls. |
| Addendum 1 | Backend overflow rejection before saving or /process; exactly 1,000 after trimming and line breaks accepted. Focus, Field error and absence of maxLength are Q1b UI. |
| Addendum 2 | Four separate reds: thing/pile × yes/no/options, each accepting the person's text through answerQuestion, journal, /process and main. |
| TL-P4-43 / split | General option contract; no `note` kind, second continuation scheduler, lineage store or frozen asking-member list. Publication belongs to Q1c; UI to Q1b. |

The prep's P5 exclusions were superseded by Q4: the scope red deliberately admits a new same-pile sibling
and an unrelated readable journal request. Only a new other pile and post-admission arrivals are excluded.
No report/status live-question fields are tested here.

## Fixtures and entry points

One new allocated file: `runner/test/q1-continuation.test.ts`.
It reuses `realWorld`, the in-process Hono `createApp().request` host, real Drive-v3 replay and production `main`.
App entry points (`answerQuestion`, `DriveVault`) are dynamically imported with asserted existing exports;
missing exports become failed expects. It does not import prospective exports or add an execution engine.
The distinct-candidate fixture calls the same production main with the same transports and an injected Claude reply.
All folders, documents, people and tokens are made-up fixtures. No live Drive or Claude process is started.
The fake clock covers timers and Date; upload and save pauses use controlled promises. No polling or real waits.
`TMPDIR` points inside this worktree's `tmp-logs`, so generated dispatch/model files stay in the worktree.

Wire choices in the tests are explicit: model options select `{folderId,label}`, while stored options carry
`{id,label,action:{kind:'file-to',folderId}}`. The model supplies neither an option id nor an action payload.
New journal fixtures carry `askedAt` and `answer`; observable answer assertions also accept a widened `text`
field, since the ruling fixes the values but does not name that property. Legacy `text:'yes'/'no'` still reads.
No private round-history format is invented: exhaustion fixtures obtain it from production main.
Questions fixture updates preserve the producer's other questions.json fields, including future counters.

## Reds

All names below are exact Vitest test titles in `runner/test/q1-continuation.test.ts`.
Every one failed at the stated production HEAD with **AssertionError**, never a load error, timeout or uncaught exception.
Each has positive control assertions. Soft expects let independent contract checks run after a known missing feature.
For exhaustion cases, HEAD fails earlier at the missing second asking; the final exhausted/precedence/reset checks
remain reachable contract assertions for the implementation, not claimed observed exhausted behaviour at HEAD.

| Exact test name | File | First observed failing assertion at HEAD |
| --- | --- | --- |
| `Q1a q1-clear-work-with-waiting-item: an option asking leaves its item and files clear work` | `runner/test/q1-continuation.test.ts` | options must not invalidate the whole intent: expected 'failed' to be 'done' // Object.is equality |
| `Q1a q1-options-exact-action: consent resolves stored folder id despite duplicate labels and rename` | `runner/test/q1-continuation.test.ts` | the client saves only the chosen option id: expected true to deeply equal { option: 'job-choice' } |
| `Q1a q1-options-exact-action: unknown options and substituted payloads cannot consent` | `runner/test/q1-continuation.test.ts` | only a known option id is an answer: expected 'accepted' to be 'refused' // Object.is equality |
| `Q1a q1-options-exact-action: two to four script candidates accepted and fabricated or fifth refused` | `runner/test/q1-continuation.test.ts` | 2 already-visible candidate folders: expected 'failed' to be 'done' // Object.is equality |
| `Q1a q1-text-person-provenance: additive answer values preserve asking identity and legacy no` | `runner/test/q1-continuation.test.ts` | every new answer is keyed to id AND asking: expected undefined to be 1791622799000 // Object.is equality |
| `Q1a q1-text-person-provenance: later answer wins within one asking and older asking cannot answer a new one` | `runner/test/q1-continuation.test.ts` | round 1 answer cannot close round 2: expected [] to deeply equal [ 1791622800000 ] |
| `Q1a q1-text-person-provenance: addendum 1 trims accepts 1000 and newlines refuses overflow and controls` | `runner/test/q1-continuation.test.ts` | invalid text saves nothing: expected 'accepted' to be 'refused' // Object.is equality |
| `Q1a q1-text-person-provenance: addendum 2 text answers every thing question options=false` | `runner/test/q1-continuation.test.ts` | expected true to deeply equal { Object (text) } |
| `Q1a q1-text-person-provenance: addendum 2 text answers every thing question options=true` | `runner/test/q1-continuation.test.ts` | expected true to deeply equal { Object (text) } |
| `Q1a q1-text-person-provenance: addendum 2 text answers every pile question options=false` | `runner/test/q1-continuation.test.ts` | expected true to deeply equal { Object (text) } |
| `Q1a q1-text-person-provenance: addendum 2 text answers every pile question options=true` | `runner/test/q1-continuation.test.ts` | expected true to deeply equal { Object (text) } |
| `Q1a q1-text-person-provenance: person words stay subject data and document instructions grant no consent` | `runner/test/q1-continuation.test.ts` | expected [] to deeply equal [ ObjectContaining{…} ] |
| `Q1a q1-continuation-members-and-journal: today takes new same-pile items and all journal but no new pile` | `runner/test/q1-continuation.test.ts` | expected [ 'Yes' ] to include 'This is for the room at home.\nKeep t…' |
| `Q1a q1-waits-one-run-and-replay: two typed answers wait batch once and replay does not dispatch` | `runner/test/q1-continuation.test.ts` | expected [ 'Yes', 'Yes' ] to deeply equal [ 'This is also for the room.', …(1) ] |
| `Q1a q1-two-rounds-no-third: thing exhausts after two saved askings and words reset` | `runner/test/q1-continuation.test.ts` | first answered asking must permit the second round: expected undefined to be defined |
| `Q1a q1-two-rounds-no-third: pile exhausts after two saved askings and words reset` | `runner/test/q1-continuation.test.ts` | first answered asking must permit the second round: expected undefined to be defined |
| `Q1a q1-continuation-budget-meter: typed waiting and replay do zero admission reads with ordinary model usage` | `runner/test/q1-continuation.test.ts` | expected [ 'Yes' ] to deeply equal [ Array(1) ] |
| `Q1a q1-legacy-question-answer-status: old stored records read and reports never leak option actions` | `runner/test/q1-continuation.test.ts` | new options remain report-compatible: expected 'failed' to be 'done' // Object.is equality |
| `Q1a q1-pile-projection: waiting on a member or pile appears on listed and full piles and clears on leaving` | `runner/test/q1-continuation.test.ts` | expected undefined to be 'waiting' // Object.is equality |
| `Q1a q1-continuation-budget-meter: quota refusal retains typed answer without another asking or model call` | `runner/test/q1-continuation.test.ts` | quota refusal keeps the exact answer: expected true to deeply equal { Object (text) } |
| `Q1a q1-waits-one-run-and-replay: lost response competing answers reuse one request id per asking` | `runner/test/q1-continuation.test.ts` | expected true to deeply equal { Object (text) } |
| `Q1a q1-pile-projection: readiness and error survive waiting projection and changing words clears it` | `runner/test/q1-continuation.test.ts` | waiting still derives from questions: expected undefined to be 'waiting' // Object.is equality |
| `Q1a q1-pile-projection: upload state survives waiting marker and finishes through the same queue` | `runner/test/q1-continuation.test.ts` | the same pile policy also projects its pending asking: expected undefined to be 'waiting' // Object.is equality |
| `Q1a q1-pile-projection: exhausted persists on reload waiting wins and word edit clears both` | `runner/test/q1-continuation.test.ts` | an unresolved first answer must produce asking two: expected undefined to be defined |
| `Q1a q1-two-rounds-no-third: retries failed saves and dispatch replay count only durable askings` | `runner/test/q1-continuation.test.ts` | both validation calls count their model usage: expected 'timing: end=saving total=0 start=1617…' to match /in=20 out=20/ |
| `Q1a q1-two-rounds-no-third: exhausted identity follows reuploaded content and leaving ends it` | `runner/test/q1-continuation.test.ts` | an unresolved first answer must produce asking two: expected undefined to be defined |
| `Q1a q1-legacy-question-answer-status: stored choices keep content and name-place fences` | `runner/test/q1-continuation.test.ts` | the fenced move still refers to typed stored consent: expected true to deeply equal { option: 'home-choice' } |
| `Q1a q1-legacy-question-answer-status: state pair and folder retain yes-no scope and refuse inbox text consent` | `runner/test/q1-continuation.test.ts` | the inbox text contract never widens state pair or folder consent: expected 'accepted' to be 'refused' // Object.is equality |

The retry/save red also pins usage for both injected validation calls (`in=20 out=20`); HEAD reports only the
last call's 10/10. The shared timing/ledger belongs to B1d. Q1 consumes that owner’s accounting; it adds no ledger
and must return any unavailable retry accounting API to that owner rather than implement a second one.

## Compatibility rows

| Stored record / boundary | Actual reader/control | Result before new-feature assertion |
| --- | --- | --- |
| P2 questions, optional subjects | `isRunnerFile(SYSTEM.questions, literal fixture)` | Accepts unchanged fixture. |
| P2 yes/no journal | `isJournalRecord(literal fixture)` plus vault answer → /process → main | Reads old yes/no and preserves legacy effect/scope. |
| P2 manifest | `parseRunManifestV2(literal fixture, original root, RUNNER_WRITES)` | Accepts. |
| P2 checkpoint | `parseRunCheckpoint(literal fixture, independent manifest binding)` | Accepts. |
| P2 report | `parseRunReport(literal fixture, independent manifest binding)` | Accepts. |
| P2 last-run | `isRunnerFile(SYSTEM.lastRun, literal fixture)` | Accepts. |
| State/pair/folder yes/no | Real answerQuestion, /process and main | Existing instruction/folder scope preserved. |
| Stored shown state | Real answerQuestion → instruction admission → main | Zero model calls preserved. |
| Content/name/place fences | Legacy mixed main manifest plus choice race at writing status | modifiedTime captured; changed name/place retained. |
| New option asking/report | Real validated main, manifest reportPlan and parseRunReport | Red: old AskShape rejects options; new report assertions pin action exclusion. |

No proven semantic contradiction in the existing tests inspected. One format-sensitive expectation is for the
coordinator: `runner/test/ask-answer-loop.test.ts:419`, **answering twice starts one run**, expects a newly written
answer to contain `text:'yes'`. If the additive writer uses an `answer` field without that legacy text mirror, that
expectation needs the coordinator’s compatibility ruling. It is unchanged here; its idempotency behaviour is valid.
Existing compatibility suites were not run, in accordance with the targeted-only instruction.

## Validation

Final targeted command (exit 1 is the expected red result):

```sh
TMPDIR=/private/tmp/bower-q1a-stored-answers/tmp-logs pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2 --reporter=json --outputFile=../tmp-logs/q1a-reds.json > tmp-logs/q1a-reds.log 2>&1
```

- 28 tests, 28 assertion failures, zero passes, zero unexpected failure classes, no suite loading error.
- App tsc: `pnpm exec tsc --noEmit -p tsconfig.app.json` — pass; `tmp-logs/q1a-app-tsc.log`.
- Node tsc: `pnpm exec tsc --noEmit -p tsconfig.node.json` — pass; `tmp-logs/q1a-node-tsc.log`.
- Runner tsc: `pnpm -C runner exec tsc --noEmit -p .` — pass; `tmp-logs/q1a-runner-tsc.log`.
- Touched-file ESLint: `pnpm -C runner exec eslint test/q1-continuation.test.ts` — pass; `tmp-logs/q1a-eslint.log`.
- Only failures were read from test output. Final machine-readable evidence: `tmp-logs/q1a-reds.json`.
- No pnpm check, full unit/corpus suites or e2e: this is the expressly targeted-only red session, with no screen change.
- No new corpus case or corpus support change; no conditional method verdict row is required.
- No implementation, commit, merge, push or deployment. No existing test was edited or removed.

Logs and generated dispatch fixtures under `tmp-logs/` are local evidence, not files for either commit.
The coordinator can commit the new test file as the red commit, and this notes file separately.

## Research

No network was used. These established references were already cited in the local mechanisms and fixture support:

- [TypeScript discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions): tagged option/text alternatives.
- [Tolerant Reader](https://martinfowler.com/bliki/TolerantReader.html): additive shapes with old readers/records retained.
- [Idempotency-Key draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/): one stable request identity per asking, including retry after lost response.
- [Hono testing](https://hono.dev/docs/guides/testing): actual createApp().request route tests, reused from in-process.ts.

## Left out

Implementation and integration; Q1c live publication/status merging; Q1b UI/focus/lines; which-note; B12 lineage;
new corpus support, full gates and e2e. The timing retry accounting remains with B1d as described above.
