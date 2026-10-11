# B1d selection: tests-only red delivery

implementer: codex

Scope: red ownership only, including TL-P4-41 addendum 13. The initial red delivery left existing assertions
unchanged; the owner subsequently authorized the 36-row assertion sweep recorded below. No production, corpus
fixture, golden, network, git-write or dependency changes. The coordinator owns commits. The initial red
files are in 7823b8ed; this sweep remains uncommitted.

tests changed: runner/test/b1-planning.test.ts: new main/corpus contract reds and their positive controls only.
tests changed: runner/test/b1-planning-support.ts: new test observations and seeded fixtures for those reds only.
tests changed: docs/harness/2026-10-11-b1d-selection-notes.md: new delivery and contradiction record only.
removed: none.

## Exact reds and controls

Every row runs through the existing corpus driver, `runOnDrive` -> runner `main` -> the real provider and adapters.
Only Claude's transport and Drive v3 are replaced. Neither `selectionOf` nor a test planner substitutes for main.
The tests use soft assertions to run the controls and rejected variants even when the first B1d assertion fails.

| Exact name | Red and positive control |
| --- | --- |
| b1-index-job-offer | Relevant hub past 12 distractors, cold and warm; real offer links, hub news, personal Applications and all 12 unrelated hubs preserved. |
| b1-changes-person-edit | Real cold bootstrap then warm personal edit; both calls receive refreshed id/version/summary, Garden bytes unchanged with zero additional media reads. |
| b1-cut-index-no-new-destination | 155 folders produce a real cut projection; reject creation based on the miss, accept a visible existing id, and file a clear sibling beside an asking. |
| b1-five-per-source | Six wants rejected for each of a file source and a words-only source; five accepted for both, each shared physical note read once. |
| b1-selection-closed-ids | Invented item/kind/note/destination ids, paths and extra keys refused; listed note/folder ids proceed. Valid parent/name execution is also covered below. |
| b1-folded-moc-expansion | Existing marked MOC with 41 members; at most one metadata member table per step, selected map/members retrieved once, unpicked member bodies absent. |
| b1-target-injection | Source instructions, personal evidence and MOC Overview text cannot add Rules/unrelated writes or change the frozen destination; trusted filing and destination hub update proceed. |
| b1-read-to-act-fence | Hub text and source name/place changed during execution call; preserve the newer evidence and refuse stale acts. Unchanged filing/hub update succeeds. |
| b1-question-candidate-binding | Fabricated or fifth option rejected; 2, 3 and 4 listed actions retain distinct stored option ids/folder ids through a rename, with clear work filed beside waiting work. |
| b1-shared-ledger | One retry in each step, exact four-result usage and Drive calls/bytes; one remaining timeout budget, exhaustion waits; within-bound filing, index <=32000, notes <=24000, sources including words <=48000. |
| b1-refresh-cache-hot-order | Shared changes discovery and one changed-prefix Range, one selected full read, settled maintenance; both prompts retain hot at position 6 and the existing op key once. |
| b1-pre-manifest-retry | Injected process crash before manifest sends no writes; redispatch sees a new personal edit, completes, and post-manifest report recovery calls neither semantic step. |
| b1-neighbourhood-order-and-30-cap | Whole-word title/summary matches, recency then path, 30 candidates, no substring/two-hop leakage; small control orders match, folder hub, one-link neighbour. |
| b1-expansion-is-not-a-read-picked-members-count-within-five | Five selected members read once with no map/unpicked-body download for displaying expansion; sixth member is refused. |
| b1-new-subfolder-visible-parent-name-and-near-duplicate | Visible parent and valid new name execute; Inbox, .bower, root, unrelated parent, dot/path/overlength names and case-folded existing sibling refused. Uses the existing MAX_NAME. |
| b1-one-new-subfolder-per-item | One child folder succeeds; execution cannot create a second nested child beyond the frozen proposal. |
| b1-one-retry-per-step-four-calls-exhaustion-waits | Within-bound four-call control completes; selection/execution exhaustion stops at 2/3 calls and ends done with waiting dispositions and existing set-aside rows. |
| b1-200-operations-exhaustion-waits | Small real frozen plan succeeds; 201 unique sources attempt 405 operations on today's implementation, exceeding 200. No oversized manifest or item mutation may proceed; items must wait. |
| b1-pinned-and-script-notes-count-within-five | Recorded pair answer pins plus destination hub and two further wants total five; one further want totals six and must wait. Uses real question/journal admission. |

## Test mechanisms and evidence boundaries

- Replies use Q2's closed selection shape, then the existing `tidy-intent` execution shape. Selection ids come
  from real FakeDrive seed/admission ids, never name substrings. `unknown` is the permitted kind control.
- Candidate observations tolerate flat or per-item candidate containers and id/fileId/noteId/folderId rows.
  They do not pin prompt instruction wording or a new production export.
- Warm cache seeding gets its index bytes from production `planningIndex`, not a second index builder. The
  person's next-run case instead warms itself through an actual completed cold main run.
- Equal-recency fixtures use FakeDrive's public snapshot/restore with equal metadata timestamps. Their
  insertion order is reversed. One real `touch` then establishes the recency control.
- Source bodies in the operation and character fixtures differ, preventing the existing hash deduplicator
  from removing sources before the behavior under test. Character stress includes long pile words.
- The operation red checks the actual outgoing manifest's operations. Its test transport stops only an
  oversized send, after asserting the exact 200 bound. This avoids executing hundreds of effects merely to
  prove that the missing limit permits 405 operations. It does not replace or alter production planning.
- Fake timers replace Date/performance; Claude result durations, turns, ordinary/cache tokens are injected.
  Four calls must sum to model=100, api=70, turns=10, in=160, out=50. The clock advances by those call
  durations; subsequent timeout allowances cannot reset the first call's remaining budget. An expired
  model budget starts no execution call and uses the same waiting path. No real timer waits are introduced.
- Source/target edits for the fence occur after execution context is prepared and before its reply returns.
  The post-manifest control withholds the terminal status response and uses immutable-admission redispatch.
- Production traffic counts come only from main's HTTP wrapper. Seeding, warm projection preparation,
  admissions, between-run personal edits and driver snapshots are excluded. Diagnostics append only to
  `os.tmpdir()/b1d-selection-observations.ndjson`, copied to /tmp for the delivery.

## Verification

`pnpm -C runner exec vitest run test/b1-planning.test.ts --maxWorkers=2 --reporter=default --cache=false`

Result: 19 tests fail on assertions for missing B1d behavior. No import, type, uncaught runtime or timeout
failures. The default JSON reporter is overridden and the test cache disabled so results stay outside the repo.
Logs: `/tmp/b1d-selection-red.log`, `/tmp/b1d-selection-observations.ndjson`.

Targeted compatibility suite was run in full before recording contradictions, also with `--maxWorkers=2`
and `--reporter=default --cache=false`: 14 files, 321 tests passed. Log: `/tmp/b1d-selection-compat.log`.

| Compatibility | Files | Result |
| --- | --- | --- |
| Provider / main / timing | claude-provider, main, timing-counts | pass |
| B1a / B1c | b1a-contract, b1-index | pass |
| Q1a / Q1c | q1-continuation, q1c-live | pass |
| B3b | b23-hot, b23-hot-context, b23-hot-recovery | pass |
| Corpus / method / traffic pins | corpus, corpus-driver, second-brain-method, drive-calls-golden | pass |

Runner TypeScript `--noEmit -p .` passes: `/tmp/b1d-selection-types.log`.
ESLint on both new files passes: `/tmp/b1d-selection-lint.log`.
No fixture or screen was changed. Full `pnpm check`/e2e are left for implementation/integration; their normal
commands write repository results, contrary to this red session's explicit no-repository-test-output scope.

## Observed traffic; no golden changes

These are today's red-run observations, not accepted completed B1d goldens. Two calls currently mean an
old one-step provider rejected selection and retried as execution; the tests explicitly reject that behavior.
No model-quality or performance acceptance follows from these failing observations.

| Fixture / condition | Drive calls | Prefix media | Full media | Semantic transport calls |
| --- | ---: | ---: | ---: | ---: |
| b1-index-job-offer cold | 54 | 16 | 14 | 2 |
| b1-index-job-offer warm | 24 | 0 | 16 | 2 |
| b1-changes-person-edit cold bootstrap | 49 | 3 | 3 | 2 |
| b1-changes-person-edit warm changed version | 43 | 1 | 12 | 2 |
| refresh/cache/hot warm selected personal note | 61 | 1 | 10 | 2 |

Measured warm-minus-cold deltas: offer -30 Drive calls / -16 prefixes / +2 full media;
person edit -6 Drive calls / -2 prefixes / +9 full media. The latter includes a real changed-note maintenance
write, unlike its bootstrap. Exact bytes per run are in the observation log; record ids and op keys make
some byte totals vary between independent runs. Tests compare timing's bytes to that same run's measured
wire bytes, not a replacement constant.

Named proposed semantic calls: selection, selection validation retry, execution, execution validation retry.
Discovery must be one shared changes-feed drain; a changed note gets its existing Range prefix once; chosen
L3 gets one full cached read. Expansion is metadata and adds no full member reads on its own. No golden
was raised and no B1c/B3b traffic pin was edited. Injected clocks are not elapsed-time goldens; no >20% time
delta is claimed or accepted here. The existing 20% whole-run reserve remains an implementation contract.

## Existing assertion contradictions for the lead

Historical inventory from the initial red delivery: the complete targeted suite passed on the old one-step
implementation. The first 36 rows (through q1c-live:474) are adapted by the authorized sweep below. The last
eight refresh/cache rows remain unchanged and need the lead’s separate ruling. Locations below refer to
7823b8ed, before the sweep inserted the waiting-report helper.

| Existing file:line | Contradiction |
| --- | --- |
| runner/test/claude-provider.test.ts:163 | One execution retry plus successful execution is pinned to two calls, omitting selection. |
| runner/test/claude-provider.test.ts:181 | Valid new-Area run is pinned to one call. |
| runner/test/claude-provider.test.ts:182 | Success for new Finance/Payslips creates two new folders for the item. |
| runner/test/claude-provider.test.ts:197 | Refused execution assumes two total calls. |
| runner/test/claude-provider.test.ts:198 | Exhaustion is asserted failed rather than done/waiting. |
| runner/test/claude-provider.test.ts:244 | Invalid basis is pinned to two calls without a preceding valid selection. |
| runner/test/claude-provider.test.ts:245 | Invalid basis is pinned to two calls without a preceding valid selection. |
| runner/test/claude-provider.test.ts:246 | Valid basis is pinned to one call. |
| runner/test/claude-provider.test.ts:257 | Valid new-subfolder run is pinned to one call. |
| runner/test/claude-provider.test.ts:275 | Successful no-note validation retry omits selection in its two-call pin. |
| runner/test/claude-provider.test.ts:285 | Execution exhaustion is pinned to two total calls. |
| runner/test/claude-provider.test.ts:286 | Execution exhaustion is pinned to failed rather than done/waiting. |
| runner/test/claude-provider.test.ts:287 | Exhaustion forbids all report/manifest writes, preventing waiting rows. |
| runner/test/claude-provider.test.ts:302 | Valid citing-line run is pinned to one call. |
| runner/test/claude-provider.test.ts:314 | Valid photo run is pinned to one call. |
| runner/test/claude-provider.test.ts:329 | Execution exhaustion is pinned to two total calls. |
| runner/test/claude-provider.test.ts:330 | Execution exhaustion status list ends failed. |
| runner/test/claude-provider.test.ts:331 | Exhaustion requires an old terminal failure sentence instead of waiting rows. |
| runner/test/claude-provider.test.ts:332 | Exhaustion forbids all writes, including its waiting report. |
| runner/test/claude-provider.test.ts:333 | Exhaustion requires an unchanged entire listing, including the absent waiting/report records. |
| runner/test/claude-provider.test.ts:342 | Valid recorded run is pinned to one call. |
| runner/test/claude-provider.test.ts:413 | Timing pins one result's model/API/turns/token totals instead of both calls. |
| runner/test/claude-provider.test.ts:430 | Input tokens pin a single result's usage. |
| runner/test/corpus-driver.test.ts:28 | Two presses expect two model calls rather than four semantic calls. |
| runner/test/corpus-driver.test.ts:30 | The second call is assumed to be the next press, not first-press execution. |
| runner/test/second-brain-method.test.ts:195 | Evidence-only model run is pinned to one call. |
| runner/test/q1-continuation.test.ts:304 | Model-assisted option continuation is capped at one total call. |
| runner/test/q1-continuation.test.ts:617 | Two model-assisted answer runs are pinned to two calls total. |
| runner/test/q1-continuation.test.ts:620 | Each model-assisted run's timing pins one turn/result. |
| runner/test/q1-continuation.test.ts:1112 | Model-assisted continuation is capped at one call. |
| runner/test/q1-continuation.test.ts:1114 | Renamed/moved-folder model-assisted continuation is pinned to one call. |
| runner/test/q1-continuation.test.ts:1121 | Ordinary and valid-folder model-assisted controls are pinned to one call. |
| runner/test/q1-continuation.test.ts:1253 | Model-assisted pile-answer run is pinned to one call. |
| runner/test/q1c-live.test.ts:392 | Recovery's cumulative model count pins the original plan to one semantic call. |
| runner/test/q1c-live.test.ts:438 | Frozen original plan is pinned to one model call. |
| runner/test/q1c-live.test.ts:474 | Recovery's cumulative model count pins the original plan to one call. |
| runner/test/b1a-contract.test.ts:127 | Warm retrieval/changes discovery is required inside maintain after planning. |
| runner/test/b1a-contract.test.ts:132 | The final warm-maintain request must still be its own changes-feed cursor call. |
| runner/test/b1a-contract.test.ts:825 | Maintenance alone is required to make all three discovery calls rather than reuse pre-planning discovery. |
| runner/test/b1-index.test.ts:751 | Cold production planning is pinned to one model call. |
| runner/test/b1-index.test.ts:754 | Pre-model mutation observations are pinned to a single call's [0]. |
| runner/test/b1-index.test.ts:755 | Pre-model read observations are pinned to a single call's [1]. |
| runner/test/b1-index.test.ts:1022 | questions.json media is required during maintain, although planning needs and caches it earlier. |
| runner/test/b1-index.test.ts:1028 | Changed-note Range is required during maintain, contradicting refresh before both calls. |

Traffic constants in timing-counts and drive-calls-golden remain accepted B1c/B3b pins; changed counts need
named calls, not blanket loosening. B1c's warm unchanged traversal assertions also need reconciliation with
where the lead puts the shared refresh; their same-read/no-duplicate intent must survive. Stored-answer
controls that legitimately use no model and post-manifest no-replanning assertions do not contradict B1d.
Legacy corpus replies emit a tidy intent once per cwd; the implementation handoff may need a phase-aware
adapter in B1d's allocated corpus driver while retaining every existing execution assertion.

## Sweep (two steps, exhaustion waits)

Owner-authorized TL-P4-51 sweep for TL-P4-41 B1d / addendum 13: adapt only the first 36 contradiction rows.
The eight B1a/B1c refresh/cache rows and all traffic/golden pins remain unchanged.

tests changed: runner/test/claude-provider.test.ts: TL-P4-41 B1d / addendum 13: include selection in successful/retried calls; execution retry input moves to call 3; one Finance folder under an explicitly visible Areas candidate replaces Finance/Payslips; exhaustion ends done with waiting dispositions, a manifest and existing set-aside report; protect the original non-runner listing; sum both calls' recorded timing and ordinary/cache token usage.
tests changed: runner/test/corpus-driver.test.ts: TL-P4-41 B1d / addendum 13: two presses mean four semantic calls; the between-edit belongs to call 3, second-press selection.
tests changed: runner/test/second-brain-method.test.ts: TL-P4-41 B1d / addendum 13: evidence-only planning includes selection and execution, preserving the existing method/hot assertions.
tests changed: runner/test/q1-continuation.test.ts: TL-P4-41 B1d / addendum 13: model-assisted continuation includes both steps; two runs total four calls and each sums turns/input/output; zero-call stored-answer paths stay allowed while one-call planning cannot pass the cap assertions.
tests changed: runner/test/q1c-live.test.ts: TL-P4-41 B1d / addendum 13: original frozen planning totals two calls; cumulative recovery counts stay two, preserving no-replanning and publication assertions.

| Original contradiction rows | Adaptation |
| --- | --- |
| claude-provider:163,197,244,245,275,285,329 | Valid selection plus execution retry = 3 calls. |
| claude-provider:181,246,257,302,314,342 | Selection plus successful execution = 2 calls. |
| claude-provider:182 | Finance alone is one new child of Areas; the selection candidates must expose Areas by id. Existing New area Finance reporting remains exact. |
| claude-provider:198,286,287,330–333 | Done/saving, durable manifest, waiting dispositions, nonempty existing set-aside report and no filed items; protect original non-runner records while allowing runner records. |
| claude-provider:413,430 | Two identical recorded results: model 82500, API 81960, turns 2, input 10240, output 7780; cache usage counts twice too. |
| corpus-driver:28,30; second-brain-method:195 | Four calls across two presses, between-edit at call 3; evidence-only planning has two calls. |
| q1-continuation:304,617,620,1112,1114,1121,1253 | Zero or two calls where a stored path may bypass the model; assisted controls have two; two assisted runs have four, each with turns=2 in=20 out=20. |
| q1c-live:392,438,474 | Two original semantic calls; recovery adds none. |

Rows unable to adapt without changing their point: none. The new-Area fixture keeps its responsibility and
exact report explanation while removing the second new child; its parent must appear in selection candidates.
No other assertion numbers or rules were changed. Retry-context array positions are adjusted with the listed
call-count rows so they still inspect the execution retry, rather than the first execution call.

The legacy execution-only reply fixtures/transport adapters remain as recorded. This sweep changes assertions,
not the model fixture protocol; the previously recorded phase-aware corpus adapter handoff still applies.
No assertion treats rejection of a selection reply as a successful selection. Every changed test is red on
today's implementation (21 distinct tests cover the 36 assertion rows); none passes on one-step behavior.

Verification (final sweep tree):
`pnpm -C runner exec vitest run test/claude-provider.test.ts test/corpus-driver.test.ts test/second-brain-method.test.ts test/q1-continuation.test.ts test/q1c-live.test.ts --maxWorkers=2 --reporter=default --cache=false`

Result: 5 files, 98 tests; 21 fail on the expected missing selection-call counts or shared timing/token totals,
77 untouched tests pass. No import, type, uncaught runtime or timeout failures. Deliberate crash/publication
transport errors in Q1c are fixture controls, not unhandled errors. All changed cases appear in the failure
list in `/tmp/b1d-selection-sweep.log`. All scratch files, events and logs use OS temp; reporter/cache overrides
prevent repository result/cache writes. No node_modules change and no git write command.

Runner TypeScript passes: `/tmp/b1d-selection-sweep-types.log`.
ESLint on the five touched test files passes: `/tmp/b1d-selection-sweep-lint.log`.
`git diff --check` passes. Full check/e2e remain for implementation/integration under this test-only scope.

## Offline research reused

The packet's sources were reused without network access or independent reverification:

- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://arxiv.org/html/2506.08837v1
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching

They support curated context, just-in-time retrieval, plan then execute and stable prefix reuse. The hard
numbers and authority rules come from the packet and addendum 13, not from these external references.
