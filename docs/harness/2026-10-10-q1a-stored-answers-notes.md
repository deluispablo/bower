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

### Round 2 — current delivery

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
