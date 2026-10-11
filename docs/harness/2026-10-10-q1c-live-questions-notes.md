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
