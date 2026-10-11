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


## Implementation

implementer: codex

Status: blocked after the complete authorized sweeps, under the owner's TL-P4-51 golden-stop instruction.

Changed paths: runner/src/claude.ts, runner/src/index.ts, runner/src/main.ts, runner/src/timing.ts,
src/data/vault/vault-index.ts, runner/test/corpus-run.ts (allocated driver only), and this notes appendix.
The five production files and the allocated corpus driver contain an uncommitted implementation draft;
it is **not merge-ready**. No git-writing command, network call, dependency replacement, test assertion edit,
fixture edit or golden edit was made. The coordinator owns commits. Do not mistake this draft for acceptance.

Research first: reused only the packet's offline citations, without independent reverification:
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://arxiv.org/html/2506.08837v1
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching

The draft moves the existing index home's read-only refresh ahead of semantic planning. Its returned
listing, cursor and snapshot are handed to the same maintain effect for persistence at the end.
No preparation checkpoint or pre-manifest index write was added. Warm prefixes, chosen note bodies,
source extraction and maintenance use the existing Drive read cache. VaultIndex builds the whole-word,
recency/path, hub and one-link neighbourhood, capped at 30 displayed candidates. The provider validates
selection, freezes its destinations and allowed ids, retrieves chosen evidence, then validates execution
through the existing closed intent and scripted planner. RunTiming aggregates both calls and retries,
keeps the 20% time reserve and checks the 200-operation cap. Exhaustion ends done, logs one count,
and leaves Drive untouched so a fresh admission can take the same inbox/declarations/requests again.
Q1a's option actions, Q1c's publication callback, B3b's hot slot and the manifest/checkpoint/barrier
remain in their existing homes. The allocated corpus driver also handles execution-only reply sequences
when a redispatch fixture supplies its selection independently; no assertion was changed.

removed: the provider's one-step call/retry block and its reset 15-minute allowance.
removed: eager retrieval of the old twelve hub bodies from production Claude planning.
removed: discovery and changed-prefix refresh after semantic planning when main supplies refreshed observations.
removed: failure/report/manifest persistence on semantic validation or operation-ledger exhaustion.
tests changed: none

### Verification and stop evidence

Initial red: all 19 committed B1d tests failed on assertions, /tmp/b1d-implementation-red.log.
Final complete runner sweep: 50 files; 396 passed, 274 failed of 670 tests.
Final B1d results within that sweep: 6 passed, 13 failed of 19; full assertion inventory follows.
Final src sweep: 167 files passed, one failed; 5617 passed, one failed of 5618 tests.
The sole src failure is src/e2e-port.test.ts:37, with the expected EPERM listen error and its timeout.
All requested app/node/runner TypeScript checks and touched-file ESLint checks pass.
The initial mixed-root lint invocation hit automatic tsconfigRootDir ambiguity; temporary configs
import the unchanged repository configs and set their respective roots. No lint rule was disabled.

Commands (all output and TypeScript build-info files outside the repository):
- `pnpm -C runner exec vitest run --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1d-runner-results.json --cache=false`
- `pnpm exec vitest run src --maxWorkers=2 --reporter=default --reporter=json --outputFile=/tmp/b1d-src-results.json --cache=false`
- `pnpm exec tsc --noEmit -p tsconfig.app.json --tsBuildInfoFile /tmp/b1d-app.tsbuildinfo`
- `pnpm exec tsc --noEmit -p tsconfig.node.json --tsBuildInfoFile /tmp/b1d-node.tsbuildinfo`
- `pnpm -C runner exec tsc --noEmit -p .`
- `pnpm exec eslint --config /tmp/b1d-eslint-app.mjs src/data/vault/vault-index.ts`
- `pnpm exec eslint --config /tmp/b1d-eslint-runner.mjs runner/src/claude.ts runner/src/index.ts runner/src/main.ts runner/src/timing.ts runner/test/corpus-run.ts`

Logs: /tmp/b1d-runner.log, /tmp/b1d-src.log, /tmp/b1d-{app,node,runner}-types.log,
/tmp/b1d-{app,runner}-eslint.log. JSON results preserve every assertion and stack.
No pnpm check or e2e was run: their normal commands write builds/check marks/results into this repository,
which this session explicitly prohibits. No fixture or app screen was changed.

Passed exact B1d tests:
- `b1-index-job-offer`
- `b1-changes-person-edit`
- `b1-folded-moc-expansion`
- `b1-read-to-act-fence`
- `b1-pre-manifest-retry`
- `b1-neighbourhood-order-and-30-cap`

### Measured golden table — unchanged files

The pinned C04 selection input moves by the named selection call's instruction and id/version/candidate
metadata, while L3 bodies move to execution. Measurements below reconstruct the complete received
prompt from vitest's failure diff and the unchanged golden; reconstructed copies are in /tmp only.
No golden is accepted or changed. The owner-required stop applies to these pins.

| Pinned assertion | Golden file | Old chars | Measured chars | Delta | Measured SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| runner/test/model-input-fingerprint.test.ts:81 | runner/test/fixtures/model-input-c04.golden.txt | 9431 | 10832 | +1401 | da7b69240701098f3f24c4418eecb22db6b08b8122d27800a11d94bd26e8f26b |
| runner/test/model-input-fingerprint.test.ts:93 | runner/test/fixtures/model-input-c04.raw.golden.txt | 9427 | 10830 | +1403 | c0973cdc4163fc5a625fe000a2fe9e197bd5492268349d89e472f61f9151beb0 |

The accepted traffic pins did not move: timing-counts.test.ts and drive-calls-golden.test.ts pass in full.
The C05 archive golden's report observation is absent, not a measured accepted traffic rise:
runner/test/c05-bounded-reads.test.ts:278 observes undefined report.updated because that legacy
transport returns execution JSON during selection. It is included in the failure inventory below.
Fingerprint checks at runner/test/model-input-fingerprint.test.ts:113/152/174/268/290 also fail;
these include real draft gaps (fingerprinting only successful selection, and incomplete normalization of
new metadata ids), not just permission to update a golden. There is no elapsed-time golden acceptance
or >20% time-delta claim; injected/modelled timings are not real deployment latency.

### Cold/warm production traffic observations

Seeding, admission, inspection and between-run edits are excluded. These are measured production HTTP
calls, not newly accepted goldens. Each complete row below uses selection then execution.

| Fixture / condition | Drive calls | Bytes | Range prefixes | Full media | Operations | Filed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| b1-index-job-offer cold | 109 | 109966 | 16 | 21 | 7 | 1 |
| b1-index-job-offer warm | 91 | 97184 | 14 | 23 | 7 | 1 |
| b1-changes-person-edit cold | 49 | 37947 | 3 | 3 | 1 | 0 |
| b1-changes-person-edit warm | 43 | 48482 | 1 | 12 | 1 | 0 |
| b1-refresh-cache-hot-order warm | 65 | 55710 | 4 | 11 | 5 | 1 |

Named semantic calls: selection, selection validation retry, execution, execution validation retry.
The shared-ledger positive control completes in exactly four calls: injected aggregate
model=100, api=70, turns=10, input=160, output=50; the declining timeout checks pass.
The clear within-bound controls and character-envelope assertions run before the exhaustion assertion.
The 201-item case is rejected before source extraction or any manifest; its inbox is unchanged.

Named Drive reads: the existing cold bootstrap start token and canonical listing; the one warm
changes-feed drain; changed note Range prefixes; legacy hub ownership/type Range probes;
matched-note Range prefixes for one-link discovery; selected full note reads; maintain's complete
MOC reads and hot's declared evidence reads. No second drain or physical selected-note cache is added.
For offer warm-minus-cold: -18 calls, -12782 bytes, -2 prefixes, +2 full media; operations/filing unchanged.
For personal edit warm-minus-cold: -6 calls, +10535 bytes, -2 prefixes, +9 full media; operations unchanged.
The previous notes' red-run numbers are not a settled-plan baseline, so they cannot justify raising a
traffic golden. Relative to those observations: offer cold +55 calls/0 prefixes/+7 full media;
offer warm +67 calls/+14 prefixes/+7 full media; personal edit cold and warm each +0 calls;
refresh/cache/hot +4 calls/+3 prefixes/+1 full media. These are descriptive deltas, not approved pins.
The large offer rise remains a performance gap: all current snapshot owners are enriched, so hot reads
more eligible hubs. It needs diagnosis and measurement before acceptance; no golden was loosened.
Exact observations: /tmp/b1d-implementation-observations.ndjson.

### Compatibility drafts and remaining implementation gaps

These are proposals for lead review only; no contract or test has been altered.

| Home / evidence | Draft or unresolved issue |
| --- | --- |
| b1-planning-support.ts:220–221; claude-provider.test.ts exhaustion helper | Addendum 15 says inbox only, nothing written. Assertions still require a new on-disk dispositions.json waiting row. Derive waiting from the untouched inbox/status instead, or allocate a durable exception explicitly; this draft writes nothing. |
| b1-planning.test.ts:498 | The unpicked map is fully read once by existing maintain, to freeze owned MOC regions and persist membership after filing. Expansion itself reads only metadata. Clarify whether the assertion excludes maintain; do not add a prefix-only MOC writer. |
| b1-planning.test.ts:409–410; runner/src/hot.ts (not owned) | The seeded undated HTML-comment op row is rejected by existing renderHot, which preserves dated rows ending in op:<12 hex>. Reconcile the recorded legacy form in B3b's own home; B1d must not add a second hot renderer. |
| b1a-contract.test.ts; b1-index.test.ts | Pre-planning refresh intentionally moves feed/Range traffic out of maintain. Cold Claude now has two calls. Preserve total physical-read invariants while updating phase-specific observations only after the lead rules. |
| Execution-only fixture transports across runner tests | They must emit the closed selection reply before their recorded execution reply. Do not add production fallback from tidy-intent to inferred selection. Complete inventory follows; the allocated corpus sequence fix alone does not migrate every transport. |
| model-input-fingerprint.test.ts | Selection's new indexed/folder dictionary keys and item ids are incompletely normalized. Set selection/retry fingerprints consistently in the existing timing mechanism, then measure both golden prompts again. |
| ClaudeSetup/read handoff | Refreshed snapshot metadata is passed, but planReads still retains its original listing. A feed change racing that listing can pair the refreshed index with stale source/target read versions; this draft needs the existing cache's versioned listing handoff, not another cache. |
| Q7 index context | The index string is <=32000, but the separate indexed metadata and repeated candidate rows are not included in that character ledger. The draft needs one combined index-context accounting bound. |
| Selection kind rows | The draft uses a finite built-in kind list. It does not yet discover real configured type-row ids; unknown passes the committed controls. Reuse the existing configured row home when allocated. |
| Maintenance 300-call bound | No new cap is enforced in the maintenance home by this draft. RunTiming must account and grant those calls with the same ledger; no second budget object is permitted. |
| Q1 answers / standalone provider fixtures | Full compatibility sweep remains red; no stored-answer/recovery acceptance is claimed beyond the passing B1d recovery and unchanged scripted controls. |

The draft has no new stored format and no scripted.ts, run-manifest.ts or report.ts edits.
The new optional read-only setup and maintain arguments preserve existing callers; they are not
acceptance of the unresolved stale-listing handoff. No golden, test or bound is loosened to hide a gap.

### Complete runner failure inventory

Every failed test in the full sweep is listed with the actual assertion location (or its declaration
for a transport failure). These include contradictions and real implementation/fixture failures;
they are not all classified as contract contradictions. Distinct repeated soft assertions are retained
in /tmp/b1d-runner-results.json. The rows below are a decision index into that full evidence.

| File:line | Failed test | First observed failure |
| --- | --- | --- |
| runner/test/ask-answer-loop.test.ts:304 | an answer applies at once (TL-P4-08 addendum 8) a yes to keep one note starts a scoped run that merges | AssertionError: expected [ …(6) ] to not include 'Projects/Flat hunt/Flat 3 (second).md' |
| runner/test/ask-answer-loop.test.ts:323 | an answer applies at once (TL-P4-08 addendum 8) answers reach the model path | AssertionError: expected [ { …(2) }, { …(2) } ] to deeply equal [ ObjectContaining{…} ] |
| runner/test/ask-answer-loop.test.ts:357 | an answer applies at once (TL-P4-08 addendum 8) a yes to a pair ask merges through keep-one-note-merge | AssertionError: expected undefined to be defined |
| runner/test/ask-answer-loop.test.ts:384 | an answer applies at once (TL-P4-08 addendum 8) a yes to a pair whose other note is in the Bin settles and says nothing was merged | AssertionError: expected [ 'q-pair-f12.f13' ] to deeply equal [] |
| runner/test/ask-answer-loop.test.ts:402 | an answer applies at once (TL-P4-08 addendum 8) with no new input a second run leaves nothing held or waiting for the same reason | AssertionError: expected [ …(2) ] to deeply equal [] |
| runner/test/ask-answer-loop.test.ts:442 | an answer applies at once (TL-P4-08 addendum 8) an answer during a run is applied by the next | AssertionError: expected [ …(6) ] to not include 'Projects/Flat hunt/Flat 3 (second).md' |
| runner/test/ask-answer-loop.test.ts:459 | an answer applies at once (TL-P4-08 addendum 8) a no closes the question with no run | AssertionError: expected [ 'q-merge-flat-3' ] to deeply equal [] |
| runner/test/ask-answer-loop.test.ts:500 | an answer applies at once (TL-P4-08 addendum 8) a yes to a thing asked about starts a run that takes only its pile, with the answer shown | AssertionError: expected [ …(7) ] to include 'Projects/Flat hunt/Kitchen, Wrenfield…' |
| runner/test/ask-answer-loop.test.ts:520 | an answer applies at once (TL-P4-08 addendum 8) a yes to Write it writes the update in a scoped run | AssertionError: expected [ Array(1) ] to deeply equal [ 'Two applications open.', …(1) ] |
| runner/test/ask-answer-loop.test.ts:548 | an answer applies at once (TL-P4-08 addendum 8) a person edit after the question stops Write it | AssertionError: expected [ { id: 'q-state-f13', …(6) } ] to deeply equal [ ObjectContaining{…} ] |
| runner/test/ask-answer-loop.test.ts:566 | an answer applies at once (TL-P4-08 addendum 8) undo of Write it restores the person's section | AssertionError: expected undefined to be defined |
| runner/test/ask-answer-loop.test.ts:590 | an answer applies at once (TL-P4-08 addendum 8) a yes to write it applies the shown text with no model call | AssertionError: expected undefined to deeply equal [ 'Two applications open.', …(1) ] |
| runner/test/ask-answer-loop.test.ts:623 | an answer applies at once (TL-P4-08 addendum 8) write it re-asks when the section changed since it was shown | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:643 | an answer applies at once (TL-P4-08 addendum 8) a write it yes whose note is gone writes one answered row | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:672 | an answer applies at once (TL-P4-08 addendum 8) write it re-asks when the note changed elsewhere since it was shown | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:697 | an answer applies at once (TL-P4-08 addendum 8) a clash at write time leads to the re-ask with the new sentence and no extra press | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:743 | an answer applies at once (TL-P4-08 addendum 8) only a clash keeps an answer for a re-ask | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:772 | an answer applies at once (TL-P4-08 addendum 8) the same non-clash refusal never starts more runs than the cap, then shows the not-written row | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:822 | an answer applies at once (TL-P4-08 addendum 8) a write it refused for good writes one answered row on Home and on the note | AssertionError: expected [ 'q-state-f13' ] to deeply equal [] |
| runner/test/ask-answer-loop.test.ts:843 | an answer applies at once (TL-P4-08 addendum 8) a write it with nothing to write writes one answered row | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:96 | an answer applies at once (TL-P4-08 addendum 8) a lone no to write it closes the question with no model call | AssertionError: expected 409 to be 200 // Object.is equality |
| runner/test/ask-answer-loop.test.ts:888 | an answer applies at once (TL-P4-08 addendum 8) a yes to write it beside a pile asks the model | AssertionError: expected 4 to be 3 // Object.is equality |
| runner/test/ask-answer-loop.test.ts:899 | an answer applies at once (TL-P4-08 addendum 8) of two answers to one question, the later one counts | AssertionError: expected [ 'q-merge-flat-3' ] to deeply equal [] |
| runner/test/ask-one-per-thing.test.ts:46 | one open question per thing (TL-P4-11 addendum) two differently worded asks about one thing give one question | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/ask-one-per-thing.test.ts:56 | one open question per thing (TL-P4-11 addendum) a thing that leaves the inbox closes its question | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/ask-one-per-thing.test.ts:67 | one open question per thing (TL-P4-11 addendum) an answer whose subject left is settled | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/ask-one-per-thing.test.ts:82 | one open question per thing (TL-P4-11 addendum) a re-upload of the same thing adds no question | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/ask-one-per-thing.test.ts:96 | one open question per thing (TL-P4-11 addendum) an instructions run keeps an open thing question | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/ask-one-per-thing.test.ts:111 | one open question per thing (TL-P4-11 addendum) a pile ask then a thing ask leave one question | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/ask-only-lines.test.ts:36 | a run that only asks keeps the Timeline lines the model added with no cites | AssertionError: expected '---\nsummary: Looking for a flat near…' to contain 'Viewing moved to Saturday.' |
| runner/test/b1-index.test.ts:751 | B1c fix 1: 4 bootstrap plans with the in-memory index | AssertionError: positive control: real main called the planning provider: expected [ [ …(16) ], [ …(16) ] ] to have a length of 1 but got 2 |
| runner/test/b1-index.test.ts:751 | B1c fix 1: 4 missing-index plans with the in-memory index | AssertionError: positive control: real main called the planning provider: expected [ [ …(17) ], [ …(17) ] ] to have a length of 1 but got 2 |
| runner/test/b1-index.test.ts:952 | B1c fix 2: warm instructions planning preserves calls without Inbox or declaration reads for the index | AssertionError: expected "planningIndex" to be called once, but got 0 times |
| runner/test/b1-index.test.ts:952 | B1c fix 2: warm all planning preserves calls without Inbox or declaration reads for the index | AssertionError: expected "planningIndex" to be called once, but got 0 times |
| runner/test/b1-index.test.ts:1029 | B1c fix 4: a warm run with changed notes counted through maintain equals the pre-addendum-9 count | AssertionError: instructions/1: provider skips this note; maintain reads its one Range without metadata: expected [ { method: 'GET', …(4) } ] to deeply equal [ { method: 'GET', …(4) } ] |
| runner/test/b1-planning.test.ts:107 | b1-cut-index-no-new-destination | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1-planning.test.ts:138 | b1-five-per-source | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1-planning.test.ts:167 | b1-pinned-and-script-notes-count-within-five | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1-planning.test.ts:183 | b1-selection-closed-ids | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1-planning.test.ts:260 | b1-target-injection | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1-planning.test.ts:327 | b1-question-candidate-binding | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1-planning.test.ts:382 | b1-shared-ledger | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1-planning.test.ts:409 | b1-refresh-cache-hot-order | AssertionError: expected '# Hot\n_Updated: 2026-10-07_\n## Open…' to contain 'made-up-op' |
| runner/test/b1-planning.test.ts:498 | b1-expansion-is-not-a-read-picked-members-count-within-five | AssertionError: showing a member list does not read the unpicked map body: expected [ { …(5) } ] to deeply equal [] |
| runner/test/b1-planning.test.ts:523 | b1-new-subfolder-visible-parent-name-and-near-duplicate | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1-planning.test.ts:537 | b1-one-new-subfolder-per-item | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1-planning.test.ts:552 | b1-one-retry-per-step-four-calls-exhaustion-leaves-items-for-next-run | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1-planning.test.ts:599 | b1-200-operations-exhaustion-leaves-items-for-next-run | AssertionError: exhausted sources stay visible as waiting: expected undefined to be 'waiting' // Object.is equality |
| runner/test/b1a-contract.test.ts:634 | B1a contract: round 3 1: vanished indexed notes drop without failing and ordinary edits refresh | AssertionError: not-found read: state commits the drained feed cursor: expected '19' to be '18' // Object.is equality |
| runner/test/b1a-contract.test.ts:703 | B1a contract: round 3 2: unrelated account changes drain once and the next run has two discovery reads | AssertionError: the next no-change run makes exactly the two discovery reads: expected [ Array(1) ] to deeply equal [ [ 'GET', …(2) ], [ 'GET', …(2) ] ] |
| runner/test/b1a-contract.test.ts:808 | B1a contract: round 4 1: a folder binned before planning drops every indexed descendant | AssertionError: live control: main drains the real feed once: expected 2 to be 1 // Object.is equality |
| runner/test/b1a-contract.test.ts:808 | B1a contract: round 4 2: a folder moved outside drops its indexed subtree and commits the cursor | AssertionError: live control: main drains the real feed once: expected 2 to be 1 // Object.is equality |
| runner/test/b1a-contract.test.ts:808 | B1a contract: round 4 3: a renamed folder updates descendant paths and index order without media reads | AssertionError: live control: main drains the real feed once: expected 2 to be 1 // Object.is equality |
| runner/test/b1a-contract.test.ts:808 | B1a contract: round 4 4: an inside folder move updates recursive paths and regroups without media reads | AssertionError: live control: main drains the real feed once: expected 2 to be 1 // Object.is equality |
| runner/test/b23-hot-context.test.ts:330 | B3b hot: a Home answer removes only its settled Open thread | Error: between: expected one question from the previous press, found 0 |
| runner/test/c04-incorporation.test.ts:123 | what the model is shown (P4-3) the model context carries bounded extracted text for each admitted thing | AssertionError: expected [] to deeply equal [ 'Areas/Garden/Garden.md' ] |
| runner/test/c04-incorporation.test.ts:209 | the C04 slice through the Claude provider (P4-3) the C04 corpus cases score green with scripted proposals | AssertionError: expected { id: 'bench-2-text-pdf', …(2) } to deeply equal { id: 'bench-2-text-pdf', …(2) } |
| runner/test/c04-incorporation.test.ts:231 | the C04 slice through the Claude provider (P4-3) a recorded Claude reply on a C04 case writes a note with its content | AssertionError: expected { pass: false, unmet: [ …(4) ] } to deeply equal { pass: true, unmet: [] } |
| runner/test/c04-incorporation.test.ts:314 | the C04 slice, review round (P4-3) a model cite links the note the run actually made | BowerError: These items will be handled on the next run. |
| runner/test/c04-incorporation.test.ts:359 | the C04 slice, review round (P4-3) a note body or line that links outside what the model was shown is refused | BowerError: These items will be handled on the next run. |
| runner/test/c04-prompt-fixes.test.ts:62 | c04 prompt fixes (TL-P4-08 addendum 5) a number not found in its sources is refused and retried once | AssertionError: expected 'Select context first. Return only {"i…' to match /Your reply was refused: .*"30".*Reply…/ |
| runner/test/c04-prompt-fixes.test.ts:98 | c04 prompt fixes (TL-P4-08 addendum 5) a raw file name is replaced by a plain name | AssertionError: expected 'Select context first. Return only {"i…' to match /Your reply was refused: .*name.*Reply…/ |
| runner/test/c05-bounded-reads.test.ts:278 | C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media | AssertionError: expected undefined to deeply equal [ ObjectContaining{…} ] |
| runner/test/c05-bounded-reads.test.ts:148 | C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence | AssertionError: production records must form a verified run: expected 'new' to be 'run' // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:498 | C05 bounded reads: fix 2 control: a waiting retry whose pending relocation lands completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:498 | C05 bounded reads: fix 2: a waiting retry whose pending relocation failed completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:498 | C05 bounded reads: fix 2: a waiting retry interrupted after its pointer and before its append appends once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:401 | C05 bounded reads: fix 1 control: a waiting retry whose archive lands completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:401 | C05 bounded reads: fix 1: a waiting retry whose archive move failed completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:148 | C05 bounded reads: horizon: past 20 runs uses listing age and TOO_OLD_WHY without a chain walk | AssertionError: production records must form a verified run: expected 'new' to be 'run' // Object.is equality |
| runner/test/c05-incorporation.test.ts:74 | the C05 slice through the Claude provider the C05 corpus cases score green with scripted proposals | AssertionError: expected { …(11) } to deeply equal { …(11) } |
| runner/test/c05-incorporation.test.ts:90 | the C05 slice through the Claude provider every Timeline line a run writes has its own report row | AssertionError: expected '---\nsummary: Looking for a flat near…' to contain 'The Ferrowick offer is fully remote, …' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: title grammar case and punctuation shows the named note before hubs | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: title grammar the article shows the named note before hubs | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: title grammar my article shows the named note before hubs | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: title grammar Unicode NFC shows the named note before hubs | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: longest whole title wins and source-only or partial mentions grant nothing | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: row 6 files the source and lists 2 same-title notes by id and folder without asking | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: row 6 files the source and lists 3 same-title notes by id and folder without asking | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: row 7 files the source but four named notes produce one unlinked row and zero updates | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: consent refuses unrelated request id through main beside a legitimate append | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: consent refuses unrelated target id through main beside a legitimate append | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: consent refuses citation not filed in this run through main beside a legitimate append | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: row 5 missing Timeline is byte-identical, linked in leftAsWritten and never counted updated | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: row 8 unparseable Timeline is byte-identical, linked in leftAsWritten and never counted updated | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: corpus first append, protected ranges, state question and later non-adoption score per run | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: state answer true changes only the shown bullet or writes nothing and is never re-asked | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: state answer false changes only the shown bullet or writes nothing and is never re-asked | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: state changed before Write it re-asks and preserves the new personal bullet | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: append clash retries on the next main call with the fresh personal text and original citation | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: landed append with lost answer and failed read-back resumes exactly once | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: fix 1 finding 1: overflow blocks owned and personal note writes | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: fix 1 finding 2: a conflicted append retries its filed source within twenty retained runs | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: fix 1 finding 3: article-equivalent titles stay ambiguous in context and writes | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: fix 1 finding 4: a completed replay cannot consume the new request for the same note | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: fix 1 finding 5: an already-present bound append completes the request before replay | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: fix 1 finding 8: an unrelated filing failure preserves the filed source refusal row | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 2: only the oldest unfinished request settles for one note | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 1: ambiguity settles and reports without a model line | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 1: overflow settles and reports without a model line | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 1: missing Timeline settles and reports without a model line | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 1: unreadable Timeline settles and reports without a model line | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 3: overflow refuses its source on an unnamed owned hub | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 3: ambiguity refuses its source on an unnamed owned hub | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 5: invalid bullet count state proposal leaves the valid append independent | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 5: plain note state proposal leaves the valid append independent | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 6: retry cites the bound source id after its rename | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 3 6: satisfaction follows final citation naming on a filing collision | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 4 1: settlement survives recovery and retention | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 4 2: pending retries keep target and source ids | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 4 3: only settlement archives scripted requests | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 5 1: archived completion uses the record id inside differently named bytes | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 5 2: a retained completion never resolves a renamed target by title again | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 5 3: a request past retention is left as written and archived without an append | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 5 4: one line and one nothing-found row settle two named targets | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 person notes: round 5 5: only a clashed target retries on bound ids before archive | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 1: dated-colon list with no offered line settles as nothing found | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 2: plain list with front matter appends once, updates, archives and completes | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 2: plain list without front matter appends once, updates, archives and completes | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 3: prose stays unreadable even with a sourced line offered | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 4: appendable person and Bower-owned notes remain positive controls | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve CRLF and Unicode byte offsets through main and note-edit | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve star marker through main and note-edit | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve whole nested subtree at top level through main and note-edit | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve last top-level star in mixed markers through main and note-edit | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve last top-level dash in mixed markers through main and note-edit | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve trailing blanks with final newline through main and note-edit | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve no final newline through main and note-edit | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve trailing blanks without final newline through main and note-edit | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve following heading stays outside the list through main and note-edit | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve plain CRLF star subtree before a following heading through main and note-edit | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/c05-person-notes.test.ts:67 | C05 person notes through runner main C05 timeline list C05 timeline list: 5: preseeded Bower star line completes once and replay keeps exact bytes | AssertionError: expected '---\nby: bower\nsummary: Alex\'s plot…' to contain ' · The replacement water butt has arr…' |
| runner/test/claude-provider.test.ts:222 | the Claude provider a new Area with no cited rule or note is refused and retried once | AssertionError: expected 'You plan one Bower tidy-up. You have …' to contain 'Areas/Community garden' |
| runner/test/claude-provider.test.ts:156 | the Claude provider a responsibility does not open a new Project | AssertionError: expected undefined to be defined |
| runner/test/claude-provider.test.ts:297 | the Claude provider the retry runs the model in a folder that still exists | AssertionError: expected [ true, true, true ] to deeply equal [ true, true ] |
| runner/test/claude-provider.test.ts:328 | the Claude provider a new subfolder of an existing Area is not reported as a new area | BowerError: That isn't in your Bower folder any more. |
| runner/test/claude-provider.test.ts:348 | the Claude provider a thing with text and no note or citing line is refused and retried once | AssertionError: expected 'You plan one Bower tidy-up. You have …' to match /no note/ |
| runner/test/claude-provider.test.ts:405 | the Claude provider a second refusal ends the run honestly | AssertionError: expected [ 'reading', 'writing', 'done' ] to deeply equal [ Array(4) ] |
| runner/test/claude-provider.test.ts:463 | the Claude provider a malformed or out-of-schema Claude reply fails truthfully and writes nothing | AssertionError: prose instead of JSON: expected [ 'reading', 'writing', 'done' ] to deeply equal [ 'reading', 'writing', 'failed' ] |
| runner/test/claude-provider.test.ts:585 | the Claude provider contract (TL-P4-01 P4-2) a Claude reply that targets a thing not admitted is refused and writes nothing | AssertionError: a manifest that bins Resources: expected [ 'reading', 'writing', 'done' ] to deeply equal [ 'reading', 'writing', 'failed' ] |
| runner/test/claude-provider.test.ts:585 | the Claude provider contract (TL-P4-01 P4-2) the runner computes ids and digests, never the model | AssertionError: a reply with an operation id: expected [ 'reading', 'writing', 'done' ] to deeply equal [ 'reading', 'writing', 'failed' ] |
| runner/test/corpus-driver.test.ts:30 | a case's between step runs between two runs | AssertionError: expected 'Select context first. Return only {"i…' to contain 'Alex wants an amber kitchen.' |
| runner/test/corpus-driver.test.ts:92 | multi-press corpus answers a pair question through the answer path between presses | Error: between: expected one question from the previous press, found 0 |
| runner/test/corpus-driver.test.ts:121 | multi-press corpus keeps both notes and closes the question after Keep mine | Error: between: expected one question from the previous press, found 0 |
| runner/test/corpus-driver.test.ts:140 | multi-press corpus checks the first press independently of the final report | Error: between: expected one question from the previous press, found 0 |
| runner/test/corpus.test.ts:15 | the capability corpus the corpus scorer passes on the scripted provider outputs | AssertionError: expected { Object (id, pass, ...) } to deeply equal { Object (id, pass, ...) } |
| runner/test/duplicate-by-hash.test.ts:115 | a thing already saved (duplicate-by-hash) a thing whose content is already filed goes to the Bin as already saved | AssertionError: expected [ Array(2) ] to deeply equal [ 'Payslip_Aug.pdf' ] |
| runner/test/duplicate-by-hash.test.ts:84 | a thing already saved (duplicate-by-hash) undo brings an already-saved thing back to the inbox | TypeError: Cannot read properties of null (reading 'run') |
| runner/test/duplicate-by-hash.test.ts:159 | a thing already saved (duplicate-by-hash) a copy inside the same pile keeps one and bins the other as already saved | AssertionError: expected [ 'Offer_letter_final(2).pdf', …(1) ] to have a length of 1 but got 2 |
| runner/test/duplicate-by-hash.test.ts:174 | a thing already saved (duplicate-by-hash) an empty file is never taken for one already saved | AssertionError: expected [ 'empty.txt', 'empty.txt' ] to deeply equal [ 'empty.txt' ] |
| runner/test/duplicate-by-hash.test.ts:186 | a thing already saved (duplicate-by-hash) a saved link with the same address as a filed one is filed as usual | AssertionError: expected [ 'listing-88213.example.url', …(1) ] to deeply equal [ 'listing-88213.example.url' ] |
| runner/test/duplicate-by-hash.test.ts:201 | a thing already saved (duplicate-by-hash) a filed copy the person already binned does not count | AssertionError: expected [ 'Offer_letter_final(2).pdf', …(1) ] to deeply equal [ 'Offer_letter_final(2).pdf' ] |
| runner/test/duplicate-by-hash.test.ts:84 | a thing already saved (duplicate-by-hash) a binned duplicate's open question closes | TypeError: Cannot read properties of null (reading 'run') |
| runner/test/duplicate-by-hash.test.ts:84 | a thing already saved (duplicate-by-hash) a refused Bin keeps its question open | TypeError: Cannot read properties of null (reading 'run') |
| runner/test/duplicate-by-hash.test.ts:84 | a thing already saved (duplicate-by-hash) a copy whose twin left during the run is not binned | TypeError: Cannot read properties of null (reading 'run') |
| runner/test/duplicate-by-hash.test.ts:84 | a thing already saved (duplicate-by-hash) a copy changed during the run is not binned | TypeError: Cannot read properties of null (reading 'run') |
| runner/test/duplicate-by-hash.test.ts:84 | a thing already saved (duplicate-by-hash) pile words with only a saved copy are kept | TypeError: Cannot read properties of null (reading 'run') |
| runner/test/keep-one-note.test.ts:53 | keep one note keep one note carries the facts and bins the other | AssertionError: expected [ …(9) ] to not include 'Projects/Flat hunt/Flat 3 (second).md' |
| runner/test/keep-one-note.test.ts:82 | keep one note undo of keep one note restores both notes and links | AssertionError: expected undefined to be true // Object.is equality |
| runner/test/keep-one-note.test.ts:127 | keep one note the other note changed after the read is not binned | AssertionError: expected '---\nsummary: The same flat from a se…' to contain '- 2026-10-07 · Alex: the landlord acc…' |
| runner/test/keep-one-note.test.ts:159 | keep one note keep-one says what happened when the other note moved or was binned | AssertionError: expected undefined to be '---\nsummary: The same flat from a se…' // Object.is equality |
| runner/test/keep-one-note.test.ts:178 | keep one note a line that only starts like a kept line is carried | AssertionError: expected true to be false // Object.is equality |
| runner/test/model-input-fingerprint.test.ts:81 | model input fingerprint the model input on the C04 fixture equals its golden copy | AssertionError: expected 'Select context first. Return only {"i…' to be 'You plan one Bower tidy-up. You have …' // Object.is equality |
| runner/test/model-input-fingerprint.test.ts:93 | model input fingerprint the raw model input on the C04 fixture equals its golden copy | AssertionError: expected 'Select context first. Return only {"i…' to be 'You plan one Bower tidy-up. You have …' // Object.is equality |
| runner/test/model-input-fingerprint.test.ts:113 | model input fingerprint the timing line carries the model input fingerprint | AssertionError: expected 'timing: end=done total=4 start=0 toke…' to contain 'input=e9cb58a5faf6' |
| runner/test/model-input-fingerprint.test.ts:152 | model input fingerprint two runs of the same case on fresh ids give the same input fingerprint | AssertionError: expected '' to match /^[0-9a-f]{12}$/ |
| runner/test/model-input-fingerprint.test.ts:174 | model input fingerprint the same case with other ids has the same fingerprint | AssertionError: expected '' to match /^[0-9a-f]{12}$/ |
| runner/test/model-input-fingerprint.test.ts:268 | model input fingerprint two fresh fake folders on the same case give the same input fingerprint through main | AssertionError: expected 'Select context first. Return only {"i…' to be 'Select context first. Return only {"i…' // Object.is equality |
| runner/test/model-input-fingerprint.test.ts:290 | model input fingerprint a change in one input section moves only that section hash | AssertionError: expected 'timing: end=done total=3 start=0 toke…' to match /sections=prompt:[0-9a-f]{6},tree:[0-9…/ |
| runner/test/pair-ask.test.ts:54 | two notes for one thing (keep-one-not-asked) two notes for one thing are asked as a pair | AssertionError: expected [] to deeply equal [ ObjectContaining{…} ] |
| runner/test/pair-ask.test.ts:71 | two notes for one thing (keep-one-not-asked) a words-only pile can become a Timeline line | AssertionError: expected [ Array(1) ] to include '- 2026-10-07 · Second viewing booked …' |
| runner/test/pair-ask.test.ts:95 | two notes for one thing (keep-one-not-asked) a words-only pile whose lines are all in its note already is already saved | AssertionError: expected [ Array(1) ] to deeply equal [] |
| runner/test/pair-ask.test.ts:113 | two notes for one thing (keep-one-not-asked) a yes to an older pair question whose note is in the Bin settles and names it | AssertionError: expected [ { id: 'q-merge-flat-3', …(4) } ] to deeply equal [] |
| runner/test/per-thing-ask.test.ts:70 | per-thing asks (TL-P4-08 addendum 4) an ask about one thing leaves it in the inbox and files the rest of its pile | AssertionError: expected [ { command: 'claude', …(7) }, …(1) ] to have a length of 1 but got 2 |
| runner/test/per-thing-ask.test.ts:115 | per-thing asks (TL-P4-08 addendum 4) the reply schema takes its state limits from note-edit | AssertionError: expected { code: +0, calls: 2 } to deeply equal { code: +0, calls: 1 } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a notJson refusal is retried once with its reason | AssertionError: expected { kind: 'notJson', retried: false } to deeply equal { kind: 'notJson', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noText refusal is retried once with its reason | AssertionError: expected { kind: 'noText', retried: false } to deeply equal { kind: 'noText', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a notIntent refusal is retried once with its reason | AssertionError: expected { kind: 'notIntent', retried: false } to deeply equal { kind: 'notIntent', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a thingKeys refusal is retried once with its reason | AssertionError: expected { kind: 'thingKeys', retried: false } to deeply equal { kind: 'thingKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a thingNotAdmitted refusal is retried once with its reason | AssertionError: expected { kind: 'thingNotAdmitted', …(1) } to deeply equal { kind: 'thingNotAdmitted', …(1) } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a thingTwice refusal is retried once with its reason | AssertionError: expected { kind: 'thingTwice', retried: false } to deeply equal { kind: 'thingTwice', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a placeOutside refusal is retried once with its reason | AssertionError: expected { Object (kind, retried) } to deeply equal { kind: 'placeOutside', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a nameChangesKind refusal is retried once with its reason | AssertionError: expected { kind: 'nameChangesKind', …(1) } to deeply equal { kind: 'nameChangesKind', …(1) } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a rawName refusal is retried once with its reason | AssertionError: expected { kind: 'rawName', retried: false } to deeply equal { kind: 'rawName', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a numbers refusal is retried once with its reason | AssertionError: expected { kind: 'numbers', retried: false } to deeply equal { kind: 'numbers', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a newFolder refusal is retried once with its reason | AssertionError: expected { kind: 'newFolder', retried: false } to deeply equal { kind: 'newFolder', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteForNote refusal is retried once with its reason | AssertionError: expected { kind: 'noteForNote', retried: false } to deeply equal { kind: 'noteForNote', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteKeys refusal is retried once with its reason | AssertionError: expected { kind: 'noteKeys', retried: false } to deeply equal { kind: 'noteKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteName refusal is retried once with its reason | AssertionError: expected { kind: 'noteName', retried: false } to deeply equal { kind: 'noteName', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteSummary refusal is retried once with its reason | AssertionError: expected { kind: 'noteSummary', retried: false } to deeply equal { kind: 'noteSummary', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteBody refusal is retried once with its reason | AssertionError: expected { kind: 'noteBody', retried: false } to deeply equal { kind: 'noteBody', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteSections refusal is retried once with its reason | AssertionError: expected { Object (kind, retried) } to deeply equal { kind: 'noteSections', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteLink refusal is retried once with its reason | AssertionError: expected { kind: 'noteLink', retried: false } to deeply equal { kind: 'noteLink', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteMdLink refusal is retried once with its reason | AssertionError: expected { kind: 'noteMdLink', retried: false } to deeply equal { kind: 'noteMdLink', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteWeb refusal is retried once with its reason | AssertionError: expected { kind: 'noteWeb', retried: false } to deeply equal { kind: 'noteWeb', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a pileNotAdmitted refusal is retried once with its reason | AssertionError: expected { kind: 'pileNotAdmitted', …(1) } to deeply equal { kind: 'pileNotAdmitted', …(1) } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a pileTwice refusal is retried once with its reason | AssertionError: expected { kind: 'pileTwice', retried: false } to deeply equal { kind: 'pileTwice', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a tooManyLines refusal is retried once with its reason | AssertionError: expected { Object (kind, retried) } to deeply equal { kind: 'tooManyLines', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineKeys refusal is retried once with its reason | AssertionError: expected { kind: 'lineKeys', retried: false } to deeply equal { kind: 'lineKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineNote refusal is retried once with its reason | AssertionError: expected { kind: 'lineNote', retried: false } to deeply equal { kind: 'lineNote', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineText refusal is retried once with its reason | AssertionError: expected { kind: 'lineText', retried: false } to deeply equal { kind: 'lineText', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineCites refusal is retried once with its reason | AssertionError: expected { kind: 'lineCites', retried: false } to deeply equal { kind: 'lineCites', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineUncited refusal is retried once with its reason | AssertionError: expected { kind: 'lineUncited', retried: false } to deeply equal { kind: 'lineUncited', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noNote refusal is retried once with its reason | AssertionError: expected { kind: 'noNote', retried: false } to deeply equal { kind: 'noNote', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateKeys refusal is retried once with its reason | AssertionError: expected { kind: 'stateKeys', retried: false } to deeply equal { kind: 'stateKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateNote refusal is retried once with its reason | AssertionError: expected { kind: 'stateNote', retried: false } to deeply equal { kind: 'stateNote', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateTwice refusal is retried once with its reason | AssertionError: expected { kind: 'stateTwice', retried: false } to deeply equal { kind: 'stateTwice', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateText refusal is retried once with its reason | AssertionError: expected { kind: 'stateText', retried: false } to deeply equal { kind: 'stateText', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateCites refusal is retried once with its reason | AssertionError: expected { kind: 'stateCites', retried: false } to deeply equal { kind: 'stateCites', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askKeys refusal is retried once with its reason | AssertionError: expected { kind: 'askKeys', retried: false } to deeply equal { kind: 'askKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askNotAdmitted refusal is retried once with its reason | AssertionError: expected { kind: 'askNotAdmitted', …(1) } to deeply equal { kind: 'askNotAdmitted', …(1) } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askNotes refusal is retried once with its reason | AssertionError: expected { kind: 'askNotes', retried: false } to deeply equal { kind: 'askNotes', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askTwice refusal is retried once with its reason | AssertionError: expected { kind: 'askTwice', retried: false } to deeply equal { kind: 'askTwice', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askAlsoFiles refusal is retried once with its reason | AssertionError: expected { Object (kind, retried) } to deeply equal { kind: 'askAlsoFiles', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askText refusal is retried once with its reason | AssertionError: expected { kind: 'askText', retried: false } to deeply equal { kind: 'askText', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a keepKeys refusal is retried once with its reason | AssertionError: expected { kind: 'keepKeys', retried: false } to deeply equal { kind: 'keepKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a keepNote refusal is retried once with its reason | AssertionError: expected { kind: 'keepNote', retried: false } to deeply equal { kind: 'keepNote', retried: true } |
| runner/test/per-thing-ask.test.ts:201 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a keepNotAsked refusal is retried once with its reason | AssertionError: expected { Object (kind, retried) } to deeply equal { kind: 'keepNotAsked', retried: true } |
| runner/test/per-thing-ask.test.ts:217 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a structured output beside a bad result is refused and asked again | AssertionError: expected 'Select context first. Return only {"i…' to contain 'Your reply was refused: a result that…' |
| runner/test/q1-continuation.test.ts:267 | Q1a stored answers through production entry points Q1a q1-clear-work-with-waiting-item: an option asking leaves its item and files clear work | AssertionError: expected 'Inbox/Room papers/Clear.md' to be 'Areas/Home/Clear.md' // Object.is equality |
| runner/test/q1-continuation.test.ts:303 | Q1a stored answers through production entry points Q1a q1-options-exact-action: consent resolves stored folder id despite duplicate labels and rename | AssertionError: expected [ 'f14' ] to deeply equal [ 'f8' ] |
| runner/test/q1-continuation.test.ts:345 | Q1a stored answers through production entry points Q1a q1-options-exact-action: two to four script candidates accepted and fabricated or fifth refused | AssertionError: question stores script-bound options: expected [] to have a length of 2 but got +0 |
| runner/test/q1-continuation.test.ts:400 | Q1a stored answers through production entry points Q1a q1-text-person-provenance: later answer wins within one asking and older asking cannot answer a new one | AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ] |
| runner/test/q1-continuation.test.ts:451 | Q1a stored answers through production entry points Q1a q1-text-person-provenance: person words stay subject data and document instructions grant no consent | AssertionError: expected [ { …(3) }, { …(3) } ] to deeply equal [ ObjectContaining{…} ] |
| runner/test/q1-continuation.test.ts:484 | Q1a stored answers through production entry points Q1a q1-continuation-members-and-journal: today takes new same-pile items and all journal but no new pile | AssertionError: expected [] to deeply equal [ 'f16', 'f18' ] |
| runner/test/q1-continuation.test.ts:517 | Q1a stored answers through production entry points Q1a q1-waits-one-run-and-replay: two typed answers wait batch once and replay does not dispatch | AssertionError: expected undefined to deeply equal [] |
| runner/test/q1-continuation.test.ts:544 | Q1a stored answers through production entry points Q1a q1-two-rounds-no-third: thing exhausts after two saved askings and words reset | AssertionError: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:544 | Q1a stored answers through production entry points Q1a q1-two-rounds-no-third: pile exhausts after two saved askings and words reset | AssertionError: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:621 | Q1a stored answers through production entry points Q1a q1-continuation-budget-meter: typed waiting and replay do zero admission reads with ordinary model usage | AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ] |
| runner/test/q1-continuation.test.ts:655 | Q1a stored answers through production entry points Q1a q1-legacy-question-answer-status: old stored records read and reports never leak option actions | AssertionError: options produce a durable readable manifest: expected null not to be null |
| runner/test/q1-continuation.test.ts:1557 | Q1a stored answers through production entry points Q1a q1-pile-projection: exhausted persists on reload waiting wins and word edit clears both | AssertionError: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:822 | Q1a stored answers through production entry points Q1a q1-two-rounds-no-third: retries failed saves and dispatch replay count only durable askings | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/q1-continuation.test.ts:1557 | Q1a stored answers through production entry points Q1a q1-two-rounds-no-third: exhausted identity follows reuploaded content and leaving ends it | AssertionError: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:875 | Q1a stored answers through production entry points Q1a q1-legacy-question-answer-status: stored choices keep content and name-place fences | AssertionError: expected undefined to match object { name: 'Clear.md', …(2) } |
| runner/test/q1-continuation.test.ts:932 | Q1a fix round 1 through production entry points Q1a fix 1.1: second-answer placement precedes exhaustion after an unresolved second answer | AssertionError: the production runner writes asking one: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:932 | Q1a fix round 1 through production entry points Q1a fix 1.2: instructions scope preserves inbox counters and exhausted subjects without a third asking | AssertionError: the production runner writes asking one: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:1557 | Q1a fix round 1 through production entry points Q1a fix 1.3: pile and member share two rounds and only changed words permit another asking | AssertionError: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:1557 | Q1a fix round 1 through production entry points Q1a fix 1.4: a same-bytes reupload retains hash history through the planner and writes no asking | AssertionError: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:1122 | Q1a fix round 1 through production entry points Q1a fix 1.5: missing or outside-root stored option folders cannot authorize alternative filing | AssertionError: expected [ 'f14' ] to deeply equal [ 'f8' ] |
| runner/test/q1-continuation.test.ts:932 | Q1a fix round 1 through production entry points Q1a fix 1.5b: a gone option folder leaves the item waiting and the next run asks again as the next round | AssertionError: the production runner writes asking one: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:1205 | Q1a fix round 1 through production entry points Q1a fix 1.6: words-only pile consent places its generated note in the chosen stored folder | AssertionError: positive control: a words-only pile generates one note: expected [] to have a length of 1 but got +0 |
| runner/test/q1-continuation.test.ts:932 | Q1a fix round 3 through production entry points Q1a fix 3.1: unavailable chosen folders force a new asking before next-tidy model placement | AssertionError: the production runner writes asking one: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:932 | Q1a fix round 3 through production entry points Q1a fix 3.2: mixed member histories cap pile askings and count only the waiting member | AssertionError: the production runner writes asking one: expected undefined to be defined |
| runner/test/q1-continuation.test.ts:1383 | Q1a fix round 3 through production entry points Q1a fix 3.3: exhausted members stay untouched while existing and later clear siblings file | AssertionError: expected [ 'f14' ] to deeply equal [ 'f7' ] |
| runner/test/q1-continuation.test.ts:1452 | Q1a fix round 4 through production entry points Q1a fix 4.1: a loose Inbox file whose chosen folder is gone is asked again as the next round | AssertionError: expected undefined to deeply equal ObjectContaining {"subject": "f16"} |
| runner/test/q1-continuation.test.ts:1452 | Q1a fix round 4 through production entry points Q1a fix 4.2: every member-subject path re-asks once after an unavailable folder: folder member | AssertionError: expected undefined to deeply equal ObjectContaining {"subject": "f16"} |
| runner/test/q1-continuation.test.ts:1452 | Q1a fix round 4 through production entry points Q1a fix 4.2: every member-subject path re-asks once after an unavailable folder: loose Inbox file | AssertionError: expected undefined to deeply equal ObjectContaining {"subject": "f16"} |
| runner/test/q1-continuation.test.ts:1452 | Q1a fix round 4 through production entry points Q1a fix 4.2: every member-subject path re-asks once after an unavailable folder: words-only pile | AssertionError: expected undefined to deeply equal ObjectContaining{…} |
| runner/test/q1c-live.test.ts:147 | Q1c durable publication through main and createApp().request q1-live-snapshot-over-64kib-trims | AssertionError: expected undefined to be defined |
| runner/test/q1c-live.test.ts:210 | Q1c durable publication through main and createApp().request q1-live-publication-transport-failure-keeps-the-run | AssertionError: expected undefined to be defined |
| runner/test/q1c-live.test.ts:284 | Q1c durable publication through main and createApp().request q1-live-question-long-note-name-publish… | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/q1c-live.test.ts:284 | Q1c durable publication through main and createApp().request q1-live-question-invalid-shape-publishes | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/q1c-live.test.ts:318 | Q1c durable publication through main and createApp().request Q1c fix 1: eleven askings keep clear work and publish the first ten by askedAt | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/q1c-live.test.ts:358 | Q1c durable publication through main and createApp().request Q1c fix 1: a crash after manifest persistence recovers questions with stored option actions intact | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/q1c-live.test.ts:450 | Q1c durable publication through main and createApp().request Q1c q1-live-question-before-clear-effects-end: durable publication | AssertionError: expected [ Array(2) ] to include 'Resources/Clear.md' |
| runner/test/q1c-live.test.ts:462 | Q1c durable publication through main and createApp().request Q1c q1-live-question-before-clear-effects-end: same-run recovery republishes without a second model reply | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/second-brain-method.test.ts:85 | the second-brain method (TL-P4-08) an ambiguous thing stays in the inbox with a question and the run goes on | AssertionError: expected { pass: false, unmet: [ …(2) ] } to deeply equal { pass: true, unmet: [] } |
| runner/test/second-brain-method.test.ts:127 | the second-brain method (TL-P4-08) a later run does not repeat an open question | AssertionError: expected [] to have a length of 1 but got +0 |
| runner/test/second-brain-method.test.ts:146 | the second-brain method (TL-P4-08) a document that only confirms a known fact updates the note and makes none | AssertionError: expected { pass: false, unmet: [ …(4) ] } to deeply equal { pass: true, unmet: [] } |
| runner/test/second-brain-method.test.ts:196 | B3b hot: evidence-only method verdict covers hidden unarchived refresh | AssertionError: expected { pass: false, unmet: [ …(4) ] } to deeply equal { pass: true, unmet: [] } |
| runner/test/state-rewrite.test.ts:85 | a change kind of its own for Current state (C05) a Bower-owned Current state is rewritten and undo restores it | AssertionError: expected [ 'One application open.' ] to deeply equal [ 'One application open.', …(1) ] |
| runner/test/state-rewrite.test.ts:123 | a change kind of its own for Current state (C05) a Current state the person edited gets a line and a question, never a rewrite | AssertionError: expected undefined to be 'Industrial Designer, Ferrowick' // Object.is equality |
| runner/test/state-rewrite.test.ts:141 | a change kind of its own for Current state (C05) no fallback line when the run already cites the same thing on that note | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:162 | a change kind of its own for Current state (C05) the fallback line names only what the section lacks | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:173 | a change kind of its own for Current state (C05) a person-edited section's fallback names none of Bower's last-written lines | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:187 | a change kind of its own for Current state (C05) Bower's last state is read from the previous state change, not searched | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:200 | a change kind of its own for Current state (C05) with no previous state change to read, every line the section lacks is news | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:221 | a change kind of its own for Current state (C05) a run manifest that cannot be read is passed over, and every line the section lacks is news | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:67 | a change kind of its own for Current state (C05) after a Bower append the next run only adds a line | TypeError: Cannot read properties of null (reading 'operations') |
| runner/test/state-rewrite.test.ts:67 | a change kind of its own for Current state (C05) an unmarked Current state is never adopted without a rule | TypeError: Cannot read properties of null (reading 'operations') |
| runner/test/state-rewrite.test.ts:280 | a change kind of its own for Current state (C05) a yes rule lets Bower adopt the section | AssertionError: expected [ 'One application open.' ] to deeply equal [ 'One application open.', …(1) ] |
| runner/test/state-rewrite.test.ts:296 | a change kind of its own for Current state (C05) undo restores an empty section empty | AssertionError: expected [] to deeply equal [ 'One application open.', …(1) ] |
| runner/test/things-normalised.test.ts:85 | things section normalisation two fresh runs of the same case give the same things section hash | Error: No things hash captured from timing |
| runner/test/things-normalised.test.ts:159 | things section normalisation a multi-thing pile with a link gives the same things section hash on fresh runs | Error: No things hash captured from timing |

### Final boundary

Stopped production changes after both full sweeps finished and the pinned prompt movements were listed.
The preserved diff is a draft only. No commits: the user forbids git-writing commands.
No UI, e2e, golden/fixture updates, configured type-row contract extension, or unrelated-home repairs.


## Sweep 2

Red-owning test session; the owner authorized lead plan (1), the second TL-P4-51 sweep.
Pinned committed implementation draft: `86bc6bc1f6d062cf97abbfc3d8a65ae7f625cfc6`.
No production edits, network calls, git write commands, dependency changes, or repository test output.
The coordinator owns the commits. Logs, measurement files and diagnostics are in OS temp.

### Transport adaptation

Every corpus/main fixture transport now passes through `phaseAwareClaude` in
`runner/test/b1-planning-support.ts`. This includes raw inline providers, recordedClaude, per-thing-ask,
q1-continuation, q1c-live, state-rewrite, second-brain-method, ask-answer-loop, ask-one-per-thing,
ask-only-lines, duplicate-by-hash, keep-one-note, pair-ask, C04/C05, B23 and corpus replies.
The two driver boundaries supply FakeDrive/root/admission out of band, without changing model input
or charging fixture inspection as production traffic. Standalone provider tests use the same helper.
Already adapted and explicit B1d selection transports are retained through that helper, never adapted twice.

The selection binds execution source ids, exact destination ids, cited target notes, basis notes,
existing body-link targets, pair notes and the same asking/options. Only the admitted sources actually
used by the execution are selected; omitted siblings remain omitted. Journal/words sources carry their
uncited/pair context. Invalid execution ids and shapes remain in the execution reply for production refusal.
Selection retries repeat the frozen selection; execution retries keep their original attempt order.
Every semantic call/retry still reaches the callback and production timing. Q1 fixtures which varied
ask kind by physical call number now vary by logical planning step, so the two phases agree.

Per-thing-ask and C04 validation arrays continue to observe execution attempts; their original refusal,
retry, source and copy assertions are unchanged. Other full-note observation arrays observe execution
context. Main's timing still counts selection and execution; the helper tests independently pin both
phases and both retry indices. The cold B1c projection observations occur once at selection preparation;
its zero-write and one-physical-prefix-read numbers are unchanged.

### Ruled fixture and phase changes

- Exhaustion: both helpers derive waiting from untouched inbox ids/bytes and the done status.
  They no longer require or manufacture dispositions.json. A missing report stays missing; it is not a prerequisite for waiting. Existing no-manifest/source-mutation,
  next-admission, empty-report and console-count checks remain.
- Hot: the warm fixture seeds `- 2026-10-06 · Existing change. · op:012345abcdef`.
  The hot assertions still require that exact key once after maintain. renderHot is untouched.
- Folded MOC: warm fixtures use existing indexedFront, mocSnapshot and mocMembership to seed state.
  The unchanged-map control uses mocEdit to settle the seed's generated regions, then files outside
  the map's folder. It asserts unchanged bytes/membership and zero full map reads, including maintain.
  A person-edited map is the positive control: one full ownership read, with the new comment preserved.
  The picked-five/unpicked-member/six-refused bounds remain unchanged.
- B1a/B1c: discovery observations include pre-planning refresh, and changed Range reads move from
  maintaining=true to false. The two/three discovery-read bounds, one-feed bounds, zero descendant
  media, one Range per changed note, 41+count whole-run traffic and other physical bounds remain.
  The warm index spy observes refreshPlanning, which now owns discovery, instead of the unused
  planningIndex wrapper. Listing read-ahead moves existing source/declaration media into refresh:
  each is still physically read exactly once (zero for instructions). Discovery retains its exact
  state/feed/index set, excluding those baseline admission reads in either phase. Maintenance spies
  forward the new prepared-refresh arguments; dropping them had forced a second feed drain in the fixture.

### Selection prompt golden measurement

The latest pre-sweep inventory showed both prompt goldens failing. The first selection input was measured
through corpus -> main against the pinned committed draft, with production unchanged. Tests wrote the
measurement to `/tmp/b1d-sweep2-model-input.raw.txt` and `.normalized.txt` only; the temporary measurement
code was removed. Goldens were then copied by this session, never regenerated by a test.
Only the selection prompt goldens changed; no execution-prompt or traffic golden changed.

| Selection golden | Before bytes / SHA256 prefix | After bytes / SHA256 prefix |
| --- | --- | --- |
| model-input-c04.golden.txt | 9434 / 5b7a9ded4447 | 10834 / da7b69240701 |
| model-input-c04.raw.golden.txt | 9430 / e1e7c6c36b37 | 10832 / c0973cdc4163 |

Each diff is +3/-1 lines: the selection directive; the committed folderCandidates option instruction;
and the last JSON line replaces eager full notes with an empty notes array plus foldersById, sources,
candidate id/version/coverage and indexed metadata. Rules, method order, extracted source text,
index projection and existing execution instructions otherwise stay byte-identical. The option line
is part of the measured first selection prompt; no separate execution golden is updated.
Diff evidence: `/tmp/b1d-sweep2-golden.diff` and `/tmp/b1d-sweep2-golden-measure.log`.
The raw golden now passes. The normalized golden is byte-identical to its measurement; its test still
stops at an unchanged old two-call assertion (valid selection plus two malformed execution attempts is three).
The timing/fresh-id normalization failures are preserved; the test helper does not normalize production ids.

### Tests changed, by file

tests changed: runner/test/b1-planning-support.ts: the one phase adapter, exact used ids/asks/wants, retries, inbox-derived waiting, strict hot seed and real MOC retrieval fixtures.
tests changed: runner/test/b1-planning-support.test.ts: protocol controls for omitted sources, exact targets/options, both phases, retry kind/index and adapter reuse.
tests changed: runner/test/b1-planning.test.ts: ruled hot op key, unchanged-map retrieval fixture and changed-map positive control; explicit semantic replies use the helper.
tests changed: runner/test/b1a-contract.test.ts: move discovery observation to planning plus maintain without changing physical-read bounds.
tests changed: runner/test/b1-index.test.ts: observe selection preparation and refreshPlanning; move Range phase, retain physical-read/whole-run invariants.
tests changed: runner/test/claude-provider.test.ts: exhaustion waiting is untouched inbox/status instead of a dispositions.json row, and no newly written report file is required.
tests changed: runner/test/corpus-run.ts: route every inline/recorded corpus transport and redispatch through the existing helper, supplying the immutable fixture out of band.
tests changed: runner/test/real-world.ts: route every live-adapter test model transport through the same helper and pass seeded fixture data out of band.
tests changed: runner/test/per-thing-ask.test.ts: selection binds the corrected execution reply; original execution validation attempts and refusal assertions stay intact.
tests changed: runner/test/c04-prompt-fixes.test.ts: same shared selection adapter and preserved execution validation observations/reply order.
tests changed: runner/test/c04-incorporation.test.ts: shared adapter for standalone providers; full execution context observations stay with execution.
tests changed: runner/test/c05-person-notes.test.ts: shared adapter; full-note observation arrays capture execution context.
tests changed: runner/test/duplicate-by-hash.test.ts: shared adapter; observe execution sources once and inject source changes during execution, preserving race timing.
tests changed: runner/test/q1-continuation.test.ts: custom main uses the helper; world varies asking kind by logical step, and its refusal by execution attempt, with all physical calls counted.
tests changed: runner/test/q1c-live.test.ts: custom recovery main uses the shared helper as its ordinary world does; publication/recovery assertions stay unchanged.
tests changed: runner/test/model-input-fingerprint.test.ts: standalone providers use the shared helper; no fingerprint/assertion normalization changes.
tests changed: runner/test/things-normalised.test.ts: standalone section-hash fixtures now reach execution through the shared helper.
tests changed: runner/test/fixtures/model-input-c04.golden.txt: measured normalized first selection prompt on the committed draft only.
tests changed: runner/test/fixtures/model-input-c04.raw.golden.txt: measured raw first selection prompt on the committed draft only.
tests changed: docs/harness/2026-10-11-b1d-selection-notes.md: Sweep 2 scope, per-file reasons, measured diffs, remaining contracts and complete failure inventory.
removed: none.

### Cannot adapt without changing the test's point or an unallocated assertion

No production fallback or wider target authority was added to make these pass. These remain explicit
contradictions/gaps rather than fixture protocol failures:

| Home | Why it remains |
| --- | --- |
| per-thing-ask; c04-prompt-fixes; claude-provider refusal controls | Production's execution retry always receives the generic frozen-selection reason; these tests require the actual refusal kind/reason and the existing asking-once-more diagnostic. Rewriting their expected text would remove their point. |
| state-rewrite; ask-only-lines; C05 source-only plans | Execution rejects uncited updates without an admitted journal, although these existing tests intentionally exercise the uncited fallback. Adding cites to those replies would change their point. |
| c04-incorporation:124; corpus-driver:30 | Existing assertions inspect full L3 text at the first call/second-press selection. Selection is metadata only. Moving these behavior assertions to execution or weakening them needs a separate ruling; preserved here. |
| claude-provider:295–296; model-input-fingerprint:76; ask-answer-loop:888; q1-continuation retry timing | Residual old two-call / one-added-call / two-result token expectations did not belong to the first sweep's allocated assertion rows. Selection adds one physical call/result. They are listed, not silently raised or hidden. |
| ask-answer-loop:323; q1-continuation answer-provenance projections | The first sweep raised physical call counts but left aggregate answer arrays expecting one copy; both phases carry the answer. Deduplicating test observations would stop verifying the actual model inputs. |
| claude-provider exhaustion helper / status-refusal cases; q1-continuation invalid options | Exhaustion and malformed/out-of-authority replies now end done without a report file. The remaining controls require saving phase or failed status. The exhaustion helper follows the inbox/status ruling; other status contracts stay visible. |
| c04-hardware-receipt; claude-provider new subfolder | Old filing fixtures require a child under an existing but nonvisible candidate parent (or multiple new levels). Inventing a visible parent or changing the destination removes the filing-policy point. |
| C05 pending/recovery/retention / stored state answers | These controls require verified pending records, old target/source ids and no-model state actions. Their unchanged assertions still fail after valid two-step transport; they need implementation fixes. |
| model-input-fingerprint timing/fresh ids | The timing mechanism hashes execution while the test expects selection; indexed/folder dictionary keys and source ids are incompletely normalized. Refreshing a golden cannot repair normalization or timing semantics. |

B1a/B1c phase compatibility passes all 49 tests after forwarding the prepared refresh and
observing the same physical discovery/admission reads in their new phase. Log `/tmp/b1d-sweep2-phase2.log`.

The first post-adaptation sweep also exposed old model callbacks that changed asking kind between
selection and execution merely because the physical call count advanced. Those were repaired by logical
step/attempt binding, preserving the question-history tests' point and leaving their assertions intact.

### Offline research and gates

Reused the packet's offline citations without network or independent reverification:
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://arxiv.org/html/2506.08837v1
https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Baseline whole runner suite: 670 tests; 396 pass, 274 fail, `/tmp/b1d-sweep2-before.json` and `.log`.
Final command: `pnpm -C runner exec vitest run --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-sweep2-final.json --cache=false`.
All test logs and observations use OS temp. Runner TypeScript and touched-file ESLint pass;
logs `/tmp/b1d-sweep2-types.log`, `/tmp/b1d-sweep2-lint.log`, `/tmp/b1d-sweep2-last-lint.log`.
The B1 planning/helper controls pass, including both changed/unchanged map controls;
log `/tmp/b1d-sweep2-b1.log`. Git diff whitespace validation passes.
Full pnpm check and e2e are not run: the owner's explicit runner-only/no-repository-output scope takes
precedence over the worker packet's standard gates, which write repository result/mark files.
No screen, production file or corpus seed file was changed; traffic goldens and contract bounds stay pinned.

### Final whole runner result and complete failure inventory

Result: **FAIL — 673 tests, 568 passed and 105 failed**. All 22 B1 planning/helper tests and
all 49 B1a/B1c compatibility tests pass. The former 274-failure inventory is reduced by 169,
with three additional protocol tests. Whole-run command used `--maxWorkers=2`, JSON output in
`/tmp/b1d-sweep2-final.json`, all console output in `/tmp/b1d-sweep2-final.log`, and `--cache=false`.

This is not a claim that the sweep has achieved a known-implementation-gaps-only green boundary.
The remaining failures include the unchanged residual call/token/answer-array and first-call L3
contracts listed above, in addition to genuine execution diagnostics, uncited-writing and C05/Q1
implementation gaps. They cannot all be removed under the owner's assertion/production restrictions.
No fixture-binding/import/timeout failure remains. TypeErrors in old state-manifest inspections are
secondary to the refused uncited execution producing no manifest, not transport import failures.
No acceptance, performance, deployment, integration or commit is claimed.

| Failing file | Failed tests |
| --- | ---: |
| runner/test/ask-answer-loop.test.ts | 11 |
| runner/test/ask-only-lines.test.ts | 1 |
| runner/test/c04-incorporation.test.ts | 2 |
| runner/test/c04-prompt-fixes.test.ts | 2 |
| runner/test/c05-bounded-reads.test.ts | 8 |
| runner/test/c05-incorporation.test.ts | 1 |
| runner/test/c05-person-notes.test.ts | 5 |
| runner/test/claude-provider.test.ts | 8 |
| runner/test/corpus-driver.test.ts | 1 |
| runner/test/model-input-fingerprint.test.ts | 4 |
| runner/test/per-thing-ask.test.ts | 45 |
| runner/test/q1-continuation.test.ts | 6 |
| runner/test/state-rewrite.test.ts | 11 |

Each row below is one failed test and its first observed assertion. Repeated soft failures and full
messages remain in the JSON evidence; the table does not discard additional failures within a test.
Where a shared exhaustion/manifest helper fails first, the assertion's helper location is retained.

| File:line | Failed test | First observed failure |
| --- | --- | --- |
| runner/test/ask-answer-loop.test.ts:323 | an answer applies at once (TL-P4-08 addendum 8) answers reach the model path | AssertionError: expected [ { …(2) }, { …(2) } ] to deeply equal [ ObjectContaining{…} ] |
| runner/test/ask-answer-loop.test.ts:590 | an answer applies at once (TL-P4-08 addendum 8) a yes to write it applies the shown text with no model call | AssertionError: expected undefined to deeply equal [ 'Two applications open.', …(1) ] |
| runner/test/ask-answer-loop.test.ts:623 | an answer applies at once (TL-P4-08 addendum 8) write it re-asks when the section changed since it was shown | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:643 | an answer applies at once (TL-P4-08 addendum 8) a write it yes whose note is gone writes one answered row | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:672 | an answer applies at once (TL-P4-08 addendum 8) write it re-asks when the note changed elsewhere since it was shown | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:697 | an answer applies at once (TL-P4-08 addendum 8) a clash at write time leads to the re-ask with the new sentence and no extra press | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:743 | an answer applies at once (TL-P4-08 addendum 8) only a clash keeps an answer for a re-ask | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:772 | an answer applies at once (TL-P4-08 addendum 8) the same non-clash refusal never starts more runs than the cap, then shows the not-written row | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:843 | an answer applies at once (TL-P4-08 addendum 8) a write it with nothing to write writes one answered row | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:96 | an answer applies at once (TL-P4-08 addendum 8) a lone no to write it closes the question with no model call | AssertionError: expected 409 to be 200 // Object.is equality |
| runner/test/ask-answer-loop.test.ts:888 | an answer applies at once (TL-P4-08 addendum 8) a yes to write it beside a pile asks the model | AssertionError: expected 4 to be 3 // Object.is equality |
| runner/test/ask-only-lines.test.ts:36 | a run that only asks keeps the Timeline lines the model added with no cites | AssertionError: expected '---\nsummary: Looking for a flat near…' to contain 'Viewing moved to Saturday.' |
| runner/test/c04-incorporation.test.ts:124 | what the model is shown (P4-3) the model context carries bounded extracted text for each admitted thing | AssertionError: expected [] to deeply equal [ 'Areas/Garden/Garden.md' ] |
| runner/test/c04-incorporation.test.ts:210 | the C04 slice through the Claude provider (P4-3) the C04 corpus cases score green with scripted proposals | AssertionError: expected { id: 'c04-hardware-receipt', …(2) } to deeply equal { id: 'c04-hardware-receipt', …(2) } |
| runner/test/c04-prompt-fixes.test.ts:64 | c04 prompt fixes (TL-P4-08 addendum 5) a number not found in its sources is refused and retried once | AssertionError: expected 'You plan one Bower tidy-up. You have …' to match /Your reply was refused: .*"30".*Reply…/ |
| runner/test/c04-prompt-fixes.test.ts:100 | c04 prompt fixes (TL-P4-08 addendum 5) a raw file name is replaced by a plain name | AssertionError: expected 'You plan one Bower tidy-up. You have …' to match /Your reply was refused: .*name.*Reply…/ |
| runner/test/c05-bounded-reads.test.ts:197 | C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:148 | C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence | AssertionError: production records must form a verified run: expected 'new' to be 'run' // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:498 | C05 bounded reads: fix 2 control: a waiting retry whose pending relocation lands completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:498 | C05 bounded reads: fix 2: a waiting retry whose pending relocation failed completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:498 | C05 bounded reads: fix 2: a waiting retry interrupted after its pointer and before its append appends once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:401 | C05 bounded reads: fix 1 control: a waiting retry whose archive lands completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:401 | C05 bounded reads: fix 1: a waiting retry whose archive move failed completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:148 | C05 bounded reads: horizon: past 20 runs uses listing age and TOO_OLD_WHY without a chain walk | AssertionError: production records must form a verified run: expected 'new' to be 'run' // Object.is equality |
| runner/test/c05-incorporation.test.ts:74 | the C05 slice through the Claude provider the C05 corpus cases score green with scripted proposals | AssertionError: expected { …(11) } to deeply equal { …(11) } |
| runner/test/c05-person-notes.test.ts:434 | C05 person notes through runner main C05 person notes: fix 1 finding 2: a conflicted append retries its filed source within twenty retained runs | AssertionError: expected 'new' to be 'run' // Object.is equality |
| runner/test/c05-person-notes.test.ts:448 | C05 person notes through runner main C05 person notes: fix 1 finding 3: article-equivalent titles stay ambiguous in context and writes | AssertionError: expected [ 'Areas/Home/Garden plot.md', …(1) ] to not include 'Areas/Home/Garden plot.md' |
| runner/test/c05-person-notes.test.ts:921 | C05 person notes through runner main C05 person notes: round 4 2: pending retries keep target and source ids | AssertionError: renamed target, replacement=true: expected '---\nsummary: Alex\'s plot at the Lar…' to be '---\nsummary: Alex\'s plot at the Lar…' // Object.is equality |
| runner/test/c05-person-notes.test.ts:748 | C05 person notes through runner main C05 person notes: round 5 2: a retained completion never resolves a renamed target by title again | AssertionError: expected 'new' to be 'run' // Object.is equality |
| runner/test/c05-person-notes.test.ts:1127 | C05 person notes through runner main C05 person notes: round 5 3: a request past retention is left as written and archived without an append | AssertionError: expected '---\nsummary: Alex\'s plot at the Lar…' to be '---\nsummary: Alex\'s plot at the Lar…' // Object.is equality |
| runner/test/claude-provider.test.ts:220 | the Claude provider a new Area with no cited rule or note is refused and retried once | AssertionError: expected 'You plan one Bower tidy-up. You have …' to contain 'Areas/Community garden' |
| runner/test/claude-provider.test.ts:295 | the Claude provider the retry runs the model in a folder that still exists | AssertionError: expected [ true, true, true ] to deeply equal [ true, true ] |
| runner/test/claude-provider.test.ts:326 | the Claude provider a new subfolder of an existing Area is not reported as a new area | BowerError: That isn't in your Bower folder any more. |
| runner/test/claude-provider.test.ts:346 | the Claude provider a thing with text and no note or citing line is refused and retried once | AssertionError: expected 'You plan one Bower tidy-up. You have …' to match /no note/ |
| runner/test/claude-provider.test.ts:403 | the Claude provider a second refusal ends the run honestly | AssertionError: expected [ 'reading', 'writing', 'done' ] to deeply equal [ Array(4) ] |
| runner/test/claude-provider.test.ts:461 | the Claude provider a malformed or out-of-schema Claude reply fails truthfully and writes nothing | AssertionError: prose instead of JSON: expected [ 'reading', 'writing', 'done' ] to deeply equal [ 'reading', 'writing', 'failed' ] |
| runner/test/claude-provider.test.ts:583 | the Claude provider contract (TL-P4-01 P4-2) a Claude reply that targets a thing not admitted is refused and writes nothing | AssertionError: a manifest that bins Resources: expected [ 'reading', 'writing', 'done' ] to deeply equal [ 'reading', 'writing', 'failed' ] |
| runner/test/claude-provider.test.ts:583 | the Claude provider contract (TL-P4-01 P4-2) the runner computes ids and digests, never the model | AssertionError: a reply with an operation id: expected [ 'reading', 'writing', 'done' ] to deeply equal [ 'reading', 'writing', 'failed' ] |
| runner/test/corpus-driver.test.ts:30 | a case's between step runs between two runs | AssertionError: expected 'Select context first. Return only {"i…' to contain 'Alex wants an amber kitchen.' |
| runner/test/model-input-fingerprint.test.ts:74 | model input fingerprint the model input on the C04 fixture equals its golden copy | AssertionError: expected [ { command: 'claude', …(7) }, …(2) ] to have a length of 2 but got 3 |
| runner/test/model-input-fingerprint.test.ts:114 | model input fingerprint the timing line carries the model input fingerprint | AssertionError: expected 'timing: end=done total=3 start=0 toke…' to contain 'input=e9cb58a5faf6' |
| runner/test/model-input-fingerprint.test.ts:176 | model input fingerprint the same case with other ids has the same fingerprint | AssertionError: expected '02cf1b5575d9' to be 'a7940162c592' // Object.is equality |
| runner/test/model-input-fingerprint.test.ts:269 | model input fingerprint two fresh fake folders on the same case give the same input fingerprint through main | AssertionError: expected 'Select context first. Return only {"i…' to be 'Select context first. Return only {"i…' // Object.is equality |
| runner/test/per-thing-ask.test.ts:126 | per-thing asks (TL-P4-08 addendum 4) the reply schema takes its state limits from note-edit | AssertionError: expected 'You plan one Bower tidy-up. You have …' to contain 'Your reply was refused: a state that …' |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a notJson refusal is retried once with its reason | AssertionError: expected { kind: 'notJson', retried: false } to deeply equal { kind: 'notJson', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noText refusal is retried once with its reason | AssertionError: expected { kind: 'noText', retried: false } to deeply equal { kind: 'noText', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a notIntent refusal is retried once with its reason | AssertionError: expected { kind: 'notIntent', retried: false } to deeply equal { kind: 'notIntent', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a thingKeys refusal is retried once with its reason | AssertionError: expected { kind: 'thingKeys', retried: false } to deeply equal { kind: 'thingKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a thingNotAdmitted refusal is retried once with its reason | AssertionError: expected { kind: 'thingNotAdmitted', …(1) } to deeply equal { kind: 'thingNotAdmitted', …(1) } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a thingTwice refusal is retried once with its reason | AssertionError: expected { kind: 'thingTwice', retried: false } to deeply equal { kind: 'thingTwice', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a placeOutside refusal is retried once with its reason | AssertionError: expected { Object (kind, retried) } to deeply equal { kind: 'placeOutside', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a nameChangesKind refusal is retried once with its reason | AssertionError: expected { kind: 'nameChangesKind', …(1) } to deeply equal { kind: 'nameChangesKind', …(1) } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a rawName refusal is retried once with its reason | AssertionError: expected { kind: 'rawName', retried: false } to deeply equal { kind: 'rawName', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a numbers refusal is retried once with its reason | AssertionError: expected { kind: 'numbers', retried: false } to deeply equal { kind: 'numbers', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a newFolder refusal is retried once with its reason | AssertionError: expected { kind: 'newFolder', retried: false } to deeply equal { kind: 'newFolder', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteForNote refusal is retried once with its reason | AssertionError: expected { kind: 'noteForNote', retried: false } to deeply equal { kind: 'noteForNote', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteKeys refusal is retried once with its reason | AssertionError: expected { kind: 'noteKeys', retried: false } to deeply equal { kind: 'noteKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteName refusal is retried once with its reason | AssertionError: expected { kind: 'noteName', retried: false } to deeply equal { kind: 'noteName', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteSummary refusal is retried once with its reason | AssertionError: expected { kind: 'noteSummary', retried: false } to deeply equal { kind: 'noteSummary', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteBody refusal is retried once with its reason | AssertionError: expected { kind: 'noteBody', retried: false } to deeply equal { kind: 'noteBody', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteSections refusal is retried once with its reason | AssertionError: expected { Object (kind, retried) } to deeply equal { kind: 'noteSections', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteLink refusal is retried once with its reason | AssertionError: expected { kind: 'noteLink', retried: false } to deeply equal { kind: 'noteLink', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteMdLink refusal is retried once with its reason | AssertionError: expected { kind: 'noteMdLink', retried: false } to deeply equal { kind: 'noteMdLink', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteWeb refusal is retried once with its reason | AssertionError: expected { kind: 'noteWeb', retried: false } to deeply equal { kind: 'noteWeb', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a pileNotAdmitted refusal is retried once with its reason | AssertionError: expected { kind: 'pileNotAdmitted', …(1) } to deeply equal { kind: 'pileNotAdmitted', …(1) } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a pileTwice refusal is retried once with its reason | AssertionError: expected { kind: 'pileTwice', retried: false } to deeply equal { kind: 'pileTwice', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a tooManyLines refusal is retried once with its reason | AssertionError: expected { Object (kind, retried) } to deeply equal { kind: 'tooManyLines', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineKeys refusal is retried once with its reason | AssertionError: expected { kind: 'lineKeys', retried: false } to deeply equal { kind: 'lineKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineNote refusal is retried once with its reason | AssertionError: expected { kind: 'lineNote', retried: false } to deeply equal { kind: 'lineNote', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineText refusal is retried once with its reason | AssertionError: expected { kind: 'lineText', retried: false } to deeply equal { kind: 'lineText', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineCites refusal is retried once with its reason | AssertionError: expected { kind: 'lineCites', retried: false } to deeply equal { kind: 'lineCites', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineUncited refusal is retried once with its reason | AssertionError: expected { kind: 'lineUncited', retried: false } to deeply equal { kind: 'lineUncited', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noNote refusal is retried once with its reason | AssertionError: expected { kind: 'noNote', retried: false } to deeply equal { kind: 'noNote', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateKeys refusal is retried once with its reason | AssertionError: expected { kind: 'stateKeys', retried: false } to deeply equal { kind: 'stateKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateNote refusal is retried once with its reason | AssertionError: expected { kind: 'stateNote', retried: false } to deeply equal { kind: 'stateNote', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateTwice refusal is retried once with its reason | AssertionError: expected { kind: 'stateTwice', retried: false } to deeply equal { kind: 'stateTwice', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateText refusal is retried once with its reason | AssertionError: expected { kind: 'stateText', retried: false } to deeply equal { kind: 'stateText', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateCites refusal is retried once with its reason | AssertionError: expected { kind: 'stateCites', retried: false } to deeply equal { kind: 'stateCites', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askKeys refusal is retried once with its reason | AssertionError: expected { kind: 'askKeys', retried: false } to deeply equal { kind: 'askKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askNotAdmitted refusal is retried once with its reason | AssertionError: expected { kind: 'askNotAdmitted', …(1) } to deeply equal { kind: 'askNotAdmitted', …(1) } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askNotes refusal is retried once with its reason | AssertionError: expected { kind: 'askNotes', retried: false } to deeply equal { kind: 'askNotes', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askTwice refusal is retried once with its reason | AssertionError: expected { kind: 'askTwice', retried: false } to deeply equal { kind: 'askTwice', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askAlsoFiles refusal is retried once with its reason | AssertionError: expected { Object (kind, retried) } to deeply equal { kind: 'askAlsoFiles', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askText refusal is retried once with its reason | AssertionError: expected { kind: 'askText', retried: false } to deeply equal { kind: 'askText', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a keepKeys refusal is retried once with its reason | AssertionError: expected { kind: 'keepKeys', retried: false } to deeply equal { kind: 'keepKeys', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a keepNote refusal is retried once with its reason | AssertionError: expected { kind: 'keepNote', retried: false } to deeply equal { kind: 'keepNote', retried: true } |
| runner/test/per-thing-ask.test.ts:203 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a keepNotAsked refusal is retried once with its reason | AssertionError: expected { Object (kind, retried) } to deeply equal { kind: 'keepNotAsked', retried: true } |
| runner/test/per-thing-ask.test.ts:219 | per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a structured output beside a bad result is refused and asked again | AssertionError: expected 'You plan one Bower tidy-up. You have …' to contain 'Your reply was refused: a result that…' |
| runner/test/q1-continuation.test.ts:374 | Q1a stored answers through production entry points Q1a q1-options-exact-action: two to four script candidates accepted and fabricated or fifth refused | AssertionError: five is refused by validated main: expected 'done' to be 'failed' // Object.is equality |
| runner/test/q1-continuation.test.ts:407 | Q1a stored answers through production entry points Q1a q1-text-person-provenance: later answer wins within one asking and older asking cannot answer a new one | AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ] |
| runner/test/q1-continuation.test.ts:458 | Q1a stored answers through production entry points Q1a q1-text-person-provenance: person words stay subject data and document instructions grant no consent | AssertionError: expected [ { …(3) }, { …(3) } ] to deeply equal [ ObjectContaining{…} ] |
| runner/test/q1-continuation.test.ts:540 | Q1a stored answers through production entry points Q1a q1-waits-one-run-and-replay: two typed answers wait batch once and replay does not dispatch | AssertionError: expected [ 'This is also for the room.', …(3) ] to deeply equal [ 'This is also for the room.', …(1) ] |
| runner/test/q1-continuation.test.ts:628 | Q1a stored answers through production entry points Q1a q1-continuation-budget-meter: typed waiting and replay do zero admission reads with ordinary model usage | AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ] |
| runner/test/q1-continuation.test.ts:840 | Q1a stored answers through production entry points Q1a q1-two-rounds-no-third: retries failed saves and dispatch replay count only durable askings | AssertionError: both validation calls count their model usage: expected 'timing: end=saving total=0 start=2589…' to match /in=20 out=20/ |
| runner/test/state-rewrite.test.ts:85 | a change kind of its own for Current state (C05) a Bower-owned Current state is rewritten and undo restores it | AssertionError: expected [ 'One application open.' ] to deeply equal [ 'One application open.', …(1) ] |
| runner/test/state-rewrite.test.ts:123 | a change kind of its own for Current state (C05) a Current state the person edited gets a line and a question, never a rewrite | AssertionError: expected undefined to be 'Industrial Designer, Ferrowick' // Object.is equality |
| runner/test/state-rewrite.test.ts:162 | a change kind of its own for Current state (C05) the fallback line names only what the section lacks | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:173 | a change kind of its own for Current state (C05) a person-edited section's fallback names none of Bower's last-written lines | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:187 | a change kind of its own for Current state (C05) Bower's last state is read from the previous state change, not searched | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:200 | a change kind of its own for Current state (C05) with no previous state change to read, every line the section lacks is news | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:221 | a change kind of its own for Current state (C05) a run manifest that cannot be read is passed over, and every line the section lacks is news | AssertionError: expected [] to deeply equal [ Array(1) ] |
| runner/test/state-rewrite.test.ts:67 | a change kind of its own for Current state (C05) after a Bower append the next run only adds a line | TypeError: Cannot read properties of null (reading 'operations') |
| runner/test/state-rewrite.test.ts:67 | a change kind of its own for Current state (C05) an unmarked Current state is never adopted without a rule | TypeError: Cannot read properties of null (reading 'operations') |
| runner/test/state-rewrite.test.ts:280 | a change kind of its own for Current state (C05) a yes rule lets Bower adopt the section | AssertionError: expected [ 'One application open.' ] to deeply equal [ 'One application open.', …(1) ] |
| runner/test/state-rewrite.test.ts:296 | a change kind of its own for Current state (C05) undo restores an empty section empty | AssertionError: expected [] to deeply equal [ 'One application open.', …(1) ] |

Coordinator handoff: tests/fixtures/goldens/notes only, uncommitted in the entry worktree.
The worker card is blocked on the remaining contract decisions/implementation gaps, not on a tool,
network or dependency issue. No additional assertions were rewritten to conceal them.


## Implementation round 2

implementer: codex
status: blocked; owned-file fixes are uncommitted, not accepted or merge-ready.

The owner authorized implementation plan (2), no network, no git-writing commands, no test changes,
no node_modules replacement or symlinking, and OS-temp-only test output. Those constraints were kept.
Changed production paths: runner/src/claude.ts, runner/src/index.ts, runner/src/main.ts, runner/src/timing.ts.
This notes appendix is the only other changed repository file. The coordinator owns all commits.

### Owned-file implementation and evidence

- One combined serialized index-context bound now counts index text, indexed metadata and every
  source's candidate rows, including JSON escaping and cut notices, within 32,000 characters.
  Small contexts retain their exact bytes. Large contexts use candidate id references to the same
  indexed dictionary, keep neighbourhood and hub metadata ahead of unrelated rows, and cut whole
  projection lines. Validation accepts only retained dictionary ids. It never substitutes truncated
  versions, ids or coverage records. A cut still refuses a new destination justified by absence.
- RunTiming, the existing run ledger and metered Drive transport, grants at most 300 physical
  maintenance sends across discovery/refresh, declarations and settling/reconciliation. An attempted
  301st send is refused before the transport; retries consume their actual sends. Ordinary operation
  traffic keeps its existing phase accounting. Pre-manifest exhaustion uses the existing untouched-inbox
  outcome; a nonempty persisted checkpoint chain keeps exhaustion on the existing recovery path.
  The ledger carries the admission count for the existing counted waiting message. No second budget object exists.
- Execution retries retain the actual closed-intent refusal kind and reason and the existing
  asking-once-more diagnostic. Uncited Bower updates can use the frozen selected ids and destination hub;
  personal evidence keeps the existing journal/ownership checks. Frozen destination and injection reds
  remain green. No execution-only fallback to inferred production selection was added.
- The timing fingerprint and section hashes bind the first selection input, including failed selection,
  rather than being overwritten by execution. Both phases and retries still aggregate actual usage.
- planningIndex accepts the already prepared refresh, so its production compatibility path uses the
  same observations without another discovery/feed/prefix call. The helper remains usable by existing
  callers. This also eliminates the newly unused production planningIndex export without a baseline edit.
- Per ruling (a), settled unpicked folded maps reuse retrieval state's full snapshot and membership;
  maintain needs complete owned regions when it writes or migrates a map. The unchanged-map control
  reads the map zero times, and the person-edited-map control reads it once and keeps the comment.
  The existing MOC parser/author and strict manifest format are preserved. No second membership writer,
  prefix-only MOC writer, or new stored format was introduced.

removed: the separate uncounted index metadata/candidate envelope.
removed: the generic frozen-selection reason replacing actual execution validation refusals.
removed: execution overwriting the first selection's timing fingerprint and section hashes.
removed: the added production-unused planningIndex finding, by reusing prepared observations.
removed: treating post-checkpoint ledger exhaustion as untouched pre-manifest exhaustion.
removed: the experimental MOC path/affected-members walker; existing MOC ownership remains the one home.
tests changed: none

### Versioned listing handoff: scope blocker, concrete patch pending

The draft's stale-listing gap remains unresolved in the repository. refreshPlanning returns the newer
feed metadata and snapshot, but RunnerDrive.planReads still holds its earlier listing and versions map.
Its inner admission reader also memoizes read-ahead by id, so merely changing an outer version map is
insufficient: a new cache key must not receive the previous reader's stale bytes. This requires a handoff
inside runner/src/drive.ts's existing planReads/ReadCache mechanism. That file is not in the packet's
owned-file allocation. No proxy, parallel cache, prototype patch or duplicate discovery was substituted.

A concrete proposed patch is in /tmp/b1d-round2-listing-handoff.patch. It adds planReads.handoff:
replace the existing listing with the prepared listing, update its version map, reset admission's
id-only read-ahead reader, and retain the existing versioned ReadCache for shared physical reads.
main hands the refreshed listing over before constructing the semantic provider. This proposed patch
is not applied or validated, and is not counted as delivered code. The owner was asked to allocate
runner/src/drive.ts; no reply or scope expansion was received before this card.

The [bower-implement skill](../../.agents/skills/bower-implement/SKILL.md) says “Commit only the owned files.”
The explicit editing restriction comes from [WORKER.md](WORKER.md): “Touch only the files the packet owns.”
WORKER.md also says “if it cannot do what you need, stop and report `blocked`.” Those explicit worker
scope/mechanism requirements caused this blocker; no extra editing restriction was inferred from the skill. The owner was shown the
concrete patch before the scope question. Current ownership was retained while finishing every requested
sweep and recording every remaining failure; no permission or approval was inferred from elapsed time.

### One deferred gap

Selection still accepts the built-in kinds payslip, invoice, job-offer, rental-listing, contract,
booking and recipe, plus unknown. B5a's configured type-row table is not on this branch; the coordinator
merges it next round. This is the one deliberately deferred feature gap. The pending cache allocation
and existing red compatibility contracts below are blockers, not silently deferred acceptance work.

### Verification

Baseline full runner: 673 tests, 568 passed, 105 failed. /tmp/b1d-round2-before.json and .log.
Initial failing assertion used for retry diagnostics: per-thing-ask.test.ts, “a numbers refusal is
retried once with its reason”; it received the generic frozen-selection reason. All 45 formerly failing
per-thing-ask tests now pass. All 11 state-rewrite tests and both c04-prompt-fixes tests now pass.

Final full runner: 673 tests, 629 passed, 44 failed; 61 baseline failures repaired, zero new failures.
All 19 B1d planning reds/controls and 3 phase-adapter controls pass. B1a/B1c: 49/49.
B3b: 135/135. Q1c live: 8/8. Drive traffic goldens: 5/5. Timing traffic counts: 2/2.
The complete remaining failure inventory is below, with full messages/stacks in JSON.

Src: 168 files, 5617 passed, one failed. The sole failure is src/e2e-port.test.ts:37, the expected
EPERM listen refusal and subsequent timeout. No app or node source file was changed this round.
App, node and runner TypeScript: pass. Touched-file ESLint: pass. Git diff whitespace: pass.
Unused-code gate: fail on two stale baseline rows, both exports runner/src/claude.ts selectionOf:
harness/unused-baseline.json and harness/unused-production-baseline.json. There is no new unused
production finding in the final gate output. Those harness files are outside the owned scope.

Commands and final logs (all artifacts outside the repository; Vitest cache disabled):
- pnpm -C runner exec vitest run --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-round2-complete.json --cache=false
  /tmp/b1d-round2-complete.log
- pnpm exec vitest run src --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-round2-src.json --cache=false
  /tmp/b1d-round2-src.log
- pnpm exec tsc --noEmit -p tsconfig.app.json --tsBuildInfoFile /tmp/b1d-round2-app.tsbuildinfo
  /tmp/b1d-round2-app-types.log
- pnpm exec tsc --noEmit -p tsconfig.node.json --tsBuildInfoFile /tmp/b1d-round2-node.tsbuildinfo
  /tmp/b1d-round2-node-types.log
- pnpm -C runner exec tsc --noEmit -p .
  /tmp/b1d-round2-runner-types.log
- pnpm -C runner exec eslint --config /tmp/b1d-round2-eslint-runner.mjs src/claude.ts src/index.ts src/main.ts src/timing.ts
  /tmp/b1d-round2-eslint.log
- node scripts/check-unused-gate.mjs
  /tmp/b1d-round2-unused.log

The OS-temp ESLint config imports the unchanged repository config and sets tsconfigRootDir to the
runner checkout. No rule was disabled. No pnpm check or e2e was run: their normal commands write
repository build/results/check-mark files, contrary to this session's explicit output restriction.
No fixture or UI file changed.

Two OS-temp diagnostics exercised the actual ledger and extracted production bound helper without
editing any test: /tmp/b1d-round2-ledger-probe.log grants 150 + 150 maintenance sends, refuses the
301st with the injected admission count of two, and allows ordinary traffic afterward; /tmp/b1d-round2-index-probe.log bounds 3,507,943 serialized
characters to 31,988, retains each candidate's exact dictionary version/coverage, and marks the cut.
No diagnostic contacted a network service. Scratch sources/bundles are in /tmp only.

### Golden table: measured, none changed

Moved golden files: none in round 2. The raw golden assertion passes through corpus -> main; therefore
its pinned bytes are also the measured first selection input. Applying the existing normalizer to those
measured bytes matches the normalized golden exactly. Its test still stops earlier at its unchanged
physical-call assertion (expected 2, measured 3: selection, execution, execution validation retry).
No accepted traffic or prompt golden was raised, and no test or fixture was changed.

| Golden file:line | Assertion file:line | Named call | Pinned chars | Measured chars | Measured bytes | Delta |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| runner/test/fixtures/model-input-c04.raw.golden.txt:1 | runner/test/model-input-fingerprint.test.ts:94 | selection | 10830 | 10830 | 10832 | 0 |
| runner/test/fixtures/model-input-c04.golden.txt:1 | runner/test/model-input-fingerprint.test.ts:82 | selection, normalized | 10832 | 10832 | 10834 | 0 |

Measured raw SHA256: c0973cdc4163fc5a625fe000a2fe9e197bd5492268349d89e472f61f9151beb0.
Measured normalized SHA256: da7b69240701098f3f24c4418eecb22db6b08b8122d27800a11d94bd26e8f26b.
The C04 combined index context is 1,206 serialized characters. Full measurements:
/tmp/b1d-round2-goldens.json. Semantic names remain selection, selection validation retry,
execution and execution validation retry. This round adds no physical discovery, feed, prefix or full
media call on a settled within-bound run; the cap is a grant check, and planningIndex consumes prepared data.

C05's archived-request traffic golden cannot be measured as a successfully completed run:
c05-bounded-reads.test.ts:197 fails its precondition that a legacy request was archived (measured 0,
expected 1), before its golden pins. Report/retention controls remain in the failure inventory, rather
than being treated as approval to change a traffic golden. No deployment latency, >20% time-delta
acceptance or real cold/warm latency claim is made from injected model timings.

### Remaining contradictions and baseline implementation gaps

All remaining tests ran before stopping. Tests were not changed to reconcile these contracts:

- model-input-fingerprint.test.ts:74 and claude-provider.test.ts:295 require two physical calls for
  selection plus two execution attempts; measured three. ask-answer-loop.test.ts:888 similarly expects
  three where the added selection makes four. q1-continuation.test.ts:840 still pins two-result token
  totals for a three-result retry path.
- c04-incorporation.test.ts:124 and corpus-driver.test.ts:30 require full L3 text in the first selection
  input; the ruled metadata-only selection moves picked full-note evidence to execution.
- ask-answer-loop.test.ts:323 and q1-continuation.test.ts:407/458/540/628 expect one projection of answer
  provenance; both semantic phases carry it. Their observations cannot be hidden to make them green.
- claude-provider.test.ts:403/461/583 and q1-continuation.test.ts:374 expect saving/failed persistence
  after exhausted validation; the inbox/no-write ruling uses done and leaves the admission untouched.
- claude-provider.test.ts:318 and the c04-hardware-receipt corpus case require a new subfolder under a
  parent absent from that source's visible neighbourhood. The ruled visible-parent restriction is kept.
- The remaining C05 pending/retention/source-id controls and stored-answer action controls are actual
  baseline implementation gaps, not fixture import failures. No broader title/id authority or second
  pending-state mechanism was added to make them pass.
- Fresh-id fingerprint normalization still misses new item ids and indexed/folder dictionary keys in
  runner/src/model-input.ts, outside the owned allocation. Selection timing now binds the correct input,
  but that does not fix its normalization home or justify refreshing a golden.

### Complete final runner failure inventory

Each row names one failed test and its first observed assertion. Additional soft assertions and complete
stacks remain in /tmp/b1d-round2-complete.json; none of these failures is new relative to the baseline.

| File:line | Failed test | First observed failure |
| --- | --- | --- |
| runner/test/ask-answer-loop.test.ts:323 | an answer applies at once (TL-P4-08 addendum 8) answers reach the model path | AssertionError: expected [ { …(2) }, { …(2) } ] to deeply equal [ ObjectContaining{…} ] |
| runner/test/ask-answer-loop.test.ts:590 | an answer applies at once (TL-P4-08 addendum 8) a yes to write it applies the shown text with no model call | AssertionError: expected undefined to deeply equal [ 'Two applications open.', …(1) ] |
| runner/test/ask-answer-loop.test.ts:623 | an answer applies at once (TL-P4-08 addendum 8) write it re-asks when the section changed since it was shown | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:643 | an answer applies at once (TL-P4-08 addendum 8) a write it yes whose note is gone writes one answered row | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:672 | an answer applies at once (TL-P4-08 addendum 8) write it re-asks when the note changed elsewhere since it was shown | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:697 | an answer applies at once (TL-P4-08 addendum 8) a clash at write time leads to the re-ask with the new sentence and no extra press | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:743 | an answer applies at once (TL-P4-08 addendum 8) only a clash keeps an answer for a re-ask | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:772 | an answer applies at once (TL-P4-08 addendum 8) the same non-clash refusal never starts more runs than the cap, then shows the not-written row | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:843 | an answer applies at once (TL-P4-08 addendum 8) a write it with nothing to write writes one answered row | AssertionError: expected undefined to be 'now' // Object.is equality |
| runner/test/ask-answer-loop.test.ts:96 | an answer applies at once (TL-P4-08 addendum 8) a lone no to write it closes the question with no model call | AssertionError: expected 409 to be 200 // Object.is equality |
| runner/test/ask-answer-loop.test.ts:888 | an answer applies at once (TL-P4-08 addendum 8) a yes to write it beside a pile asks the model | AssertionError: expected 4 to be 3 // Object.is equality |
| runner/test/ask-only-lines.test.ts:36 | a run that only asks keeps the Timeline lines the model added with no cites | AssertionError: expected '---\nsummary: Looking for a flat near…' to contain 'Viewing moved to Saturday.' |
| runner/test/c04-incorporation.test.ts:124 | what the model is shown (P4-3) the model context carries bounded extracted text for each admitted thing | AssertionError: expected [] to deeply equal [ 'Areas/Garden/Garden.md' ] |
| runner/test/c04-incorporation.test.ts:210 | the C04 slice through the Claude provider (P4-3) the C04 corpus cases score green with scripted proposals | AssertionError: expected { id: 'c04-hardware-receipt', …(2) } to deeply equal { id: 'c04-hardware-receipt', …(2) } |
| runner/test/c05-bounded-reads.test.ts:197 | C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:148 | C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence | AssertionError: production records must form a verified run: expected 'new' to be 'run' // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:498 | C05 bounded reads: fix 2 control: a waiting retry whose pending relocation lands completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:498 | C05 bounded reads: fix 2: a waiting retry whose pending relocation failed completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:498 | C05 bounded reads: fix 2: a waiting retry interrupted after its pointer and before its append appends once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:401 | C05 bounded reads: fix 1 control: a waiting retry whose archive lands completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:401 | C05 bounded reads: fix 1: a waiting retry whose archive move failed completes once | AssertionError: expected +0 to be 1 // Object.is equality |
| runner/test/c05-bounded-reads.test.ts:148 | C05 bounded reads: horizon: past 20 runs uses listing age and TOO_OLD_WHY without a chain walk | AssertionError: production records must form a verified run: expected 'new' to be 'run' // Object.is equality |
| runner/test/c05-incorporation.test.ts:74 | the C05 slice through the Claude provider the C05 corpus cases score green with scripted proposals | AssertionError: expected { …(11) } to deeply equal { …(11) } |
| runner/test/c05-person-notes.test.ts:434 | C05 person notes through runner main C05 person notes: fix 1 finding 2: a conflicted append retries its filed source within twenty retained runs | AssertionError: expected 'new' to be 'run' // Object.is equality |
| runner/test/c05-person-notes.test.ts:448 | C05 person notes through runner main C05 person notes: fix 1 finding 3: article-equivalent titles stay ambiguous in context and writes | AssertionError: expected [ 'Areas/Home/Garden plot.md', …(1) ] to not include 'Areas/Home/Garden plot.md' |
| runner/test/c05-person-notes.test.ts:921 | C05 person notes through runner main C05 person notes: round 4 2: pending retries keep target and source ids | AssertionError: renamed target, replacement=true: expected '---\nsummary: Alex\'s plot at the Lar…' to be '---\nsummary: Alex\'s plot at the Lar…' // Object.is equality |
| runner/test/c05-person-notes.test.ts:748 | C05 person notes through runner main C05 person notes: round 5 2: a retained completion never resolves a renamed target by title again | AssertionError: expected 'new' to be 'run' // Object.is equality |
| runner/test/c05-person-notes.test.ts:1127 | C05 person notes through runner main C05 person notes: round 5 3: a request past retention is left as written and archived without an append | AssertionError: expected '---\nsummary: Alex\'s plot at the Lar…' to be '---\nsummary: Alex\'s plot at the Lar…' // Object.is equality |
| runner/test/claude-provider.test.ts:295 | the Claude provider the retry runs the model in a folder that still exists | AssertionError: expected [ true, true, true ] to deeply equal [ true, true ] |
| runner/test/claude-provider.test.ts:326 | the Claude provider a new subfolder of an existing Area is not reported as a new area | BowerError: That isn't in your Bower folder any more. |
| runner/test/claude-provider.test.ts:403 | the Claude provider a second refusal ends the run honestly | AssertionError: expected [ 'reading', 'writing', 'done' ] to deeply equal [ Array(4) ] |
| runner/test/claude-provider.test.ts:461 | the Claude provider a malformed or out-of-schema Claude reply fails truthfully and writes nothing | AssertionError: prose instead of JSON: expected [ 'reading', 'writing', 'done' ] to deeply equal [ 'reading', 'writing', 'failed' ] |
| runner/test/claude-provider.test.ts:583 | the Claude provider contract (TL-P4-01 P4-2) a Claude reply that targets a thing not admitted is refused and writes nothing | AssertionError: a manifest that bins Resources: expected [ 'reading', 'writing', 'done' ] to deeply equal [ 'reading', 'writing', 'failed' ] |
| runner/test/claude-provider.test.ts:583 | the Claude provider contract (TL-P4-01 P4-2) the runner computes ids and digests, never the model | AssertionError: a reply with an operation id: expected [ 'reading', 'writing', 'done' ] to deeply equal [ 'reading', 'writing', 'failed' ] |
| runner/test/corpus-driver.test.ts:30 | a case's between step runs between two runs | AssertionError: expected 'Select context first. Return only {"i…' to contain 'Alex wants an amber kitchen.' |
| runner/test/model-input-fingerprint.test.ts:74 | model input fingerprint the model input on the C04 fixture equals its golden copy | AssertionError: expected [ { command: 'claude', …(7) }, …(2) ] to have a length of 2 but got 3 |
| runner/test/model-input-fingerprint.test.ts:176 | model input fingerprint the same case with other ids has the same fingerprint | AssertionError: expected '694fd8a53d2c' to be 'e9cb58a5faf6' // Object.is equality |
| runner/test/model-input-fingerprint.test.ts:269 | model input fingerprint two fresh fake folders on the same case give the same input fingerprint through main | AssertionError: expected 'Select context first. Return only {"i…' to be 'Select context first. Return only {"i…' // Object.is equality |
| runner/test/q1-continuation.test.ts:374 | Q1a stored answers through production entry points Q1a q1-options-exact-action: two to four script candidates accepted and fabricated or fifth refused | AssertionError: five is refused by validated main: expected 'done' to be 'failed' // Object.is equality |
| runner/test/q1-continuation.test.ts:407 | Q1a stored answers through production entry points Q1a q1-text-person-provenance: later answer wins within one asking and older asking cannot answer a new one | AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ] |
| runner/test/q1-continuation.test.ts:458 | Q1a stored answers through production entry points Q1a q1-text-person-provenance: person words stay subject data and document instructions grant no consent | AssertionError: expected [ { …(3) }, { …(3) } ] to deeply equal [ ObjectContaining{…} ] |
| runner/test/q1-continuation.test.ts:540 | Q1a stored answers through production entry points Q1a q1-waits-one-run-and-replay: two typed answers wait batch once and replay does not dispatch | AssertionError: expected [ 'This is also for the room.', …(3) ] to deeply equal [ 'This is also for the room.', …(1) ] |
| runner/test/q1-continuation.test.ts:628 | Q1a stored answers through production entry points Q1a q1-continuation-budget-meter: typed waiting and replay do zero admission reads with ordinary model usage | AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ] |
| runner/test/q1-continuation.test.ts:840 | Q1a stored answers through production entry points Q1a q1-two-rounds-no-third: retries failed saves and dispatch replay count only durable askings | AssertionError: both validation calls count their model usage: expected 'timing: end=saving total=0 start=3391…' to match /in=20 out=20/ |


### Offline sources and boundary

Research reused from the packet without network or independent reverification:
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://arxiv.org/html/2506.08837v1
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Final diff: /tmp/b1d-round2-implementation.diff. No commit, integration, backup, deployment,
acceptance or full-green claim is made. Pending scope and the 44 baseline compatibility failures
must be ruled or fixed in their existing homes; B5a kinds alone are intentionally deferred.


## Sweep 3

implementer: codex
status: tests-only sweep complete; runner implementation remains red, coordinator owns commits.

Authority: TL-P4-41 addendum 16 and the owner's sweep-3 instruction. No network, no git-writing
commands, no production edits, no node_modules replacement or symlink. Tests use the OS temporary
folder; Vitest's repository output path is overridden and its cache disabled. The earlier round-2
statement that validation exhaustion should end done is superseded: invalid replies after their one
retry fail; only the shared ledger can end done with untouched inbox items.

Research reused offline, not independently reverified:
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://arxiv.org/html/2506.08837v1
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching

### Authorized test repairs and preserved intent

tests changed: runner/test/model-input-fingerprint.test.ts: count selection plus execution and its retry; preserve both byte goldens and fingerprint checks.
tests changed: runner/test/claude-provider.test.ts: count every working-directory/HOME observation; seed a matching Money hub so the Statements parent is visible; still require a filed subfolder and no New area report.
tests changed: runner/test/ask-answer-loop.test.ts: require the same answer in selection and execution; count both calls beside a pile, keeping all write-it state and archive assertions.
tests changed: runner/test/q1-continuation.test.ts: check provenance in each semantic call, never flatten away repeated observations; aggregate selection plus both execution attempts' actual tokens; retain failed status assertions.
tests changed: runner/test/c04-incorporation.test.ts: select the seeded Garden hub explicitly, keep source text bounds in selection, require metadata only there and full picked evidence only in execution; keep the 4000/24000 bounds and exact cut accounting including its notice.
tests changed: runner/test/corpus-driver.test.ts: keep a four-call, two-run between-step control; pick the edited note by its listed id on run two and assert its full text in execution; first selection/first execution and second selection exclude the new words.
tests changed: runner/test/b1-planning.test.ts: add one named invalid-reply exhaustion red and one ledger-exhaustion contract, each with a valid filing positive control; retain existing retry/operation bounds.
tests changed: harness/corpus/c04-hardware-receipt/case.json: mark the added Receipts hub Bower-owned to expose the existing parent through its matching metadata.
tests changed: harness/corpus/c04-hardware-receipt/expected.json: preserve the added existing hub byte-for-byte, alongside Rules, while keeping monthly filing and derived receipt-note expectations.
tests changed: harness/corpus/c04-hardware-receipt/folder/Areas/Money/Receipts/Receipts.md: add a matching existing-parent hub; the monthly subfolder is still created by the runner.

No assertion in the invalid-reply tests originally at claude-provider:403/461/583 or
q1-continuation:374 was repaired or weakened. Their shifted current locations are in the final inventory.
The c04 hardware case now passes its original scorer; this exposes c04-offer-and-flat next in the same
loop. Its unseeded Money parent is the same visible-parent contradiction, but that corpus fixture is
outside the owner's named sweep scope and remains unchanged.

The C04 bounded-note test also exposed the previously unreachable cut assertion: cut characters equal
original length minus actual content shown, with the cut notice fitting inside the same 4000-character
bound. The test now checks conservation and the marker's exact count, instead of incorrectly treating
all 4000 characters as source content. No character ceiling was raised.

### Exhaustion kinds and controls

- b1-invalid-reply-exhaustion-fails-after-one-retry: selection and execution each return an out-of-schema
  extra key on both attempts. Each must end failed (code 1), never a third attempt, no manifest or
  source/declaration write. Its positive control uses invalid then valid selection, invalid then valid
  execution: four actual calls, done, one source filed. The current implementation instead returns done;
  this is an implementation gap, not a contradiction in the red.
- b1-ledger-exhaustion-valid-replies-done-with-items-left-in-inbox: 101 valid selected files and valid
  execution intents need at least 202 operations (a file move plus a derived note per source), exceeding
  the unchanged 200-operation ledger. Exactly two valid model calls must end done with all 101 inbox
  sources and declarations untouched, no invalid-reply refusal and no oversized manifest. Its control
  files one source within the same ledger. This contract is currently green.
- Existing validation-exhaustion expectations of failed remain implementation gaps. Existing B1d
  negative tests that still expect done after invalid replies are separate contradictions; their
  already-green assertions were not part of the owner's enumerated compatibility repairs. The grep
  audit records their locations below so round 3 cannot mistake those greens for validation authority.

### Golden movements and named calls

Moved golden files: none. Both model-input-c04.raw.golden.txt and model-input-c04.golden.txt remain
byte-identical. No traffic golden, token ceiling, retry bound, character ceiling or operation cap moved.
The only numeric compatibility pins moved by the named added selection call are:

| File:line | Old value | New value | Named call |
| --- | --- | --- | --- |
| runner/test/model-input-fingerprint.test.ts:74 | 2 physical calls | 3 physical calls | selection before execution and execution validation retry |
| runner/test/claude-provider.test.ts:296 | [true,true] | [true,true,true] | selection before execution and execution validation retry |
| runner/test/claude-provider.test.ts:297 | [true,true] | [true,true,true] | selection before execution and execution validation retry |
| runner/test/ask-answer-loop.test.ts:889 | prior calls + 1 | prior calls + 2 | selection before answered execution |
| runner/test/q1-continuation.test.ts:845 | in=20 out=20 | in=30 out=30 | selection adds actual input=10/output=10 before two execution attempts |

Selection and execution each retain answer provenance. Their repeated answer records do not represent
another answer or another quota unit. The batched continuation's first two calls still have no answers;
its next two each carry both bound answers. Unavailable/fabricated/fifth-option failed assertions stand.

### Ruling grep audit

One ruling-focused sweep: /tmp/b1d-sweep3-ruling-grep.txt covers call counts, tokens, full-context
assertions, failed status and exhaustion across the seven named runner test files. No test is skipped.

The existing done-after-invalid-reply assertions remain unchanged and are contradictions under
addendum 16, even where they currently pass. They are explicitly outside the enumerated repair list:

| File:line | Invalid-reply path still asserting a ledger outcome |
| --- | --- |
| runner/test/b1-planning.test.ts:108 | cut-index creation refusal returned twice |
| runner/test/b1-planning.test.ts:139 | six wants returned twice |
| runner/test/b1-planning.test.ts:168 | pinned plus requested wants exceed five on both replies |
| runner/test/b1-planning.test.ts:184 | invented ids/paths/kinds/unclosed selection on both replies |
| runner/test/b1-planning.test.ts:188 | unclosed selection on both replies |
| runner/test/b1-planning.test.ts:261 | target injection refused on both execution replies |
| runner/test/b1-planning.test.ts:266 | execution changes frozen destination on both replies |
| runner/test/b1-planning.test.ts:328 | fabricated/fifth question options returned twice |
| runner/test/b1-planning.test.ts:515 | six folded members requested twice |
| runner/test/b1-planning.test.ts:536 | forbidden parent/name/duplicate returned twice |
| runner/test/b1-planning.test.ts:550 | nested execution destination returned twice |
| runner/test/b1-planning.test.ts:565 | invalid reply after its retry in either phase |
| runner/test/claude-provider.test.ts:262 | responsibility cannot authorize a new Project, invalid execution twice |
| runner/test/claude-provider.test.ts:368 | missing incorporation note on both execution attempts |
| runner/test/claude-provider.test.ts:413 | protected original :403 actually expects saving/done after invalid execution, not failed |

The protected original claude-provider:403 test remains unchanged as directed. Its current saving/done
assertion is itself a contradiction; the other protected invalid-reply assertions require failed and
remain implementation gaps. This distinction corrects the round-2 inventory and does not grant a
production change or silently change any protected test.

removed: no test or fixture removed; no golden replaced, bound loosened or production fallback added.

### Final verification and complete remaining red inventory

Before edits: 689 runner tests, 645 passed, 44 failed.
Final suite: 691 runner tests, 657 passed, 34 failed (32 implementation gaps, 2 contradictions).
Eleven previously failing tests now pass; two contracts were added (the ledger control passes and the
invalid-reply exhaustion control fails on both selection and execution as intended). Two repaired
first assertions reveal a later existing failure: c04-offer-and-flat's invisible parent in the C04
loop, and the write-it state update beside a pile. All source/target/state assertions remain intact.

Required full runner command, exit 1:
`pnpm -C runner exec vitest run --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-sweep3-complete.json --cache=false > /tmp/b1d-sweep3-complete.log 2>&1`

Additional checks: runner TypeScript pass (/tmp/b1d-sweep3-types.log), ESLint of all seven touched
runner test files pass (/tmp/b1d-sweep3-eslint.log), git diff whitespace pass. pnpm check and fake e2e
were not run: their normal paths write repository build/check-mark/result artifacts, which this
session's explicit OS-temp-only instruction forbids. No UI or runtime code changed. No commit was made.

Baseline and targeted assertion evidence: /tmp/b1d-sweep3-before.{json,log},
/tmp/b1d-sweep3-targeted.{json,log}, /tmp/b1d-sweep3-revised.{json,log},
/tmp/b1d-sweep3-context.{json,log}. Diagnostic script/output and scratch files stay in /tmp.
The full final JSON retains all failure messages and soft assertions. Each row below is one remaining
failed test with its actual current failure location and kind; same-line helper failures are separate rows.

| File:line | Kind | Remaining red |
| --- | --- | --- |
| runner/test/ask-answer-loop.test.ts:591 | implementation gap | a yes to write it applies the shown text with no model call |
| runner/test/ask-answer-loop.test.ts:624 | implementation gap | write it re-asks when the section changed since it was shown |
| runner/test/ask-answer-loop.test.ts:644 | implementation gap | a write it yes whose note is gone writes one answered row |
| runner/test/ask-answer-loop.test.ts:673 | implementation gap | write it re-asks when the note changed elsewhere since it was shown |
| runner/test/ask-answer-loop.test.ts:698 | implementation gap | a clash at write time leads to the re-ask with the new sentence and no extra press |
| runner/test/ask-answer-loop.test.ts:744 | implementation gap | only a clash keeps an answer for a re-ask |
| runner/test/ask-answer-loop.test.ts:773 | implementation gap | the same non-clash refusal never starts more runs than the cap, then shows the not-written row |
| runner/test/ask-answer-loop.test.ts:844 | implementation gap | a write it with nothing to write writes one answered row |
| runner/test/ask-answer-loop.test.ts:96 | implementation gap | a lone no to write it closes the question with no model call |
| runner/test/ask-answer-loop.test.ts:890 | implementation gap | a yes to write it beside a pile asks the model |
| runner/test/ask-only-lines.test.ts:36 | implementation gap | keeps the Timeline lines the model added with no cites |
| runner/test/b1-planning.test.ts:629 | implementation gap | b1-invalid-reply-exhaustion-fails-after-one-retry |
| runner/test/c04-incorporation.test.ts:224 | contradiction | the C04 corpus cases score green with scripted proposals |
| runner/test/c05-bounded-reads.test.ts:197 | implementation gap | C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media |
| runner/test/c05-bounded-reads.test.ts:148 | implementation gap | C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence |
| runner/test/c05-bounded-reads.test.ts:498 | implementation gap | C05 bounded reads: fix 2 control: a waiting retry whose pending relocation lands completes once |
| runner/test/c05-bounded-reads.test.ts:498 | implementation gap | C05 bounded reads: fix 2: a waiting retry whose pending relocation failed completes once |
| runner/test/c05-bounded-reads.test.ts:498 | implementation gap | C05 bounded reads: fix 2: a waiting retry interrupted after its pointer and before its append appends once |
| runner/test/c05-bounded-reads.test.ts:401 | implementation gap | C05 bounded reads: fix 1 control: a waiting retry whose archive lands completes once |
| runner/test/c05-bounded-reads.test.ts:401 | implementation gap | C05 bounded reads: fix 1: a waiting retry whose archive move failed completes once |
| runner/test/c05-bounded-reads.test.ts:148 | implementation gap | C05 bounded reads: horizon: past 20 runs uses listing age and TOO_OLD_WHY without a chain walk |
| runner/test/c05-incorporation.test.ts:74 | implementation gap | the C05 corpus cases score green with scripted proposals |
| runner/test/c05-person-notes.test.ts:434 | implementation gap | C05 person notes: fix 1 finding 2: a conflicted append retries its filed source within twenty retained runs |
| runner/test/c05-person-notes.test.ts:448 | implementation gap | C05 person notes: fix 1 finding 3: article-equivalent titles stay ambiguous in context and writes |
| runner/test/c05-person-notes.test.ts:921 | implementation gap | C05 person notes: round 4 2: pending retries keep target and source ids |
| runner/test/c05-person-notes.test.ts:748 | implementation gap | C05 person notes: round 5 2: a retained completion never resolves a renamed target by title again |
| runner/test/c05-person-notes.test.ts:1127 | implementation gap | C05 person notes: round 5 3: a request past retention is left as written and archived without an append |
| runner/test/claude-provider.test.ts:413 | contradiction | a second refusal ends the run honestly |
| runner/test/claude-provider.test.ts:471 | implementation gap | a malformed or out-of-schema Claude reply fails truthfully and writes nothing |
| runner/test/claude-provider.test.ts:593 | implementation gap | a Claude reply that targets a thing not admitted is refused and writes nothing |
| runner/test/claude-provider.test.ts:593 | implementation gap | the runner computes ids and digests, never the model |
| runner/test/model-input-fingerprint.test.ts:176 | implementation gap | the same case with other ids has the same fingerprint |
| runner/test/model-input-fingerprint.test.ts:269 | implementation gap | two fresh fake folders on the same case give the same input fingerprint through main |
| runner/test/q1-continuation.test.ts:374 | implementation gap | Q1a q1-options-exact-action: two to four script candidates accepted and fabricated or fifth refused |

Exhaustion rows: the new invalid-reply red, the protected malformed reply, closed-id/digest refusals,
and the fabricated/fifth question-option refusal are invalid-reply exhaustion implementation gaps.
The protected second-refusal row is a contradictory saving/done assertion, preserved by explicit scope.
The new ledger-exhaustion contract (101 sources, at least 202 operations, two valid calls) is green.
All other implementation-gap rows concern incorporation/state writes, pending/retention/source-id
handling, ambiguous request evidence or fresh-id normalization, not an exhausted ledger.

### Compatibility results from the same full runner suite

| Suite | Passed / total | Status |
| --- | ---: | --- |
| test/b1-index.test.ts | 31 / 31 | pass |
| test/b1-planning-support.test.ts | 3 / 3 | pass |
| test/b1-planning.test.ts | 20 / 21 | fail; inventory above |
| test/b23-hot-context.test.ts | 10 / 10 | pass |
| test/b23-hot-recovery.test.ts | 2 / 2 | pass |
| test/b23-hot.test.ts | 135 / 135 | pass |
| test/c04-incorporation.test.ts | 5 / 6 | fail; inventory above |
| test/claude-provider.test.ts | 19 / 23 | fail; inventory above |
| test/corpus-driver.test.ts | 18 / 18 | pass |
| test/main.test.ts | 7 / 7 | pass |
| test/model-input-fingerprint.test.ts | 7 / 9 | fail; inventory above |
| test/q1-continuation.test.ts | 42 / 43 | fail; inventory above |
| test/timing-counts.test.ts | 2 / 2 | pass |

The corpus-driver between-step contract is green with all four actual calls observed. The C04 bounded
extraction contract is green with full note text in execution only. The C04 hardware receipt control
passes its original scoring and preserves its newly seeded hub; the next corpus member remains a
named contradiction. Raw and normalized C04 prompt golden checks both pass without changing a byte.

Scope audit: only the seven named runner test files, c04-hardware-receipt fixture/expectation files,
and this notes appendix changed. No corpus driver production file required an edit; no other fixture,
shared harness record, production file or golden changed. Remaining implementation work belongs to
round 3 and the coordinator, not this red-owning session.

## Implementation round 3

implementer: codex
status: blocked; uncommitted implementation, not accepted or merge-ready. No fourth round without a ruling.

Authority: owner instruction and TL-P4-41 addendum 16. No network, git-writing command, test edit,
node_modules replacement or symlink. Test output, caches, build information and diagnostics are in
OS temporary files. The coordinator owns commits. Only allocated production files and this appendix changed.

### Implemented in the existing homes

- Applied /tmp/b1d-round2-listing-handoff.patch as the base. main hands refreshPlanning's prepared
  listing to planReads before constructing the provider. handoff replaces the listing and version map,
  resets admission's id-only read-ahead and its warm marker, and retains the one versioned ReadCache.
  The base alone exposed duplicate read-ahead traffic: admission warmListing bypassed that cache.
  Its existing reader now sends text/bytes through that same cache; the public reads delegate to the
  reader without recursive cache calls. Full bytes still supply the prefix, and live fences remain fresh.
- Partial changes-feed metadata preserves listed checksums only when modifiedTime is exactly equal.
  Changed versions never inherit an old checksum. This belongs in refreshPlanning's existing merge,
  not a second discovery request or another metadata/cache mechanism. Q1's same-bytes reupload control
  now retains its hash-backed exhaustion history; no additional physical read is needed.
- Invalid selection or execution after its one retry throws the existing BowerError and fails the run.
  main returns code 1 for failed runs. Only RunTiming's LedgerExhausted uses the untouched-inbox done
  outcome. The new invalid-reply and valid-101-source/202-operation controls retain their distinct kinds.
- C05's existing requestTargets verdict and personalAppendHistory supply read pins keyed by the admitted
  request file. Those pins count in each filed source's five-note allowance and are frozen in allowedTargets.
  Execution retains the bounded pins instead of dropping them when it replaces selection's empty notes.
  Pending requests suppress title matches and reuse verified target/source ids; renamed replacements
  gain no consent. A gone bound target is omitted from read pins and settles through the scripted planner.
  Refused/old targets remain suppressed: the existing planner records their row without an edit.
  Waiting sources use those script-bound ids for neighbourhood discovery, rather than fetching unrelated
  prefixes from stale request wording. No new pending store, writer, settlement rule or planner was added.
- Existing cited-line repetition evidence is recalculated after selected full notes reach execution.
  The same Timeline parser supplies it; repeating a line is accepted only on an already frozen target
  and grants no fresh source evidence or consent. This repairs the final C05 retained-source replay.
- Selection reads the ordered B5a type table through readTypeTable and uses its row ids, including the
  existing tolerant-reader seed, plus unknown. Both model phases receive that same table as context.
  No built-in classification list remains in selection validation. An OS-temp production-provider probe
  accepts configured committee-update and plans its move, and refuses absent payslip after one retry:
  /tmp/b1d-round3-type-probe.log. Each case observes two actual calls; the test tree is unchanged.
- model-input normalization covers itemId, folderId, parentId and indexed/folder dictionary keys.
  Dictionary rows retain their contents and multiplicity in stable canonical-content order; versions
  are run-dependent timestamps. Type-row ids remain stable configuration. Text values are not edited.
  The fresh-id controls and text-looking-like-an-id controls pass. Only the normalized fingerprint form
  changes; actual versions remain in both model inputs and the manifest fences.

removed: stale planner listing and versions after the prepared refresh.
removed: admission read-ahead's bypass of the versioned ReadCache and the resulting duplicate physical reads.
removed: same-version feed metadata discarding the listed checksum used by Q1 hash history.
removed: validation retry exhaustion masquerading as ledger exhaustion and ending done.
removed: successful process exit for a newly failed run.
removed: selection validation's built-in seven-kind list.
removed: execution dropping script-bound C05 note pins, and title-based discovery for pending requests.
removed: gone bound targets consuming selection read pins.
removed: execution retaining the empty selection stage's cited-line repetition evidence.
removed: physical item/dictionary ids and version timestamps leaking into the fresh-id fingerprint.
tests changed: none

### Write it and remaining compatibility drafts

The Write it implementation is still in its existing scripted/answer homes. The ten failing setup
paths in ask-answer-loop's shownWorld never reach execution: source words are "The offer came in."
and the extracted Industrial Designer/Ferrowick offer; the Job hunt hub's summary is "Applications
and offers." There is no whole-word match for that hub, so its parent is absent from the source's
visible neighbourhood. The transport selects a new Applications subfolder under that absent parent
and repeats it on retry. Changing singular offer into plural offers, allowing every indexed hub's
parent, or inventing an execution fallback would weaken addendum 13's neighbourhood/visible-parent
contract. No such workaround was made. The stored-answer controls with an actually stored question
continue to use the existing no-model path. The complete final inventory below includes these cases.

Drafts for the lead; no test, fixture, assertion, public format or golden was changed:

| Evidence / home | Compatibility draft or boundary |
| --- | --- |
| b1-planning's invalid-reply paths | Keep inbox/no-write/one-retry controls; assert failed/code 1 instead of the ledger's done helper. |
| claude-provider and q1-options negatives | Retain failed/status and authority checks; reconcile their older code-0 terminal-report assertion with the new explicit code-1 red. |
| b23-hot-recovery pre-plan failure | Preserve no-write/recovery assertions; reconcile code 0 after a failed model with main's failed outcome. |
| b1a-contract mocked pre-maintain listing | Assert the refreshed version/new hidden child; mocks currently demand the superseded pre-feed listing and throw before maintain. |
| ask-answer-loop shownWorld | Seed a genuinely matching hub word in the source or hub metadata; retain every shown-text, no-model, archive and re-ask assertion. |
| c04-offer-and-flat / c05 corpus | Give each newly proposed subfolder an actually visible parent; preserve all original filing/scoring controls. |
| ask-only-lines | Select its Flat hunt target by id; the current selection gives only Resources, then execution writes an unselected hub. |
| c05-person-notes final replay | Repaired by recalculating existing-line evidence after execution reads; all 60 tests now pass, including 19 conflict retries and the retained-source replay. |
| model-input goldens | Review the measured selection type-table addition and derived normalization separately; leave all byte/fresh-id assertions intact. |
| B5a unused-production gate | Reconcile type-table's formerly whole-file baseline with its now-live reader and five other unused exports; no new baseline entries added here. |

### Golden measurements and every named call

No golden or test fixture changed in this round. Actual C04 selection input was captured by an
OS-temp Vitest transform that adds only an OS-temp observation write, with no production fetch or
semantic change. The capture ran the unchanged raw-golden test; its expected failure is recorded in
/tmp/b1d-round3-capture.{json,log}. Bytes: /tmp/b1d-round3-measured-input.txt and
/tmp/b1d-round3-measured-normalized.txt; lengths/hashes: /tmp/b1d-round3-golden-measurements.log.
The raw prompt prefix is byte-identical. Its only changed context key is types.

| Golden file | Old chars / bytes | Measured chars / bytes | Char delta | Named call / reason |
| --- | ---: | ---: | ---: | --- |
| runner/test/fixtures/model-input-c04.raw.golden.txt | 10830 / 10832 | 11605 / 11607 | +775 | selection receives the ordered B5a type table; execution receives the same table. |
| runner/test/fixtures/model-input-c04.golden.txt | 10832 / 10834 | 11502 / 11504 | +670 | that selection table adds 775; derived fresh-id/version normalization removes 105. |

Measured raw SHA256: 724f6170ed0e4cf1c8affb2d1ec8fb125c0ab8043460e9cf4cdd58d566576fdc.
Measured normalized SHA256: 2b74fe14c6e58978e1cb0855be9155f8dd18a013ce19d14655dfe8f5034bbb9e.
These are review measurements, not silently raised golden pins. Fresh-id normalization has no model
call or byte-growth claim of its own. No traffic, token, operation, retry, character or time bound rose.

Named semantic calls remain: selection; selection validation retry; execution; execution validation
retry. Each step has one retry, four physical model calls at most; actual usage stays on RunTiming.
The type table adds one existing versioned media read only when type-table.json is present; the
missing-table path uses readTypeTable's existing seed with zero Drive calls. The custom-table probe
records that path. Existing selected-note reads and script-bound pending-run record reads reuse the
same cache. The listing handoff, same-version checksum merge and repetition evidence add zero
physical discovery/feed/media calls. No second changes-feed drain was introduced.

### Verification commands and output boundary

Baseline full runner after applying the handoff base: 646 passed, 45 failed, 691 total:
/tmp/b1d-round3-before.{json,log}. The unchanged committed sweep 3's prior result was 657/691.
All tests remain unchanged; changing invalid-reply outcomes deliberately exposes the already-audited
contradictory done assertions instead of preserving their accidental greens.

Completed src suite: 170 physical files, 5689 passed, one failed. src/e2e-port.test.ts:37 is the
expected sandbox socket-listen failure; its observed assertion is the 5000 ms timeout. No app source
changed. App, node and runner TypeScript pass; touched-file ESLint passes. The unused gate's ordinary
pass is green; production fails on the B5a reader's now-visible unused exports and stale whole-file
baseline, listed separately below. No pnpm check or screen e2e ran: their normal commands write
repository build/result/check-mark files, contrary to the owner's OS-temp-only instruction. ui:false,
no screen, test, fixture, shared harness baseline or generated landing file changed.

Final required commands (all output outside the repository, Vitest cache disabled):
- pnpm -C runner exec vitest run --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-round3-final.json --cache=false
  /tmp/b1d-round3-final.log
- pnpm exec vitest run src --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-round3-src.json --cache=false
  /tmp/b1d-round3-src.log
- pnpm exec tsc --noEmit -p tsconfig.app.json --tsBuildInfoFile /tmp/b1d-round3-app.tsbuildinfo
  /tmp/b1d-round3-app-types.log
- pnpm exec tsc --noEmit -p tsconfig.node.json --tsBuildInfoFile /tmp/b1d-round3-node.tsbuildinfo
  /tmp/b1d-round3-node-types.log
- pnpm -C runner exec tsc --noEmit -p .
  /tmp/b1d-round3-runner-types.log
- pnpm -C runner exec eslint src/claude.ts src/drive.ts src/main.ts src/model-input.ts src/index.ts
  /tmp/b1d-round3-eslint.log
- node scripts/check-unused-gate.mjs
  /tmp/b1d-round3-unused.log

OS-temp diagnostic artifacts: /tmp/b1d-round3-targeted.{json,log},
/tmp/b1d-round3-revised.{json,log}, /tmp/b1d-round3-gone.{json,log},
/tmp/b1d-round3-checksums.{json,log}, /tmp/b1d-round3-present-lines.{json,log},
/tmp/b1d-round3-corpus-diagnosis.log. Temporary diagnostic logging was removed from production.
The capture transform/config, bundles and probes are /tmp/b1d-round3-* only; no dependency changes.

Unused-production gate inventory (mechanical B5a boundary; outside this packet's production allocation):
- runner/src/type-table.ts:40, firstMatchingRow: unused production export.
- runner/src/type-table.ts:32, insertTypeRow: unused production export.
- runner/src/type-table.ts:4, propertyValuesOk: unused production re-export.
- runner/src/type-table.ts:44, requestTableColumn: unused production export.
- runner/src/type-table.ts:4, typeTableOk: unused production re-export.
- harness/unused-production-baseline.json:24: whole-file runner/src/type-table.ts row is stale now the reader is live.
The gate reports 28 baseline versus 32 current findings: five export findings replace one file finding.
The earlier two selectionOf baseline rows are already absent on this branch. None was reintroduced.

### Offline sources and stop boundary

Reused the packet's offline research without a network lookup:
- [Curated context and just-in-time retrieval](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
- [Plan then execute](https://arxiv.org/html/2506.08837v1).
- [Stable prompt prefixes](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
The existing ReadCache documents [HTTP version validators](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.3);
its existing implementation remains the one cache. No second planner, cache, ledger, writer or pending state added.

Round 3 cannot be marked green with the remaining contracts, goldens and B5a gate findings unchanged.
The owner's instruction and addendum 16 require return to the lead; no fourth implementation round,
new golden acceptance, unallocated shared-file pruning or weaker authority was inferred.

### Final complete runner inventory and compatibility results

Final runner: 654 passed, 37 failed, 691 total; 52 physical test files. Exit 1.
Changed production: runner/src/claude.ts, runner/src/drive.ts, runner/src/index.ts,
runner/src/main.ts, runner/src/model-input.ts. No other production file changed.
Full messages and every soft assertion are in /tmp/b1d-round3-final.json.

| File:line | Kind | Remaining red / first observation |
| --- | --- | --- |
| runner/test/ask-answer-loop.test.ts:588 | invalid-reply exhaustion; visible-parent fixture contradiction | a yes to write it applies the shown text with no model call |
| runner/test/ask-answer-loop.test.ts:613 | invalid-reply exhaustion; visible-parent fixture contradiction | write it re-asks when the section changed since it was shown |
| runner/test/ask-answer-loop.test.ts:639 | invalid-reply exhaustion; visible-parent fixture contradiction | a write it yes whose note is gone writes one answered row |
| runner/test/ask-answer-loop.test.ts:661 | invalid-reply exhaustion; visible-parent fixture contradiction | write it re-asks when the note changed elsewhere since it was shown |
| runner/test/ask-answer-loop.test.ts:694 | invalid-reply exhaustion; visible-parent fixture contradiction | a clash at write time leads to the re-ask with the new sentence and no extra press |
| runner/test/ask-answer-loop.test.ts:739 | invalid-reply exhaustion; visible-parent fixture contradiction | only a clash keeps an answer for a re-ask |
| runner/test/ask-answer-loop.test.ts:768 | invalid-reply exhaustion; visible-parent fixture contradiction | the same non-clash refusal never starts more runs than the cap, then shows the not-written row |
| runner/test/ask-answer-loop.test.ts:833 | invalid-reply exhaustion; visible-parent fixture contradiction | a write it with nothing to write writes one answered row |
| runner/test/ask-answer-loop.test.ts:860 | invalid-reply exhaustion; visible-parent fixture contradiction | a lone no to write it closes the question with no model call |
| runner/test/ask-answer-loop.test.ts:879 | invalid-reply exhaustion; visible-parent fixture contradiction | a yes to write it beside a pile asks the model |
| runner/test/ask-only-lines.test.ts:35 | invalid-reply exhaustion; unselected-target fixture contradiction | keeps the Timeline lines the model added with no cites |
| runner/test/b1-planning.test.ts:108 (helper :257) | invalid-reply exhaustion; done contradiction | b1-cut-index-no-new-destination |
| runner/test/b1-planning.test.ts:139 (helper :257) | invalid-reply exhaustion; done contradiction | b1-five-per-source |
| runner/test/b1-planning.test.ts:168 (helper :257) | invalid-reply exhaustion; done contradiction | b1-pinned-and-script-notes-count-within-five |
| runner/test/b1-planning.test.ts:184 (helper :257) | invalid-reply exhaustion; done contradiction | b1-selection-closed-ids |
| runner/test/b1-planning.test.ts:261 (helper :257) | invalid-reply exhaustion; done contradiction | b1-target-injection |
| runner/test/b1-planning.test.ts:328 (helper :257) | invalid-reply exhaustion; done contradiction | b1-question-candidate-binding |
| runner/test/b1-planning.test.ts:515 (helper :257) | invalid-reply exhaustion; done contradiction | b1-expansion-is-not-a-read-picked-members-count-within-five |
| runner/test/b1-planning.test.ts:536 (helper :257) | invalid-reply exhaustion; done contradiction | b1-new-subfolder-visible-parent-name-and-near-duplicate |
| runner/test/b1-planning.test.ts:550 (helper :257) | invalid-reply exhaustion; done contradiction | b1-one-new-subfolder-per-item |
| runner/test/b1-planning.test.ts:565 (helper :257) | invalid-reply exhaustion; done contradiction | b1-one-retry-per-step-four-calls-exhaustion-leaves-items-for-next-run |
| runner/test/b1a-contract.test.ts:488 | stale-listing mock contradiction; assertion causes failed run | B1a contract: pass 1 1: the committed cursor never passes an unreflected concurrent edit |
| runner/test/b1a-contract.test.ts:573 | stale-listing mock contradiction; assertion causes failed run | B1a contract: pass 1 5: newly discovered hidden descendants advance only the cursor |
| runner/test/b1a-contract.test.ts:643 | stale-listing mock contradiction; assertion causes failed run | B1a contract: round 3 1: vanished indexed notes drop without failing and ordinary edits refresh |
| runner/test/b23-hot-recovery.test.ts:47 | provider error; code-0/code-1 contradiction | B3b hot: pre-plan failure and done redispatch send no hot writes |
| runner/test/c04-incorporation.test.ts:223 | invalid-reply exhaustion; c04-offer-and-flat visible-parent contradiction | the C04 corpus cases score green with scripted proposals |
| runner/test/c05-incorporation.test.ts:74 | invalid-reply exhaustion; c05-line-not-repeated visible-parent contradiction | the C05 corpus cases score green with scripted proposals |
| runner/test/claude-provider.test.ts:262 | invalid-reply exhaustion; code-0/done contradiction | a responsibility does not open a new Project |
| runner/test/claude-provider.test.ts:365 | invalid-reply exhaustion; code-0/done contradiction | a thing with text and no note or citing line is refused and retried once |
| runner/test/claude-provider.test.ts:409 | invalid-reply exhaustion; code-0/done contradiction | a second refusal ends the run honestly |
| runner/test/claude-provider.test.ts:468 | invalid-reply exhaustion; code-0/done contradiction | a malformed or out-of-schema Claude reply fails truthfully and writes nothing |
| runner/test/claude-provider.test.ts:529 | model process error; code-0/code-1 contradiction | the Claude provider runs under the original permission policy and never logs the token |
| runner/test/claude-provider.test.ts:592 | invalid-reply exhaustion; code-0/done contradiction | a Claude reply that targets a thing not admitted is refused and writes nothing |
| runner/test/claude-provider.test.ts:592 | invalid-reply exhaustion; code-0/done contradiction | the runner computes ids and digests, never the model |
| runner/test/model-input-fingerprint.test.ts:82 | compatibility golden; table context/normalization | the model input on the C04 fixture equals its golden copy |
| runner/test/model-input-fingerprint.test.ts:94 | compatibility golden; table context/normalization | the raw model input on the C04 fixture equals its golden copy |
| runner/test/q1-continuation.test.ts:373 | invalid-reply exhaustion; code-0/code-1 contradiction | Q1a q1-options-exact-action: two to four script candidates accepted and fabricated or fifth refused |

The B1 helper at runner/test/b1-planning-support.ts:257–258 still asserts done/code 0 for those
invalid replies. Both phases' retry bounds and all source/no-write controls remain unchanged.
The protected failed-status reds now fail their older code-0 assertion before reaching the phase
assertion; no failed reply is relabelled as ledger exhaustion to hide this incompatibility.

Ledger exhaustion controls (valid replies but insufficient operations/items) both pass:
b1-200-operations-exhaustion-leaves-items-for-next-run and
b1-ledger-exhaustion-valid-replies-done-with-items-left-in-inbox. Invalid-reply control
b1-invalid-reply-exhaustion-fails-after-one-retry passes for selection and execution, with its
four-call valid-retry positive control. Every remaining exhaustion red is classified above;
there is no failing valid-ledger exhaustion red. The golden and stale-listing mock reds are not
ledger exhaustion.

| Compatibility suite | Passed / total |
| --- | ---: |
| runner/test/ask-answer-loop.test.ts | 14 / 24 |
| runner/test/b1-index.test.ts | 31 / 31 |
| runner/test/b1a-contract.test.ts | 15 / 18 |
| runner/test/b1-planning-support.test.ts | 3 / 3 |
| runner/test/b1-planning.test.ts | 11 / 21 |
| runner/test/b23-hot-context.test.ts | 10 / 10 |
| runner/test/b23-hot-recovery.test.ts | 1 / 2 |
| runner/test/b23-hot.test.ts | 135 / 135 |
| runner/test/c05-bounded-reads.test.ts | 8 / 8 |
| runner/test/c05-person-notes.test.ts | 60 / 60 |
| runner/test/claude-provider.test.ts | 16 / 23 |
| runner/test/corpus-driver.test.ts | 18 / 18 |
| runner/test/drive-calls-golden.test.ts | 5 / 5 |
| runner/test/main.test.ts | 7 / 7 |
| runner/test/model-input-fingerprint.test.ts | 7 / 9 |
| runner/test/q1-continuation.test.ts | 42 / 43 |
| runner/test/q1c-live.test.ts | 8 / 8 |
| runner/test/second-brain-method.test.ts | 6 / 6 |
| runner/test/state-rewrite.test.ts | 13 / 13 |
| runner/test/timing-counts.test.ts | 2 / 2 |

Measured production calls (seeding/admission/inspection excluded; no golden pins changed):

| Case | Cold/warm | Drive calls | Bytes | Range prefixes | Full media | Operations | Filed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| b1-index-job-offer | cold | 109 | 109984 | 16 | 21 | 7 | 1 |
| b1-index-job-offer | warm | 79 | 95938 | 2 | 23 | 7 | 1 |
| b1-changes-person-edit | cold | 49 | 37953 | 3 | 3 | 1 | 0 |
| b1-changes-person-edit | warm | 43 | 48476 | 1 | 12 | 1 | 0 |
| b1-refresh-cache-hot-order | warm | 65 | 55923 | 4 | 11 | 5 | 1 |

Offer warm-minus-cold: -30 calls, -14046 bytes, -14 prefixes, +2 full media.
Person-edit warm-minus-cold: -6 calls, +10523 bytes, -2 prefixes, +9 full media.
All rows have exactly selection then execution. No measured deployment-latency or >20% time-delta
acceptance is claimed. Source observations: /var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b1d-selection-observations.ndjson.

Final boundary: blocked pending the lead's new ruling; no fourth round, test edit or commit performed.


## Sweep 4

implementer: codex
status: blocked; fixtures and item 5 prepared for the runner, not accepted or merge-ready.

Authority: the owner's sweep-4 instruction and TL-P4-41 addendum 17. No network, git-writing command,
node_modules replacement or symlink. Test reports, caches and diagnostics stay in OS temporary files.
Production is unchanged except the explicitly authorized type-table pruning. The runner owns commits;
`.codex-commits.json` specifies the exact two requested messages and assigns every changed file once.

### Fixtures, assertion boundary and requested handoff mocks

tests changed: runner/test/b1-planning-support.ts: phaseAwareClaude now binds every uncited lines/states target to an admitted selected source and includes its note id in wants. When filing selects a later source, uncited targets bind to that selected source rather than silently disappearing. Existing cited targets, pair pins and exact source/destination ids remain in the same helper.
tests changed: runner/test/ask-answer-loop.test.ts: shownWorld's source words explicitly say Job hunt, making the proposed Applications parent's hub a real whole-word neighbourhood match; every shown-text, archive, re-ask and no-model assertion stays.
tests changed: runner/test/b1-planning.test.ts: add a real-main positive control using the repaired helper, a visible new-folder parent, one cited hub and a separate uncited hub; both targets are frozen and actually written in exactly two semantic calls. Existing tests and assertions stay.
tests changed: runner/test/c04-incorporation.test.ts: the scripted payslip proposal creates Money directly under visible Areas, using its existing responsibility, instead of proposing the two absent folders Money/Payslips. Corpus scoring and all assertions stay. No extra seeded note or traffic/golden pin was retained.
tests changed: runner/test/model-input-fingerprint.test.ts: add a control with two identical C04 runs through main, each successful with exactly two calls, and exactly one normalized selection fingerprint. Existing raw/normalized golden assertions stay.
tests changed: runner/test/type-table.test.ts: resolve typeTableOk/propertyValuesOk at their existing canonical note-format home after deleting the unused runner re-exports. No assertion changes or replacement implementations. The contracts requiring the deleted insertion/column functions remain red for the lead/B5b.

Fixture changed: harness/corpus/c05-line-not-repeated/case.json: source words explicitly identify Job hunt,
so the new Applications parent's hub is visible without broadening production neighbourhood authority.
The affected transports already enter phaseAwareClaude through realWorld/runWithClaude/replySequence:
ask-answer-loop, claude-provider, ask-only-lines, C04/C05 and q1-continuation. No second reply adapter added.
The helper repair turns the uncited ask-only-lines case green without editing that test.

The ten remaining b1-planning reds intentionally send invented ids, excess wants, invalid parents,
extra keys, nested second folders or repeated invalid replies. They are the subject of those tests;
replacing them with valid replies would remove their negative coverage. Their common helper at the
old :257/current :262 asserts ledger-exhaustion/done, while production correctly treats their replies
as validation failure under addendum 16. No assertion or negative subject was changed to hide that conflict.
Only b1-cut-index-no-new-destination seeds the cut index. Other negative replies remain deliberately
invalid on their named subject, rather than accidentally cut. The character/operation bound controls stay.

B1a :488/:573/:643 do not contain handoff-less Drive mocks in this checkout. Their mocks are
withMaintenance observation spies (:476/:554/:602); the adapter is the real RunnerDrive. Its real
planReads.handoff is already implemented (:279), and main calls it after refreshPlanning (:427).
The spies still assert a pre-refresh version or absence of a newly discovered hidden child at maintenance
(:479/:558/:604). That assertion throws before original maintenance, causing the recorded failed run.
Adding a stale fake listing or suppressing the real handoff would make a test pass by hiding the contract.
All three are listed below and left for the lead, as required; no production fix follows this sweep.

B23 :47 is not an invalid-reply fixture: its transport intentionally throws a pre-plan provider error.
The failed status is correct; its unchanged main-return assertion expects 0 instead of the current 1.
Hot recovery's two other tests pass. No hot code or fixture was changed.

Existing assertion changes: none. The AST audit checks the byte-identical existing expect statements in
changed files; the assertion-line diff contains no removed assertion lines. Only the two newly requested
positive controls add assertions. Evidence: /tmp/b1d-sweep4-assertions.log and
/tmp/b1d-sweep4-assertion-diff.log. No .only/.skip, bound increase or production workaround.

removed: runner/src/type-table.ts whole-file row from harness/unused-production-baseline.json.
removed: runner/src/type-table.ts re-export typeTableOk.
removed: runner/src/type-table.ts re-export propertyValuesOk.
removed: runner/src/type-table.ts insertTypeRow.
removed: runner/src/type-table.ts firstMatchingRow.
removed: runner/src/type-table.ts requestTableColumn.
removed: imports used only by the deleted type-table exports; the tolerant reader and seed are unchanged.

### Golden diff (only ruled inputs)

Both golden comparisons pass. Regenerated from the round-3 measured C04 selection captures, then
verified by the unchanged real-main golden assertions. The prompt prefix is byte-identical in both files.

| Golden | Old chars / UTF-8 bytes | New chars / UTF-8 bytes | Exact changed context keys |
| --- | ---: | ---: | --- |
| runner/test/fixtures/model-input-c04.raw.golden.txt | 10830 / 10832 | 11605 / 11607 | types only (+775 chars): ordered eight-row B5a type table |
| runner/test/fixtures/model-input-c04.golden.txt | 10832 / 10834 | 11502 / 11504 | types; foldersById, indexed, sources: ruled id/dictionary/version normalization (+670 chars total) |

Raw SHA256: 724f6170ed0e4cf1c8affb2d1ec8fb125c0ab8043460e9cf4cdd58d566576fdc.
Normalized SHA256: 2b74fe14c6e58978e1cb0855be9155f8dd18a013ce19d14655dfe8f5034bbb9e.
No source text, prompt instruction, character budget, latency bound, traffic golden or assertion changed.
The added identical-run control is green; the existing fresh-id and text-looking-like-an-id controls stay green.

### Gates and remaining reds

Baseline runner before edits: 654 passed, 37 failed, 691 total (/tmp/b1d-sweep4-before.{json,log}).
Final full runner: 669 passed, 24 failed, 693 total; exit 1.
Full src: 5689 passed, 1 failed, 5690 total; the expected sandbox server.listen restriction surfaces
as the existing 5000 ms timeout in src/e2e-port.test.ts:37 (listen is :21). No app file changed.
Runner tsc, ESLint on every touched TypeScript file, and both unused gate passes succeed.
Unused baseline: 1 ordinary and 27 production findings, no fresh or stale findings.
The 73 shared traffic/latency/per-thing/C04/C05 bounded-read pin tests all pass with their original assertions.
No pnpm check or screen e2e: ui:false and their usual outputs/check marks write into the repository,
contrary to the owner's test-output instruction. The specifically requested runner/src suites and gates ran.

Commands (each redirects output to its OS-temp log):
- pnpm -C runner exec vitest run --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-sweep4-verified.json --cache=false
  log: /tmp/b1d-sweep4-verified.log
- pnpm exec vitest run src --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-sweep4-src.json --cache=false
  log: /tmp/b1d-sweep4-src.log
- pnpm -C runner exec tsc --noEmit -p .
  log: /tmp/b1d-sweep4-tsc.log
- pnpm exec eslint runner/test/b1-planning-support.ts runner/test/ask-answer-loop.test.ts runner/test/b1-planning.test.ts runner/test/type-table.test.ts runner/test/model-input-fingerprint.test.ts runner/src/type-table.ts
  log: /tmp/b1d-sweep4-eslint.log; final helper: /tmp/b1d-sweep4-helper-eslint.log
- pnpm exec eslint runner/test/c04-incorporation.test.ts
  log: /tmp/b1d-sweep4-c04-eslint.log
- node scripts/check-unused-gate.mjs
  log: /tmp/b1d-sweep4-unused.log
- Shared-pin regression log/report: /tmp/b1d-sweep4-shared-pins.{log,json}.

Every remaining runner red is listed below. The JSON report contains every soft assertion, not just its first.

| File:line | Test | Cause / lead boundary |
| --- | --- | --- |
| runner/test/b1-planning.test.ts:133 | b1-cut-index-no-new-destination | Deliberately invalid selection/execution after one retry fails; unchanged leavesForNextRun :262 requires done/code 0 and ledger-only output. |
| runner/test/b1-planning.test.ts:164 | b1-five-per-source | Deliberately invalid selection/execution after one retry fails; unchanged leavesForNextRun :262 requires done/code 0 and ledger-only output. |
| runner/test/b1-planning.test.ts:193 | b1-pinned-and-script-notes-count-within-five | Deliberately invalid selection/execution after one retry fails; unchanged leavesForNextRun :262 requires done/code 0 and ledger-only output. |
| runner/test/b1-planning.test.ts:209 | b1-selection-closed-ids | Deliberately invalid selection/execution after one retry fails; unchanged leavesForNextRun :262 requires done/code 0 and ledger-only output. |
| runner/test/b1-planning.test.ts:286 | b1-target-injection | Deliberately invalid selection/execution after one retry fails; unchanged leavesForNextRun :262 requires done/code 0 and ledger-only output. |
| runner/test/b1-planning.test.ts:353 | b1-question-candidate-binding | Deliberately invalid selection/execution after one retry fails; unchanged leavesForNextRun :262 requires done/code 0 and ledger-only output. |
| runner/test/b1-planning.test.ts:540 | b1-expansion-is-not-a-read-picked-members-count-within-five | Deliberately invalid selection/execution after one retry fails; unchanged leavesForNextRun :262 requires done/code 0 and ledger-only output. |
| runner/test/b1-planning.test.ts:561 | b1-new-subfolder-visible-parent-name-and-near-duplicate | Deliberately invalid selection/execution after one retry fails; unchanged leavesForNextRun :262 requires done/code 0 and ledger-only output. |
| runner/test/b1-planning.test.ts:575 | b1-one-new-subfolder-per-item | Deliberately invalid selection/execution after one retry fails; unchanged leavesForNextRun :262 requires done/code 0 and ledger-only output. |
| runner/test/b1-planning.test.ts:590 | b1-one-retry-per-step-four-calls-exhaustion-leaves-items-for-next-run | Deliberately invalid selection/execution after one retry fails; unchanged leavesForNextRun :262 requires done/code 0 and ledger-only output. |
| runner/test/b1a-contract.test.ts:488 | B1a contract: pass 1 1: the committed cursor never passes an unreflected concurrent edit | Maintenance observation spy asserts the old listing after real handoff; throws before maintenance. Requested mock repair does not apply to this real adapter; lead must rule. |
| runner/test/b1a-contract.test.ts:573 | B1a contract: pass 1 5: newly discovered hidden descendants advance only the cursor | Maintenance observation spy asserts the old listing after real handoff; throws before maintenance. Requested mock repair does not apply to this real adapter; lead must rule. |
| runner/test/b1a-contract.test.ts:643 | B1a contract: round 3 1: vanished indexed notes drop without failing and ordinary edits refresh | Maintenance observation spy asserts the old listing after real handoff; throws before maintenance. Requested mock repair does not apply to this real adapter; lead must rule. |
| runner/test/b23-hot-recovery.test.ts:47 | B3b hot: pre-plan failure and done redispatch send no hot writes | Intentional pre-plan provider exception returns code 1; unchanged assertion requires code 0. Not a hot-recovery fixture failure. |
| runner/test/claude-provider.test.ts:262 | a responsibility does not open a new Project | Intentional responsibility-only new Project is refused after one retry; unchanged assertion requires done, contrary to invalid-reply failure ruling. |
| runner/test/claude-provider.test.ts:365 | a thing with text and no note or citing line is refused and retried once | Intentional invalid reply/process error fails with code 1; unchanged legacy assertion requires code 0/done. Cannot make this valid without removing its refusal subject. |
| runner/test/claude-provider.test.ts:409 | a second refusal ends the run honestly | Intentional invalid reply/process error fails with code 1; unchanged legacy assertion requires code 0/done. Cannot make this valid without removing its refusal subject. |
| runner/test/claude-provider.test.ts:468 | a malformed or out-of-schema Claude reply fails truthfully and writes nothing | Intentional invalid reply/process error fails with code 1; unchanged legacy assertion requires code 0/done. Cannot make this valid without removing its refusal subject. |
| runner/test/claude-provider.test.ts:529 | the Claude provider runs under the original permission policy and never logs the token | Intentional invalid reply/process error fails with code 1; unchanged legacy assertion requires code 0/done. Cannot make this valid without removing its refusal subject. |
| runner/test/claude-provider.test.ts:723 | a Claude reply that targets a thing not admitted is refused and writes nothing | Intentional invalid reply/process error fails with code 1; unchanged legacy assertion requires code 0/done. Cannot make this valid without removing its refusal subject. |
| runner/test/claude-provider.test.ts:763 | the runner computes ids and digests, never the model | Intentional invalid reply/process error fails with code 1; unchanged legacy assertion requires code 0/done. Cannot make this valid without removing its refusal subject. |
| runner/test/q1-continuation.test.ts:373 | Q1a q1-options-exact-action: two to four script candidates accepted and fabricated or fifth refused | Deliberately fabricated/fifth/payload/outside/not-folder option is refused; unchanged main-return assertion requires 0 instead of 1. |
| runner/test/type-table.test.ts:52 | B5a contracts: b5-row-schema-and-order | Item 5 explicitly deletes the unused production export this B5a contract still requires; no test-side copy or assertion weakening added. |
| runner/test/type-table.test.ts:152 | B5a contracts: b5-explicit-column-replaces-fourth | Item 5 explicitly deletes the unused production export this B5a contract still requires; no test-side copy or assertion weakening added. |

Remaining src red: src/e2e-port.test.ts:37, expected sandbox socket-listen restriction/time-out;
no production regression inferred from that environment-only failure.

Offline research reused from the packet, without independent network verification:
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://arxiv.org/html/2506.08837v1
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Stop boundary: fixture repairs are reviewable, assertions remain intact, all required gates ran.
The remaining assertion contracts need the lead's ruling. No fourth production implementation round,
mock that hides stale/fresh listing semantics, test implementation of deleted production functions,
new performance pin or integration is performed. No merge-readiness or acceptance is claimed.

## Sweep 5

implementer: codex
status: blocked; the assigned invalid-reply/ledger split and B1a spy repairs are complete.
The two type-table contracts cannot be retargeted to a public caller in this checkout.
The full runner suite enumerates all four remaining reds below; no production repair is included.

Authority: the owner's sweep-5 instruction and TL-P4-41 addenda 16–18; addendum 14 supplies
B1a's refreshed-listing expectation. This session changes only test files and this required note.
No network, git-writing command, node_modules replacement/symlink, export restoration, or app-code edit.
The runner commits the diff. Reports, test diagnostics and compiler/linter output are in OS temp.

### Changed tests and assertion boundary

tests changed: runner/test/b1-planning-support.ts: add failedReply for invalid replies after their retry (failed/code 1); extract byte-identical inbox/report/no-write assertions into untouchedInbox, shared with leavesForNextRun. leavesForNextRun retains done/code 0, its exact console count, and every prior assertion for ledger exhaustion.
tests changed: runner/test/b1-planning.test.ts: nine repeated-invalid subjects use failedReply, retaining their negative fixtures and positive controls. The leftover-items test keeps done/code 0 and every existing assertion, but ends with valid selection/execution replies for 101 separate one-file piles whose moves and notes exceed 200 operations. One branch succeeds on its first execution reply; the other retries one refused execution reply and receives the valid oversized intent. The four-call retry control stays. Re-admission retains all piles/requests; its next run selects one whole pile, files it, and leaves the others outside selection. b1-shared-ledger and both existing operation-ledger tests stay unchanged.
tests changed: runner/test/b1a-contract.test.ts: change only the three maintenance observation spy expectations to the refreshed handoff: latest edit version, newly discovered hidden child's path, and refreshed version or absence of vanished notes. Every read-count, prefix outcome, no-extra-listing, cursor, and no-extra-write assertion stays.
tests changed: runner/test/claude-provider.test.ts: six invalid-reply subjects now require code 1/failed after the retry; successful retry controls stay done/code 0. The three callers of the former ledger-only helper retain all no-row, no-manifest, evidence, inbox and re-admission checks under expectFailedReply. Their ledger-only deferred-count console assertions are removed from the invalid-reply path; the ledger count contract remains unchanged in leavesForNextRun. refusedWhole changes only code 0 to 1 for the two admitted-authority/id-digest subjects. The permission-policy regression test (old :529/current :525) is byte-identical.
tests changed: runner/test/q1-continuation.test.ts: only the code assertion at :373 changes from 0 to 1 for fabricated/fifth/payload/outside/non-folder options. Its existing failed status, no-question and unchanged-evidence assertions, and all accepted option controls stay.

Assertion audit: /tmp/b1d-sweep5-assertion-audit.log. Existing expect expressions in
b1-planning.test.ts are byte-identical. B1a changes exactly the three handed-over listing
observations, with no count change. The AST-isolated permission-policy test is byte-identical,
as is the entire b23-hot-recovery.test.ts file. No .only/.skip, bound/tolerance increase,
traffic/golden edit, new dependency or production workaround.

### Per-test kinds (all 17 sweep-4 invalid-reply reds)

The locations in the first column are the sweep-4 references supplied by the owner.
The B1 planning entries refer to the common helper call, not a new failure location.

| Original file:line | Test | Kind and disposition |
| --- | --- | --- |
| runner/test/b1-planning.test.ts:133 | b1-cut-index-no-new-destination | invalid reply: repeated new destination justified by a cut index; failed/code 1. |
| runner/test/b1-planning.test.ts:164 | b1-five-per-source | invalid reply: repeated six wants; failed/code 1. |
| runner/test/b1-planning.test.ts:193 | b1-pinned-and-script-notes-count-within-five | invalid reply: pins plus wants exceed five; failed/code 1. |
| runner/test/b1-planning.test.ts:209 | b1-selection-closed-ids | invalid reply: invented ids/kinds, paths and extra keys; failed/code 1. |
| runner/test/b1-planning.test.ts:286 | b1-target-injection | invalid reply: poisoned targets or changed frozen destination; failed/code 1. |
| runner/test/b1-planning.test.ts:353 | b1-question-candidate-binding | invalid reply: fabricated/fifth candidates; failed/code 1. |
| runner/test/b1-planning.test.ts:540 | b1-expansion-is-not-a-read-picked-members-count-within-five | invalid reply: repeated six picked members; failed/code 1. |
| runner/test/b1-planning.test.ts:561 | b1-new-subfolder-visible-parent-name-and-near-duplicate | invalid reply: invalid/invisible parents or invalid/duplicate names; failed/code 1. |
| runner/test/b1-planning.test.ts:575 | b1-one-new-subfolder-per-item | invalid reply: execution adds a second nested folder; failed/code 1. |
| runner/test/b1-planning.test.ts:590 | b1-one-retry-per-step-four-calls-exhaustion-leaves-items-for-next-run | ledger exhaustion: valid final replies exceed 200 operations; done/code 0, untouched inbox, fresh admission and next-run filing. |
| runner/test/claude-provider.test.ts:262 | a responsibility does not open a new Project | invalid reply: responsibility alone cannot authorize the proposed Project; failed/code 1. |
| runner/test/claude-provider.test.ts:365 | a thing with text and no note or citing line is refused and retried once | invalid reply: repeated execution without a note/citing line; failed/code 1. Valid retry control stays done/code 0. |
| runner/test/claude-provider.test.ts:409 | a second refusal ends the run honestly | invalid reply: repeated unauthorized new Project; failed/code 1. |
| runner/test/claude-provider.test.ts:468 | a malformed or out-of-schema Claude reply fails truthfully and writes nothing | invalid reply: malformed/schema/name/extension/envelope refusals; failed/code 1, no writes. |
| runner/test/claude-provider.test.ts:723 | a Claude reply that targets a thing not admitted is refused and writes nothing | invalid reply: admitted-authority violations through refusedWhole; failed/code 1. |
| runner/test/claude-provider.test.ts:763 | the runner computes ids and digests, never the model | invalid reply: model-supplied ids/hashes/operations through refusedWhole; failed/code 1. Valid runner-generated ids/digests control stays. |
| runner/test/q1-continuation.test.ts:373 | Q1a q1-options-exact-action: two to four script candidates accepted and fabricated or fifth refused | invalid reply: invalid option id/action/folder/count; failed/code 1. Accepted 2–4 option controls stay done/code 0. |

Additional ledger controls are unchanged: b1-shared-ledger's injected model-time expiration,
b1-200-operations-exhaustion-leaves-items-for-next-run, and
b1-ledger-exhaustion-valid-replies-done-with-items-left-in-inbox. All pass, keeping done/code 0.
The invalid-reply control b1-invalid-reply-exhaustion-fails-after-one-retry also passes unchanged.

### Type-table retargeting gap

runner/test/type-table.test.ts is unchanged rather than weakening either contract.
The only public function in runner/src/type-table.ts is readTypeTable (:14), which calls
seedTable and typeRowOk. insertTypeRow, firstMatchingRow and requestTableColumn were deleted
entirely in sweep 4; a scoped production search finds no caller or implementation of them.
claudeProvider uses readTypeTable to show rows and validate selected kind ids, but does not
insert type rows, choose the first matching classification, or replace a requested column.

Consequently there is no public function using the named deleted helpers to retarget :52/:152
to. Testing a manually inserted row or manually replaced fourth column through readTypeTable
would only test reading a precomputed fixture and would remove the original behavior coverage.
No test-side replacement implementation, restored export, invented production API or new
production mechanism was added. These two contracts need the lead to name a real public
consumer or explicitly rule their replacement behavior. This is the unresolved part of item 3.

### Gates and every remaining red

Before edits, the six targeted files reproduce 24 failed / 100 passed / 124 total tests:
/tmp/b1d-sweep5-before.{json,log}. The repaired B1 planning file is 22/22 green:
/tmp/b1d-sweep5-ledger.{json,log}.

Final full runner: **689 passed, 4 failed, 693 total**, exit 1. No extra remaining red.
Runner TypeScript and ESLint on all five changed TypeScript files pass, exit 0.
The two authorized code regressions keep their original assertions and remain for the next session.

| Current file:line | Test | Remaining cause |
| --- | --- | --- |
| runner/test/b23-hot-recovery.test.ts:47 | B3b hot: pre-plan failure and done redispatch send no hot writes | Unchanged code regression: pre-plan provider exception returns 1; assertion requires 0 under addendum 18 (2). |
| runner/test/claude-provider.test.ts:525 | the Claude provider runs under the original permission policy and never logs the token | Unchanged code regression (old :529): provider/process error returns 1; assertion requires 0 under addendum 18 (2). |
| runner/test/type-table.test.ts:52 | B5a contracts: b5-row-schema-and-order | Retargeting gap: no public insertion/first-match consumer; absent insertTypeRow export fails at helper :14. |
| runner/test/type-table.test.ts:152 | B5a contracts: b5-explicit-column-replaces-fourth | Retargeting gap: no public requested-column consumer; absent requestTableColumn export fails at helper :14. |

Commands (all output redirected to OS-temp files):
- pnpm -C runner exec vitest run --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-sweep5-runner.json --cache=false
  log: /tmp/b1d-sweep5-runner.log
- pnpm -C runner exec tsc --noEmit -p .
  log: /tmp/b1d-sweep5-tsc.log
- pnpm exec eslint runner/test/b1-planning-support.ts runner/test/b1-planning.test.ts runner/test/b1a-contract.test.ts runner/test/claude-provider.test.ts runner/test/q1-continuation.test.ts
  log: /tmp/b1d-sweep5-eslint.log
- git diff --check: pass (read-only).

No pnpm check or e2e run: the owner's test-output rule forbids their repository output/check
marks, as recorded in Sweep 4; ui:false and no app or corpus fixture changed. The explicitly
requested full runner suite ran with --maxWorkers=2, an OS-temp JSON report and cache disabled.
No rerun after note-only edits is needed.

Offline sources reused from the assigned packet, without network verification:
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://arxiv.org/html/2506.08837v1
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Stop boundary: five test-file changes plus this note are reviewable for the runner to commit.
Items 1/2/4 are complete; item 3 remains blocked by the missing public consumer. No acceptance,
merge-readiness, integration, commit or production fix is claimed.

## Fix (addendum 18)

implementer: codex
status: the two authorized regressions are fixed; remaining contract reds prevent a green runner suite.

Authority: the owner's narrow implementation instruction and TL-P4-41 addendum 18 (2),
with addendum 16's invalid-reply/ledger split. Only runner/src/claude.ts and runner/src/main.ts
change, plus this required note. No network, git-writing command, dependency change,
node_modules replacement/symlink, test edit or unrelated production repair.
The runner commits the diff. All check output and Vitest reports live in OS temp;
Vitest's cache is disabled and the runner's configured repository report is overridden.

### Narrow change

The existing two-attempt validation loop now throws InvalidModelReply only after its retry
also fails. It remains a BowerError with the existing sentence and credential-safe diagnostics.
The existing terminal-failure path carries that distinction to main, which returns code 1
for this invalid reply, and code 0 when the Worker accepts another terminal failure report.
A provider exception or process error before planning therefore keeps its failed report,
no manifest and no derived writes, with code 0. Saving and unreported errors keep code 1;
ledger exhaustion keeps done/code 0. No hot, recovery, checkpoint or report mechanism changes.

removed: the blanket code-1 mapping for every accepted terminal failure report.
removed: no production function, existing export, test, assertion or dependency.
tests changed: none

### Red and green evidence

Before the fix, the two assigned files reproduce **23 passed, 2 failed, 25 total**, exit 1:
/tmp/b1d-fix18-red.{json,log}. Both fail with expected code 0, received code 1:
- runner/test/claude-provider.test.ts:525 (owner's original :529),
  "the Claude provider runs under the original permission policy and never logs the token".
- runner/test/b23-hot-recovery.test.ts:47,
  "B3b hot: pre-plan failure and done redispatch send no hot writes".

Both pass in the final full runner suite. Its existing controls also pass:
b1-invalid-reply-exhaustion-fails-after-one-retry (failed/code 1),
b1-ledger-exhaustion-valid-replies-done-with-items-left-in-inbox (done/code 0),
and b1-shared-ledger. The credential, permission, no-manifest and no-hot-write assertions
are unchanged. No fixture, golden, call budget, bound or tolerance is changed.

### Required checks and every remaining red

Full runner: **690 passed, 3 failed, 693 total**, exit 1.
Full src suite: **5,689 passed, 1 failed, 5,690 total**, exit 1.
Runner TypeScript, ESLint on both touched files and both unused-code gate passes: exit 0.
Read-only git diff --check: pass. No test file appears in the diff.

| File:line | Remaining red | Cause and scope |
| --- | --- | --- |
| runner/test/claude-provider.test.ts:464 (fixture :437) | a malformed or out-of-schema Claude reply fails truthfully and writes nothing | "the turn cap reached" expects code 1, but this process/cap failure takes no validation retry and now keeps the accepted failed report's code 0. This expectation conflicts with the owner's only-invalid-reply-after-retry instruction; no test change or extra code repair is authorized. |
| runner/test/type-table.test.ts:52 (helper :14) | B5a contracts: b5-row-schema-and-order | Existing Sweep 5 gap: insertTypeRow is absent, with no public production consumer named for retargeting. Outside this fix. |
| runner/test/type-table.test.ts:152 (helper :14) | B5a contracts: b5-explicit-column-replaces-fourth | Existing Sweep 5 gap: requestTableColumn is absent, with no public production consumer named for retargeting. Outside this fix. |
| src/e2e-port.test.ts:37 | a server from another worktree is never reused | Expected sandbox restriction: listen EPERM at 127.0.0.1, followed by the 5,000 ms test timeout. Confirmed by the focused default-reporter run. |

The provider test's fixture loop stops at its turn-cap assertion. Its no-result/process-error
and size-cap fixtures at :438–439 also take no validation retry; their code-1 expectations
are potential instances of the same contract conflict, not separately observed failures.
No assertions are weakened, no fourth implementation round or other mechanism is added,
and no acceptance or merge-readiness is claimed.

Commands (each redirected to its matching OS-temp log):
- pnpm -C runner exec vitest run test/claude-provider.test.ts test/b23-hot-recovery.test.ts --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-fix18-red.json --cache=false
  log: /tmp/b1d-fix18-red.log
- pnpm -C runner exec vitest run --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-fix18-runner.json --cache=false
  log: /tmp/b1d-fix18-runner.log
- pnpm exec vitest run src --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-fix18-src.json --cache=false
  log: /tmp/b1d-fix18-src.log
- pnpm -C runner exec tsc --noEmit -p .
  log: /tmp/b1d-fix18-tsc.log
- pnpm exec eslint runner/src/claude.ts runner/src/main.ts
  log: /tmp/b1d-fix18-eslint.log
- node scripts/check-unused-gate.mjs
  log: /tmp/b1d-fix18-unused.log
- pnpm exec vitest run src/e2e-port.test.ts --maxWorkers=2 --reporter=default --cache=false
  log: /tmp/b1d-fix18-port.log (EPERM diagnostic; 1 passed, 1 failed, exit 1)

No pnpm check or e2e: their repository outputs conflict with the owner's output restriction;
the explicitly requested checks above ran. No screen or corpus fixture changed.
Offline research reuses the packet's citations and the existing validate-and-retry loop:
https://python.useinstructor.com/concepts/retrying/ (already cited in runner/src/claude.ts).
No source was fetched or independently reverified over the network.

## Fix (addendum 19)

implementer: codex
status: blocked; authorized fixes are applied, but the unchanged test requires a forbidden third export.

Authority: the owner's narrow instruction and TL-P4-41 addendum 19. Only
runner/src/claude.ts, runner/src/main.ts, runner/src/type-table.ts,
harness/unused-production-baseline.json and this note change. No network,
git-writing command, test edit, dependency change or node_modules change.
The runner commits the diff. Logs, JSON reports and temporary Claude work folders
stay in OS temp; both Vitest commands disable the cache and override repository reports.

### Narrow change

The existing reply reader marks caps (including the turn cap), missing JSON results
and non-result envelopes as no valid reply. The call passes that mark through the
existing InvalidModelReply and terminal-failure path, so main returns code 1.
Malformed or out-of-schema answers still receive exactly one validation retry.
The permission/token error-result control and the hot pre-plan failure retain code 0;
no retry, ledger, hot, recovery, checkpoint, report or write-authority mechanism changes.
main's comments now include calls with no valid reply.

insertTypeRow and requestTableColumn are restored exactly from the implementation
removed by f4aebc8b, using the original declaration validators and structuredClone.
Each has one production finding and one reason with the exact authorized wording:
"B5b wires it (TL-P4-41 addendum 19); B5b removes this line".
The other three removed exports, firstMatchingRow, typeTableOk and propertyValuesOk,
remain absent from runner/src/type-table.ts.

removed: code-0 treatment of caps and absent results returned by a model call.
removed: no production function, existing test, assertion, bound or dependency.
tests changed: none

Offline research reuses the packet's citations and the existing retry implementation:
https://python.useinstructor.com/concepts/retrying/ (already cited in runner/src/claude.ts).
The type-table functions reuse their original app implementation (f4aebc8b parent).
No cited source was fetched or independently reverified over the network.

### Red evidence

Before the fix, provider, type-table and hot-recovery suites reproduce
**38 passed, 3 failed, 41 total**, exit 1. All existing tests remain unchanged.
Log: /tmp/b1d-fix19-red.log; report: /tmp/b1d-fix19-red.json.
- runner/test/claude-provider.test.ts:464, "a malformed or out-of-schema Claude reply
  fails truthfully and writes nothing": the turn cap expects code 1, received 0.
- runner/test/type-table.test.ts:52, "B5a contracts: b5-row-schema-and-order":
  insertTypeRow must be a function, received undefined.
- runner/test/type-table.test.ts:152, "B5a contracts: b5-explicit-column-replaces-fourth":
  requestTableColumn must be a function, received undefined.

### Contract conflict

The unchanged "B5a contracts: b5-row-schema-and-order" also imports firstMatchingRow
at runner/test/type-table.test.ts:53 and asserts that export is a function at :14.
Addendum 19 restores only two exports and requires the other three to stay deleted.
That leaves firstMatchingRow absent, so this assertion cannot pass within the authorized
scope. Neither the forbidden export nor a test change is added. All requested suites
and checks are run before reporting the complete remaining failure list below.

### Final counts and every remaining red

| Check | Final result | OS-temp evidence |
| --- | --- | --- |
| Full runner suite | 692 passed, 1 failed, 693 total; exit 1 | /tmp/b1d-fix19-runner.json and .log |
| Full src suite | 5,689 passed, 1 failed, 5,690 total; exit 1 | /tmp/b1d-fix19-src.json and .log |
| Runner TypeScript | pass; exit 0 | /tmp/b1d-fix19-tsc.log |
| ESLint, all three touched TypeScript files | pass; exit 0 | /tmp/b1d-fix19-eslint-runner.log |
| Unused-code gate | pass; 1 baseline finding, 1 current | /tmp/b1d-fix19-unused.log |
| Unused-production-code gate | pass; 29 baseline findings, 29 current | /tmp/b1d-fix19-unused.log |
| Read-only git diff --check | pass; exit 0 | Checked after the edits |

All requested runner compatibility controls pass unchanged: the malformed/out-of-schema
provider test traverses its turn-cap, no-result and size-cap fixtures; the permission/token
control, hot pre-plan failure/done redispatch, b1-invalid-reply-exhaustion-fails-after-one-retry,
b1-ledger-exhaustion-valid-replies-done-with-items-left-in-inbox and b1-shared-ledger pass.
b5-explicit-column-replaces-fourth also passes. No test appears in the diff.

| File:line | Remaining failure | Diagnosis |
| --- | --- | --- |
| runner/test/type-table.test.ts:53 (helper :14) | B5a contracts: b5-row-schema-and-order | Requires firstMatchingRow to be exported. Addendum 19 explicitly keeps that third export deleted; no restoration or test change is authorized. |
| src/e2e-port.test.ts:37 | a server from another worktree is never reused | Expected sandbox listen EPERM, followed by the existing 5,000 ms timeout; focused evidence is /tmp/b1d-fix19-port.log. |

The initial root-directory ESLint invocation encountered ambiguous tsconfigRootDir inference
and ignored the JSON baseline because ESLint has no matching JSON configuration. The final
invocation uses the runner's own config from its directory and passes for every touched
TypeScript file; the JSON baseline is validated by both unused-code passes.

Commands (all output redirected to the OS-temp logs above):
- pnpm -C runner exec vitest run test/claude-provider.test.ts test/type-table.test.ts test/b23-hot-recovery.test.ts --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-fix19-red.json --cache=false
- pnpm -C runner exec vitest run --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-fix19-runner.json --cache=false
- pnpm exec vitest run src --maxWorkers=2 --reporter=json --outputFile=/tmp/b1d-fix19-src.json --cache=false
- pnpm -C runner exec tsc --noEmit -p .
- pnpm -C runner exec eslint src/claude.ts src/main.ts src/type-table.ts
- node scripts/check-unused-gate.mjs
- pnpm exec vitest run src/e2e-port.test.ts --maxWorkers=2 --reporter=default --cache=false

No pnpm check or e2e: their repository outputs conflict with the owner's output restriction;
the explicitly requested checks above ran. No screen, corpus fixture or golden changed.
No acceptance, integration readiness or fully green runner suite is claimed. The lead must
resolve the firstMatchingRow contract conflict; no unrelated repair is attempted.

## Fix round 4 reds

Tests-only delivery for TL-P4-41 addendum 21 and the seven Important findings in
`docs/harness/2026-10-11-b1d-adversarial-final.md`. The runner owns the commit. No production,
existing-test, fixture, golden, dependency, network or git-write changes were made.

tests changed: runner/test/b1d-fr4.test.ts: seven new independent main-path reds, each with passing positive controls.
tests changed: docs/harness/2026-10-11-b1d-selection-notes.md: appended this red evidence and verification record.
removed: none.

All seven use the existing `setup`, `seedState` and `run` helpers, then `runOnDrive` -> runner
`main` -> the real Claude provider and adapters. Only Drive and Claude transports are fixtures.
The answer fixtures use actual journal records and `planAdmission` with instructions scope;
their initial seed pile is binned before admission, leaving no admitted piles. No helper or
production file was changed. Finding 7 also runs through main, on a cold index, so prefix type
discovery and neighbourhood construction are both covered without changing the vault-index test.

| Exact red | Failing assertion and positive control |
| --- | --- |
| b1d-fr4 1 shown candidates bound notes and parents | An indexed Garden note absent from the source candidates is accepted and fully read; a new parent omitted by the 30-candidate cap is accepted. Control: shown hub filing and shown-parent child creation both complete. |
| b1d-fr4 2 destination hub counts within five | Five requested evidence notes excluding the hub start execution and download six full notes. Control: four requested notes plus the hub download exactly five and complete. |
| b1d-fr4 3 empty selection grants no keep or Bin | A valid admitted pair yes plus empty selection edits A and bins B. Control: explicitly selecting the same answer and pair merges, copies B's news into A and bins B. |
| b1d-fr4 4 no-model answers share the 200-operation ledger | With no piles, 201 valid stored answers start no model but produce a 205-operation main manifest, change the target and archive all 201 records. Control: one stored shown-state yes writes its update and archives its answer within 200 operations. |
| b1d-fr4 5 real link changes alter the fingerprint | In cut context, changing `[[Garden]]` to `[[Garden2]]` changes the id-only candidate while both actual fingerprints remain `fd329f8a2168`. Control: identical content with different actual run/admission ids produces distinct raw inputs but equal normalized inputs and fingerprints. |
| b1d-fr4 6 near names collapse internal whitespace | An existing `Developer offers` sibling does not prevent creation of `Developer  offers`. Control: the distinct `Developer applications` child files successfully under the shown parent. |
| b1d-fr4 7 neighbourhood includes the prefix typed MOC | Matching Offer plus nonmatching `Contents.md` with prefix `type: moc` omits Contents from candidates. Control: a conventional same-folder-name map is included, and both map fixtures receive a prefix read. |

The finding 4 count is the complete main-path manifest, including main's maintenance effects;
the adversarial provider-only reproduction reported 203. The contract remains at most 200.
The test executes the real oversized plan to verify actual record consumption rather than
intercepting its persistence. All 201 records are compared against their complete pre-run evidence
and original changes paths. Failure output reports mismatch counts, with no relaxed bound.

For finding 5, the two linked notes share a folder and are typed MOCs in the retrieval metadata.
Their stable metadata remains present in both cut contexts; only the source's real resolved link
candidate changes. This isolates normalization from path/metadata changes that could mask the
id-only candidate collision. The same-content control uses different real run/admission ids.

Verification:

```sh
pnpm -C runner exec vitest run test/b1d-fr4.test.ts --maxWorkers=2 --reporter=default --cache=false
pnpm -C runner exec tsc --noEmit -p .
pnpm exec eslint runner/test/b1d-fr4.test.ts
```

Final focused run: **7 tests, 7 assertion reds**, every positive control and fixture guard passes.
No import, uncaught runtime, timeout or unrelated assertion failure. Logs:
`/tmp/b1d-fr4-red.log`, `/tmp/b1d-fr4-types.log`, `/tmp/b1d-fr4-lint.log`.
The existing observation helper writes under `os.tmpdir()`; caches are disabled and the default
JSON reporter is overridden so tests write no repository artifacts. Runner TypeScript and the
new file's ESLint pass. No full check/e2e or implementation was requested in this reds-only session.

Offline sources reused from the packet, without network verification:
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents,
https://arxiv.org/html/2506.08837v1,
https://platform.claude.com/docs/en/build-with-claude/prompt-caching.
Fingerprint canonicalization follows the existing cited RFC 8785:
https://www.rfc-editor.org/rfc/rfc8785.

## Fix round 4

Implemented TL-P4-41 addendum 21 in the three allocated production homes. The runner owns
the commits. No test, fixture, golden, dependency, network or git-write change was made.

tests changed: none
removed: selection authority for indexed notes absent from that source's final shown candidates.
removed: new-parent authority inferred from containment or a main-folder name after the candidate cap.
removed: the conditional hub allowance that let five wants authorize a sixth destination note.
removed: unconditional full reads of answer pins when no item was selected.
removed: keep authority without one selected item's allowed targets covering both pair ids.
removed: the answer-only bypass of requireOperations; plannedWith now checks the shared ledger once.
removed: blanket normalization of arbitrary id fields, including id-only candidate references.
removed: whitespace-sensitive sibling comparison and name-only MOC recognition in neighbourhood.

### Changes in the existing homes

- `runner/src/claude.ts`: validates wants and proposed parents against the per-source candidates
  actually serialized after boundIndexContext. Existing answer/request pins are shown in the same
  capped list. The destination hub always joins the deduplicated five-note accounting. Only selected
  items supply readable targets; keep requires both pair ids in one selected item's allowed targets,
  in addition to the existing admitted-yes check. Both model and stored-answer plans pass through
  plannedWith's one requireOperations call, retaining the existing extra-operation reservation.
- `runner/src/model-input.ts`: the same JSON/JCS normalizer resolves an id-only physical reference
  to its stable indexed/folder path. A row with its own path keeps the existing redundant-id
  normalization. Other stable ids remain intact. This preserves both fresh-id controls and the
  existing raw/normalized C04 goldens, while the real Garden/Garden2 link change moves the fingerprint.
- `runner/src/claude.ts` and `src/data/vault/vault-index.ts`: carry the prefix parser's type into
  neighbourhood metadata and recognize `type: moc` alongside conventional folder-map naming.
  Discovered links retain that type. The existing match/map/link order and 30-candidate cap remain.
- The existing near-name comparison trims, lowercases and collapses whitespace before comparing
  sibling names. checkCreationName still owns name validation.

No second planner, cache, ledger, writer, pending store, normalizer or neighbourhood mechanism added.
No screen or stored format changed. Prefix metadata reuses the existing read cache.

### Compatibility draft for the lead

| Home / contract | Behaviour change and draft |
| --- | --- |
| src/data/vault/vault-index.ts neighbourhood | A prefix-typed MOC such as Contents.md now occupies the folder-map stage, independent of its title. The optional type metadata preserves callers that supply only summary/links and conventional name recognition. Keep the 30-candidate cap; a transport control must select only rows shown after that cap, including folded-map controls. No persisted format migration or alternate map detector is needed. |

### Red and green evidence

Before implementation, the unchanged `runner/test/b1d-fr4.test.ts` produced **7 assertion reds**,
with passing positive controls: `/tmp/b1d-fr4-before.log`. The same complete file then passed
**7/7**, including the selected merge, one stored answer, fresh-id fingerprint and cold typed-MOC
controls: `/tmp/b1d-fr4-focused.log`. All seven also pass in the complete runner run below.

### Required checks and output boundary

Every command redirected output to OS temp. Vitest's repository JSON reporter and cache were
disabled. No node_modules replacement or symlink, repository test output or git write was used.

| Check | Final result | OS-temp log |
| --- | --- | --- |
| Full runner suite | 48 files pass, 5 fail; 686 tests pass, 14 fail | /tmp/b1d-fr4-runner.log |
| src suite | 170 files pass, 1 fails; 5710 tests pass, 1 fails; expected listen EPERM and timeout only | /tmp/b1d-fr4-src.log |
| App TypeScript | pass, exit 0 | /tmp/b1d-fr4-app-tsc.log |
| Node TypeScript | pass, exit 0 | /tmp/b1d-fr4-node-tsc.log |
| Runner TypeScript | pass, exit 0 | /tmp/b1d-fr4-runner-tsc.log |
| App touched-file ESLint | pass, exit 0 | /tmp/b1d-fr4-eslint-app.log |
| Runner touched-file ESLint | pass, exit 0 | /tmp/b1d-fr4-eslint-runner.log |
| Unused-code and production gate | pass, exit 0; unchanged 1/30 known findings | /tmp/b1d-fr4-unused.log |
| Diff whitespace | pass | git diff --check, read-only |

Commands:
```sh
pnpm -C runner exec vitest run test/b1d-fr4.test.ts --maxWorkers=2 --reporter=default --cache=false
pnpm -C runner exec vitest run --maxWorkers=2 --reporter=default --cache=false
pnpm exec vitest run src --maxWorkers=2 --reporter=default --cache=false
pnpm exec tsc --noEmit -p tsconfig.app.json
pnpm exec tsc --noEmit -p tsconfig.node.json
pnpm -C runner exec tsc --noEmit -p .
pnpm exec eslint src/data/vault/vault-index.ts
pnpm -C runner exec eslint src/claude.ts src/model-input.ts
node scripts/check-unused-gate.mjs
```

The initial combined root ESLint invocation hit the existing ambiguous tsconfigRootDir inference
(`/tmp/b1d-fr4-eslint.log`). Separate app/runner invocations from their own directories pass
without changing configuration. No pnpm check or e2e ran: their repository outputs conflict with
the owner's explicit output restriction; the explicitly requested checks above all completed.

### Complete remaining runner inventory and stop boundary

The seven new reds pass, but the full runner gate is **not green**. The complete failed-test
inventory follows; repeated soft assertions are counted once per test. No test or contract number
was weakened. TL-P4-51 requires recording all contradictory tests after the whole targeted suite,
then stopping. Delivery is blocked on reconciliation of these older controls with addendum 21.
Several controls select a capped-out map or unrelated note; the five-wants controls also require
a sixth destination hub. Restoring that authority would reintroduce the fix-round findings.

| File:line | Exact failed test | Evidence / required reconciliation |
| --- | --- | --- |
| runner/test/b1-planning.test.ts:127, :145 | b1-cut-index-no-new-destination | Clear and sibling controls select HUB in a 155-matching-note context; that map is omitted from the capped source candidates. Select shown evidence while preserving cut-context/no-creation assertions. |
| runner/test/b1-planning.test.ts:158 | b1-five-per-source | Control requests five evidence notes excluding the destination hub, requiring six. Include the hub within five. |
| runner/test/b1-planning.test.ts:189 | b1-pinned-and-script-notes-count-within-five | Pair-answer control explicitly wants the destination hub and additional notes absent from the answer source's shown candidates. The inserted pins themselves are shown; the control must bind its remaining wants to shown rows. |
| runner/test/b1-planning.test.ts:250 | b1-folded-moc-expansion | Control wants the folded map after 41 matching members have filled the 30-candidate cap. Its indexed metadata alone is no selection authority. |
| runner/test/b1-planning.test.ts:276, :285 | b1-target-injection | Control and injected variants select the folded map omitted by the same cap. They now fail at selection, before the expected execution/retry. Preserve injection assertions with shown evidence. |
| runner/test/b1-planning.test.ts:395 | b1-shared-ledger | Long-source control requests five evidence notes for each source, excluding the destination hub. Six cannot satisfy the five-note contract. |
| runner/test/b1-planning.test.ts:493 | b1-neighbourhood-order-and-30-cap | 32 matching notes fill the cap, yet the filing control selects the omitted HUB. The ordering/cap assertions still hold; execution must select a shown note. |
| runner/test/b1-planning.test.ts:523, :535 | b1-expansion-is-not-a-read-picked-members-count-within-five | Control requests five members plus a separate destination hub, exceeding five; folded members must also be among that source's shown candidates. |
| runner/test/b23-hot-context.test.ts:334 | B3b hot: a Home answer removes only its settled Open thread | Second run fails selection before the answer filing/Open-thread assertions. Reconcile its phase-aware transport's wants with the answer source's shown rows. |
| runner/test/c05-bounded-reads.test.ts:588, :611 | C05 bounded reads: fix 2 control: a waiting retry whose pending relocation lands completes once | Third-run transport proposes an already-settled source's line with a new ordinary pile; selection fails before execution. Keep the settled-consent assertion while binding transport wants to shown evidence. |
| runner/test/c05-bounded-reads.test.ts:466, :629 | C05 bounded reads: fix 1 control: a waiting retry whose archive lands completes once | Same third-run selection failure for the settled archive control. No stale-source selection exception was added. |
| runner/test/claude-provider.test.ts:377 | a thing cited by a Timeline line on an existing note needs no note | Leek soup source is given a Flat hunt line; its transport selects that unrelated note and selection now refuses it. Preserve citation/no-new-note behavior using shown evidence. |
| runner/test/duplicate-by-hash.test.ts:157 | a copy inside the same pile keeps one and bins the other as already saved | Phase-aware filing transport selects the Job hunt hub for its offer confirmation; this control fails selection before duplicate assertions. Reconcile the transport's wants with shown candidates. |
| runner/test/duplicate-by-hash.test.ts:199 | a filed copy the person already binned does not count | Same transport selection failure before the binned-copy assertions. No duplicate handling or Bin fence changed. |

The only src failure is `src/e2e-port.test.ts:37`, “a server from another worktree is never reused”:
listen EPERM in this sandbox and its existing timeout, as explicitly expected by the owner.
Raw runner failure locations are also in `/tmp/b1d-fr4-failure-locations.log`.

Offline sources reused without network verification: the packet's curated-context, plan/execute
and stable-prefix citations, plus https://www.rfc-editor.org/rfc/rfc8785 for the existing JCS home.

## Sweep 6

Tests-only TL-P4-51 repair for TL-P4-41 addendum 21 (1) and (2). The baseline full runner
suite reproduced the inventory: **14 assertion reds, 686 passing tests in 53 files**
(`/tmp/b1d-sweep6-before.log`). Production, assertions, goldens and the shared planning helper
are unchanged. The runner owns the commits; no git-writing command, dependency replacement,
symlink or network request was used. Test output and observations stayed in OS temp.

tests changed: runner/test/b1-planning.test.ts: bind cut/cap controls to shown evidence; count the hub within five; retain 41 folded members with five matching members and use a hubless destination for the five-member controls.
tests changed: runner/test/b23-hot-context.test.ts: make the Home visits summary match the letter's singular appointment token, preserving the actual Home answer and Open-thread checks.
tests changed: runner/test/c05-bounded-reads.test.ts: give the ordinary pile garden-plot evidence and make both third-run transports phase-aware, so the original bound-source line is proposed in execution before the correction retry.
tests changed: runner/test/claude-provider.test.ts: seed an existing soup note among the soup source's shown candidates and cite it, retaining the Timeline-without-new-note subject.
tests changed: runner/test/duplicate-by-hash.test.ts: make the local job-hunt summary match the source's singular offer token, retaining all content-hash and Bin assertions.
tests changed: docs/harness/2026-10-11-b1d-selection-notes.md: append Sweep 6 repairs, assertion audit and complete remaining-red inventory.
removed: none.

### Repaired inventory (pre-sweep file:line references)

| Original file:line | Subject retained and fixture repair |
| --- | --- |
| runner/test/b1-planning.test.ts:127, :145 | Cut-index/no-new-destination: keep all 155 matching notes and the cut notice. Clear and sibling controls select shown Group 154 evidence instead of the capped-out hub; the refused new-parent proposal and asking remain. |
| runner/test/b1-planning.test.ts:158 | Five per source: the shared five-note selection is four evidence notes plus the destination hub. Both sources, the words-only source, shared physical reads and the six-wants refusal remain. |
| runner/test/b1-planning.test.ts:189 | Pinned and script notes: retain two actual answer pins and three/four extra wants. The answer's made-up description supplies remote-offer words so those extra wants are shown. The valid total stays five and the invalid total stays six. |
| runner/test/b1-planning.test.ts:250 | Folded MOC expansion: keep 41 members and all body/read assertions. Five members match the source; the other 36 remain folded members with nonmatching titles/summaries, leaving the map shown. The control selects the map plus four members. |
| runner/test/b1-planning.test.ts:276, :285 | Injection: reuse that shown folded map. Keep the poisoned source, map and personal text, the permitted hub line, and each attempted Rules/unrelated-note write unchanged. |
| runner/test/b1-planning.test.ts:395 | Shared ledger: each long-source selection uses four long notes plus the hub. Keep all source/note/index/time/token/operation bounds and the expired-budget control. |
| runner/test/b1-planning.test.ts:493 | Neighbourhood order and cap: keep 32 matching notes, recency/path ordering and every exact 30-cap assertion. Select shown Match 31 instead of explicitly requesting the omitted hub; the implicit destination hub occupies a second slot. |
| runner/test/b1-planning.test.ts:523, :535 | Expansion is not a read: retain five selected members and all unpicked-map, changed-map and six-wants assertions. File into existing Resources/Careers, which has no hub, so the five-member control needs no sixth note and does not alter folded-folder membership. |
| runner/test/b23-hot-context.test.ts:334 | Home answer/Open threads: change only local Home visits summary wording from appointments to an appointment, making its existing link selectable from the letter evidence. |
| runner/test/c05-bounded-reads.test.ts:588, :611 | Settled pending relocation: the new ordinary letter names the garden plot, showing the target. The same original filed source and both exact wordings reach the first execution attempt; the retry keeps ordinary filing. Completion/archive assertions remain. |
| runner/test/c05-bounded-reads.test.ts:466, :629 | Settled archive: use the same shown-target and phase-aware correction fixture. The original request bytes, source id, exact wordings and no-second-append/update assertions remain. Failed-relocation and interrupted-append variants also retain their subjects. |
| runner/test/claude-provider.test.ts:377 | Timeline citation/no new note: seed Resources/Recipes/Leek soup.md as an existing Bower note and direct the soup's citing line there. The thing still has no note proposal. |
| runner/test/duplicate-by-hash.test.ts:157 | Same-pile duplicate: the local hub summary says offer letters so the kept offer can select it. Uploaded/filed bytes, one-kept/one-binned checks and confirmation transport remain. |
| runner/test/duplicate-by-hash.test.ts:199 | Binned filed copy: reuse the matching local hub summary; the person's real Bin action and all duplicate/no-duplicate assertions remain. |

The C05 transports reuse the existing phaseAwareClaude helper. Their proposal counter now counts
execution calls, and attempt zero offers the original line in both semantic phases; the first
execution does not silently drop the consent subject just because selection was another call.
No new selection, cache, write or consent mechanism was added.

### Assertion and scope audit

All **671 existing expect lines** across the five touched test files compare byte-for-byte with
HEAD (166, 116, 162, 171 and 56 respectively). The complete diff contains no assertion edits,
production edits, skipped tests, fixture-file exports or changed goldens. Read-only diff whitespace
verification passes. Audit: `/tmp/b1d-sweep6-diff-audit.log`.

The initial repaired full runner run passed **53/53 files and 700/700 tests**
(`/tmp/b1d-sweep6-runner.log`). After making the C05 execution proposals explicitly phase-aware,
its complete file passes **8/8 tests** (`/tmp/b1d-sweep6-c05-transport.log`); the final full run
and final static checks are recorded below.

No pnpm check or e2e ran: their configured build, JSON-report, cache and check-mark outputs write
into the repository, which this session explicitly forbids. This fixture-only repair changes no
screen. Vitest uses the default reporter alone and disables its repository cache. Runner TypeScript
and touched-file ESLint are checked directly with output redirected to OS temp.

Offline sources reused from the packet, without network verification:
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents,
https://arxiv.org/html/2506.08837v1,
https://platform.claude.com/docs/en/build-with-claude/prompt-caching.

### Final verification and remaining reds

| Check | Result | OS-temp log |
| --- | --- | --- |
| Full runner, final transport fixtures | pass, exit 0; 53 files, 700 tests | /tmp/b1d-sweep6-runner-final.log |
| Runner TypeScript | pass, exit 0 | /tmp/b1d-sweep6-types.log |
| Touched runner test ESLint | pass, exit 0 | /tmp/b1d-sweep6-lint.log |
| Assertion/scope/whitespace audit | pass | /tmp/b1d-sweep6-diff-audit.log |

```sh
pnpm -C runner exec vitest run --maxWorkers=2 --reporter=default --cache=false
pnpm -C runner exec tsc --noEmit -p .
pnpm -C runner exec eslint test/b1-planning.test.ts test/b23-hot-context.test.ts test/c05-bounded-reads.test.ts test/claude-provider.test.ts test/duplicate-by-hash.test.ts
```

Every command redirected stdout/stderr to the OS-temp log in the table. Both static logs are
empty on success. The final full run includes all seven fix-round-4 regression tests and all
previously red controls; no assertion change was needed.

**Remaining runner reds: none.** All 14 tests from the remaining-runner inventory pass.
