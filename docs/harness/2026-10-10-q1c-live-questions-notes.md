# Q1c live questions — red delivery

implementer: codex

Entry: q1c-live-questions. Red owner only; tests and notes, no implementation.
Worktree: /private/tmp/bower-q1c-live-questions; branch q1c-live-questions.
HEAD: 9bf011f00112444db84630e53ffc98ff43062057. No git write, commit, push, port binding or network call.

## Standards

Offline references, not fetched in this session: [HTTP validators / ETags, RFC 9110 §8.8.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.3)
and [Kafka delivery semantics / idempotent production](https://kafka.apache.org/documentation/#semantics).
A version identifies a whole representation; request sequence identifies a replay. The app's monotonic revision
and the runner's attempt/seq fences already implement those roles: reuse them rather than add a channel.
Local evidence read: runner/src/status.ts (request retry and sequence recovery), api/src/person.ts (runnerReport's
transaction, duplicate-sequence no-op and raiseRevision), src/data/live/runs.ts (one accepted revision and poll).
The tests use these production entry points, WorkerHttp, makeLiveSources, main and createApp().request.
No new production export is imported, so none of these reds can fail because a proposed export is absent.

## Ruling coverage

| Ruling | Red and positive control |
| --- | --- |
| Contract 1 / Q2 publication point | Main's persisted manifest contains the exact asking id/text/time while a controlled clear effect is held; public status already holds the question. The waiting file's metadata and bytes are unchanged; releasing the clear effect completes the run and files the clear sibling. One whole validated model reply, no model streaming callback. |
| Contract 2 / snapshot | API full replacement, empty replacement, no-op snapshot, same-phase revision without phaseAt, duplicate/lost response, seq/attempt/ticket/run fences, takeover and fresh Person, malformed shapes, ten-card/200-character/40-character/64 KiB bounds. Every API case first accepts an old report and GET /status. |
| Contract 3 / merge | Actual live sources merge by id plus askedAt, with Drive winning at handoff, later askings remaining distinct, journal suppression of answers and no resurrection. HTTP snapshots exercise revision/run/folder/session fences; an existing stored question is the positive control. |
| Contract 4 / channel | Vault subscriber hears status changes; one existing four-second poll, no additional listing per poll, replace-to-empty retains unrelated stored questions. API accepts public option id/label projection and refuses a stored action. No new question store or transport is introduced by the tests. |
| Contract 5 / additive compatibility | Existing P2 questions through DriveVault; P2 manifests, checkpoints and report through their existing readers; old GET /status through WorkerHttp/LiveRuns. API omission of questions retains a previously accepted snapshot. |
| Addendum 1 / backend portions | Asking order, one source after an answer, old snapshot cannot restore the card, options/shown update survive status reconnect. Questions from an older run remain on Home alongside the current snapshot. |
| Addendum 2 / backend portion | A stored text answer to an inbox thing or pile yes/no asking filters that asking from live questions; round two remains open. The same merge assertion covers boolean and option answers. |

The packet is ui:false. Addendum 1's sheet-title focus, earliest-this-run sheet renderer and N-more count,
Textarea/no-maxLength/over-limit error, and addendum 2's Something else and Cancel layout are Q1b's screen reds.
The 1,000-character answer admission belongs to Q1a. Q1c does not assert those unlanded UI/admission promises.
Q1a's packet supplies the additive boolean/{option:id}/{text} answer values and asking id+askedAt.
Tests seed journal records with questionId, askedAt and answer; public options contain id and label only.
They assert Q1c's merge or public snapshot, never execution of a stored file-to action or Q1a's answer admission.
The full stored action appears only as intentionally invalid status input in the API rejection row.

## Reds

Each executed test below failed as an AssertionError at HEAD, not a load error. All earlier controls passed.
The first main red additionally runs its released-job controls in finally, even when the snapshot assertion fails.

| Exact test name | File | HEAD reason |
| --- | --- | --- |
| `Q1c q1-live-question-before-clear-effects-end: durable publication` | `runner/test/q1-continuation.test.ts` | Public status questions is undefined; expected the persisted asking. |
| `Q1c q1-live-question-before-clear-effects-end: same-run recovery republishes without a second model reply` | `runner/test/q1-continuation.test.ts` | Public status questions is undefined; expected the persisted asking. |
| `Q1c q1-stored-and-live-question-merge: Drive wins by asking identity and handoff never drops a card` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: status changes emit the vault and use one polling stream` | `src/data/live/live.test.ts` | Vault subscription was not called on the status change. |
| `Q1c q1-stored-and-live-question-merge: revision fence discards an old snapshot` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: run fence discards an old snapshot` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: folder fence discards an old snapshot` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: session fence discards an old snapshot` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: addendum 1 keeps asking order and an answer closes the shared source` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: addenda 1-2 thing answer true cannot revive round one or hide round two` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: addenda 1-2 thing answer {"option":"Q1C_OPTION"} cannot revive round one or hide round two` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: addenda 1-2 thing answer {"text":"Alex keeps this with project words.\nMade-up line."} cannot revive round one or hide round two` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: addenda 1-2 pile answer true cannot revive round one or hide round two` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: addenda 1-2 pile answer {"option":"Q1C_OPTION"} cannot revive round one or hide round two` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: addenda 1-2 pile answer {"text":"Alex keeps this with project words.\nMade-up line."} cannot revive round one or hide round two` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |
| `Q1c q1-stored-and-live-question-merge: contract 5 legacy status stays readable beside the additive snapshot` | `src/data/live/live.test.ts` | The accepted live asking is missing; Drive-only questions remain. |

### API reds — not run: api (ports)

Written through createApp().request, with a manually driven Person wake, no timed polling/waits.
These 23 cases were type-checked and linted, but have not been executed or confirmed red at HEAD.
The coordinator must run them after this red delivery; no API-vitest acceptance is claimed here.

| Exact test name | File | Assertion promised |
| --- | --- | --- |
| `Q1c q1-status-seq-revision-recovery: contract 2 same-phase snapshots replace and raise revision without phaseAt` | `api/test/q1-questions.test.ts` | Full snapshot replace; changed revision, unchanged phaseAt, unchanged snapshot is a no-op. |
| `Q1c q1-status-seq-revision-recovery: duplicate seq and lost-response replay preserve the first asking` | `api/test/q1-questions.test.ts` | Same seq cannot substitute an asking after a lost response. |
| `Q1c q1-status-seq-revision-recovery: seq fence cannot replace the durable snapshot` | `api/test/q1-questions.test.ts` | Refused stale sender; the admitted asking remains durable and revision fenced. |
| `Q1c q1-status-seq-revision-recovery: attempt fence cannot replace the durable snapshot` | `api/test/q1-questions.test.ts` | Refused stale sender; the admitted asking remains durable and revision fenced. |
| `Q1c q1-status-seq-revision-recovery: ticket fence cannot replace the durable snapshot` | `api/test/q1-questions.test.ts` | Refused stale sender; the admitted asking remains durable and revision fenced. |
| `Q1c q1-status-seq-revision-recovery: run fence cannot replace the durable snapshot` | `api/test/q1-questions.test.ts` | Refused stale sender; the admitted asking remains durable and revision fenced. |
| `Q1c q1-status-seq-revision-recovery: takeover fences the retired ticket and restarted Person retains the snapshot` | `api/test/q1-questions.test.ts` | Refused stale sender; the admitted asking remains durable and revision fenced. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses eleven questions without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses non-array snapshot without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses missing asking identity without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses negative asking time without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses empty question without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses five public options without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses wrong id type without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses 201-character question without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses 41-character yes without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses 41-character no without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 refuses stored action payload without changing status` | `api/test/q1-questions.test.ts` | 415, with unchanged durable status; the old phase-only report is the control. |
| `Q1c q1-status-seq-revision-recovery: contract 2 accepts ten bounded cards inside 64 KiB` | `api/test/q1-questions.test.ts` | The accepted full public snapshot survives GET /status without internal stored actions. |
| `Q1c q1-status-seq-revision-recovery: contract 2 keeps the entire request inside 64 KiB` | `api/test/q1-questions.test.ts` | 413 over 64 KiB, unchanged snapshot, accepted bounded snapshot retained. |
| `Q1c q1-status-seq-revision-recovery: contract 4 public snapshot excludes action and uses the original status route` | `api/test/q1-questions.test.ts` | The accepted full public snapshot survives GET /status without internal stored actions. |
| `Q1c q1-status-seq-revision-recovery: shown state and public option identity survive reconnect` | `api/test/q1-questions.test.ts` | The accepted full public snapshot survives GET /status without internal stored actions. |
| `Q1c q1-status-seq-revision-recovery: contract 5 an old status report leaves the additive snapshot in place` | `api/test/q1-questions.test.ts` | Omitted additive field retains the accepted snapshot and revision. |

## Validation

- `pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2`: 2 assertion reds.
- `pnpm exec vitest run src/data/live/live.test.ts -t Q1c --maxWorkers=2`: 14 assertion reds.
- API vitest: not run: api (ports), by assignment. No ports were bound.
- tsc app, node, runner and API: pass. Logs: tmp-logs/q1c-tsc-{app,node,runner,api}.log.
- ESLint on all three touched test files, in their respective packages: pass.
  Logs: tmp-logs/q1c-eslint-{app,runner,api}.log.
- Red output: tmp-logs/q1c-{app,runner}-red.log. Only failure output was read.
- `pnpm check` and e2e: not run; this session is explicitly targeted-test-only, has expected reds and cannot bind ports.
- No new corpus case: no method verdict row is required. Existing P2 fixtures are reused unchanged.

## Compatibility rows

| Stored/wire contract | Fixture / production reader | Result before Q1c assertion |
| --- | --- | --- |
| P2 questions | src/data/contracts/fixtures/p2/questions.json via live DriveVault.questions | Exact legacy questions returned. |
| P2 manifest | fixtures/p2/run-manifest.json via parseRunManifestV2 | Exact legacy value, including original identities. |
| P2 checkpoint chain | fixtures/p2/run-checkpoint.json via parseRunCheckpoint | Every checkpoint reads identically. |
| P2 run report | fixtures/p2/run-report.json via parseRunReport | Exact legacy value. |
| Old GET /status | WorkerHttp then LiveRuns.current, questions omitted | Old phase, id and phaseAt unchanged. |
| Old runner status report | createApp().request, questions omitted | API positive control written; not executed (ports). |
| Additive live status | WorkerHttp then LiveRuns then DriveVault.questions | Red: live asking absent at HEAD. |

## Files and changes

- runner/test/q1-continuation.test.ts: new file, main publication/recovery reds and golden reader controls.
- api/test/q1-questions.test.ts: new file, production-route snapshot/persistence/fence/boundary reds.
- src/data/live/live.test.ts: appended Q1c tests and a P2 fixture import; existing tests untouched.
- docs/harness/2026-10-10-q1c-live-questions-notes.md: this delivery record, line 3 implementer: codex.
- tmp-logs/: verification output and a generated made-up recovery event; verification artifacts, not production changes.

tests changed: none (no existing test body, expectation or name changed).
removed: none.
commits: none; the coordinator commits tests and notes in their required separate commits.

## Existing-test conflicts for coordinator

No definite contradiction was found in the existing test assertions read: phase-only reports still keep their meaning.
Potential exact-report-count conflicts if Q1c publishes an extra writing report even for an empty snapshot:
runner/test/main.test.ts:86, :172, :184, :214 pin exact phase sequences. Do not change these here; the coordinator
should review them against the implementation's publication policy. They are not authorization to change a contract bound.
The red's recovery control uses the existing Drive-v3 test adapter for a redispatched run already past its report
barrier; API takeover/restarted persistence has its own production-route reds. It does not claim to simulate a process kill.

## Follow-up

Q1c implementation waits for Q1a integration. Keep the new reds unchanged; any Q1a stored-schema fixture repair
must remain on the red side with a specific ruling. The coordinator runs the API rows and integration gates.

## API reds run by the coordinator

`pnpm -C api exec vitest run test/q1-questions.test.ts --maxWorkers=2` at 4dc7f762: 23 of 23 fail as assertions (no load errors), each on the missing snapshot, revision or refusal it pins.

## Red repair after Q1a

Repair HEAD: 81058f62. Mechanical red repair only; no network, git writes or dependency changes.

tests changed: runner/test/q1c-live.test.ts: moved from q1-continuation.test.ts at the Q1a merge; temp path per TL-P4-54; no Q1a import, type or helper repair needed.

Each change:
- Import mkdir alongside writeFile, tmpdir from node:os, and join instead of resolve from node:path.
- Create join(tmpdir(), 'bower-q1c-tests') recursively before writing the recovery event.
- Give the event a unique UUID filename under that directory; GITHUB_EVENT_PATH receives the same event path.
- All test names, assertions, fixture shapes and production helpers remain unchanged.
  Runner tsc already passed before the repair; both reds reach the intended Q1c snapshot assertions after it.

Offline standard: Node's tmpdir/join/mkdir pattern already used in runner/test/q1-continuation.test.ts
and runner/test/real-world.ts; Node API reference https://nodejs.org/api/os.html#ostmpdir (not fetched).

Validation:
- `pnpm -C runner exec vitest run test/q1c-live.test.ts --maxWorkers=2 --outputFile.json='/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T//bower-q1c-red-repair.8bYH4q/runner-results.json'`
  exits 1: exactly two AssertionErrors, no import/type/helper failures.
- Durable publication fails at runner/test/q1c-live.test.ts:141: captured.run.questions is undefined.
  Its preceding controls and released-job completion controls pass.
- Same-run recovery fails at runner/test/q1c-live.test.ts:173: reported.questions is undefined.
  Its preceding legacy-reader, first-run, stored-question, recovery and single-model-call controls pass.
- `pnpm -C runner exec tsc --noEmit -p .` exits 0; tsc has no --maxWorkers option.
- Logs and final JSON report: /var/folders/zg/53gb21k95_534c957t93xksw0000gn/T//bower-q1c-red-repair.8bYH4q/
  runner-red.log, runner-tsc.log and runner-results.json. Initial tsc output: baseline-tsc.log.
- The first repaired run used Vitest's default reporter, which wrote ignored runner/test-results/unit.json.
  The final run explicitly redirects JSON output to OS temp; no shared config was edited.
- pnpm check and e2e not run: this assignment authorizes only the red file and runner tsc.

removed: none.
commits: none; coordinator owns commits.

## Implementation

Implementation session, 2026-10-11. Status: blocked under TL-P4-51. No production file or test was changed.
Read the worker card, packet contracts 1–5, Q1 contract, prep file/overlap ledgers and these notes.
No network, successfully bound port, direct writing git command or dependency replacement was used.
The explicitly required full src suite runs its existing git fixtures in scratch repositories; no worktree git write
was requested. Its existing port fixture attempted a listen and was refused, as recorded below.

### Research and intended mechanism

Offline references (not fetched): [RFC 9110 §8.8.3, ETag](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.3)
identifies the representation; use the existing monotonic Worker revision to identify the replacement snapshot.
[Kafka delivery semantics](https://kafka.apache.org/documentation/#semantics) describes idempotent production;
reuse the existing attempt/ticket/sequence fences so a lost-response retry cannot replace an accepted asking.
Local research: `RunnerStatus.request/post`, `Person.runnerReport`, `LiveRuns.current/take`,
`DriveVault.questionSnapshot/questions`, `makeLiveSources` lifetime wiring and `runOperations` manifest persistence.
These homes already provide the transport, polling, journal filtering and fencing required by the packet.

The intended publication hook belongs immediately after the existing engine has written a validated manifest,
before the first effect, and also receives a recovered manifest. The runner would project its questions effect
into action-free cards, capped at ten, and reuse RunnerStatus. A completed recovery must also carry the snapshot
on its terminal report. DriveVault would merge the accepted LiveRuns snapshot with Drive by id plus askedAt,
prefer Drive, then run the existing journal/subject policy. No alternate polling or storage home is warranted.

### Contract/test contradictions, complete inventory from the permitted reads

The existing `runs` row has no snapshot field. Contract 2 requires durable replacement across a fresh Person;
contract 4 requires the existing run state and forbids a second question store. The standard implementation
adds a nullable snapshot column through an appended schema step, preserving the shipped steps. The following
committed tests must be updated for that additive migration, but this assignment explicitly forbids every test edit.
These are inspection findings, **not claimed API execution failures**; the coordinator owns API execution.

| Test / file:line | Conflict |
| --- | --- |
| `shipped person schema steps never change`, `api/test/schema-steps.test.ts:66` | Requires SCHEMA_VERSION's step count to equal the 14 hashes in SHIPPED. An additive step must have its hash pinned in this test. Editing a shipped step also fails the preceding hash assertion at :64. |
| `person storage migrates from v7 to v8 keeping every row`, `api/test/person.test.ts:440` (rewind :449) | The rewind drops only shipped columns through v14, retains a new runs column, then replays the added ALTER at restart; duplicate-column failure. |
| `person storage migrates from v8 to v9 keeping every run`, `api/test/person.test.ts:477` (rewind :486) | Same retained-column/replayed-migration conflict. |
| `person storage migrates from v9 to v10 keeping every ticket`, `api/test/person.test.ts:510` (rewind :517) | Same retained-column/replayed-migration conflict, even though no run row is needed. |
| `person storage migrates from v10 to v11 keeping every row`, `api/test/person.test.ts:528` (rewind :543) | Same retained-column/replayed-migration conflict. |
| `storage from before the deadline table keeps its deadlines`, `api/test/deadlines.test.ts:99` (rewind :107) | undoV14 leaves the new runs column while setting schema version 11; restart replays its ALTER. |
| `a v13 object with a run going and a gone ticket moves to v14 with no second dispatch`, `api/test/deadlines.test.ts:135` (rewind :143) | Same conflict when replaying from version 13. |
| `deadlines kept at schema v12 keep their times and start with no attempts`, `api/test/deadlines.test.ts:239` (rewind :245) | Same conflict when replaying from version 12. |

Earlier person migration fixtures recreate `runs`, so they do not have the retained-column conflict.
The main phase-sequence assertions noted in the red delivery are avoidable: keep the phase-only writing report
and publish an additional same-phase report only when a nonempty question snapshot first becomes durable.
They are not counted as contradictions. No production workaround was added to bypass a schema test.
No immutable admission manifest was repurposed as mutable status storage, and no second KV question store was added.

### Compatibility row drafts (no contract change delivered)

| Proposed contract change | Legacy compatibility / required proof | State |
| --- | --- | --- |
| RunWire / runner status `questions?` | Omission keeps existing status meanings and any accepted snapshot; a present empty array replaces it. Validate public fields/count/body bounds without actions. API Q1c contract 2/4/5 rows. | Draft; blocked |
| Person run snapshot column / appended migration | Existing rows default to null and continue omitting questions; existing phaseAt and revision rules retain their meaning. Fresh Person returns accepted snapshots. Shipped migration hashes remain unchanged; new hash and rewind fixtures require test-owner repair. | Draft; blocked |
| Durable plan publication hook | No new stored manifest field; legacy P2 manifests/checkpoints/reports read identically. New and recovered manifests publish before effects; report projection remains unchanged. runner/test/q1c-live.test.ts. | Draft; blocked |
| DriveVault question projection | Stored questions and actions remain in their existing format; public cards expose only option ids/labels. Asking-key merge, Drive preference and existing journal suppression keep old boolean and new option/text answers meaningful. src/data/live/live.test.ts Q1c rows. | Draft; blocked |

### Coordinator execution needed

All 23 API reds listed in “API reds — not run: api (ports)” above remain required, now at the current checkout:
`pnpm -C api exec vitest run test/q1-questions.test.ts --maxWorkers=2`.
This runs every `Q1c q1-status-seq-revision-recovery` case: same-phase replacement/revision/phaseAt,
duplicate seq and lost response, four stale fences, takeover/restart, all eleven malformed/over-bound cases,
ten-card acceptance, 64 KiB body refusal, action-free projection, reconnect and omitted-field compatibility.
Also run `api/test/schema-steps.test.ts`, `api/test/person.test.ts` and `api/test/deadlines.test.ts`
after the lead resolves the test-edit restriction. Full API regressions, pnpm check and demo/fake
app/capabilities e2e remain coordinator work because this session cannot bind ports; pnpm check also writes
repository test/build/check artifacts, forbidden here. No gate pass is claimed.

### Executed validation at the unchanged production tree

- `pnpm -C runner exec vitest run test/q1c-live.test.ts --maxWorkers=2 --reporter=default`:
  both committed reds reproduced as assertions at :141 and :173. Log: `/tmp/q1c-runner-red.log`.
- `pnpm -C runner exec vitest run --maxWorkers=2 --reporter=default`:
  630 passed, exactly those two Q1c reds failed; 46 passing files and one failing file.
  Log: `/tmp/q1c-runner-all.log`. The default-only reporter avoids repository JSON output.
- `pnpm exec vitest run src --maxWorkers=2`: 5,601 passed, 14 committed Q1c merge reds failed, plus
  `a server from another worktree is never reused`, `src/e2e-port.test.ts:37`, timed out after its
  `server.listen` at :21 emitted `listen EPERM: operation not permitted 127.0.0.1`.
  This fifteenth failure is an environment restriction, not a Q1 contract contradiction or a production regression.
  165 passing files, two failing files, one unhandled listen error. Log: `/tmp/q1c-src-all.log`.
  The coordinator must also run this port fixture. No retry, test edit or port workaround was attempted.
- TypeScript app, node, runner and API all passed with no emitted files:
  `pnpm exec tsc --noEmit -p tsconfig.app.json`, `pnpm exec tsc --noEmit -p tsconfig.node.json`,
  `pnpm -C runner exec tsc --noEmit -p .`, `pnpm -C api exec tsc --noEmit -p .`.
  Logs: `/tmp/q1c-tsc-{app,node,runner,api}.log`.
- ESLint passed over the inspected prospective implementation files in their respective packages:
  contracts run-wire/questions/types, spine engine, DriveVault, live runs/index, runner main/status,
  and API person/person-schema/run-ticket/runner. No code file was touched.
  Logs: `/tmp/q1c-eslint-{app,runner,api}.log`.
- Read-only `git diff --check` passed; `git status --short` shows only this notes file changed.
  All command logs are in the OS temporary folder. No test was altered, removed or skipped.

Lead/coordinator action required: authorize the schema hash pin and historical-fixture repair on the test-owner
side before an implementation session can satisfy both durable run snapshots and the unchanged-test restriction.
The immutable shipped steps must remain unchanged. These notes contain drafts only, not a delivered implementation.

removed: none.
tests changed: none.
commits: none; git writes are forbidden and the coordinator owns commits.
