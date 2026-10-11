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

## Implementation

Status: **blocked before production edits**. The full runner sweep was completed before stopping;
no production, test, fixture, golden, dependency or git changes were made in this session.
Only this notes appendix is changed. No partial planner is left in the tree.

implementer: codex
tests changed: none
removed: none (blocked before implementation).
removed: no old planner, cache, ledger or writer was replaced or duplicated.

### Required allocations and contract conflicts

1. **Refresh has an unallocated home.** `runner/src/index.ts:329–336` owns `planningIndex`,
   `snapshotNotes`, `readState` and the canonical projection. A warm index returns `undefined`
   at line 332. The changes drain is currently inside `withMaintenance` at lines 348–353, after
   the provider has already returned its plan (`runner/src/main.ts:422`). The cold bootstrap
   start token also happens there, after the planning listing. Contract 1 requires both semantic
   calls to consume the refresh; contract 4 and addenda 3/4 require maintenance to share that
   discovery and its prefix reads. Moving this work within its existing home requires allocation
   of `runner/src/index.ts`, which neither Owned files nor H2/H6 includes. Reimplementing its
   projection/snapshot in main or claude would add the second mechanism expressly forbidden by
   the assignment. Running maintain on a fabricated preparation manifest would also introduce
   a preparation plan and reserve ids before the real frozen plan, contrary to the lifecycle ruling.

2. **Exhaustion cannot reach the existing done barrier with the ruled report.** Contract 9's
   waiting disposition and Ruled 2's existing set-aside row conflict with the report invariant:
   `src/data/spine/report.ts:239–245` expressly says waiting items have no rows, lines 288 and
   293–295 reject a set-aside row for a waiting item, and `src/data/spine/barrier.ts:328–331`
   stops saving on that contradiction. Rows require operation-grounded subjects; an empty-requires
   set-aside contribution names no admitted item and fails too (`report.ts:275–281`). Both files
   are unallocated. The counterexample is the committed exhaustion red: it requires done,
   nonempty setAside and every disposition waiting (`runner/test/b1-planning-support.ts:147–157`).
   Refusing a fictional move to ground a row would violate the frozen-authority contract;
   changing waiting to set-aside would violate the red. A bypass in main would be a second report path.

3. **The committed assertion sweep leaves direct transports execution-only.** The notes' Sweep
   section already records that fixture protocol was unchanged. `recordedClaude` and the inline
   transports in `runner/test/claude-provider.test.ts` emit tidy-intent at every call, including
   selection. For example the new-Area control at lines 199–202 always returns `money`, a tidy-intent,
   but lines 208–215 now require a valid selection and its folder candidates. The allocated H2 driver
   can adapt `replySequence` in `runner/test/corpus-run.ts`; it cannot adapt direct recorded transports
   or inline providers in unchanged tests. Production may not interpret an execution reply as an
   accepted Q2 closed selection. The 21 failures below identify every affected test in this sweep.

The bower-implement workflow ([SKILL.md](../../.agents/skills/bower-implement/SKILL.md)) delegates
scope and mechanism rules to [WORKER.md](WORKER.md): “if it cannot do what you need, stop and report
`blocked`.” The owner's explicit owned-files-only and no-test-changes instructions are also binding.
No permission was assumed to change these homes, tests, report contracts or golden pins.

### Compatibility drafts for the lead (not implemented)

| Home / contract | Concrete draft needed to unblock |
| --- | --- |
| B1c refresh/index and shared run reads | Allocate index.ts; expose one read-only refresh result to planning and reuse it when declaring maintain. Keep cold bootstrap-token ordering, versioned prefixes, canonical projection and same-artifact cursor commit. No preparation checkpoint or additional cache. |
| Exhaustion / report provenance | Rule an operation-free, admitted-id-grounded set-aside contribution for waiting items, consumed by the existing manifest/report/disposition checker. Allocate the existing report and manifest contract homes and their tests. Keep the engine/barrier checks; do not bypass them. |
| Model fixture protocol | Authorize a separate transport-only handoff that supplies closed selection replies to the direct mocks. Adapt the allocated corpus driver in the implementation after that handoff; keep every semantic assertion and zero-model recovery control. |
| Eight B1a/B1c assertions below | Lead-owned sweep must preserve no duplicate discovery/media and pre-manifest no-writes while moving refresh before both calls. |

These are proposed compatibility drafts, not accepted contract changes. Stored formats and runtime
behavior remain unchanged. The previously listed eight deferred assertions all still pass against
this unchanged implementation; they remain contradictions with the requested future implementation:

| File:line | Required reconciliation |
| --- | --- |
| runner/test/b1a-contract.test.ts:127 | Refresh discovery is pinned inside maintain after planning. |
| runner/test/b1a-contract.test.ts:132 | Final warm-maintain request is pinned to its own cursor call. |
| runner/test/b1a-contract.test.ts:825 | Maintain alone is pinned to all three discovery calls. |
| runner/test/b1-index.test.ts:751 | Cold main is pinned to one semantic call. |
| runner/test/b1-index.test.ts:754 | Pre-model write observations are pinned to [0], rather than both calls. |
| runner/test/b1-index.test.ts:755 | Pre-model read observations are pinned to [1], rather than both calls. |
| runner/test/b1-index.test.ts:1022 | Question media is pinned inside maintain rather than the shared earlier read. |
| runner/test/b1-index.test.ts:1028 | Changed Range is pinned inside maintain rather than before planning. |

### Verification of the unchanged tree

All tests used `--reporter=default --cache=false`, at most two workers, and OS-temp logs.
No pnpm check was run: its documented script writes test-results, build artifacts and the check
mark into the repository, contrary to the explicit session restriction. No fixture or UI changed,
so e2e:fake and screen e2e were not triggered. The specified runner/src/type/lint sweep was run.

| Check | Result | OS-temp log |
| --- | --- | --- |
| B1d reds, test/b1-planning.test.ts | 19 failed on assertions / 19 tests, no import/type/timeout failure | /tmp/b1d-implementation-red.log |
| Whole runner suite | 40 failed, 630 passed / 670 tests; 6 failed, 44 passed / 50 files | /tmp/b1d-implementation-runner.log |
| Whole src suite | 5617 passed, 1 failed / 5618 tests; 167 passed, 1 failed / 168 files; expected e2e-port EPERM only | /tmp/b1d-implementation-src.log |
| tsc app, --noEmit --incremental false | pass | /tmp/b1d-implementation-tsc-app.log |
| tsc node, --noEmit --incremental false | pass | /tmp/b1d-implementation-tsc-node.log |
| tsc runner, --noEmit --incremental false | pass | /tmp/b1d-implementation-tsc-runner.log |
| ESLint app owned production file | pass | /tmp/b1d-implementation-eslint-app.log |
| ESLint runner owned production/driver files | pass | /tmp/b1d-implementation-eslint-runner.log |

The initial combined ESLint invocation hit automatic tsconfigRootDir ambiguity. Scratch configs in
/tmp/b1d-eslint-{app,runner}.mjs import the unchanged repository configs and supply their actual root;
rerunning each directory's files with those configs passed. No lint rules or repository configs changed.
There are no touched TypeScript files; these lint checks cover the slated production/driver ownership.

The full runner sweep includes provider/main/timing, B1a/B1c, Q1a/Q1c, B3b, corpus, method and traffic
pins. All 40 failures consist of the 19 new reds plus these 21 committed sweep tests:

| Current assertion location | Exact failing test |
| --- | --- |
| runner/test/claude-provider.test.ts:189 | a new Area with no cited rule or note is refused and retried once |
| runner/test/claude-provider.test.ts:208 | a new Area with a responsibility is made and the report says why |
| runner/test/claude-provider.test.ts:227 | a responsibility does not open a new Project |
| runner/test/claude-provider.test.ts:275 | a rule basis is a whole rules line, never part of one or the cut marker |
| runner/test/claude-provider.test.ts:288 | a new subfolder of an existing Area is not reported as a new area |
| runner/test/claude-provider.test.ts:306 | a thing with text and no note or citing line is refused and retried once |
| runner/test/claude-provider.test.ts:333 | a thing cited by a Timeline line on an existing note needs no note |
| runner/test/claude-provider.test.ts:345 | a photo with no text needs no note |
| runner/test/claude-provider.test.ts:360 | a second refusal ends the run honestly |
| runner/test/claude-provider.test.ts:375 | a recorded Claude reply becomes operations the spine validates |
| runner/test/claude-provider.test.ts:446 | the runner logs one timing line per run with the Claude reply's numbers |
| runner/test/claude-provider.test.ts:463 | the timing line counts cache-read input tokens |
| runner/test/corpus-driver.test.ts:28 | a case's between step runs between two runs |
| runner/test/q1-continuation.test.ts:304 | Q1a q1-options-exact-action: consent resolves stored folder id despite duplicate labels and rename |
| runner/test/q1-continuation.test.ts:617 | Q1a q1-continuation-budget-meter: typed waiting and replay do zero admission reads with ordinary model usage |
| runner/test/q1-continuation.test.ts:1112 | Q1a fix 1.5: missing or outside-root stored option folders cannot authorize alternative filing |
| runner/test/q1-continuation.test.ts:1253 | Q1a fix 1.7: pending text from another pile never reaches this subject planner without provenance |
| runner/test/q1c-live.test.ts:392 | Q1c fix 1: a crash after manifest persistence recovers questions with stored option actions intact |
| runner/test/q1c-live.test.ts:438 | Q1c q1-live-question-before-clear-effects-end: durable publication |
| runner/test/q1c-live.test.ts:474 | Q1c q1-live-question-before-clear-effects-end: same-run recovery republishes without a second model reply |
| runner/test/second-brain-method.test.ts:195 | B3b hot: evidence-only method verdict covers hidden unarchived refresh |

The exact new reds all failed; definition locations are listed here. The full assertion-location
inventory (103 distinct failing locations) is /tmp/b1d-implementation-failures.tsv.

| Definition location | Exact red |
| --- | --- |
| runner/test/b1-planning.test.ts:41 | b1-index-job-offer |
| runner/test/b1-planning.test.ts:68 | b1-changes-person-edit |
| runner/test/b1-planning.test.ts:95 | b1-cut-index-no-new-destination |
| runner/test/b1-planning.test.ts:123 | b1-five-per-source |
| runner/test/b1-planning.test.ts:143 | b1-pinned-and-script-notes-count-within-five |
| runner/test/b1-planning.test.ts:173 | b1-selection-closed-ids |
| runner/test/b1-planning.test.ts:220 | b1-folded-moc-expansion |
| runner/test/b1-planning.test.ts:239 | b1-target-injection |
| runner/test/b1-planning.test.ts:269 | b1-read-to-act-fence |
| runner/test/b1-planning.test.ts:298 | b1-question-candidate-binding |
| runner/test/b1-planning.test.ts:331 | b1-shared-ledger |
| runner/test/b1-planning.test.ts:386 | b1-refresh-cache-hot-order |
| runner/test/b1-planning.test.ts:413 | b1-pre-manifest-retry |
| runner/test/b1-planning.test.ts:451 | b1-neighbourhood-order-and-30-cap |
| runner/test/b1-planning.test.ts:492 | b1-expansion-is-not-a-read-picked-members-count-within-five |
| runner/test/b1-planning.test.ts:505 | b1-new-subfolder-visible-parent-name-and-near-duplicate |
| runner/test/b1-planning.test.ts:528 | b1-one-new-subfolder-per-item |
| runner/test/b1-planning.test.ts:542 | b1-one-retry-per-step-four-calls-exhaustion-waits |
| runner/test/b1-planning.test.ts:558 | b1-200-operations-exhaustion-waits |

### Measured golden table; no golden changes

These are baseline measurements from the unchanged full sweep. Every accepted pin passed; there
is no moved pinned golden. No named call was added in this session, so every implementation delta
is zero. Modelled times are injected fixture measurements, not live performance claims.

| Pin file:line / fixture | Measured value | Implementation delta | Named added calls |
| --- | --- | ---: | --- |
| runner/test/timing-counts.test.ts:15; drive-calls-golden.test.ts:27,29 / C04 cold | 96 Drive calls | 0 | none |
| runner/test/timing-counts.test.ts:21; drive-calls-golden.test.ts:33 / C04 phases | token 0, reads 25, model 0, apply 55, checkpoints 4, report 10, status 0, runner 2 | 0 in every phase | none |
| runner/test/drive-calls-golden.test.ts:90 / 25 earlier runs | 107 Drive calls | 0 | none |
| runner/test/drive-calls-golden.test.ts:92 / retained phases | token 0, reads 28, model 0, apply 54, checkpoints 4, report 10, status 0, runner 11 | 0 in every phase | none |
| runner/test/drive-calls-golden.test.ts:66 / offer-and-flat apply | 6230 ms, within existing 8025 ms bound | 0 | none |

B1d's failing fixture observations below come from this session's first red run. They are not
accepted B1d goldens: selection is currently rejected and retried as execution. Seeding and
inspection traffic are excluded by the committed driver. Exact production bytes are captured
by that same run; none are estimated from note lengths.

| Fixture / condition | Drive calls | Bytes | Prefix media | Full media | Semantic calls | Operations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| b1-index-job-offer cold | 54 | 24800 | 16 | 14 | 2 | 0 |
| b1-index-job-offer warm | 24 | 20171 | 0 | 16 | 2 | 0 |
| b1-changes-person-edit bootstrap | 49 | 37944 | 3 | 3 | 2 | 1 |
| b1-changes-person-edit warm edit | 43 | 48482 | 1 | 12 | 2 | 1 |
| b1-refresh-cache-hot-order warm | 61 | 55421 | 1 | 10 | 2 | 5 |

Measured warm-minus-cold baseline deltas: job offer -30 calls / -4629 bytes / -16 prefixes /
+2 full media; person edit -6 calls / +10538 bytes / -2 prefixes / +9 full media. These reproduce
missing refresh/selection behavior; they are not implementation increases or quality acceptance.
No golden was raised, and no >20% implementation time delta is claimed.

The packet's offline citations were reused without network or independent reverification:
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents,
https://arxiv.org/html/2506.08837v1, and
https://platform.claude.com/docs/en/build-with-claude/prompt-caching.
No new standard, package, cache, writer, ledger or planner was introduced.

Final verification: src/e2e-port.test.ts:37 timed out after its server could not bind
127.0.0.1 (EPERM), with the associated unhandled listen error; this is the session's expected sandbox limitation. No other src failure.
`git diff --check` passes. Final tree changes only this notes appendix. No git-write command,
network call, node_modules replacement, repository test log/cache or production change was made.


## Fixture repair (phase-aware transports)

Owner-authorized mechanical follow-up to Implementation / Required allocations and contract conflicts,
item 3. Tests and the B1d-owned corpus transport only; no production or assertion changes.
Coordinator owns commits. No network, git-write command or dependency changes.

tests changed: runner/test/b1-planning-support.ts: shared phaseAwareClaude adapter emits fixture-bound closed selection, then the original execution envelope.
tests changed: runner/test/claude-provider.test.ts: recordedClaude and every inline execution transport reuse the adapter; retries retain execution attempt order.
tests changed: runner/test/corpus-run.ts: replySequence reuses the adapter; main/redispatch attach their actual seeded fixture outside model input.
tests changed: docs/harness/2026-10-11-b1d-selection-notes.md: fixture repair scope, verification and remaining failure inventory.
removed: none.

Selection uses actual admission ids and exact fixture path-to-id lookups. Words-only sources use their
pile ids. Execution source ids, destinations and cited note ids become closed selection rows with
unknown kind and asks: []; malformed execution fixtures receive a valid fixture-derived selection first.
Invalid execution targets stay in the unchanged execution reply. Existing destinations become folder
ids; one new child uses its existing parent id and name. Selection retries repeat the frozen selection;
execution retries preserve the original execution sequence. Corrected inline retry fixtures supply their
final destination for selection and keep their original first execution refusal. Result usage remains
that of each fixture, so the sweep's two-call timing assertions remain unchanged.

The existing provider scratch-directory boundary and admission identity identify each run step.
Case reply sequences advance once per step, never per semantic call or validation retry. Fixture listing
uses FakeDrive directly, outside main's measured HTTP wrapper. No extra production reads are introduced.
All existing expect/expect.* assertion expressions match HEAD after removing the added transport fixture arguments.

Verification:
`pnpm -C runner exec vitest run test/claude-provider.test.ts test/corpus-driver.test.ts test/second-brain-method.test.ts test/q1-continuation.test.ts test/q1c-live.test.ts --maxWorkers=2 --reporter=default --cache=false`

Final sweep: 5 files, 98 tests; 30 fail, 68 pass. Log: `/tmp/b1d-fixture-sweep.log`.
All remaining failures trace to missing B1d behaviour: the current one-step provider rejects the valid
closed selection and repeats it as its execution retry, so no execution call or plan follows. Downstream
assertions see missing writes/reports/questions; the pair-answer driver stops because that missing plan
published no question. Other unchanged Q1/method mocks still expose the missing second semantic call.
There are no fixture-binding, import, TypeError, timeout or unhandled-error failures. The extra failures
relative to the execution-only sweep are the old provider's refusal of a valid selection, not relaxed
assertions or a new production defect.

OS-temp adapter smoke: 1 pass. It checks actual seeded ids/destination, closed selection shape, repeated
selection on retry, exact original execution replies and their retry indices, a new admission step, and a new scratch-directory run.
Source/config/log: `/tmp/b1d-fixture-smoke.test.ts`, `/tmp/b1d-fixture-smoke.config.mjs`,
`/tmp/b1d-fixture-smoke.log`. Runner TypeScript and ESLint on the three modified files pass:
`/tmp/b1d-fixture-types.log`, `/tmp/b1d-fixture-lint.log`. `git diff --check` passes.
Full pnpm check/e2e remain outside this fixture-only red repair: those commands write repository results;
the owner explicitly requires that tests never write into the repository. No screen or corpus seed changed.
The packet's offline context-engineering, plan-then-execute and prompt-cache citations were reused;
no independent network verification. Production allocations/conflicts in Implementation items 1–2 remain.

Remaining sweep inventory (exact test names; failure details remain in the OS-temp log):

- test/claude-provider.test.ts > the Claude provider > a new Area with no cited rule or note is refused and retried once
- test/claude-provider.test.ts > the Claude provider > a new Area with a responsibility is made and the report says why
- test/claude-provider.test.ts > the Claude provider > a responsibility does not open a new Project
- test/claude-provider.test.ts > the Claude provider > a rule basis is a whole rules line, never part of one or the cut marker
- test/claude-provider.test.ts > the Claude provider > a new subfolder of an existing Area is not reported as a new area
- test/claude-provider.test.ts > the Claude provider > a thing with text and no note or citing line is refused and retried once
- test/claude-provider.test.ts > the Claude provider > a thing cited by a Timeline line on an existing note needs no note
- test/claude-provider.test.ts > the Claude provider > a photo with no text needs no note
- test/claude-provider.test.ts > the Claude provider > a second refusal ends the run honestly
- test/claude-provider.test.ts > the Claude provider > a recorded Claude reply becomes operations the spine validates
- test/claude-provider.test.ts > the Claude provider > the runner logs one timing line per run with the Claude reply's numbers
- test/claude-provider.test.ts > the Claude provider contract (TL-P4-01 P4-2) > the Claude provider passes the scripted provider contract fixtures
- test/claude-provider.test.ts > the Claude provider contract (TL-P4-01 P4-2) > a write the two runner lists judged differently is judged once by RUNNER_WRITES
- test/claude-provider.test.ts > the Claude provider contract (TL-P4-01 P4-2) > the runner computes ids and digests, never the model
- test/claude-provider.test.ts > the Claude provider writes only what it proposed (P4-2 review I1) > a Claude run writes no hub line or demo extra it did not propose
- test/corpus-driver.test.ts > a case's between step runs between two runs
- test/corpus-driver.test.ts > multi-press corpus > answers a pair question through the answer path between presses
- test/corpus-driver.test.ts > multi-press corpus > keeps both notes and closes the question after Keep mine
- test/corpus-driver.test.ts > multi-press corpus > checks the first press independently of the final report
- test/corpus-driver.test.ts > multi-press corpus > empty expectations in the final score > refuses empty questionSubjects
- test/corpus-driver.test.ts > multi-press corpus > empty expectations in the per-run score > refuses empty questionSubjects
- test/corpus-driver.test.ts > multi-press corpus > reports a settled replay without writing another request
- test/q1-continuation.test.ts > Q1a stored answers through production entry points > Q1a q1-options-exact-action: consent resolves stored folder id despite duplicate labels and rename
- test/q1-continuation.test.ts > Q1a stored answers through production entry points > Q1a q1-continuation-budget-meter: typed waiting and replay do zero admission reads with ordinary model usage
- test/q1-continuation.test.ts > Q1a fix round 1 through production entry points > Q1a fix 1.5: missing or outside-root stored option folders cannot authorize alternative filing
- test/q1-continuation.test.ts > Q1a fix round 1 through production entry points > Q1a fix 1.7: pending text from another pile never reaches this subject planner without provenance
- test/q1c-live.test.ts > Q1c durable publication through main and createApp().request > Q1c fix 1: a crash after manifest persistence recovers questions with stored option actions intact
- test/q1c-live.test.ts > Q1c durable publication through main and createApp().request > Q1c q1-live-question-before-clear-effects-end: durable publication
- test/q1c-live.test.ts > Q1c durable publication through main and createApp().request > Q1c q1-live-question-before-clear-effects-end: same-run recovery republishes without a second model reply
- test/second-brain-method.test.ts > B3b hot: evidence-only method verdict covers hidden unarchived refresh


## Addendum 14 sweep

TL-P4-41 addendum 14 (2) supersedes the exhaustion-waits assertions in the earlier sweep.
Ledger-exhausted items end done with set-aside dispositions and their existing report rows.
The reason is pinned by `SET_ASIDE_TEXT['not-tidied']`, pending the designer's confirmation.
The next run must admit and file the exhausted source again; it is not permanently retired.

tests changed: runner/test/b1-planning-support.ts: replace the waiting exhaustion helper with set-aside assertions; retain done, no-filed and no-source-mutation checks; match each disposition's admitted source to its existing row using SET_ASIDE_TEXT['not-tidied'].
tests changed: runner/test/b1-planning.test.ts: update all exhaustion-helper callers and the two exhaustion test names; add a fresh-admission, second-run filing control for both selection and execution exhaustion, preserving every call and operation bound.
tests changed: runner/test/claude-provider.test.ts: adapt the earlier sweep's shared exhaustion assertion and its callers to set-aside dispositions and per-source existing rows with SET_ASIDE_TEXT['not-tidied']; preserve manifest, source protection and call-count assertions.

Verification: `pnpm -C runner exec vitest run test/b1-planning.test.ts test/claude-provider.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1d-addendum14-results.json`.
Both touched test suites ran: 34 failed, 8 passed (42 total). This is a tests-only red delivery;
production implementation remains outside scope. Logs: `/tmp/b1d-addendum14.log`,
`/tmp/b1d-addendum14-results.json`. No network, git writes, dependency changes, repository
test output, pnpm check or e2e (the latter gates write repository artifacts) were run.
Offline sources: packet citations reused without re-verification; no new mechanism.

Failed tests (complete targeted-suite list; first assertion location):

- `runner/test/b1-planning-support.ts:204`: b1-index-job-offer.
- `runner/test/b1-planning.test.ts:38`: b1-changes-person-edit.
- `runner/test/b1-planning.test.ts:38`: b1-cut-index-no-new-destination.
- `runner/test/b1-planning.test.ts:38`: b1-five-per-source.
- `runner/test/b1-planning.test.ts:38`: b1-pinned-and-script-notes-count-within-five.
- `runner/test/b1-planning.test.ts:38`: b1-selection-closed-ids.
- `runner/test/b1-planning.test.ts:38`: b1-folded-moc-expansion.
- `runner/test/b1-planning.test.ts:38`: b1-target-injection.
- `runner/test/b1-planning.test.ts:38`: b1-read-to-act-fence.
- `runner/test/b1-planning-support.ts:204`: b1-question-candidate-binding.
- `runner/test/b1-planning.test.ts:338`: b1-shared-ledger.
- `runner/test/b1-planning.test.ts:38`: b1-refresh-cache-hot-order.
- `runner/test/b1-planning.test.ts:434`: b1-pre-manifest-retry.
- `runner/test/b1-planning.test.ts:38`: b1-neighbourhood-order-and-30-cap.
- `runner/test/b1-planning.test.ts:38`: b1-expansion-is-not-a-read-picked-members-count-within-five.
- `runner/test/b1-planning.test.ts:38`: b1-new-subfolder-visible-parent-name-and-near-duplicate.
- `runner/test/b1-planning.test.ts:38`: b1-one-new-subfolder-per-item.
- `runner/test/b1-planning.test.ts:546`: b1-one-retry-per-step-four-calls-exhaustion-set-aside.
- `runner/test/b1-planning.test.ts:38`: b1-200-operations-exhaustion-set-aside.
- `runner/test/claude-provider.test.ts:197`: a new Area with no cited rule or note is refused and retried once.
- `runner/test/claude-provider.test.ts:219`: a new Area with a responsibility is made and the report says why.
- `runner/test/claude-provider.test.ts:239`: a responsibility does not open a new Project.
- `runner/test/claude-provider.test.ts:289`: a rule basis is a whole rules line, never part of one or the cut marker.
- `runner/test/claude-provider.test.ts:304`: a new subfolder of an existing Area is not reported as a new area.
- `runner/test/claude-provider.test.ts:322`: a thing with text and no note or citing line is refused and retried once.
- `runner/test/claude-provider.test.ts:352`: a thing cited by a Timeline line on an existing note needs no note.
- `runner/test/claude-provider.test.ts:364`: a photo with no text needs no note.
- `runner/test/claude-provider.test.ts:380`: a second refusal ends the run honestly.
- `runner/test/claude-provider.test.ts:398`: a recorded Claude reply becomes operations the spine validates.
- `runner/test/claude-provider.test.ts:463`: the runner logs one timing line per run with the Claude reply's numbers.
- `runner/test/claude-provider.test.ts:550`: the Claude provider passes the scripted provider contract fixtures.
- `runner/test/claude-provider.test.ts:624`: a write the two runner lists judged differently is judged once by RUNNER_WRITES.
- `runner/test/claude-provider.test.ts:550`: the runner computes ids and digests, never the model.
- `runner/test/claude-provider.test.ts:803`: a Claude run writes no hub line or demo extra it did not propose.


## Implementation — addendum 14 allocation audit and complete sweep

implementer: codex
status: blocked; no production change remains in the worktree.
tests changed: none
removed: the attempted read-only index preparation, main wiring, timing budget methods and VaultIndex neighbourhood edits.
removed: the first red run's generated runner/test-results/unit.json; subsequent reporters and caches use OS temp or are disabled.
removed: no accepted mechanism, fixture, golden, test or dependency.

### Remaining mechanism allocation

Addendum 14 (1) grants index.ts, so the previous refresh allocation blocker is resolved.
The committed phase-aware fixture repair also resolves the previous transport blocker.
Addendum 14 (2) changes the exhaustion disposition to set-aside, but the existing shared
report mechanism still cannot represent an exhausted, untouched admitted source with a row.
This is a source-level contract conflict even after the complete assertion sweep:

- src/data/spine/report.ts:206–210 derives set-aside only for captured members or pile children;
  an uncaptured admitted item is waiting. Merely holding the pile does not produce set-aside.
- src/data/spine/report.ts:258–264 grounds report rows only through existing move/Bin effects
  and note create/edit effects depending on them. A contribution requiring no effect has no
  admitted subject. A maintain or runner-json effect also supplies no subject.
- src/data/spine/report.ts:275–281 rejects a row with no admitted subject. At :294–297,
  a captured set-aside item must have a grounded set-aside row.
- src/data/spine/barrier.ts:328–331 enforces those checks and keeps a contradictory run in saving.
- src/data/spine/scripted.ts:618 and :961–962 own capture/decide/build; a blocked readiness or
  held pile gives no captured subject or set-aside row. No public exhaustion decision is available.

The exhaustion red now requires set-aside plus SET_ASIDE_TEXT['not-tidied'] and no source
mutation (runner/test/b1-planning-support.ts:211–224), including retry admission on the next
run (runner/test/b1-planning.test.ts:556–563). Renaming waiting to set-aside alone cannot pass
report provenance. Inventing a refused move/Bin/edit to ground the row would introduce an
unauthorized source operation and violate frozen authority. Bypassing the barrier or writing a
second report/disposition path in main would violate the single-home requirement.

Scope therefore needs the existing planner, manifest declaration and report homes, rather
than another writer in an owned file. Those files remain outside this assignment's allocation.
The [bower-implement skill](../../.agents/skills/bower-implement/SKILL.md) requires the packet's
owned scope and [WORKER.md](WORKER.md)'s rule: “if it cannot do what you need, stop and report
`blocked`.” That explicit requirement applies to the report mechanism here. No approval is
requested, and no broader allocation is assumed. The independent full sweep was completed
before returning the card.

### Compatibility draft; no stored contract changed

Allocate src/data/spine/scripted.ts, src/data/contracts/run-manifest.ts and
src/data/spine/report.ts, with lead-owned fixture tests for their changed declaration.
Add an explicit admitted-id-grounded exhaustion declaration to the frozen manifest's capture
and report contribution in these existing homes. Restrict it to the admitted ids, the reason
key not-tidied and zero source effects. The existing report materializer and disposition
checker should consume that declaration; keep the engine and done barrier unchanged.
Make the optional stored declaration readable in older manifests and strict when writing it.
Do not consume pile declarations or archive exhausted source journal requests, so fresh
admission retries them next run. All semantic exhaustion paths should call the existing
planner with that decision; no fabricated source operation, preparation checkpoint or writer.
This is a concrete compatibility draft for the lead, not an implemented format change.

### Offline research reused

The packet's curated-context / just-in-time retrieval, plan-then-execute and stable-prefix
citations were reused without network or independent re-verification:
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents,
https://arxiv.org/html/2506.08837v1,
https://platform.claude.com/docs/en/build-with-claude/prompt-caching.
Existing homes were inspected before editing. No new package was selected.

### Verification

All test output is in OS temp. The first red accidentally used the runner configuration's
repository JSON reporter; its generated result was removed. The subsequent commands explicitly
set --cache=false and --reporter=default --reporter=json --outputFile=/tmp/… . No git-write
command, network call, dependency replacement or symlink was issued. The initial tree was clean;
only this notes appendix remains changed.

| Check | Result | OS-temp log |
| --- | --- | --- |
| B1d exact reds, test/b1-planning.test.ts | 19 failed / 19 tests | /tmp/b1d-final-red.log |
| Complete runner suite, including provider/main/timing, B1a/B1c, Q1a/Q1c, B3b, corpus/method | 98 failed, 572 passed / 670 tests; 15 failed, 35 passed files | /tmp/b1d-final-runner.log |
| tsc --noEmit -p tsconfig.app.json | pass | /tmp/b1d-final-tsc-app.log |
| tsc --noEmit -p tsconfig.node.json | pass | /tmp/b1d-final-tsc-node.log |
| runner tsc --noEmit -p tsconfig.json | pass | /tmp/b1d-final-tsc-runner.log |
| ESLint on all attempted production paths | pass with explicit config roots | /tmp/b1d-final-eslint-runner.log; /tmp/b1d-final-eslint-app.log |

The initial mixed-root ESLint invocation failed at parser setup because tsconfigRootDir was
ambiguous. OS-temp configs importing each unchanged original config and specifying its actual
root resolved the invocation; both resulting logs are empty. No lint rule or repo config changed.
pnpm check and e2e were not run: they write repository gate/results artifacts, prohibited by the
owner's instruction. There is no screen or fixture change and no green check mark is claimed.
JSON inventories: /tmp/b1d-final-red-results.json and /tmp/b1d-final-runner-results.json.

### Measured golden table; goldens unchanged

Every accepted golden in the complete runner sweep passed. None moved, and no implementation
call or timing delta remains. Production counts exclude fixture seeding and inspection.

| Pin file:line / fixture | Measured value | Implementation delta | Named added calls |
| --- | --- | ---: | --- |
| runner/test/timing-counts.test.ts:15; runner/test/drive-calls-golden.test.ts:27,29 / C04 cold | 96 Drive calls | 0 | none |
| runner/test/timing-counts.test.ts:21; runner/test/drive-calls-golden.test.ts:33 / C04 phases | token 0, reads 25, model 0, apply 55, checkpoints 4, report 10, status 0, runner 2 | 0 per phase | none |
| runner/test/drive-calls-golden.test.ts:90,92 / 25 earlier runs | 107 Drive calls; reads 28, apply 54, checkpoints 4, report 10, runner 11, other phases 0 | 0 | none |
| runner/test/drive-calls-golden.test.ts:66 / offer-and-flat apply | 6230 ms, existing bound 8025 ms | 0 | none |

The last full-sweep B1d observations still reproduce the red baseline; two calls are the existing
one-step refusal/retry, not proof of selection/execution. These are failing-fixture measurements,
not accepted B1d goldens or implementation increases.

| Fixture | Condition | Drive calls | Bytes | Prefix media | Full media | Calls | Operations |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| b1-index-job-offer | cold | 54 | 24800 | 16 | 14 | 2 | 0 |
| b1-index-job-offer | warm | 24 | 20171 | 0 | 16 | 2 | 0 |
| b1-changes-person-edit | bootstrap | 49 | 37944 | 3 | 3 | 2 | 1 |
| b1-changes-person-edit | warm edit | 43 | 48482 | 1 | 12 | 2 | 1 |
| b1-refresh-cache-hot-order | warm | 61 | 55421 | 1 | 10 | 2 | 5 |

Warm-minus-cold baseline deltas: job -30 calls / -4629 bytes / -16 prefixes / +2 full media;
person edit -6 calls / +10538 bytes / -2 prefixes / +9 full media. Every implementation delta
is zero. Named added calls: none. No >20% implementation-time delta is claimed.

### Complete runner failure inventory

The table lists all 98 failed tests from the completed sweep, with the first relevant committed
assertion/helper location. These are failures of the unchanged implementation against committed
selection transports and assertions, not newly introduced regressions. Exact failure messages
are retained in /tmp/b1d-final-runner-results.json. No test, transport or assertion was altered.

| File:line | Failed test |
| --- | --- |
| runner/test/b1-index.test.ts:97 | B1c index: exact PARA order direct notes shortest duplicate paths and recursive folded count |
| runner/test/b1-index.test.ts:171 | B1c index: 32000 character cut names every omitted folder and preserves whole rows |
| runner/test/b1-index.test.ts:220 | B1c index: hidden app settings and dot-folder notes never enter either projection |
| runner/test/b1-index.test.ts:242 | B1c index: hidden-only feed changes only the cursor with a visible-feed positive control |
| runner/test/b1-index.test.ts:275 | B1c index: unchanged summaries keep index bytes and stamp through a visible version change |
| runner/test/b1-index.test.ts:97 | B1c index: existing MOC at 40 direct members folds and rebuilds complete regions by id |
| runner/test/b1-index.test.ts:97 | B1c index: existing MOC at 41 direct members folds and rebuilds complete regions by id |
| runner/test/b1-index.test.ts:327 | B1c index: a personal MOC stays byte identical while the Bower MOC refreshes |
| runner/test/b1-index.test.ts:339 | B1c index: done replay keeps the folded projection and complete members without another write |
| runner/test/b1-index.test.ts:358 | B1c index: lost reply for .bower/index.md resumes the same maintain before the report barrier |
| runner/test/b1-index.test.ts:358 | B1c index: lost reply for Resources/Garden/Garden.md resumes the same maintain before the report barrier |
| runner/test/b1-index.test.ts:358 | B1c index: lost reply for .bower/retrieval.json resumes the same maintain before the report barrier |
| runner/test/b1-index.test.ts:403 | B1c index: corpus b1-index-no-change preserves the derived stamp on the second real instruction press |
| runner/test/b1-index.test.ts:97 | B1c index: corpus b1-moc-over-40 folds 41 leaves with complete reachable child maps |
| runner/test/b1-index.test.ts:494 | B1c index: legacy MOC migrates on its first maintain and keeps every other byte |
| runner/test/b1-index.test.ts:507 | B1c index: legacy MOC second maintain is idempotent with no MOC write |
| runner/test/b1-index.test.ts:535 | B1c index: legacy MOC without Overview and Notes is untouched |
| runner/test/b1-index.test.ts:555 | B1c index: legacy MOC belonging to a person with the same headings is untouched |
| runner/test/b1-index.test.ts:576 | B1c index: maintain MOC targets pass the fenced-edit guard and personal targets are refused |
| runner/test/b1-index.test.ts:645 | B1c fix 1: 1 settled link rewrite supplies maintenance its new MOC text and version |
| runner/test/b1-index.test.ts:672 | B1c fix 1: 2 B1a unchanged legacy MOC is discovered migrated once and folded |
| runner/test/b1-index.test.ts:97 | B1c fix 1: 3 figures count 1 direct notes without a child map |
| runner/test/b1-index.test.ts:97 | B1c fix 1: 3 figures count 40 direct notes without a child map |
| runner/test/b1-index.test.ts:751 | B1c fix 1: 4 bootstrap plans with the in-memory index |
| runner/test/b1-index.test.ts:751 | B1c fix 1: 4 missing-index plans with the in-memory index |
| runner/test/b1-index.test.ts:799 | B1c fix 2: unchanged legacy MOC without Drive ownership is discovered migrated once and folded |
| runner/test/b1-index.test.ts:872 | B1c fix 3: legacy MOC ownership comes from the index prefix with zero extra reads |
| runner/test/b1-planning.test.ts:48 | b1-index-job-offer |
| runner/test/b1-planning.test.ts:38 | b1-changes-person-edit |
| runner/test/b1-planning.test.ts:38 | b1-cut-index-no-new-destination |
| runner/test/b1-planning.test.ts:38 | b1-five-per-source |
| runner/test/b1-planning.test.ts:38 | b1-pinned-and-script-notes-count-within-five |
| runner/test/b1-planning.test.ts:38 | b1-selection-closed-ids |
| runner/test/b1-planning.test.ts:38 | b1-folded-moc-expansion |
| runner/test/b1-planning.test.ts:38 | b1-target-injection |
| runner/test/b1-planning.test.ts:38 | b1-read-to-act-fence |
| runner/test/b1-planning.test.ts:314 | b1-question-candidate-binding |
| runner/test/b1-planning.test.ts:338 | b1-shared-ledger |
| runner/test/b1-planning.test.ts:38 | b1-refresh-cache-hot-order |
| runner/test/b1-planning.test.ts:434 | b1-pre-manifest-retry |
| runner/test/b1-planning.test.ts:38 | b1-neighbourhood-order-and-30-cap |
| runner/test/b1-planning.test.ts:38 | b1-expansion-is-not-a-read-picked-members-count-within-five |
| runner/test/b1-planning.test.ts:38 | b1-new-subfolder-visible-parent-name-and-near-duplicate |
| runner/test/b1-planning.test.ts:38 | b1-one-new-subfolder-per-item |
| runner/test/b1-planning.test.ts:546 | b1-one-retry-per-step-four-calls-exhaustion-set-aside |
| runner/test/b1-planning.test.ts:38 | b1-200-operations-exhaustion-set-aside |
| runner/test/b1a-contract.test.ts:204 | B1a contract: addendum 4: maintain writes only retrieval index once and changed MOC regions per run |
| runner/test/b1a-contract.test.ts:238 | B1a contract: 3: retrieval state and cursor commit together before the hidden report barrier |
| runner/test/b1a-contract.test.ts:266 | B1a contract: 4: settled maintenance replays without rows or duplicate writes and done skips it |
| runner/test/b1a-contract.test.ts:290 | B1a contract: case 6: lost maintenance reply resumes the same manifest before done |
| runner/test/b1a-contract.test.ts:355 | B1a contract: 4: maintenance uses settled refusals without fabricating rows or log entries |
| runner/test/b1a-contract.test.ts:402 | B1a contract: hidden paths addendum: a hidden-only feed advances only the retrieval cursor |
| runner/test/b1a-contract.test.ts:422 | B1a contract: TL-P4-45 addendum: root index is an ordinary indexed note and dot paths stay hidden |
| runner/test/b23-hot-context.test.ts:41 | B3b hot: filing writes hot once and the next prompt puts it at position 6 |
| runner/test/b23-hot-context.test.ts:101 | B3b fix 1: settled journal changes enter Recent changes on their own |
| runner/test/b23-hot-context.test.ts:129 | B3b hot: an Undo run refreshes hot from restored evidence |
| runner/test/b23-hot-context.test.ts:200 | B3b hot: an ordinary rule Undo keeps its own wording |
| runner/test/b23-hot-context.test.ts:247 | B3b hot: recent rows carry their op key and dedupe by it |
| runner/test/b23-hot-context.test.ts:330 | B3b hot: a Home answer removes only its settled Open thread |
| runner/test/b23-hot-recovery.test.ts:22 | B3b hot: pre-plan failure and done redispatch send no hot writes |
| runner/test/b23-hot-recovery.test.ts:67 | B3b hot: a lost maintain reply resumes the same manifest and writes hot once |
| runner/test/c05-between.test.ts:12 | a real first state write precedes the personal edit and shown update |
| runner/test/c05-incorporation.test.ts:74 | the C05 slice through the Claude provider the C05 corpus cases score green with scripted proposals |
| runner/test/c05-marked-history.test.ts:10 | the marked state was actually written and its previous lines remain in undo evidence |
| runner/test/c05-person-notes.test.ts:238 | C05 person notes through runner main C05 person notes: corpus first append, protected ranges, state question and later non-adoption score per run |
| runner/test/c05-person-notes.test.ts:277 | C05 person notes through runner main C05 person notes: state changed before Write it re-asks and preserves the new personal bullet |
| runner/test/c05-person-notes.test.ts:312 | C05 person notes through runner main C05 person notes: append clash retries on the next main call with the fresh personal text and original citation |
| runner/test/claude-provider.test.ts:197 | the Claude provider a new Area with no cited rule or note is refused and retried once |
| runner/test/claude-provider.test.ts:219 | the Claude provider a new Area with a responsibility is made and the report says why |
| runner/test/claude-provider.test.ts:239 | the Claude provider a responsibility does not open a new Project |
| runner/test/claude-provider.test.ts:289 | the Claude provider a rule basis is a whole rules line, never part of one or the cut marker |
| runner/test/claude-provider.test.ts:304 | the Claude provider a new subfolder of an existing Area is not reported as a new area |
| runner/test/claude-provider.test.ts:322 | the Claude provider a thing with text and no note or citing line is refused and retried once |
| runner/test/claude-provider.test.ts:352 | the Claude provider a thing cited by a Timeline line on an existing note needs no note |
| runner/test/claude-provider.test.ts:364 | the Claude provider a photo with no text needs no note |
| runner/test/claude-provider.test.ts:380 | the Claude provider a second refusal ends the run honestly |
| runner/test/claude-provider.test.ts:398 | the Claude provider a recorded Claude reply becomes operations the spine validates |
| runner/test/claude-provider.test.ts:463 | the Claude provider the runner logs one timing line per run with the Claude reply's numbers |
| runner/test/claude-provider.test.ts:550 | the Claude provider contract (TL-P4-01 P4-2) the Claude provider passes the scripted provider contract fixtures |
| runner/test/claude-provider.test.ts:624 | the Claude provider contract (TL-P4-01 P4-2) a write the two runner lists judged differently is judged once by RUNNER_WRITES |
| runner/test/claude-provider.test.ts:550 | the Claude provider contract (TL-P4-01 P4-2) the runner computes ids and digests, never the model |
| runner/test/claude-provider.test.ts:803 | the Claude provider writes only what it proposed (P4-2 review I1) a Claude run writes no hub line or demo extra it did not propose |
| runner/test/corpus-driver.test.ts:28 | a case's between step runs between two runs |
| runner/test/corpus-driver.test.ts:92 | multi-press corpus answers a pair question through the answer path between presses |
| runner/test/corpus-driver.test.ts:121 | multi-press corpus keeps both notes and closes the question after Keep mine |
| runner/test/corpus-driver.test.ts:140 | multi-press corpus checks the first press independently of the final report |
| runner/test/corpus-driver.test.ts:225 | multi-press corpus empty expectations in the final score refuses empty questionSubjects |
| runner/test/corpus-driver.test.ts:225 | multi-press corpus empty expectations in the per-run score refuses empty questionSubjects |
| runner/test/corpus-driver.test.ts:242 | multi-press corpus reports a settled replay without writing another request |
| runner/test/corpus.test.ts:15 | the capability corpus the corpus scorer passes on the scripted provider outputs |
| runner/test/q1-continuation.test.ts:304 | Q1a stored answers through production entry points Q1a q1-options-exact-action: consent resolves stored folder id despite duplicate labels and rename |
| runner/test/q1-continuation.test.ts:617 | Q1a stored answers through production entry points Q1a q1-continuation-budget-meter: typed waiting and replay do zero admission reads with ordinary model usage |
| runner/test/q1-continuation.test.ts:1112 | Q1a fix round 1 through production entry points Q1a fix 1.5: missing or outside-root stored option folders cannot authorize alternative filing |
| runner/test/q1-continuation.test.ts:1253 | Q1a fix round 1 through production entry points Q1a fix 1.7: pending text from another pile never reaches this subject planner without provenance |
| runner/test/q1c-live.test.ts:392 | Q1c durable publication through main and createApp().request Q1c fix 1: a crash after manifest persistence recovers questions with stored option actions intact |
| runner/test/q1c-live.test.ts:438 | Q1c durable publication through main and createApp().request Q1c q1-live-question-before-clear-effects-end: durable publication |
| runner/test/q1c-live.test.ts:474 | Q1c durable publication through main and createApp().request Q1c q1-live-question-before-clear-effects-end: same-run recovery republishes without a second model reply |
| runner/test/second-brain-method.test.ts:195 | B3b hot: evidence-only method verdict covers hidden unarchived refresh |


### Completed src sweep and final tree

`pnpm exec vitest run src --maxWorkers=2 --cache=false --reporter=default --reporter=json --outputFile=/tmp/b1d-final-src-results.json`
finished: 167 files passed, 1 failed; 5617 tests passed, 1 failed. The sole failure is
src/e2e-port.test.ts:37 after listen on 127.0.0.1 was refused with EPERM, with the associated
unhandled listen error; this is the expected sandbox limitation. No other src failure.
Logs: /tmp/b1d-final-src.log; /tmp/b1d-final-src-results.json.
All three TypeScript logs and both successful ESLint logs are empty. git diff --check passes.
Final diff: only this notes appendix; no production/test/golden change or partial implementation remains.

## Addendum 15 sweep

TL-P4-41 addendum 15 supersedes addendum 14 (2). Ledger-exhausted items stay in the inbox
untouched and visible as waiting, with no report row, manifest change or copy. Declarations
and requests remain for the next run; the run ends done and logs the count once.

tests changed: runner/test/b1-planning-support.ts: replace the set-aside exhaustion helper with waiting/no-row assertions; observe console lines and original evidence; assert no source write, manifest change or request consumption and one counted console line.
tests changed: runner/test/b1-planning.test.ts: rename both exhaustion reds and all shared-helper callers; preserve call/operation limits; assert original evidence and requests remain, no manifest is created, fresh admission retains declarations and requests, and the next run files the source.
tests changed: runner/test/claude-provider.test.ts: adapt all three sweep exhaustion rows through the shared helper; retain done and call counts; assert waiting/no-row, no manifest change or copy, preserved evidence/declarations/requests, one counted console line and fresh admission.

No production, fixture, golden, dependency, network or git-write changes. Coordinator owns commits.
Research: reused the packet's offline citations; no network or independent reverification:
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://arxiv.org/html/2506.08837v1
https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Verification of final test tree:
- `pnpm -C runner exec vitest run test/b1-planning.test.ts test/claude-provider.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1d-add15-results.json --cache=false`: 34 failed, 8 passed across both files.
- Full assertion details: `/tmp/b1d-add15.log`; machine-readable results: `/tmp/b1d-add15-results.json`.
- Runner TypeScript passes: `/tmp/b1d-add15-types.log`. Touched-test ESLint passes: `/tmp/b1d-add15-lint.log`.
- Test reports and cache overrides use OS temp / disabled caching. No full check or e2e: this is the authorized tests-only red sweep.

Complete targeted failure inventory (all targeted tests ran before stopping):

| File:line | Failing test |
| --- | --- |
| runner/test/b1-planning.test.ts:41 | b1-index-job-offer |
| runner/test/b1-planning.test.ts:68 | b1-changes-person-edit |
| runner/test/b1-planning.test.ts:95 | b1-cut-index-no-new-destination |
| runner/test/b1-planning.test.ts:123 | b1-five-per-source |
| runner/test/b1-planning.test.ts:143 | b1-pinned-and-script-notes-count-within-five |
| runner/test/b1-planning.test.ts:173 | b1-selection-closed-ids |
| runner/test/b1-planning.test.ts:220 | b1-folded-moc-expansion |
| runner/test/b1-planning.test.ts:239 | b1-target-injection |
| runner/test/b1-planning.test.ts:269 | b1-read-to-act-fence |
| runner/test/b1-planning.test.ts:298 | b1-question-candidate-binding |
| runner/test/b1-planning.test.ts:331 | b1-shared-ledger |
| runner/test/b1-planning.test.ts:386 | b1-refresh-cache-hot-order |
| runner/test/b1-planning.test.ts:413 | b1-pre-manifest-retry |
| runner/test/b1-planning.test.ts:451 | b1-neighbourhood-order-and-30-cap |
| runner/test/b1-planning.test.ts:492 | b1-expansion-is-not-a-read-picked-members-count-within-five |
| runner/test/b1-planning.test.ts:505 | b1-new-subfolder-visible-parent-name-and-near-duplicate |
| runner/test/b1-planning.test.ts:528 | b1-one-new-subfolder-per-item |
| runner/test/b1-planning.test.ts:542 | b1-one-retry-per-step-four-calls-exhaustion-leaves-items-for-next-run |
| runner/test/b1-planning.test.ts:575 | b1-200-operations-exhaustion-leaves-items-for-next-run |
| runner/test/claude-provider.test.ts:207 | a new Area with no cited rule or note is refused and retried once |
| runner/test/claude-provider.test.ts:229 | a new Area with a responsibility is made and the report says why |
| runner/test/claude-provider.test.ts:254 | a responsibility does not open a new Project |
| runner/test/claude-provider.test.ts:301 | a rule basis is a whole rules line, never part of one or the cut marker |
| runner/test/claude-provider.test.ts:318 | a new subfolder of an existing Area is not reported as a new area |
| runner/test/claude-provider.test.ts:331 | a thing with text and no note or citing line is refused and retried once |
| runner/test/claude-provider.test.ts:363 | a thing cited by a Timeline line on an existing note needs no note |
| runner/test/claude-provider.test.ts:379 | a photo with no text needs no note |
| runner/test/claude-provider.test.ts:391 | a second refusal ends the run honestly |
| runner/test/claude-provider.test.ts:413 | a recorded Claude reply becomes operations the spine validates |
| runner/test/claude-provider.test.ts:1 | the runner logs one timing line per run with the Claude reply's numbers |
| runner/test/claude-provider.test.ts:598 | the Claude provider passes the scripted provider contract fixtures |
| runner/test/claude-provider.test.ts:637 | a write the two runner lists judged differently is judged once by RUNNER_WRITES |
| runner/test/claude-provider.test.ts:744 | the runner computes ids and digests, never the model |
| runner/test/claude-provider.test.ts:812 | a Claude run writes no hub line or demo extra it did not propose |

Delivery: done for the authorized red sweep; production remains red. No implementation attempted.
