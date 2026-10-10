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


## Implementation

### Round 4 — current completion

2026-10-10. Final status: **implementation complete; gate verification blocked by sandbox local-listener EPERM**.
Continued the 12 retained production files at HEAD `bb4300628f12aaeeccce43e01081459fe11d2e25`.
Two minimal production repairs were needed after the full check: log a cached-note parse refusal, and move
the existing expected-error ownership comment beside its ReadCache rejection handler. No test was edited;
no remote network or writing git command was used. Required local-listener gates were attempted and refused.
The checked-in fixture is Red repair 3 (recorded below): it files a clear sibling and preserves the undecided
request as pending. This supersedes the historical round-3 request contradiction; no implicit completion was added.
TL-P4-44 addenda 1–2 are in DECISIONS; addendum 3 is the supplied cached-listing/subscription ruling recorded below.
The retained implementation satisfies that ruling without media reads on the first listing or a second data store.
All retained production changes stay uncommitted; the coordinator owns commits and integration.

#### Final validation

Every targeted suite ran to completion. **No contradicting tests or regressions remain** in the 28 Q1,
4,141 data and 584 runner tests (including corpus, fingerprints, call goldens and bounded-read controls).
All test output is under `tmp-logs/`; only failures and result summaries were read.

| Command | Result / log |
| --- | --- |
| Q1 reds, `pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2` | 28/28 pass; `tmp-logs/q1-finish-reds.log`. |
| `pnpm exec vitest run src/data --maxWorkers=2` | 4,141/4,141 pass; 77 files; `tmp-logs/q1-finish-data.log`. |
| Runner suite, `pnpm -C runner exec vitest run --maxWorkers=2` | 584/584 pass; 45 files; `tmp-logs/q1-finish-runner.log`. |
| App tsc, `pnpm exec tsc -p tsconfig.app.json --noEmit` | Pass; `tmp-logs/q1-finish-tsc-app.log`. |
| Node tsc, `pnpm exec tsc -p tsconfig.node.json --noEmit` | Pass; `tmp-logs/q1-finish-tsc-node.log`. |
| Runner tsc, `pnpm -C runner exec tsc --noEmit` | Pass; `tmp-logs/q1-finish-tsc-runner.log`. |
| ESLint on all 11 retained app files | Pass; `tmp-logs/q1-finish-eslint-app.log`. |
| Runner ESLint on `src/claude.ts` from runner cwd | Pass; `tmp-logs/q1-finish-eslint-runner.log`. |
| `pnpm check`, existing heavy-run lock | Fail: architecture error-policy assertion (repaired below) and sandbox listener EPERM; `tmp-logs/q1-finish-check.log`. |
| app/capabilities/capabilities-b e2e, demo and fake, existing heavy-run lock | Both blocked before tests: dev server listen EPERM on ::1:7047; `tmp-logs/q1-finish-e2e-demo.log`, `tmp-logs/q1-finish-e2e-fake.log`. |
| `pnpm exec vitest run src/architecture.test.ts --maxWorkers=2`, after repair | 7/7 pass; `tmp-logs/q1-finish-architecture.log`. |
| Read-only `git diff --check`; test diff | Pass; no uncommitted test changes. |

The initial mixed-root ESLint invocation encountered tsconfigRootDir ambiguity; the required checks were
rerun separately in each existing config's cwd and passed. No ESLint configuration was edited.

#### Whole-check failure ledger (not contract contradictions)

The full app suite completed: 5,485 pass, two fail of 5,487; 162 green files and two failed files.
Every failed test is listed; neither test was changed. No Q1/data/runner contract contradiction remains.

| Test | File:line | Outcome |
| --- | --- | --- |
| `the shape of the code > errors are never swallowed` | `src/architecture.test.ts:110` | Detected ReadCache rejection comment placement at :109 and cached-note catch at drive-vault.ts:1424. Repaired in production; all seven architecture tests then pass. |
| `the e2e port and server identity > a server from another worktree is never reused` | `src/e2e-port.test.ts:37` | Local test server cannot listen on 127.0.0.1: EPERM, then timeout. No production contract conflict. |

Both e2e sources stopped before collecting/running test cases because the dev server cannot listen on ::1:7047.
No green check mark is claimed. Later pnpm-check stages were not reached after the app-suite failure.
The local-listener failure is unchanged by this entry and cannot be repaired within the permitted sandbox.
The complete requested suites and all three tsc checks passed again after the error-policy repairs;
their final logs use `q1-finish-*`. The full check is not repeated because its server-identity listener will still be refused.

#### Removed lines and tests — retained production diff against supplied HEAD

removed: runner/src/claude.ts: 13 lines; additive answer input, conditional candidates and accumulated usage replace old forms.
removed: src/data/answer-loop.ts: 3 lines; boolean-only signature/import widened at the existing answer boundary.
removed: src/data/contracts/journal-record.ts: 1 line; existing validator accepts asking identity and additive values.
removed: src/data/contracts/questions.ts: 5 lines; explicit asking and report policies replace id-only closure/rest spread.
removed: src/data/contracts/types.ts: 0 lines; additive fields only.
removed: src/data/demo/world.ts: 2 lines; shared answer type replaces boolean map/signature.
removed: src/data/drive/read-cache.ts: 5 lines; existing entries track completed text and notification.
removed: src/data/sources.ts: 1 line; existing VaultSource.answer signature widened.
removed: src/data/spine/scripted.ts: 30 lines; existing planner handles additive values, stored choices and durable rounds.
removed: src/data/vault/drive-vault.ts: 19 lines; shared cached projection and asking policy replace id-only filtering.
removed: src/data/vault/journal.ts: 2 lines; existing list/parser accepts completed-cache-only projection.
removed: src/data/vault/layout.ts: 3 lines; existing stored questions validator widened additively.
tests changed: none

#### Compatibility row drafts — current, review pending

| Boundary | Preserved old meaning | Additive evidence / draft disposition |
| --- | --- | --- |
| contracts/types.ts, questions.ts | Legacy yes/no, subjects and public report fields still read. | Optional file-to options, words and asking identity; all Q1 legacy controls pass. Review pending. |
| contracts/journal-record.ts | Legacy text yes/no remains boolean; later record still wins. | Strict optional answer/askedAt values with trim, length and control checks; Q1 identity/text reds and data suite pass. Review pending. |
| vault/layout.ts | `{v:1,questions}` remains readable with no new required field/version. | Optional durable rounds and validated actions; retries, exhaustion, reset, reupload and old reader controls pass. Review pending. |
| drive/read-cache.ts, vault/journal.ts, vault/drive-vault.ts | Existing single-flight/version/session lifetime, outbox and owning-reader errors remain. | Zero-media first listing and subscription projection after Home's existing questions read; supplied addendum 3 reds and all data tests pass. Review pending. |
| sources.ts, answer-loop.ts, demo/world.ts | Existing boolean callers and continuation request identity remain. | Typed option/text on the same ports; actual /process/main batching, replay and quota reds pass. Review pending. |
| Manifest/checkpoint/report | Existing versions and reader meanings unchanged. | Q1 frozen P2 fixtures, guarded writes/moves and runner controls pass. Draft unchanged-reader row. |
| Features/model inputs | No screen changes; existing prompts outside eligible 2–4 candidates retain bytes. | App tsc and all raw/normalized prompt fingerprints pass. Q1b owns UI. |
| Generic model requests | Missing request decision remains pending. | Committed Red repair 3 supplies a clear sibling filing while preserving the pending request; all Q1 and runner controls pass. Review pending. |

Sources: the offline references in Research (TypeScript unions, tolerant readers, stable request identities),
and the existing versioned read-cache mechanism. No remote documentation was fetched.
Left out: Q1c live publication, Q1b UI, which-note, B12, commits and integration. Compatibility rows are drafts
for the coordinator/reviewer, not accepted contract commits. All 12 production files remain uncommitted, with the two minimal error-policy repairs above.

### Round 3 — historical delivery (superseded by round 4)

2026-10-10. Final status: **blocked under TL-P4-51; one unchanged fixture contradiction**.
Resumed all 12 retained production changes at `2589a3418ba0bb376220bc1e0d166849cc97b916`.
No production repair was needed for the other 27 Q1 reds or any other data/runner test.
No network, writing git command, test edit, fixture edit, dependency change or numeric loosening was used.
Only this notes section was edited in this session; all retained production changes remain uncommitted.

#### Supplied repair 2 did not change the fixture

Read-only `git show --stat HEAD` and `git show HEAD -- runner/test/q1-continuation.test.ts` establish that
HEAD changes only this notes file (139 insertions), despite its commit subject claiming a fixture request decision.
The second clear-work reply at `runner/test/q1-continuation.test.ts:267` still contains only `emptyIntent`,
one `things` entry and one `asks` entry. It supplies no decision for the generic request created at :270–271.
The committed notes' Red repair 2 section itself records that repair as blocked and that no fixture changed.
The red repair 1 listing assertions and supplied TL-P4-44 addendum 3 remain preserved and green.

#### Every contradicting test — complete targeted sweep

All three requested suites completed before stopping. Exactly one distinct test fails, in both Q1 and runner runs:

| Exact test | File:line | Contradiction |
| --- | --- | --- |
| `Q1a q1-clear-work-with-waiting-item: an option asking leaves its item and files clear work` | `runner/test/q1-continuation.test.ts:278` | Requires `request-1` to disappear as completed, but the supplied fixture reply contains no request decision. Actual: the request remains pending. |

The validated model reply fields at `runner/src/claude.ts:1072–1077` and Filing construction at :1084
have no generic request decision. `modelDecisions` at `src/data/spine/scripted.ts:552–565` installs no
request handler; the existing admission filter at :827 keeps generic requests without that handler pending.
The request text names no existing note, so the C05 named-note settlement cannot admit it either.
The existing decision contract at :517–519 and :542–543 requires this pending behavior; Q1a contract 7
preserves it. The provider's existing no-unproposed-effects test at `runner/test/claude-provider.test.ts:735`
passes in the complete runner sweep. An implicit completion would change the existing request contract.
No other contradiction or regression was observed. The lead/coordinator must supply the actual fixture repair
or rule the generic model request boundary before this entry can finish with every red green.

#### Final validation

All command output is under `tmp-logs/`; only failures and result summaries were read.

| Command | Result / log |
| --- | --- |
| `pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2` | 27 pass, 1 fail / 28; `tmp-logs/q1-r3-reds.log`. |
| `pnpm exec vitest run src/data --maxWorkers=2` | 4,141 pass / 4,141; 77 green files; `tmp-logs/q1-r3-data.log`. |
| `pnpm -C runner exec vitest run --maxWorkers=2` | 583 pass, 1 fail / 584; 44 green files, one failed; `tmp-logs/q1-r3-runner.log`. Includes corpus, Drive call goldens, fingerprints and bounded reads. |
| `pnpm exec tsc -p tsconfig.app.json --noEmit` | Pass; `tmp-logs/q1-r3-tsc-app.log`. |
| `pnpm exec tsc -p tsconfig.node.json --noEmit` | Pass; `tmp-logs/q1-r3-tsc-node.log`. |
| `pnpm -C runner exec tsc --noEmit` | Pass; `tmp-logs/q1-r3-tsc-runner.log`. |
| ESLint on all 11 retained app TS files | Pass; `tmp-logs/q1-r3-eslint-app.log`. |
| ESLint on `runner/src/claude.ts` | Pass; `tmp-logs/q1-r3-eslint-runner.log`. |
| Read-only `git diff --check`; test diff | Pass; no uncommitted test changes. |
| `pnpm check`; app/capabilities e2e demo/fake | Not run after the complete TL-P4-51 contradiction sweep; no check mark or integration claim. |

#### Removed lines and tests — retained production diff against supplied HEAD

removed: runner/src/claude.ts: 13 lines; additive answer input, conditional candidates and accumulated usage replace old forms.
removed: src/data/answer-loop.ts: 3 lines; boolean-only signature/import widened at the existing answer boundary.
removed: src/data/contracts/journal-record.ts: 1 line; existing validator accepts asking identity and additive values.
removed: src/data/contracts/questions.ts: 5 lines; explicit asking and report policies replace id-only closure/rest spread.
removed: src/data/contracts/types.ts: 0 lines; additive fields only.
removed: src/data/demo/world.ts: 2 lines; shared answer type replaces boolean map/signature.
removed: src/data/drive/read-cache.ts: 5 lines; existing entries track completed text and notification.
removed: src/data/sources.ts: 1 line; existing VaultSource.answer signature widened.
removed: src/data/spine/scripted.ts: 30 lines; existing planner handles additive values, stored choices and durable rounds.
removed: src/data/vault/drive-vault.ts: 19 lines; shared cached projection and asking policy replace id-only filtering.
removed: src/data/vault/journal.ts: 2 lines; existing list/parser accepts completed-cache-only projection.
removed: src/data/vault/layout.ts: 3 lines; existing stored questions validator widened additively.
tests changed: none

#### Compatibility row drafts — current, review pending

| Boundary | Preserved old meaning | Additive evidence / draft disposition |
| --- | --- | --- |
| contracts/types.ts, questions.ts | Legacy yes/no, subjects and public report fields still read. | Optional file-to options, words and asking identity; all Q1 legacy controls pass. Review pending. |
| contracts/journal-record.ts | Legacy text yes/no remains boolean; later record still wins. | Strict optional answer/askedAt values with trim, length and control checks; Q1 identity/text reds and data suite pass. Review pending. |
| vault/layout.ts | `{v:1,questions}` remains readable with no new required field/version. | Optional durable rounds and validated actions; retries, exhaustion, reset, reupload and old reader controls pass. Review pending. |
| drive/read-cache.ts, vault/journal.ts, vault/drive-vault.ts | Existing single-flight/version/session lifetime, outbox and owning-reader errors remain. | Zero-media first listing and subscription projection after Home's existing questions read; supplied addendum 3 reds and all data tests pass. Review pending. |
| sources.ts, answer-loop.ts, demo/world.ts | Existing boolean callers and continuation request identity remain. | Typed option/text on the same ports; actual /process/main batching, replay and quota reds pass. Review pending. |
| Manifest/checkpoint/report | Existing versions and reader meanings unchanged. | Q1 frozen P2 fixtures, guarded writes/moves and runner controls pass. Draft unchanged-reader row. |
| Features/model inputs | No screen changes; existing prompts outside eligible 2–4 candidates retain bytes. | App tsc and all raw/normalized prompt fingerprints pass. Q1b owns UI. |
| Generic model requests | Missing request decision remains pending. | Supplied repair 2 HEAD contains no fixture repair; sole contradictory red listed above. Blocked, no implicit completion. |

Sources remain the offline references in Research: discriminated unions, tolerant readers and stable asking
request identities, plus the existing versioned read-cache mechanism. No online verification was attempted.
Left out: missing fixture repair/request-boundary ruling; Q1c publication, Q1b UI, which-note, B12,
full gates/e2e, commits and integration. The coordinator owns commits; all 12 production changes are retained.

### Round 2 — historical delivery (superseded by round 3)

2026-10-10. Continued the retained production changes from the supplied red repair 1 HEAD
`421764904128cbff0f1405cee47b0201c0d8a95b`. Status: **blocked on one request-decision contract mismatch**.
All changes remain uncommitted. No network, writing git command, test/fixture edit or numeric loosening.
The supplied TL-P4-44 addendum 3 governs this delivery; its listing timing supersedes the round 1 stop below.
The local DECISIONS file still contains only the original ruling and addenda 1–2; addendum 3 was supplied by the owner.

#### Red repair 2

2026-10-10. Status: **blocked; the existing validated model path cannot carry a generic request decision**.
The lead ruling preserves every assertion in the clear-work test, including request-1's completed archive,
and permits only a fixture reply using an existing request field and planner handler. No such model path exists:
`runner/src/claude.ts:1072–1077` declares the reply fields without a request decision;
`:1084` constructs Filing without one; `src/data/spine/scripted.ts:552–565` constructs modelDecisions
without the optional request handler. That handler exists only in the Decisions contract at `:543`;
the planner's journal admission at `:827` consequently leaves this generic request pending.
The production call at `runner/src/claude.ts:1231` passes modelDecisions directly to planScripted.
An undeclared fixture property would not become a request decision. No field, inference, C05 named-note
conversion, production edit or assertion change was made. All supplied uncommitted production changes remain.

tests changed: runner/test/q1-continuation.test.ts:278: lead ruling 2026-10-10 (Q1a :278): unchanged; blocked because no existing validated model request path carries request-1's decision.

The complete Q1 file ran with `--maxWorkers=2`: 27 pass, one fail. The sole contradiction remains
`Q1a q1-clear-work-with-waiting-item: an option asking leaves its item and files clear work`,
`runner/test/q1-continuation.test.ts:278`: request-1 remains pending rather than archived as completed.
Runner tsc and ESLint on this test pass. Logs: `tmp-logs/q1-red-repair-2-vitest.log`,
`tmp-logs/q1-red-repair-2-tsc.log`, `tmp-logs/q1-red-repair-2-eslint.log`.
No network or writing git command was used. Full gates and e2e remain outside this stopped red repair.

#### Implemented and preserved

- `pilesListed()` starts no text, byte or checksum read and never waits for in-flight questions/journal media.
  It projects completed questions, journal and pile-note reads from the existing versioned ReadCache.
- `questions()` uses Home's existing read, applies the shared subject/asking policy, and emits through the vault's
  existing subscription after the read and word policy land. Publication is marked on that cache version, before
  notification, so subscribers can request questions again without a notification loop. Refresh/version replacement
  and disposal retain the existing cache/session lifetime. No new store, scheduler or separate question source.
- ReadCache adds completed-read and publication flags inside its existing per-version entry. Its digest, text,
  bytes, prefix and file caches retain their meanings; publication is not stored in a digest slot.
  Journal's existing list/parser gains a cache-only read mode, including its existing device outbox; its writer and
  stored-line format are unchanged. These two supporting files extend the existing read-cache mechanism for addendum 3.
- Full piles can read a nonempty questions file. A projection refusal is logged by the owning read and does not
  refuse inbox readiness or runner admission; explicit questions and runner-owned-file readers retain their errors.
  Cached projections do not repeat failures belonging to another reader.
- Capture skips a proven empty questions file using the same existing 40-byte empty-file guard; answers still
  trigger the normal read. Round history remains in questions.json. C04 Drive goldens (88 calls, 20 plan reads),
  bounded-read fixtures and timing/latency bounds all pass unchanged.
- Folder-candidate ids and the added prompt sentence appear only for 2–4 eligible existing folders beneath main
  folders. Every model-input fingerprint test passes, including the old raw and normalized byte goldens and fresh ids.
- Stored choices override the provider's omitted-item pile hold for their selected members through the existing
  planner. Unselected omitted siblings stay. Readiness, retry holds, content evidence and name/place fences remain.
  The duplicate-label/renamed-folder option red passes through the actual provider, main and effects.
- Shared round policy reuses EMPTY_MD5. Answer controls use the repository's character-code predicate form.
  Fake-worker recoverable paths, live isolation, DriveVault error isolation and all requested latency tests pass.
  The retained additive answers/options/rounds implementation and retry usage aggregation remain in place.

#### Stop: every current contradicting test (TL-P4-51)

The whole Q1, data and runner suites completed before stopping. There is exactly one distinct failing test:

| Exact test / location | Contract mismatch and evidence |
| --- | --- |
| `Q1a q1-clear-work-with-waiting-item: an option asking leaves its item and files clear work`, `runner/test/q1-continuation.test.ts:278` | Requires `request-1` to be archived as completed, although the fixture's validated model reply supplies only one filing and one asking, no request decision or request-bound line. It remains pending. Fails identically in the Q1 run and full runner run; all other assertions in that test and all other Q1 reds pass. |

Diagnosis: the independent text is `Tidy the room papers.`. It names no stored note, so the existing C05
`settleRequest` owns no target or fulfillment for it. The validated model reply has no generic request-answer field
(`runner/src/claude.ts:1072–1084`), and `modelDecisions` provides no generic request handler
(`src/data/spine/scripted.ts:552–564`). The existing decision contract explicitly says a missing request handler
leaves requests waiting (`:518–519`, `:542–543`); the single journal-admission filter enforces that at `:827`.
This is the accepted provider's “writes only what it proposed” boundary (P4-2 review I1,
`runner/test/claude-provider.test.ts:734–770`), retained by Q1a contract 7/P9, rather than a hold caused by the asking.
The original script's optional request responder is deliberately absent from the model path.

Consequently the fixture's unconditional completion assertion conflicts with preserving that existing decision
meaning: auto-archiving it would claim an unplanned request was done. A wording heuristic, automatic success for
all generic requests, or a new request-response inference would change that contract. No such workaround was added.
The existing named-note request settlement and scripted request handler remain green in the full suites.
The lead needs to choose a handled independent-request fixture or allocate/rule the general model request-decision
boundary. No test was changed and no contract number was loosened. This replaces round 1's provisional “gap” diagnosis.
No other contradiction remains; the first-listing contradiction was resolved by addendum 3 and red repair 1.

#### Final validation

All output is under tmp-logs; only failure output or final result summaries were read.

| Command / log | Result |
| --- | --- |
| `pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2`; `tmp-logs/q1-r2-reds-final.log` | 27 pass, 1 fail / 28; assertion at :278 above. |
| `pnpm exec vitest run src/data --maxWorkers=2`; `tmp-logs/q1-r2-data-final.log` | 4,141 pass / 4,141; 77 green files. |
| `pnpm -C runner exec vitest run --maxWorkers=2`; `tmp-logs/q1-r2-runner-final.log` | 583 pass, 1 fail / 584; 44 green files, one failed. Includes the corpus, goldens and all bounded reads. |
| App tsc; `tmp-logs/q1-r2-tsc-app-final.log` | Pass. |
| Node tsc; `tmp-logs/q1-r2-tsc-node-final.log` | Pass. |
| Runner tsc; `tmp-logs/q1-r2-tsc-runner-final.log` | Pass. |
| ESLint on all 11 touched app TS files; `tmp-logs/q1-r2-eslint-app-final.log` | Pass. |
| ESLint on runner/src/claude.ts; `tmp-logs/q1-r2-eslint-runner-final.log` | Pass. |
| Read-only `git diff --check` | Pass. |
| `pnpm check`; e2e app/capabilities demo/fake | Not run after the TL-P4-51 contract stop. No check mark or integration claim. |

The first combined-root ESLint invocation failed on tsconfigRootDir discovery before linting; separate app and
runner invocations above passed without configuration changes. Intermediate regression runs remain under tmp-logs.
The final test diffs are empty; red repair 1's committed tests are preserved verbatim.

#### Removed lines and tests — final production diff against the supplied HEAD

removed: runner/src/claude.ts: 13 lines; boolean-only input, unconditional candidate prompt and last-call-only usage replaced.
removed: src/data/answer-loop.ts: 3 lines; boolean-only signature/import widened at the same answer boundary.
removed: src/data/contracts/journal-record.ts: 1 line; validator widened for optional asking identity and answer value.
removed: src/data/contracts/questions.ts: 5 lines; id-only closure and report rest-spread replaced with explicit policy.
removed: src/data/contracts/types.ts: 0 lines; additive fields only.
removed: src/data/demo/world.ts: 2 lines; shared answer type replaces boolean map/signature.
removed: src/data/drive/read-cache.ts: 5 lines; existing version entries gain completed-text and notification tracking.
removed: src/data/sources.ts: 1 line; VaultSource.answer signature widened.
removed: src/data/spine/scripted.ts: 30 lines; same planner handles additive values, stored choices and durable rounds.
removed: src/data/vault/drive-vault.ts: 19 lines; shared cached projection/asking policy replaces id-only filtering.
removed: src/data/vault/journal.ts: 2 lines; same list/parser can consume only completed cached reads.
removed: src/data/vault/layout.ts: 3 lines; existing stored questions validator widened additively.
tests changed: none

#### Compatibility row drafts — current, not accepted

| Boundary / files | Old reader / old meaning | New shape and validation evidence | Draft disposition |
| --- | --- | --- | --- |
| contracts/types.ts, questions.ts | Legacy yes/no and subjects still read; public reports preserve their old fields. | Optional stored file-to options/words and asking keys; explicit report projection; Q1 legacy reader/control reds pass. | Review pending; no contracts commit. |
| contracts/journal-record.ts | Old text yes/no reads as boolean; new booleans mirror legacy text. | Optional askedAt/answer, strict object values, trim/length/controls; identity, later answer, legacy fixtures and data suite pass. | Review pending. |
| vault/layout.ts | `{v:1,questions}` still reads; no mandatory field or new version. | Optional rounds in the same file; action/round validators; retries, reset, reupload and P2 reader reds pass. | Review pending; listing timing follows addendum 3. |
| drive/read-cache.ts, vault/journal.ts, vault/drive-vault.ts | Ordinary reads, single-flight, version replacement, outbox and owned errors retain their meanings. | Completed-cache-only listing and one version notification; Q1 subscription, cache, live-isolation and latency suites pass. | Supporting read-cache extension under supplied addendum 3; review pending. |
| sources.ts, answer-loop.ts, demo/world.ts | Boolean callers and continuation request identity still work. | Same ports accept typed text/option answers; real /process/main replay/batch/quota reds pass. | Review pending. |
| Manifest/checkpoint/report contracts | No version, fixture or public format change. | Existing parsers, guarded writes and moves pass the Q1 controls and full runner suite except the request assertion above. | Draft unchanged-reader row. |
| Features and model inputs | No feature/screen change. Existing prompts outside the 2–4 candidate path remain byte-identical. | App tsc, exact prompt goldens and fingerprint tests pass. | Q1b owns UI; no feature compatibility change. |
| Generic model requests | A missing generic request decision remains pending, never marked complete. | Sole Q1 failure requires the opposite without providing a decision; no implicit completion added. | Lead ruling required; blocked. |

Research remains the offline local references recorded below: tagged union widening, tolerant readers,
idempotency by asking identity and the existing versioned read cache/single-flight subscription.
Left out: the unresolved generic request-decision mismatch; Q1c publication, Q1b UI, which-note, B12, full gates/e2e,
commits and integration. All 12 production changes and these notes remain for the coordinator.

### Round 1 — historical implementation (superseded where round 2 says so)

2026-10-10, Codex implementation session after the supplied integration of B1a, C05 and smoke-request-slow.
Status: **blocked; production changes remain uncommitted and are not ready for integration**.
No network call, git write, test edit, fixture edit, dependency addition or UI edit was made.
Temporary production diagnostic prints were removed before the final checks.

### Stop: incompatible listing assertions

The completed targeted suites expose one contract contradiction. TL-P4-44 Q10 and packet contract 6 require
**listed as well as full** piles to derive waiting/exhausted from questions.json and open questions, with no second store.
The committed Q1 red calls a newly constructed vault's `pilesListed()` directly and requires that projection.
The old `home-inbox-first` test requires that same first listing to read no file whatsoever. Its fixture already has
questions.json, but neither the constructor nor any earlier vault call has read it. Drive listing metadata does not
contain the asking, its subject or the retained round state. The existing read cache cannot provide bytes never read.
These expectations cannot both hold on that entry point without changing the contract or adding another source of truth.
Implementation stopped after running the whole reds, data and runner suites, as instructed; tests were not weakened.

| Contradicting assertions | Ruling / evidence |
| --- | --- |
| `src/data/vault/drive-vault.test.ts:2963` (`lists the piles without reading a file, and concurrent digests of one file ask Drive once`) | Requires zero text reads on the first listed-pile call; Q10 requires the stored projection on that call. `tmp-logs/q1-final-data.log`. |
| `src/data/vault/drive-vault.test.ts:2964` (same test) | Also forbids reading the same required bytes through readBytes; changing the transport would not resolve it. |
| `runner/test/q1-continuation.test.ts:635` (`q1-pile-projection: waiting on a member or pile appears on listed and full piles and clears on leaving`) | The Q10 positive assertion on a fresh vault, for both member and pile subjects, passes with the stored read. `tmp-logs/q1-final-reds.log`. |

The other failing tests listed below are **unfinished implementation/regression work**, not additional claimed
contract contradictions. In particular, the old prompt fingerprints can be preserved on paths with fewer than two
script candidates; they are not a reason to change a golden. The request-completion failure has not been ruled a
contradiction: today's generic request handler is absent from modelDecisions, so that red remains for diagnosis.

### Work left in place

- One shared typed answer validator and journal value reader; boolean plus option/text objects, asking identity,
  later-record selection, trim/length/control checks, and inbox-only object answers.
- QuestionOption has only stored `file-to` folder ids. Model options select existing folder ids; labels cannot retarget
  consent. Report rows explicitly omit stored actions and internal question fields.
- QuestionRound history is additive in questions.json, using the subject/hash and pile words. New askings and history
  are written through the existing manifest effect, with its read modifiedTime and recovery, not a separate writer.
- Pile projection uses the existing vault read cache, journal and shared subject policy. Readiness/upload fields remain
  intact. Hash metadata for a reupload is requested with checksums when the listing omitted it.
- Continuation still uses answerRequestId, the existing /process admission, subject capture, durable Worker batching,
  quota and manifest. No scheduler, lineage, member freeze, option kind or separate round counter was added.
- The provider aggregates validation retries into the existing RunTiming.model field; timing.ts and its ledger are untouched.

**Known remaining implementation gaps:** the stored option is resolved by the planner but the provider's whole-pile
`held` decision still prevents its effect in the duplicate-label/renamed-folder red. The generic independent request
in the clear-work red is not completed. Additional first-listing reads break old error isolation, latency, accounting
and source-session tests. The added candidate input is not yet restricted to the 2–4 applicable candidate path, so old
C04 prompt/ID-normalization fixtures regress. The shared policy must reuse EMPTY_MD5 instead of its literal, and its
control-character regex needs the repository's lint-compatible form. These were left in place on the required stop.

### Research (offline)

Source references were read in the assigned prep and existing production modules; no remote documentation was fetched.
The existing design follows [TypeScript discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
and the [tolerant reader](https://martinfowler.com/bliki/TolerantReader.html): add optional fields and tagged values,
preserve legacy boolean/text meaning and explicitly project public report rows. Strict model replies reuse the existing
[Zod strict-object/refinement](https://zod.dev/api#refinements) validation path.
Continuation reuses the existing [Idempotency-Key pattern](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/):
one request id derived from question id plus askedAt, recovered by the current Worker/run lifecycle.
References are citations carried by the local implementation and prep, not claims of current online verification.

### Removed lines and tests

removed: runner/src/claude.ts: 11 lines; boolean-only answer reading and last-call-only usage assignment replaced.
removed: src/data/answer-loop.ts: 3 lines; boolean-only signature/import replaced by the additive answer boundary.
removed: src/data/contracts/journal-record.ts: 1 line; validator widened for optional asking identity and answer value.
removed: src/data/contracts/questions.ts: 5 lines; id-only closure and report rest-spread replaced with explicit policy.
removed: src/data/contracts/types.ts: 0 lines; additive fields only.
removed: src/data/demo/world.ts: 2 lines; answer map/signature now uses the shared answer type.
removed: src/data/sources.ts: 1 line; VaultSource.answer signature widened.
removed: src/data/spine/scripted.ts: 28 lines; boolean-only checks and asking-only JSON replaced in the existing planner.
removed: src/data/vault/drive-vault.ts: 18 lines; id-only answer filtering replaced with the shared asking/projection policy.
removed: src/data/vault/layout.ts: 3 lines; stored questions validator widened additively.
tests changed: none

### Compatibility row drafts (not accepted)

| Boundary / files | Old reader / old meaning | New shape and validation evidence | Draft disposition |
| --- | --- | --- | --- |
| `src/data/contracts/types.ts`, `questions.ts` | Existing yes/no questions and subject forms still read; report rows stay their old public shape. | Optional options/words, one file-to action; explicit report projection; P2 control in q1-legacy-question-answer-status passes. | Review pending; no contracts commit. |
| `src/data/contracts/journal-record.ts` | Old text yes/no reads as boolean; new boolean writes also carry legacy text so old readers retain their meaning. | Optional askedAt and answer, strict object values; old P2 journal fixture and asking/later-answer reds pass. | Review pending. |
| `src/data/vault/layout.ts` (stored questions boundary) | `{v:1,questions}` still reads unchanged; no mandatory new field. | Optional rounds retained in that same file; options checked for known kind and folder-id shape; P2 fixtures pass. | Review pending; listing contract conflict remains. |
| Manifest/checkpoint/report contracts | No format/version change or fixture rewrite. Existing guarded content write and move effects remain in use. | New stored JSON passes the actual manifest/checkpoint/report readers; report options do not leak actions. | Draft unchanged reader row; no edits in these contracts. |
| `src/data/sources.ts`, answer-loop | Boolean callers remain valid; current request-id and start options are unchanged. | Typed option/text values accepted through the same answer entry point. | Review pending. |
| `src/features/` | No feature or screen file changed; yes/no callers compile with the additive port. | App tsc passes; Q1b owns option/text UI and visible projection. | No feature compatibility change; draft unchanged row. |

### Validation

All output is under tmp-logs. Final results and every failing test location are appended below once the runs finish.
`pnpm check` and e2e were not run after the contract stop; there is no green mark or integration claim.
App, node and runner tsc were run; ESLint was run on every touched production TS file.


Final checks (no tests changed):

| Command / final log | Result |
| --- | --- |
| `pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2`, `tmp-logs/q1-final-reds.log` | 26 passed, 2 failed of 28. |
| `pnpm exec vitest run src/data --maxWorkers=2`, `tmp-logs/q1-final-data.log` | 4,130 passed, 11 failed of 4,141; 72 green files, 5 failed. |
| `pnpm -C runner exec vitest run --maxWorkers=2`, `tmp-logs/q1-final-runner.log` | 571 passed, 13 failed of 584; 39 green files, 6 failed. This includes the corpus suite. |
| `pnpm exec tsc -p tsconfig.app.json`, `tmp-logs/q1-final-tsc-app.log` | Pass. |
| `pnpm exec tsc -p tsconfig.node.json`, `tmp-logs/q1-final-tsc-node.log` | Pass. |
| `pnpm -C runner exec tsc --noEmit`, `tmp-logs/q1-final-tsc-runner.log` | Pass. |
| ESLint on the nine touched app files, `tmp-logs/q1-final-eslint-app.log` | Fail: `src/data/contracts/questions.ts:32`, no-control-regex. |
| ESLint on runner/src/claude.ts, `tmp-logs/q1-final-eslint-runner.log` | Pass. |
| `git diff --check` (read-only) | Pass. |
| `pnpm check`; e2e app/capabilities demo/fake | Not run after the contract stop. No screen changes. |

### Every remaining test failure (final runs)

The two Q1 reds below remain assertion failures, not test-loading failures. All other Q1 cases are green.
The full suites were completed before delivery; the list distinguishes regressions from the one conflict above.

| Suite | Test | Failure location | First failure |
| --- | --- | --- | --- |
| reds | `test/q1-continuation.test.ts > Q1a stored answers through production entry points > Q1a q1-clear-work-with-waiting-item: an option asking leaves its item and files clear work` | `runner/test/q1-continuation.test.ts:248` | AssertionError: independent request is completed: expected true to be false // Object.is equality |
| reds | `test/q1-continuation.test.ts > Q1a stored answers through production entry points > Q1a q1-options-exact-action: consent resolves stored folder id despite duplicate labels and rename` | `runner/test/q1-continuation.test.ts:263` | AssertionError: expected [ 'f14' ] to deeply equal [ 'f8' ] |
| data | `src/data/fake/fake-worker.test.ts > report save failure cannot publish done or repeat effects on the B path > journal changes take the recoverable path > leaves unreadable lines, differing copies and lines in two places where they are, logs once and goes on` | `src/data/fake/fake-worker.test.ts:1721` | BowerError: Bower could not read your changes. |
| data | `src/data/fake/fake-worker.test.ts > report save failure cannot publish done or repeat effects on the B path > journal changes take the recoverable path > replaces an unreadable questions.json when an answer needs it, recording the bytes it replaced` | `src/data/fake/fake-worker.test.ts:1750` | BowerError: Bower could not read its latest update. Try again. |
| data | `src/data/fake/fake-worker.test.ts > report save failure cannot publish done or repeat effects on the B path > Bower's own files take the recoverable path > unreadable runner files never send a run down the legacy path` | `src/data/fake/fake-worker.test.ts:1937` | AssertionError: text of .bower/questions.json: expected BowerError: You're offline. Try again whe… { …(2) } to match object { Object (message) } |
| data | `src/data/fake/fake-worker.test.ts > report save failure cannot publish done or repeat effects on the B path > Bower's own files take the recoverable path > a missing journal plans as an empty one on the recoverable path` | `src/data/fake/fake-worker.test.ts:2034` | AssertionError: text, all: expected BowerError: You're offline. Try again whe… { …(2) } to match object { Object (message) } |
| data | `src/data/contracts/hashes.test.ts > one digest module serves app, runner and Worker > no file outside hashes.ts calls a hash primitive or spells an empty-file constant` | `src/data/contracts/hashes.test.ts:44` | AssertionError: expected [ 'src/data/contracts/questions.ts' ] to deeply equal [] |
| data | `src/data/live/home-cache.test.ts > Home on the latency fake > Home is complete within 35% of the call minimum on the latency fake` | `src/data/live/home-cache.test.ts:103` | AssertionError: expected 1349 to be less than 1200 |
| data | `src/data/live/live.test.ts > session and folder isolation > reused sources isolate account and folder changes (queued admissions cannot block or dispatch in B, flushJournal)` | `src/data/live/live.test.ts:418` | AssertionError: expected "process" to be called 1 times, but got 0 times |
| data | `src/data/live/live.test.ts > session and folder isolation > reused sources isolate account and folder changes (queued admissions cannot block or dispatch in B, process)` | `src/data/live/live.test.ts:418` | AssertionError: expected "process" to be called 2 times, but got 1 times |
| data | `src/data/vault/drive-vault.test.ts > a set-aside pile shows its reason in the inbox > your changes are read once per listing, and one that cannot be read affects only its pile` | `src/data/vault/drive-vault.test.ts:2017` | BowerError: You're offline. Try again when you're back. |
| data | `src/data/vault/drive-vault.test.ts > a set-aside pile shows its reason in the inbox > offline, a declared pile logs one error per listing` | `src/data/vault/drive-vault.test.ts:2269` | BowerError: You're offline. Try again when you're back. |
| data | `src/data/vault/drive-vault.test.ts > the inbox from the listing alone (home-inbox-first) > lists the piles without reading a file, and concurrent digests of one file ask Drive once` | `src/data/vault/drive-vault.test.ts:2963` | AssertionError: expected "readText" to not be called at all, but actually been called 1 times |
| runner | `test/c05-bounded-reads.test.ts > C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media` | `runner/test/c05-bounded-reads.test.ts:262` | AssertionError: expected 21 to be 20 // Object.is equality |
| runner | `test/c05-bounded-reads.test.ts > C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence` | `runner/test/c05-bounded-reads.test.ts:262` | AssertionError: expected 21 to be 20 // Object.is equality |
| runner | `test/drive-calls-golden.test.ts > the C04 run makes the golden number of Drive calls per step > the C04 run makes the golden number of Drive calls per step` | `runner/test/drive-calls-golden.test.ts:25` | AssertionError: expected 89 to be 88 // Object.is equality |
| runner | `test/drive-calls-golden.test.ts > the C04 run past 20 earlier runs (retention-never-wired, round 2) > with 25 earlier runs a run makes 99 Drive calls` | `runner/test/drive-calls-golden.test.ts:80` | AssertionError: expected 89 to be 88 // Object.is equality |
| runner | `test/model-input-fingerprint.test.ts > model input fingerprint > the model input on the C04 fixture equals its golden copy` | `runner/test/model-input-fingerprint.test.ts:81` | AssertionError: expected 'You plan one Bower tidy-up. You have …' to be 'You plan one Bower tidy-up. You have …' // Object.is equality |
| runner | `test/model-input-fingerprint.test.ts > model input fingerprint > the raw model input on the C04 fixture equals its golden copy` | `runner/test/model-input-fingerprint.test.ts:92` | AssertionError: expected 'You plan one Bower tidy-up. You have …' to be 'You plan one Bower tidy-up. You have …' // Object.is equality |
| runner | `test/model-input-fingerprint.test.ts > model input fingerprint > the same case with other ids has the same fingerprint` | `runner/test/model-input-fingerprint.test.ts:174` | AssertionError: expected '580611a48577' to be '1e1d2c8f3615' // Object.is equality |
| runner | `test/model-input-fingerprint.test.ts > model input fingerprint > two fresh fake folders on the same case give the same input fingerprint through main` | `runner/test/model-input-fingerprint.test.ts:267` | AssertionError: expected 'You plan one Bower tidy-up. You have …' to be 'You plan one Bower tidy-up. You have …' // Object.is equality |
| runner | `test/q1-continuation.test.ts > Q1a stored answers through production entry points > Q1a q1-clear-work-with-waiting-item: an option asking leaves its item and files clear work` | `runner/test/q1-continuation.test.ts:248` | AssertionError: independent request is completed: expected true to be false // Object.is equality |
| runner | `test/q1-continuation.test.ts > Q1a stored answers through production entry points > Q1a q1-options-exact-action: consent resolves stored folder id despite duplicate labels and rename` | `runner/test/q1-continuation.test.ts:263` | AssertionError: expected [ 'f14' ] to deeply equal [ 'f8' ] |
| runner | `test/reads-report.test.ts > the runner plan reads and report > plan reads finish under the budget with modelled Drive latency` | `runner/test/reads-report.test.ts:40` | AssertionError: expected 2730 to be less than 2675 |
| runner | `test/reads-report.test.ts > the runner plan reads and report > with 25 earlier runs plan reads stay within their measured maintenance delta` | `runner/test/reads-report.test.ts:47` | AssertionError: expected 3180 to be less than or equal to 3030 |
| runner | `test/timing-counts.test.ts > timing counts > the timing line counts calls and bytes per phase and names the region` | `runner/test/timing-counts.test.ts:13` | AssertionError: expected 89 to be 88 // Object.is equality |


### Files retained uncommitted

All ten production files below remain in place, alongside this appended notes file. No test or shared harness record changed.

- runner/src/claude.ts
- src/data/answer-loop.ts
- src/data/contracts/journal-record.ts
- src/data/contracts/questions.ts
- src/data/contracts/types.ts
- src/data/demo/world.ts
- src/data/sources.ts
- src/data/spine/scripted.ts
- src/data/vault/drive-vault.ts
- src/data/vault/layout.ts

Logs and generated, made-up test event files remain in tmp-logs/. The coordinator owns any future commit or cleanup.

## Red repair 1

2026-10-10, Codex red-owning session; TL-P4-29, TL-P4-44 addendum 3, TL-P4-51 sweep.
Repair complete; the corrected reds fail on the uncommitted implementation, ready for its owning session.
The local DECISIONS search has no TL-P4-44 addendum 3 entry. Applied the supplied lead ruling (a),
2026-10-10: listing reads no file; Home's existing questions read populates the vault's cached questions;
the vault subscription re-emits so listed and full piles project waiting/exhausted after that read.
This supersedes only the first-call marker timing in the Implementation stop section above.

tests changed: runner/test/q1-continuation.test.ts:665: TL-P4-44 addendum 3: formerly :635; member and pile waiting markers are observed on listed and full piles through the subscription after questions(), with a zero-read first listing.
tests changed: runner/test/q1-continuation.test.ts:782: TL-P4-44 addendum 3: formerly :752; reloaded exhaustion is observed through the same subscription after questions(), with a zero-read first listing.
tests changed: runner/test/q1-continuation.test.ts:788: TL-P4-44 addendum 3: formerly :758; waiting over retained exhaustion is observed through the same subscription after questions(), with a zero-read first listing.

The shared helper subscribes before questions(), captures listed/full projections from the notification,
and checks that at least one notification supplies both expected markers. It never waits on a real timer.
It also retains the listed-marker assertion after the read. Existing full-pile, leaving, word-reset,
precedence, upload and readiness assertions are unchanged.
The repository-wide test grep for pilesListed found no other first-listing waiting/exhausted pin.
The readiness test already reads full piles before its listed assertion and needs no timing repair.
The edited-pile first listing asserts absence, not a waiting/exhausted marker, and remains unchanged.
src/data/vault/drive-vault.test.ts, including :2963–2964, is entirely unchanged (empty git diff).
No production file was edited, reverted or formatted; no network or git write was used.
Only this test file and this notes section were edited. The coordinator owns commits.
Offline research reused the local vault subscription and existing fixture entry points;
the established references in Research above remain applicable, with no new online verification.

### Validation

| Command | Result / log |
| --- | --- |
| `pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2` | 24 pass, 4 fail; `tmp-logs/q1a-red-repair-1-tests.log`. |
| `pnpm exec vitest run src/data/vault/drive-vault.test.ts --maxWorkers=2` | Preservation sweep: 226 pass, 3 fail; `tmp-logs/q1a-red-repair-1-drive-vault.log`. |
| `pnpm -C runner exec tsc --noEmit -p tsconfig.json` | Pass, including the touched test; `tmp-logs/q1a-red-repair-1-tsc.log`. |
| `pnpm exec eslint runner/test/q1-continuation.test.ts` | Pass; `tmp-logs/q1a-red-repair-1-eslint.log`. |
| `git diff --check` | Pass; read-only. |

Both test files ran to completion. Every failing test is listed below; none was changed to hide a failure.

| Test / location | Failure |
| --- | --- |
| `q1-clear-work-with-waiting-item`, runner/test/q1-continuation.test.ts:278 | Existing unfinished implementation: independent request remains pending. |
| `q1-options-exact-action`, runner/test/q1-continuation.test.ts:293 | Existing unfinished implementation: parents are f14 rather than stored destination f8. |
| `q1-pile-projection: waiting on a member or pile...`, runner/test/q1-continuation.test.ts:665 | For both subjects, fresh listing already has waiting and reads questions; questions() emits no subscription update. Helper failures :112, :113, :131. |
| `q1-pile-projection: exhausted persists...`, runner/test/q1-continuation.test.ts:782, :788 | Fresh listings already have exhausted/waiting and read files; questions() emits no update. Helper failures :112, :113, :131. |
| `your changes are read once per listing...`, src/data/vault/drive-vault.test.ts:2017 | Existing offline BowerError escapes. |
| `offline, a declared pile logs one error per listing`, src/data/vault/drive-vault.test.ts:2269 | Existing offline BowerError escapes. |
| `home-inbox-first`, src/data/vault/drive-vault.test.ts:2963 | Preserved assertion fails: first listing performs one readText. :2964 is unchanged. |

No remaining test-contract contradiction was found in the listing-marker sweep; these are production failures.
Production repair, full gates, e2e and integration remain outside this test-only repair session.

## Red repair 3

2026-10-10. Codex red owner, TL-P4-29; lead ruling (a). Repair complete.

tests changed: runner/test/q1-continuation.test.ts:284: lead ruling (a) 2026-10-10: clear work is a clear sibling pile that is filed despite the asking; request-1 stays pending and is not archived because the validated model path has no general request decision (C11).

The fixture adds a separate, single-file clear sibling pile with its own pile id and an explicit model filing.
The original clear-file filing, legacy control, successful run, saved option count, unclear item's evidence
(bytes, id, name and place), and original pile words assertions are preserved verbatim.
Only the request-completion expectation is replaced, with positive filing and pending/not-archived assertions.
The request text remains `Tidy the room papers.`. Red repair 2's finding is preserved above;
this ruling supersedes its unconditional request-completion contract, not the existing planner boundary.
No production file was edited, reverted or formatted; no network or writing git command was used.
The coordinator owns commits. Offline research reuses the existing single-file pile fixture at
runner/test/q1-continuation.test.ts and the Research references already recorded above.

Validation (all commands exit 0):
- Q1 file: `TMPDIR=/private/tmp/bower-q1a-stored-answers/tmp-logs pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2`; 28/28 pass; `tmp-logs/q1-red-repair-3-vitest.log`.
- Runner tsc: `pnpm -C runner exec tsc --noEmit -p .`; pass; `tmp-logs/q1-red-repair-3-tsc.log`.
- Test ESLint: `pnpm -C runner exec eslint test/q1-continuation.test.ts`; pass; `tmp-logs/q1-red-repair-3-eslint.log`.
Full gates, e2e, implementation and integration remain outside this authorized test-only repair.

## Red repair 4

2026-10-10. Codex red owner, lead-supplied TL-P4-44 addendum 4 (not yet in this checkout's DECISIONS).
Unchanged production HEAD: `f6e1be5062f3f7050bf5acf5b0a8eec872a540c8`.
Only the authorized test additions and this requested notes section were edited. The coordinator owns commits.
No network, git write, production change, dependency change, real timer, `.only` or `.skip` was used.

tests changed: runner/test/q1-continuation.test.ts: TL-P4-44 addendum 4: add positive same-id filing after folder rename or allowed-root move, and gone-folder waiting followed by a fresh next-round asking without a copy; preserve all existing assertions.
removed: none (no existing assertion removed or weakened).

Exact names:

- `Q1a fix 1.5: missing or outside-root stored option folders cannot authorize alternative filing`
- `Q1a fix 1.5b: a gone option folder leaves the item waiting and the next run asks again as the next round`

Fix 1.5 now also exercises Home renamed to Room and Home moved from Areas to Projects.
Both still receive the item by the same stored folder id despite the model naming Job hunt.
The case called `outside` moves Home under Inbox: Inbox is not a filing destination, so it still refuses.
All gone-case assertions (no alternative move, unchanged parents and complete item evidence), ordinary/valid
controls, and every assertion of fix 1.6 remain byte-identical. Fix 1.6 still pins where a words-only pile's note is created.
Every new assertion explicitly cites TL-P4-44 addendum 4.

Fix 1.5b obtains asking one and count one from production main, answers its generated option id, then bins
that folder. The answer continuation completes with the original item untouched, no alternative move,
no new round and no copy. A new allowed folder is created before the next run; main then writes exactly
one asking for the same item with a newer askedAt, options for the new folder and Job hunt (excluding the
gone folder), and count two. The original evidence is unchanged; checksum-matching files contain only
the original id after both runs, including any copy under another name. No counter format is seeded.

Offline research reuses the existing realWorld/main and in-process /process fixtures and the references
already recorded under Research: Hono testing, tagged unions, tolerant readers and stable request identity.
No online verification is claimed; no new mechanism was introduced.

Validation (final test-file revision, all output in `tmp-logs/`):

```sh
TMPDIR=/private/tmp/bower-q1a-stored-answers/tmp-logs pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2 --reporter=json --outputFile=../tmp-logs/q1a-red-repair-4.json > tmp-logs/q1a-red-repair-4.log 2>&1
```

- Whole file: exit 0; 36/36 pass, no skips, load errors or timeouts. Both named tests pass at unchanged HEAD.
  The new assertions do **not** fail at HEAD; no red failure is claimed. Evidence: `tmp-logs/q1a-red-repair-4.json` and `.log`.
- Runner tsc: exit 0; `tmp-logs/q1a-red-repair-4-tsc.log`. An initial optional-parent type error in the new fixture was corrected.
- Touched-file ESLint: exit 0; `tmp-logs/q1a-red-repair-4-eslint.log`.
- Read-only preservation comparison: removing only the new test, two positive loop cases and their branches
  reconstructs the entire HEAD test file exactly. Every other test and every preexisting assertion is unchanged.
- Read-only `git diff --check`: pass; HEAD unchanged. No test/ruling contradiction was observed.

Left out: production fixes, full check/e2e, commits and integration; this is the requested test-only red repair.

## Fix round 1 reds

2026-10-10. Codex red owner, TL-P4-29. Production HEAD `a568d4cc6023f7d59b5d569028410609e4de93e6` remains unchanged.
Seven new reds cover all seven Blocking findings in `docs/harness/2026-10-10-codex-q1a-stored-answers-adversarial.md`.
Only the existing Q1 test file is extended; this notes appendix is the requested delivery record. The coordinator owns commits.
No network, writing git command, production edit, new execution driver, corpus fixture, real timer, `.only` or `.skip` was used.

Read WORKER, the Q1a packet, TL-P4-44’s contract and DECISIONS addenda 1–2, and the seven-finding BLOCK review.
The local DECISIONS search contains no TL-P4-44 addendum 3 entry. The existing test helper records its zero-read first listing and questions-read subscription ruling; every such assertion is preserved.
The original test file is byte-identical after removing the newly inserted block (read-only comparison with HEAD). Every existing assertion and bound remains unchanged, including the 100-run quota fixture and prior timing/read bounds.
All round histories come from production main; no round records are seeded. Reupload checks permit retargeting the subject id while retaining the produced hash, words, count and exhaustion.

Offline research reuses the existing realWorld/main, answerQuestion, DriveVault and in-process /process fixtures, and the references already cited in the local mechanisms: [TypeScript discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions), [Tolerant Reader](https://martinfowler.com/bliki/TolerantReader.html), and [stable request identity](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/). No remote reference was fetched.

### Exact names, positive controls and observed HEAD failures

1. `Q1a fix 1.1: second-answer placement precedes exhaustion after an unresolved second answer`

   tests changed: runner/test/q1-continuation.test.ts: adds second-answer placement coverage for thing and pile; exhausts only after an unresolved second answer. Existing tests unchanged.

   Positive controls (all passed): First-answer filing succeeds for both thing and pile. An unresolved second answer still exhausts and leaves the item in the inbox.

   Observed failure: Asking two is already marked exhausted before its answer; a valid second-answer placement is discarded for both thing and pile (parents remain the inbox pile). The unresolved-second-answer control completes.

   Failing assertion lines: `runner/test/q1-continuation.test.ts:969`, `runner/test/q1-continuation.test.ts:975`, `runner/test/q1-continuation.test.ts:979`.

2. `Q1a fix 1.2: instructions scope preserves inbox counters and exhausted subjects without a third asking`

   tests changed: runner/test/q1-continuation.test.ts: adds instructions-scope preservation of one-round and exhausted inbox histories and the no-third-asking rerun. Existing tests unchanged.

   Positive controls (all passed): A stored Current state answer runs in instructions scope, removes its own card, calls no model, and leaves inbox evidence unchanged. Both count-one and exhausted histories are exercised.

   Observed failure: The instructions run deletes the rounds field for both active and exhausted histories. The exhausted subject gets a third asking on the following all-scope run and projects waiting.

   Failing assertion lines: `runner/test/q1-continuation.test.ts:1012`, `runner/test/q1-continuation.test.ts:1017`, `runner/test/q1-continuation.test.ts:1018`.

3. `Q1a fix 1.3: pile and member share two rounds and only changed words permit another asking`

   tests changed: runner/test/q1-continuation.test.ts: adds pile/member and member/pile round identity coverage, the unchanged rerun, and the words-change reset. Existing tests unchanged.

   Positive controls (all passed): An unchanged member subject stays exhausted. After each subject-switch direction, changing the pile words permits a new count-one asking.

   Observed failure: Both subject-switch directions write two count-one records instead of a shared count-two history. An unresolved second answer writes asking three; an unchanged rerun keeps that third asking.

   Failing assertion lines: `runner/test/q1-continuation.test.ts:1035`, `runner/test/q1-continuation.test.ts:1039`, `runner/test/q1-continuation.test.ts:1042`, `runner/test/q1-continuation.test.ts:1044`.

4. `Q1a fix 1.4: a same-bytes reupload retains hash history through the planner and writes no asking`

   tests changed: runner/test/q1-continuation.test.ts: extends same-bytes reupload coverage through main and durable hash history, with a different-bytes control. Existing tests unchanged.

   Positive controls (all passed): Different non-empty bytes under a new id permit a first asking. Same bytes have equal md5, a new id, and exhausted vault projection before main.

   Observed failure: Vault projection recognizes the exhausted reupload before main. Main drops the hash-backed count-two history and writes a new count-one asking for the new id; projection becomes waiting.

   Failing assertion lines: `runner/test/q1-continuation.test.ts:1073`, `runner/test/q1-continuation.test.ts:1075`, `runner/test/q1-continuation.test.ts:1076`.

5. `Q1a fix 1.5: missing or outside-root stored option folders cannot authorize alternative filing`

   tests changed: runner/test/q1-continuation.test.ts: adds unavailable stored folder consent coverage against a valid alternative model placement. Existing tests unchanged.

   Positive controls (all passed): Ordinary model filing into Job hunt succeeds. With valid Home consent, the same model reply files into the stored Home id. Clear siblings leave first so the ordinary pile hold cannot hide the consent defect.

   Observed failure: Both a binned stored folder and Home moved under Inbox allow the model’s Job hunt move. The item’s parent changes from its inbox pile to Job hunt, and the manifest contains that alternative move.

   Failing assertion lines: `runner/test/q1-continuation.test.ts:1112`, `runner/test/q1-continuation.test.ts:1113`, `runner/test/q1-continuation.test.ts:1115`.

6. `Q1a fix 1.6: words-only pile consent places its generated note in the chosen stored folder`

   tests changed: runner/test/q1-continuation.test.ts: adds words-only pile stored folder consent coverage against a conflicting model note destination. Existing tests unchanged.

   Positive controls (all passed): A words-only pile with a matching model destination generates exactly one note in Home, preserving the pile words. The same stored option is then exercised against a conflicting destination.

   Observed failure: The conflicting model destination writes the generated note into Job hunt instead of stored Home. The matching-destination control passes.

   Failing assertion lines: `runner/test/q1-continuation.test.ts:1136`, `runner/test/q1-continuation.test.ts:1138`.

7. `Q1a fix 1.7: pending text from another pile never reaches this subject planner without provenance`

   tests changed: runner/test/q1-continuation.test.ts: adds subject-only typed text coverage after a real quota refusal and next-day subject-scoped continuation. Existing tests unchanged.

   Positive controls (all passed): An own-pile text answer reaches its continuation with pileId. Real /process quota refusal keeps B’s typed answer; next day A admits only A’s pile but the existing journal still contains B’s record.

   Observed failure: B’s pending text reaches A’s planner as an answer without fileId or pileId, and appears verbatim in the full model input. A’s own text retains its pileId; B’s item remains untouched.

   Failing assertion lines: `runner/test/q1-continuation.test.ts:1185`, `runner/test/q1-continuation.test.ts:1186`.

### Validation

Final whole-file run (exit 1, expected red result):

```sh
TMPDIR=/private/tmp/bower-q1a-stored-answers/tmp-logs pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2 --reporter=json --outputFile=../tmp-logs/q1a-fix-1-reds.json > tmp-logs/q1a-fix-1-reds.log 2>&1
```

- 35 tests: all 28 existing tests pass; all 7 new reds fail with AssertionError for their stated findings. No skips, load errors, timeouts or other failure classes. Every positive control completes with hard assertions.
- `pnpm -C runner exec tsc --noEmit -p .`: exit 0, including the touched file; `tmp-logs/q1a-fix-1-tsc.log`.
- `pnpm -C runner exec eslint test/q1-continuation.test.ts`: exit 0; `tmp-logs/q1a-fix-1-eslint.log`.
- Read-only `git diff --check`: pass. Existing-file byte preservation: pass. HEAD unchanged: pass.
- JSON assertion evidence: `tmp-logs/q1a-fix-1-reds.json`; whole-file log: `tmp-logs/q1a-fix-1-reds.log`.

The initial verification found two test-fixture mistakes (checksum reads and an evidence text lookup), both corrected before final delivery. The invalid-folder fixture initially retained an omitted clear sibling, which held the entire pile and masked the review finding; it now reproduces the normal continuation with clear siblings already filed. No existing assertions were edited or weakened.
No test/ruling contradiction was found. Production fixes, full check/e2e, Q1b/Q1c, commits and integration remain outside this authorized red-only round.


## Fix round 1

2026-10-10. Codex implementer; base HEAD `5befaeea5add585812acc21acec0584f002bfbdc`.
Implemented all seven Blocking findings from the assigned adversarial review in the existing mechanisms.
No network, writing git command, test edit, golden edit, fingerprint edit, new store or new counter.
The coordinator owns commits and integration. Production and these notes remain uncommitted.

Rulings read: TL-P4-44 and DECISIONS addenda 1–2; addendum 3 is the supplied zero-read first-listing /
questions-read subscription ruling preserved by the committed reds and the earlier notes above.
The local DECISIONS still has no addendum 3 entry. No first-listing, cache or subscription contract changed.
Offline research reused the local subject/open-question policy, stored choices, capture/decide/build lifecycle,
and answersShown typed-data boundary. References remain [TypeScript discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions),
[Tolerant Reader](https://martinfowler.com/bliki/TolerantReader.html), and the existing
[stable request identity pattern](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).
No online verification is claimed.

### Seven findings resolved

| Finding / exact fix-red name | Production rule and evidence |
| --- | --- |
| `Q1a fix 1.1: second-answer placement precedes exhaustion after an unresolved second answer` | The planner holds only durable exhaustion during placement, suppresses askings past count two, and exhausts an unresolved answered second asking before incrementing fresh askings. Successful second-answer filing is considered first for both thing and pile; writing asking two alone never exhausts. |
| `Q1a fix 1.2: instructions scope preserves inbox counters and exhausted subjects without a third asking` | Instructions scope has not observed any inbox departure or words change; it retains rounds unchanged and cannot mark inbox exhaustion. Both active and exhausted histories survive the state-only answer and later all-scope run. |
| `Q1a fix 1.3: pile and member share two rounds and only changed words permit another asking` | The existing pile/member relation and nonempty reupload comparison now live in contracts/questions.ts. Dedup, round lookup and exhaustion use those rules. A subject switch increments the same record; a member asking retains its content evidence. Both switch directions exhaust without asking three and reset only after changed words. |
| `Q1a fix 1.4: a same-bytes reupload retains hash history through the planner and writes no asking` | Shared subjectPile locates the current inbox subject by id or a gone item's nonempty hash. Round retention, lookup, words reset and vault projection use that policy. Planner history survives an id replacement with identical bytes; different bytes start at count one. |
| `Q1a fix 1.5: missing or outside-root stored option folders cannot authorize alternative filing` | Existing chosen entries record unavailable destinations as null. Their presence restricts consent to the stored action; null holds the subject rather than delegating to the model. Valid consent still overrides model placement and uses the normal fences. No alternative item move is planned for either unavailable case. |
| `Q1a fix 1.6: words-only pile consent places its generated note in the chosen stored folder` | The same chosen map includes the pile's words. Its stored destination overrides d.words while retaining the model's note name. Stored consent cannot take the unrelated cited-line path; the generated operation derives from the answer through existing archive dependencies. Conflicting and matching model destinations both create one note in the chosen folder. |
| `Q1a fix 1.7: pending text from another pile never reaches this subject planner without provenance` | answersShown resolves the typed subject once and emits person text only with an admitted fileId or pileId. The unrelated journal remains admitted and pending as before, but its words never enter this model input. Own-subject text retains identity; legacy boolean inputs retain their bytes. |

### Test preservation and removed lines

removed: runner/src/claude.ts: 3 lines; anonymous text mapping replaced by subject-bound typed-data projection.
removed: src/data/contracts/questions.ts: 6 lines; exact-id-only rounds and separate projection relation replaced by shared subject policy.
removed: src/data/spine/scripted.ts: 34 lines; early exhaustion, blind inbox pruning, and permissive choice fallback replaced in the same planner.
removed: src/data/vault/drive-vault.ts: 3 lines; local id-only words-reset lookup uses shared subjectPile.
tests changed: none

Stored versions and shapes are unchanged. Rounds remain only in questions.json; chosen remains the existing
per-plan consent map. No manifest, checkpoint, report, journal, admission, scheduler or UI port was added.
Existing content checks, modifiedTime and stillAsSeen fences remain in the normal effect path.
Compatibility rows above remain drafts for review; this fix adds no stored schema requirement.

### Validation

Baseline whole Q1 file: 28 existing tests pass, all seven fix reds fail on their asserted defects;
`tmp-logs/q1a-fix-round-1-before.json` and `.log`. No load errors, timeouts or contract contradiction.
Final whole Q1 file: all 35 pass, including all seven fix reds and every original positive control;
`tmp-logs/q1a-fix-round-1-targeted-final.json` and `.log`.
Both runs use `--maxWorkers=2`, real production main and the existing in-process /process fixtures.
Only failures or aggregate result counts are read from test output.

| Command | Result / evidence |
| --- | --- |
| Whole Q1 reds and fix reds, `pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2` | 35/35 pass; `tmp-logs/q1a-fix-round-1-targeted-final.json`, `.log`. |
| `pnpm exec vitest run src/data --maxWorkers=2` | 4,141/4,141 pass; `tmp-logs/q1a-fix-round-1-data-final.json`, `.log`. |
| Runner suite, `pnpm -C runner exec vitest run --maxWorkers=2` | 591/591 pass; `tmp-logs/q1a-fix-round-1-runner-final.json`, `.log`. Includes corpus, unchanged Drive call goldens, raw/normalized model-input fingerprints, bounded reads and timing. |
| App tsc, `pnpm exec tsc -p tsconfig.app.json --noEmit` | Pass; `tmp-logs/q1a-fix-round-1-tsc-app-final.log`. |
| Node tsc, `pnpm exec tsc -p tsconfig.node.json --noEmit` | Pass; `tmp-logs/q1a-fix-round-1-tsc-node-final.log`. |
| Runner tsc, `pnpm -C runner exec tsc --noEmit -p .` | Pass; `tmp-logs/q1a-fix-round-1-tsc-runner-final.log`. |
| ESLint on the three touched app TS files | Pass; `tmp-logs/q1a-fix-round-1-eslint-app-final.log`. |
| Runner ESLint on `src/claude.ts` | Pass; `tmp-logs/q1a-fix-round-1-eslint-runner-final.log`. |
| `pnpm check`, existing heavy-run lock | Exit 1: whole app suite 5,465 pass / 22 fail; `tmp-logs/q1a-fix-round-1-check.log`, `tmp-logs/q1a-fix-round-1-check-app.json`. Full lint/typecheck passed before app tests; subsequent check stages were not reached. |
| App/capabilities/capabilities-b e2e, demo, existing heavy-run lock | Exit 1 before test cases: dev server listener EPERM on ::1:7047; `tmp-logs/q1a-fix-round-1-e2e-demo.log`. |
| App/capabilities/capabilities-b e2e, fake, existing heavy-run lock | Exit 1 before test cases: dev server listener EPERM on ::1:7047; `tmp-logs/q1a-fix-round-1-e2e-fake.log`. |
| Read-only `git diff --check`, test/golden/fingerprint diff, HEAD | Pass; no test/golden/fingerprint change; HEAD remains the base above. |

No Q1 test/ruling contradiction remains. The whole targeted suites completed, and every requested red,
legacy control, golden, fingerprint and data/runner test passed. No check mark or integration claim.
The full check's 22 failures are outside the assigned planner/subject/provenance mechanisms: 21 existing
harness-delivery tests returned codex-failed / unexpected exit 1, and the server-identity test timed out
with its local listener refused. Their exact failure evidence is listed below; no cause is inferred for
the harness-delivery failures from the generic Codex-failed message. Those tests and mechanisms are untouched.
The check's existing harness fixtures create temporary repositories; no git write was issued in this worktree.

### Whole-check failure ledger

Every failed assertion from the completed whole app suite is listed, including each parameterized case.
The suite prefix for the first 21 cases is `codex delivery entry point`; cases with identical printed
parameter titles are distinguished by occurrence order. These are gate failures, not Q1 contract contradictions.

| Test | File:line | Failure |
| --- | --- | --- |

| `codex delivery entry point commits a two-commit plan in order with implementer: codex` | `src/codex-run.test.ts:118` | Codex failed; unexpected exit 1. |
| `codex delivery entry point refuses guarded paths, secrets and addresses: guarded settings` | `src/codex-run.test.ts:145` | Codex failed; unexpected exit 1. |
| `codex delivery entry point refuses guarded paths, secrets and addresses: guarded script` | `src/codex-run.test.ts:145` | Codex failed; unexpected exit 1. |
| `codex delivery entry point refuses guarded paths, secrets and addresses: guarded environment` | `src/codex-run.test.ts:145` | Codex failed; unexpected exit 1. |
| `codex delivery entry point refuses guarded paths, secrets and addresses: secret` | `src/codex-run.test.ts:145` | Codex failed; unexpected exit 1. |
| `codex delivery entry point refuses guarded paths, secrets and addresses: address` | `src/codex-run.test.ts:145` | Codex failed; unexpected exit 1. |
| `codex delivery entry point validates the whole plan before changing HEAD ([ { message: 'one', files: [Array] } ]) [printed-title occurrence 1]` | `src/codex-run.test.ts:162` | AssertionError: expected 1 to be 3 // Object.is equality |
| `codex delivery entry point validates the whole plan before changing HEAD ([ { message: 'one', files: [Array] } ]) [printed-title occurrence 2]` | `src/codex-run.test.ts:162` | AssertionError: expected 1 to be 3 // Object.is equality |
| `codex delivery entry point validates the whole plan before changing HEAD ([ [Object], [Object] ]) [printed-title occurrence 1]` | `src/codex-run.test.ts:162` | AssertionError: expected 1 to be 3 // Object.is equality |
| `codex delivery entry point validates the whole plan before changing HEAD ([ [Object], [Object] ]) [printed-title occurrence 2]` | `src/codex-run.test.ts:162` | AssertionError: expected 1 to be 3 // Object.is equality |
| `codex delivery entry point validates the whole plan before changing HEAD ([ { message: 'one', files: [Array] } ]) [printed-title occurrence 3]` | `src/codex-run.test.ts:162` | AssertionError: expected 1 to be 3 // Object.is equality |
| `codex delivery entry point validates the whole plan before changing HEAD ([ { message: '', files: [ 'a.txt' ] } ]) [printed-title occurrence 1]` | `src/codex-run.test.ts:162` | AssertionError: expected 1 to be 3 // Object.is equality |
| `codex delivery entry point validates the whole plan before changing HEAD (not json) [printed-title occurrence 1]` | `src/codex-run.test.ts:162` | AssertionError: expected 1 to be 3 // Object.is equality |
| `codex delivery entry point appends the last usage in column order and captures the JSON stream` | `src/codex-run.test.ts:170` | Codex failed; unexpected exit 1. |
| `codex delivery entry point read-only writes the card without committing or running gates` | `src/codex-run.test.ts:183` | Codex failed; unexpected exit 1. |
| `codex delivery entry point without a plan commits edits, additions and deletions once` | `src/codex-run.test.ts:193` | Codex failed; unexpected exit 1. |
| `codex delivery entry point never commits the plan file, even when a previous plan is tracked` | `src/codex-run.test.ts:206` | Codex failed; unexpected exit 1. |
| `codex delivery entry point records gate exits and runs both e2e sources ({ check: 1 })` | `src/codex-run.test.ts:221` | AssertionError: expected 'status: codex-failed\nbranch: worker\…' to contain 'status: check-failed' |
| `codex delivery entry point records gate exits and runs both e2e sources ({ e2e: 1 })` | `src/codex-run.test.ts:221` | AssertionError: expected 'status: codex-failed\nbranch: worker\…' to contain 'status: e2e-failed' |
| `codex delivery entry point records gate exits and runs both e2e sources ({ 'e2e:fake': 1 })` | `src/codex-run.test.ts:221` | AssertionError: expected 'status: codex-failed\nbranch: worker\…' to contain 'status: e2e-failed' |
| `codex delivery entry point records gate exits and runs both e2e sources ({})` | `src/codex-run.test.ts:220` | Codex failed; unexpected exit 1. |
| `the e2e port and server identity a server from another worktree is never reused` | `src/e2e-port.test.ts:37` | Error: Test timed out in 5000ms. |

Full gate repair outside this entry, Q1c live publication, Q1b UI, which-note, B12, commits and integration
remain left out. All seven requested production repairs are complete and reviewable in this worktree.

Final status: implementation complete; full gate verification blocked by the 22 whole-check failures above
and sandbox listener EPERM for both e2e sources. No permission escalation or alternate heavy-run lock was used.
The existing global heavy-run lock was respected; both e2e attempts and the full check ran to completion.
No additional run is needed to reproduce the unchanged listener refusal, and no gate success is claimed.

## Fix round 2

2026-10-10. Continued the escalated entry at supplied HEAD
`e149f63cb81bf2a7f7b249dc6d7ad24f03b1b674`, with committed Red repair 4.
Status: the addendum 4 acceptance contract and all requested regression checks pass.
No production repair was necessary: the complete baseline Q1 file already passes 36/36.
This agrees with Red repair 4's recorded green result; no new failing assertion is claimed.
Only this appendix was edited. The coordinator owns commits and integration.
No network, writing git command, test edit, golden edit, fingerprint edit or new store was used.

Read WORKER, the packet, TL-P4-44, DECISIONS addenda 1–2, all notes (including supplied
addendum 3 and Red repair 4's addendum 4 contract), and the seven-finding adversarial review.
Addenda 3–4 are still supplied through these notes rather than this checkout's DECISIONS.

### Existing mechanism and acceptance evidence

- `src/data/spine/scripted.ts:711–721` resolves the selected stored action through its folder id,
  then obtains that folder's current path in the existing index. Renaming Home to Room or moving
  Home from Areas to Projects keeps the same destination id. Normal move fences preserve item bytes.
- The same chosen map records an unavailable destination as null and holds its subject without
  alternative placement, asking or copying in that continuation. The existing answered-asking
  closure removes that answered card; no new asking means the existing round stays at one.
- On the next run, the existing candidate builder (`runner/src/claude.ts:440–442`) uses the current
  listing. The existing asking and round-history path writes one newer asking with current options,
  excludes the gone folder, and advances the same history to round two. Nothing stores a second counter.
- Both exact acceptance tests pass through production main, answerQuestion and the real /process fixture:
  `Q1a fix 1.5: missing or outside-root stored option folders cannot authorize alternative filing`
  and `Q1a fix 1.5b: a gone option folder leaves the item waiting and the next run asks again as the next round`.
  The first covers ordinary/valid filing, rename, allowed-root move, gone and outside controls.
  The second preserves the original item evidence and verifies checksum-matching files contain
  only its original id after both the gone continuation and the fresh next-round asking.

Offline research reused these existing local mechanisms and the packet's established references:
[TypeScript discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions),
[Tolerant Reader](https://martinfowler.com/bliki/TolerantReader.html), and
[stable request identity](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).
No online verification is claimed. Existing stored schemas, journal identity, consent, fences,
rounds, asking path and subscription timing remain unchanged.

removed: none (zero production or notes lines removed).
tests changed: none

### Validation

All output is under `tmp-logs/`; only failed assertions and aggregate results were read.
All requested suites ran to completion with `--maxWorkers=2`. No failures, skips, load errors,
timeouts or test/ruling contradictions were found; the TL-P4-51 contradiction ledger is empty.

| Command | Result / evidence |
| --- | --- |
| Q1 reds: `TMPDIR=/private/tmp/bower-q1a-stored-answers/tmp-logs pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2` | 36/36 pass before changes; `tmp-logs/q1a-fix-round-2-before.json`, `.log`. |
| `pnpm exec vitest run src/data --maxWorkers=2` | 4,141/4,141 pass; `tmp-logs/q1a-fix-round-2-data.json`, `.log`. |
| `TMPDIR=/private/tmp/bower-q1a-stored-answers/tmp-logs pnpm -C runner exec vitest run --maxWorkers=2` | 592/592 pass; `tmp-logs/q1a-fix-round-2-runner.json`, `.log`. Includes corpus, Drive call goldens, raw/normalized fingerprints, bounded reads and timing. |
| `pnpm exec tsc --noEmit -p tsconfig.app.json` | Exit 0; `tmp-logs/q1a-fix-round-2-tsc-app.log`. |
| `pnpm exec tsc --noEmit -p tsconfig.node.json` | Exit 0; `tmp-logs/q1a-fix-round-2-tsc-node.log`. |
| `pnpm -C runner exec tsc --noEmit -p .` | Exit 0; `tmp-logs/q1a-fix-round-2-tsc-runner.log`. |
| `pnpm exec eslint src/data/spine/scripted.ts src/data/contracts/questions.ts src/data/vault/drive-vault.ts` | Exit 0; `tmp-logs/q1a-fix-round-2-eslint-app.log`. |
| `pnpm -C runner exec eslint src/claude.ts` | Exit 0; `tmp-logs/q1a-fix-round-2-eslint-runner.log`. |

There are no touched TypeScript files in this round; ESLint additionally verifies the four production
files from fix round 1. Read-only diff checks confirm no production, test, golden or fingerprint change.
HEAD remains unchanged. Generated evidence stays under the untracked `tmp-logs/` directory.
The sole tracked change is this notes appendix.

`pnpm check` and e2e are not repeated for unchanged production/screens. Their previously recorded
whole-check failures and local-listener refusals remain recorded under Fix round 1; no full-gate mark
or e2e success is claimed here. This round completes the user's requested checks.
Left out: Q1c live publication, Q1b UI, which-note, B12, full-gate repair, commits and integration.

## Fix round 3 reds

2026-10-10. Codex red owner; lead-approved class sweep, TL-P4-44 addendum 5 and TL-P4-51.
Production HEAD: `5befca27ad87ab9f06c62b4a6620aef4b8c2e983`, unchanged throughout this session.
Read WORKER, the packet, these notes and the pass-2 adversarial review (BLOCK 3).
Applied the supplied addendum 5: rounds/exhaustion belong to members; a pile asking counts for each
waiting member it covers; the pile count is their maximum; exhausted members alone are held.
Clear existing and later siblings file with unchanged words. Unavailable-folder consent keeps its
subject waiting for the next run's new asking, before any model placement.
Addendum 5 is supplied by the owner and is not claimed present in this checkout's DECISIONS.
The coordinator owns commits. Only the assigned test additions and this requested appendix were edited.
No network, writing git command, production change, corpus addition, counter seed or real timer was used.

tests changed: runner/test/q1-continuation.test.ts: add one production-path red and positive control per BLOCK-3 finding under TL-P4-44 addendum 5; preserve every existing assertion and bound.
removed: none. Removing only the newly inserted describe block reconstructs HEAD's test file byte for byte.

### Exact names and observed HEAD failures

1. `Q1a fix 3.1: unavailable chosen folders force a new asking before next-tidy model placement`

   Main creates asking one; answerQuestion and the real /process accept its generated Home option.
   Covers both Home binned and Home moved under Inbox. The answer continuation holds the original
   item, writes no asking and keeps count one. The next ordinary tidy receives a valid Job hunt
   placement, with no asking supplied by the model. It must write a newer asking/count two and leave
   the item evidence unchanged, with no item move in its manifest and no expired folder option.
   Positive control: available Home consent overrides that same valid Job hunt proposal and preserves bytes.
   Observed failure at `runner/test/q1-continuation.test.ts:1297`: both unavailable cases write no asking,
   instead moving the item into Job hunt. New-identity, count-two, unchanged-evidence and no-move assertions
   also fail for the same defect. Both continuation holds and the available-folder control pass.

2. `Q1a fix 3.2: mixed member histories cap pile askings and count only the waiting member`

   Main generates both member histories in one unchanged pile: A is Unclear, B is Clear.
   A's unanswered asking remains open while B receives and answers two askings without a place.
   The fixture repeats A's open asking in those replies so the provider's omitted-item safety cannot
   mask the round-cap defect. Hard assertions establish A=count one and B=count two/exhausted before
   answering A. A pile-level model asking must now be restricted to A; it cannot ask B a third time.
   A reaches count two, B retains its exhausted count two, and an unchanged rerun keeps only A waiting.
   Positive control: switching a sole waiting member's first asking to a pile asking writes round two.
   Observed failure at `runner/test/q1-continuation.test.ts:1356`: main writes `q-ask-pile-mixed`, covering
   exhausted B a third time. The unchanged rerun retains that pile card. The mixed-history setup,
   A's increment, B's retained exhausted history, original words and B's evidence all pass.

3. `Q1a fix 3.3: exhausted members stay untouched while existing and later clear siblings file`

   Main exhausts the unclear member through two actual asking/answer runs. Its existing clear sibling
   returns to the unchanged pile, and a later clear sibling is added after the next tidy.
   Both runs propose valid placements, including the exhausted member, so an omitted model decision
   cannot hold the fixture before the exhaustion policy is reached. Replies include only currently
   admitted ids, allowing the second run after the existing sibling has correctly left.
   Each clear sibling must file with unchanged bytes; the exhausted member's full evidence, history,
   absent third asking and original pile words must remain unchanged across both runs.
   Positive control: the same ordinary placements file both members when neither is exhausted.
   Observed failures at `runner/test/q1-continuation.test.ts:1398` and `:1411`: both clear siblings stay
   under the inbox pile instead of Home. The ordinary control and every exhausted-member hold pass.

### TL-P4-51 class sweep

Searched test/spec files for exhaustion, round histories, pile askings, whole-pile holding, siblings
and untouched piles. Search evidence: `tmp-logs/q1a-fix-3-class-sweep.txt`,
`tmp-logs/q1a-fix-3-holding-sweep.txt`, `tmp-logs/q1a-fix-3-member-sweep.txt`;
the test-file inventory is `tmp-logs/q1a-fix-3-test-inventory.txt`.
No existing test assertion contradicting addendum 5 was found; none was edited.

- `runner/test/q1-continuation.test.ts:534`, `:950`, `:1022`: pile/member round-switch cases leave
  only one content member in the pile. Their single count-two history remains compatible with member rounds.
  Fix 1.3's title/comment says "shared counter", but its sole-member assertion does not require a
  counter shared between different members. It remains unchanged for the coordinator's review.
- `runner/test/q1-continuation.test.ts:787`: exhausted pile projection with a newly waiting sibling
  explicitly expects waiting to win. It does not require that clear siblings be held.
- `runner/test/claude-provider.test.ts:520`, whole-pile holding assertion at `:557`: its omitted-item
  fixture has no exhaustion history. It tests missing model proposals, not member exhaustion.
- `runner/test/per-thing-ask.test.ts:59`: explicitly files the rest of a pile beside a waiting member.
  Remaining holding matches concern readiness, unreadable notes, missing uploads, races or pending edits,
  rather than exhaustion after answers. Those established bounds and assertions remain untouched.

### Validation

Final whole-file command (exit 1 is the requested red result):

```sh
TMPDIR=/private/tmp/bower-q1a-stored-answers/tmp-logs pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2 --reporter=json --outputFile=../tmp-logs/q1a-fix-3-reds.json > tmp-logs/q1a-fix-3-reds.log 2>&1
```

- Whole Q1 file: 39 tests; all 36 existing tests pass; all three new reds fail for their stated findings.
  All positive controls and fixture prerequisites pass. Failures are AssertionError only, with no skips,
  load errors, timeouts or uncaught errors. Logs: `tmp-logs/q1a-fix-3-reds.json` and `.log`.
- Runner tsc: pass; `tmp-logs/q1a-fix-3-tsc.log`.
- Touched-test ESLint: pass; `tmp-logs/q1a-fix-3-eslint.log`.
- Read-only preservation comparison and `git diff --check`: pass; no production diff; HEAD unchanged.

Initial fixture verification corrected an evidence text lookup and member ordering, then repeated
the still-open A asking to avoid unrelated omitted-item holding. The final reds reach all three defects;
no existing assertion or bound changed during those corrections.
Offline research reuses the established production-main/in-process route fixtures and existing references
under Research, including [Hono testing](https://hono.dev/docs/guides/testing), tagged unions, tolerant
readers and stable request identity. No online verification or new execution mechanism is claimed.
Left out: production repairs, full check/e2e, commits and integration; this is the authorized red-only round.


## Fix round 3

2026-10-10. Codex implementer; supplied HEAD `c72e4fa2c7ddbbba83e227416658077566db3db3`.
Implemented the lead-approved final class sweep, TL-P4-44 addendum 5, in the existing question
identity, round lookup and scripted planner. Read WORKER, the packet, both adversarial reviews,
and all these notes, including the supplied addendum 5 under Fix round 3 reds.
The coordinator owns commits and integration. No network or writing git command was issued.
No test, fixture, golden, fingerprint, dependency, UI, admission, scheduler or journal format was edited.

### Rules and existing homes

- `contracts/questions.ts`: `roundFor` returns the largest matching member count, with durable
  exhaustion winning equal counts. Different members remain different subjects. `subjectMembers`
  resolves today's covered members through the existing id/nonempty-reupload policy, excluding
  the context note; words alone keep their own identity. A pile card covers its current members,
  without a frozen member list. Pile projection also shows a refused destination as waiting.
- `spine/scripted.ts`: retained legacy pile histories are projected onto their covered members,
  with the strongest history retained per member. New pile askings increment each covered waiting
  member exactly once through the existing fresh-asking write. A mixed pile asking becomes member
  cards for the eligible members; it cannot cover an exhausted member or extend a count past two.
  An answered second asking settles each member separately, after valid placement is considered.
  Exhaustion alone never holds clear existing or later siblings. Changed words, departure,
  instructions scope, retry, save recovery and reupload keep their established meanings.
- An unavailable-folder answer holds the continuation and removes its answered card, without a
  replacement asking or a new round. The same member's existing round retains that asking in
  optional `reask` until the next run saves a fresh asking. That pending state prevents model
  placement and merge, and survives archiving of the original answer. A current model asking
  supplies current options; otherwise the saved model wording is reused without expired actions.
  Saving the next asking clears `reask` and increments the same count. An unresolved second answer
  exhausts instead. Older stored askings without history retain their already-written first asking.
  The provider's omitted-item hold cannot suppress this required re-ask; omitted siblings still wait.
- Optional `wordsOnly` distinguishes a words-only member from things added later, so its history
  cannot exhaust new clear siblings. It is identity information in the same round, not another count.
  The owning questions-file validator in `vault/layout.ts` accepts both optional fields; no new
  file, store, counter, version, writer or effect path was added. All writes and moves still use
  their existing modifiedTime, content and stillAsSeen fences.

Offline research reused the established mechanisms and sources read in the packet/prep and these notes:
[TypeScript discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions),
[Tolerant Reader](https://martinfowler.com/bliki/TolerantReader.html), and
[stable request identity](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).
These are carried local references, not claims of online verification.

removed: src/data/contracts/questions.ts: 4 lines; first-match lookup and old round declaration replaced.
removed: src/data/spine/scripted.ts: 32 lines; whole-pile exhaustion and shared increments replaced by member rules.
removed: src/data/vault/layout.ts: 1 line; existing round validator accepts the optional identity and re-ask fields.
removed: notes: none (append only).
tests changed: none

### Compatibility row draft (review pending)

| Boundary | Preserved meaning | Additive evidence / draft disposition |
| --- | --- | --- |
| `contracts/questions.ts`, `vault/layout.ts`, questions.json v1 | Old questions and rounds remain readable; missing optional fields retain legacy interpretation. No version or required field changes. Old yes/no, state/pair/folder and report fields are unchanged. | Rounds remain in the same questions file, per member, with a pile lookup returning their maximum. Optional `reask` uses the existing question validator; optional `wordsOnly` preserves words-member identity across new arrivals. All 39 Q1 tests, 4,141 data tests and 595 runner tests pass, including P2 readers, earlier reds, corpus, goldens and fingerprints. Draft only; coordinator/reviewer acceptance pending. |

### Validation and TL-P4-51

All requested test suites completed with `--maxWorkers=2`; all output is under `tmp-logs/`.
Only failed assertions/diagnostics and aggregate results were read. No tests were weakened or changed.
The whole targeted sweep found no test/ruling contradiction; the TL-P4-51 contradiction ledger is empty.

| Command | Result / evidence |
| --- | --- |
| Q1 baseline, `pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2` | 36 pass / 3 fail of 39; the exact fix 3.1, 3.2 and 3.3 assertion failures in the committed reds reproduced. `tmp-logs/q1a-fix-round-3-before.json`, `.log`. |
| Q1 final, same command | 39/39 pass; `tmp-logs/q1a-fix-round-3-reds-final.json`, `.log`. |
| `pnpm exec vitest run src/data --maxWorkers=2` | 4,141/4,141 pass; `tmp-logs/q1a-fix-round-3-data-final.json`, `.log`. |
| `pnpm -C runner exec vitest run --maxWorkers=2` | 595/595 pass; `tmp-logs/q1a-fix-round-3-runner-final.json`, `.log`. Includes corpus, unchanged Drive call goldens, raw/normalized fingerprints and earlier reds. |
| `pnpm exec tsc --noEmit -p tsconfig.app.json` | Pass; `tmp-logs/q1a-fix-round-3-tsc-app-final.log`. |
| `pnpm exec tsc --noEmit -p tsconfig.node.json` | Pass; `tmp-logs/q1a-fix-round-3-tsc-node.log`. |
| `pnpm -C runner exec tsc --noEmit -p .` | Pass; `tmp-logs/q1a-fix-round-3-tsc-runner.log`. |
| ESLint on questions.ts, scripted.ts and layout.ts | Pass; `tmp-logs/q1a-fix-round-3-eslint-final.log`. |
| Read-only preservation/diff checks | No test/golden/fingerprint diff; `git diff --check` passes. HEAD unchanged. |

Intermediate implementation diagnostics were corrected before the final checks: the stored-question
fallback initially exposed stored options to the planner's differently shaped Ask type. It now projects
only saved wording, keeping expired action consent out of the new asking. The intermediate runner run
also failed `runner/test/new-instance.test.ts:137` (second invocation had three commits instead of two)
while source edits overlapped its runner rebuild. Both completed runs with stable source passed all 595
runner tests, including that unchanged test. No fixture repair or assertion change was made.

The first extra `pnpm check` waited for the existing global heavy-run lock, then failed in whole-tree
ESLint before collecting tests: ENOENT reading a transient fixture's `dist/assets/index.js` under
`tmp-logs/bower-deploy-4D8ReJ/repo`. It overlapped the requested suites' temporary fixture lifecycle.
Evidence: `tmp-logs/q1a-fix-round-3-check.log`. A serial full-check retry follows the completed suites;
its result is recorded below. No alternate lock, gate configuration change or success mark is claimed.
No screen was touched (`ui: false`); no new screen e2e is claimed. Earlier full-gate/listener failures
remain recorded above. Q1c publication, Q1b UI, which-note, B12, commits and integration remain left out.


### Serial whole-check result and owning fix

The serial `pnpm check` acquired the existing lock and passed full lint/typecheck, then completed
the whole app suite: 5,484 pass / 3 fail of 5,487. Exit 1; later check stages were not reached.
Logs: `tmp-logs/q1a-fix-round-3-check-final.log`, `tmp-logs/q1a-fix-round-3-check-app.json`.
Every failed test is listed below. These are gate failures, not test/ruling contradictions.

| Exact test | File:line | Outcome |
| --- | --- | --- |
| `the shape of the code > the shared core > contracts import only themselves and allowlisted pure libraries` | `src/architecture.test.ts:154` | The new context-name import from data/piles crossed the pure-contract boundary. Repaired in the owning subject policy: subjectMembers receives the existing PILE_NOTE constant from its planner caller; no constant was copied, moved or added. The contracts now import only contracts. Targeted architecture result follows below. |
| `the e2e port and server identity > a server from another worktree is never reused` | `src/e2e-port.test.ts:37` | Local listener EPERM on 127.0.0.1, then timeout; the same sandbox limitation previously recorded. |
| `TL-P4-28(2): compensating Undo preserves FIFO and the Drive-only person-state oracle (random batch 3)` | `src/data/vault/undo-compensate.property.test.ts:623` (FIFO assertion `:128`) | Failed after 28 runs, seed 96466243, path 27: two newer journal lines passed an older line. The complete command counterexample is in the check log. This Undo/journal mechanism and its test are unchanged; no cause is inferred from the random property result. Requested complete data suites passed before this whole-check run and are repeated after the architecture repair. |

An unhandled listener EPERM belongs to the same e2e-port test. No unrelated gate repair or test edit
was made. The full check is not rerun after its confirmed listener refusal; the owning architecture
repair, all requested suites, typechecks and touched-file lint are verified on the final source instead.
No full-check mark, e2e success or integration is claimed.


Final verification after the pure-contract repair: Q1 39/39, data 4,141/4,141, runner 595/595,
and architecture 7/7 pass. App/node/runner tsc and touched-file ESLint all pass with no diagnostics.
The final data run includes the unchanged Undo property test and passes; its separate full-check
counterexample remains recorded above. There are no Q1 or earlier-red failures and no ruling
contradictions. Architecture evidence: `tmp-logs/q1a-fix-round-3-architecture.json`, `.log`.
All final requested evidence uses the `q1a-fix-round-3-*-final` paths in the validation table.
Read-only diff checks again show only the three owning production files and this notes appendix;
no test, golden or fingerprint change, no whitespace error, and HEAD unchanged.
Implementation and the requested verification are complete. The full-check failures above prevent
claiming a green whole gate; no acceptance, commit or integration is claimed.

## Fix round 4 reds

2026-10-10. Codex red owner; HEAD `a6bcf8a2d6b43ee062b9b9f702e4dc2d01463b46`.
Read WORKER, these notes and adversarial pass 3, BLOCK 1. Scope is the lead-approved narrow
unavailable-folder re-ask pin, within TL-P4-44 addendum 5. No network, production edits or git writes.
The coordinator owns commits. Existing tests, assertions and bounds are preserved byte for byte.

tests changed: runner/test/q1-continuation.test.ts: added loose-Inbox unavailable-folder reds and a three-path class table; no existing tests changed.
removed: none

Exact added test names:

- `Q1a fix 4.1: a loose Inbox file whose chosen folder is gone is asked again as the next round`
- `Q1a fix 4.2: every member-subject path re-asks once after an unavailable folder: folder member`
- `Q1a fix 4.2: every member-subject path re-asks once after an unavailable folder: loose Inbox file`
- `Q1a fix 4.2: every member-subject path re-asks once after an unavailable folder: words-only pile`

All paths use the existing real /process, answerQuestion and runner main fixtures. Main writes the
first option asking and its round history; the person chooses Home by stored option id, then Home
is binned before the continuation. That continuation leaves the member untouched, removes its
answered asking and retains count one. The next tidy proposes a valid placement in Job hunt without
an asking. It must instead write a fresh asking for the same subject, count two, plan no alternative
move or generated note, and preserve the member's evidence. A subsequent no-op tidy must retain
exactly that asking and count two. The words-only row uses its context note as evidence; the loose
row explicitly checks that the content file is directly in Inbox, outside the pile folder.

Observed at HEAD: both loose-file cases fail with AssertionError at
`runner/test/q1-continuation.test.ts:1470` (no asking, actual `[]`), `:1471` (no fresh askedAt),
`:1473` (no round two), and `:1485` (still no round two on the no-op tidy).
Their continuation prerequisites, held-file evidence and absence of alternative moves all pass.
The folder-member and words-only rows pass, pinning the other member-subject paths once each.
This reproduces pass-3 BLOCK 1 rather than a loading error, timeout or invalid fixture.

Final targeted command (exit 1 is the requested red outcome):

```sh
TMPDIR=/private/tmp/bower-q1a-stored-answers/tmp-logs pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2 --reporter=json --outputFile=../tmp-logs/q1a-fix-4-reds.json > tmp-logs/q1a-fix-4-reds.log 2>&1
```

- Whole file: 43 tests, 41 pass, 2 fail, zero skips. All 39 pre-existing tests pass.
  Only the two new loose-file cases fail, for the reported missing re-ask and round-two assertions.
- Runner tsc and touched-test ESLint pass with no diagnostics.
- Read-only preservation comparison confirms the entire original test file is unchanged outside
  the inserted round-4 block. `git diff --check` passes; no production diff; HEAD unchanged.
- Only failure messages and aggregate results were read. The test log, JSON report and generated
  fixtures were written under `tmp-logs/` and deleted before delivery as requested.
- Initial fixture verification repeated a placement after the replacement asking and exposed
  unrelated placement behaviour. The final fourth run is an explicit no-op model reply, isolating
  the one-re-ask/count-two invariant. No assertion or bound was removed or loosened.

Offline research reuses the existing production-main/in-process fixtures and the established
[Hono testing](https://hono.dev/docs/guides/testing) reference already recorded under Research.
No new execution driver, store or counter is added. No test/ruling contradiction was found.
Left out: implementation, full check/e2e, commits and integration; this is the authorized red-only round.

## Fix round 4

2026-10-10. Codex implementer; supplied HEAD `c94b6be42bc104ddd9a5e8e3147fa6f0a0e03a7f`.
Read WORKER, the assigned packet, these notes and adversarial pass 3, BLOCK 1.
Applied the lead-approved narrow loose-Inbox unavailable-folder re-ask fix in scripted.ts.
The coordinator owns commits. No network or writing git command was issued.

The pile-asking fallback now uses the existing subjectMembers policy: a loose Inbox file,
like words alone, is its own member subject and can reuse its retained re-ask wording.
The member-asking caller also admits a loose file through the existing d.thingAsk path.
The existing chosen/reask placement and merge guards keep it untouched before its new asking.
The existing fresh-asking write advances the same durable member history to count two and
clears reask; the unchanged tidy retains that asking without another increment.
No new store, counter, writer, schema, scheduler, model-input format or effect path was added.
Folder members and words-only piles keep their existing subject and asking paths.

Offline research reused subjectMembers, roundFor, the Decisions asking wrapper and the
fresh-asking writer, plus the local [TypeScript discriminated-union reference](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
already cited in questions.ts and these notes. No online verification is claimed.

removed: src/data/spine/scripted.ts: 2 lines; content-presence fallback and loose-member suppression replaced.
removed: notes: none (append only).
tests changed: none

### Validation and TL-P4-51

All requested test suites ran to completion with --maxWorkers=2. Output and generated fixtures
were under tmp-logs/; only failures and aggregate results were read. The baseline reproduced
both committed loose-file reds at runner/test/q1-continuation.test.ts:1470, :1471, :1473 and :1485.
There are no remaining test/ruling contradictions; the complete requested sweep is green.

| Command | Result |
| --- | --- |
| Q1 baseline: `pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2` | 41 pass / 2 fail of 43. Only fix 4.1 and the fix 4.2 loose-Inbox row fail on missing re-asking/round two. |
| Q1 final: same command | 43/43 pass, including `Q1a fix 4.1: a loose Inbox file whose chosen folder is gone is asked again as the next round` and every `Q1a fix 4.2: every member-subject path re-asks once after an unavailable folder` row. |
| `pnpm exec vitest run src/data --maxWorkers=2` | 4,141/4,141 pass. |
| `pnpm -C runner exec vitest run --maxWorkers=2` | 599/599 pass, including corpus, Drive call goldens and raw/normalized model-input fingerprints. |
| `pnpm exec tsc --noEmit -p tsconfig.app.json` | Pass, no diagnostics. |
| `pnpm exec tsc --noEmit -p tsconfig.node.json` | Pass, no diagnostics. |
| `pnpm -C runner exec tsc --noEmit -p .` | Pass, no diagnostics. |
| `pnpm exec eslint src/data/spine/scripted.ts` | Pass, no diagnostics. |
| Read-only preservation/diff checks | Only scripted.ts and this notes appendix changed; tests, fixtures, goldens and fingerprints unchanged. No whitespace errors; HEAD unchanged. |

Evidence used the q1a-fix-round-4-before, -q1, -data and -runner JSON/log files, plus the
-tsc-app, -tsc-node, -tsc-runner and -eslint logs. All tmp-logs/ output and generated fixtures
were deleted before delivery as requested; durable results remain in this appendix.
No screen was touched (ui: false). Full check/e2e were not repeated in this narrow round;
the previous whole-gate failures and listener refusals remain recorded under Fix round 3.
No full-check mark, acceptance, commit or integration is claimed.
Left out: full-gate repair, Q1b/Q1c, which-note, B12, commits and integration.

## Known-green close (coordinator)

The fix (ddfba738) was followed by fix rounds 1-3 and fix 4 on the same lines of scripted.ts, questions.ts and drive-vault.ts, so done.sh cannot revert it cleanly. The reds are proved at their commits: the Q1a reds failed at da758af6 as assertions (Reds section), and each fix round committed reds that failed at their HEAD (fix 1.1-1.7, fix 3.1-3.3, fix 4.1-4.2; this notes file). After: Q1 43/43, data 4141, runner 599; pnpm check green; e2e app/capabilities demo 35 and fake 59; Codex passes 1-3 (last BLOCK fixed by fix 4); P4-100 PASS.

tests changed: runner/test/q1-continuation.test.ts: test hygiene (coordinator, after integration): the event file and failure logs go to the OS temp folder, not the repo's tmp-logs/, which dirtied the main checkout and blocked done.sh; no assertion changed.
