# O4 vertical plan: run-report-save-barrier (research)

Read-only research by Codex `o4-plan-1` at integration `9a313fc`, assigned by coordinator `claude-orchestrator-2026-10-06-e759b272`. Planning input, not an assignment. Raw log `/private/tmp/bower-p2-o4-plan/codex-plan.log`.

Packet for `run-report-save-barrier`, researcher `o4-plan-1`: integration `9a313fc`, contracts-2/main `10ca886`, P2 C12/C14. Read-only inspection; no edits, tests, installs or network. Candidate APIs remain subject to independent review/integration.

1. **Current path and fault**

   - [src/data/live/runs.ts:84](/Users/deluisp/Projects/bower-app/src/data/live/runs.ts:84): `start()` → `startNow()` flushes journal, reads piles, calls `worker.process()`.
   - [src/data/fake/fake-worker.ts:116](/Users/deluisp/Projects/bower-app/src/data/fake/fake-worker.ts:116): `process()` checks existing activity/input, then `start()` creates a page-local run and launches `runFake()` at line 143. Phase callbacks mutate memory and attempt `last-run.json` writes at lines 149–154.
   - [src/data/fake/fake-runner.ts:61](/Users/deluisp/Projects/bower-app/src/data/fake/fake-runner.ts:61): captures observed piles, walks phases, enters `saving` at 76, executes writes at 79–102, returns `{phase:'done', report}` at 103. Source moves occur at 157/169; pile containers go to Bin at 197. Journal archive and hashes follow at 253/263.
   - **Exact fault:** [fake-worker.ts:169](/Users/deluisp/Projects/bower-app/src/data/fake/fake-worker.ts:169): line 171 catches terminal persistence failure; line 172 nevertheless `Object.assign(run, end)`, exposing `done`. `writeLastRun()` at 177 writes `{v:1,run}` using the observed modifiedTime.
   - The recorded reproduction observed 17 initial files, 15 original IDs moved, zero remaining Inbox files, one terminal refusal, durable `saving` without report, public `done`. Recovery was not exercised.
   - Reload currently converts active persisted runs to `failed` at worker lines 208–217. [LiveRuns.loadReport:253](/Users/deluisp/Projects/bower-app/src/data/live/runs.ts:253) reads the compatibility view and caches a missing report as null. Thus fixing only the terminal catch is insufficient.

   The requested `src/data/runs.ts` is actually `src/data/live/runs.ts`; `RunWire` is in `src/data/worker/worker-api.ts:9`, and `RunReport` in `src/data/types.ts:168`.

2. **Minimal B-based design**

   Use one shared fake service, independent of client lifetimes, with injected clock/scheduler. Its trusted control store owns authenticated synthetic binding/root, admission, request identity, committed head, status revision, claim/epoch and outstanding dispatch. A new `FakeWorker` is a client of that service—not a new scheduler or claimant.

   Persist canonical immutable records under the verified folder:

   - `.bower/runs/<runId>/manifest-<hash>.json`
   - `.bower/runs/<runId>/checkpoint-<revision>-<hash>.json`
   - `.bower/runs/<runId>/report-<hash>.json`
   - `.bower/piles/disposition-<hash>.json`

   Resolve scoped parent IDs and conflicting copies; never choose authority by filename or latest modifiedTime. Control metadata stays in simulated service storage, separately from folder content, and survives simulated reload.

   Required order, following [B:187–200](/Users/deluisp/Projects/bower-app/docs/harness/evidence/2026-10-05-local-prerequisites/run-recovery-contract/contract.md:187):

   - Capture verified inputs, destinations and journal references; fix operations **and all report wording/contributions**. Confirm manifest, initial checkpoint and control admission before acknowledging.
   - Commit each `possible-effect` checkpoint/head before dispatch. Serialize claim/precondition verification with the fake mutation boundary. Persist independently observed outcomes. Reconcile unknown effects; never replay applied operations.
   - Materialize the exact report from durable plan/outcomes. Commit its pending checkpoint before report publication. If that first checkpoint fails, reconstruct from the already durable plan/evidence.
   - Confirm the report body/hash, publish its checkpoint and required consumed dispositions, then confirm the same-run v1 terminal view. Only then expose public `done`. Any internal done checkpoint remains hidden while publication is pending.
   - Terminal failure logs `BowerError`, preserves public `saving` without `finishedAt`, and retains discoverable recovery authority. Recovery retries publication with stable identity/body, never calls the filing planner again.
   - An authorized second client discovers the same run through service control and retrieves the confirmed report through the existing compatibility reader.

   Consume `parseRunManifest` (`c041f2c:228`), checkpoint/report parsers and chain verifier (`6881668:197/232/270`), disposition parser (`a079115:128`), integrated declaration parser and canonical JSON helpers. These guards do **not** supply I/O authority, report-effect grounding or report materialization; the vertical adapter must implement those.

   Preserve RunReport/v1, RunWire and enums. Valid reportless legacy runs remain readable; legacy active-to-failed reload behavior remains only for legacy runs. Missing/corrupt referenced opt-in records must refuse, never silently fall back.

3. **Exact proposed writable reservation: one implementer**

   | Path | Purpose |
   |---|---|
   | `src/data/fake/fake-worker.ts` | Service-backed admission/status/recovery; legacy branch |
   | `src/data/fake/fake-runner.ts` | Separate fixed planning from checkpointed execution |
   | `src/data/fake/fake-worker.test.ts` | All entry-specific regressions |
   | `src/data/drive/fake-drive.ts` | Controlled mutation boundary and independent stored-effect/Bin evidence |
   | `src/data/fake/pretend.ts` | Persist/restore service control alongside Drive; accept legacy snapshots |
   | `src/data/choose.ts` | Supply shared service to fake clients |
   | `src/data/fake/fake-run-service.ts` **new** | Control store, claims, scheduler, recovery/publication |
   | `src/data/fake/fake-run-records.ts` **new** | Record I/O, grounding, materialization, reconciliation |

   Keep contracts, fixtures, shared harness records, `live/runs.ts`, and `fake-runner.test.ts` read-only. This preserves the existing report-reading contract; archived historical-report hydration is separate.

   **Serialize with partial-pile-readiness:** their test files can remain disjoint, but both need `fake-runner.ts` and likely the shared fake service/Drive boundary. Separate worktrees do not remove that ownership conflict.

4. **Named scenarios under the unchanged verify**

   Use `describe('report save failure cannot publish done or repeat effects', …)` so the registered command selects every case:

   ```sh
   pnpm vitest run src/data/fake/fake-worker.test.ts -t "report save failure cannot publish done or repeat effects"
   ```

   - **“terminal view refusal preserves saving after actual filing”**: intercept only done-with-report `last-run.json` persistence; throw conforming offline `BowerError` before effect. Assert the fault fired after real moves, exact source IDs/bytes/destinations, durable report evidence, no public done/finishedAt.
   - **“second client republishes the same run without domain effects”**: restore saving, recover via client B; assert unchanged run/capture/operation/report identities, report retrieval through fresh LiveRuns/DriveVault, zero additional moves/creates/Bins/content effects.
   - **“reload recovers without originating closures”**: restore Drive plus service snapshots into fresh instances; repeat publication recovery.
   - **“first pending checkpoint refusal rebuilds identical report”**: durable plan/evidence suffice; missing evidence stays unresolved.
   - **“lost move reply reconciles without replay”**: fixture 02’s actual move precedes lost acknowledgement; changed/unknown evidence blocks.
   - **“lost report or terminal-view reply reconciles exact publication”**: success occurred before acknowledgement loss; no new logical report/run.

   Fixture 04’s 15-move expectation is synthetic, distinct from the historical 17-input reproduction. Neither fixture is execution evidence.

5. **Technical-lead decisions and limits**

   The main activation blocker is concrete: B excludes Timeline edits, link-body rewrites, rule-content writes and unrestricted note revisions currently performed at runner lines 181/212/220/233. The lead must settle a supported activation boundary or prerequisite operation contracts. Do not omit these effects silently or wrap the existing runner and call it B-compliant.

   Also settle the trusted internal request/recovery mechanism while keeping RunWire unchanged, and durable terminal-view confirmation bookkeeping. Candidate guards alone cannot answer these runtime questions.

   Claim only demonstrated fake recovery. No real Drive CAS, provider exactly-once, full readiness repair, complete semantic recovery, browser execution while all browsers are closed, or P2 acceptance follows from this entry.

## Decision request for the technical lead (coordinator, 2026-10-06)

Ratified B covers only move, create-folder, create-text, write-runner-json and bin. The current fake runner also edits Timeline, rewrites link bodies, writes rule content and revises notes (`fake-runner.ts` ~181/212/220/233). `run-report-save-barrier` cannot be closed honestly by wrapping those effects. Options:

- **A (coordinator recommendation): bounded activation.** The B-managed fake run path performs only B effects. Runs whose plan needs a non-B effect keep the legacy path, but that path may no longer publish `done` before its report is durably saved (fix the reproduced barrier with legacy records only), and is marked as not B-recoverable. Semantic effects get their own operation contracts in O5.
- **B: extend the effect vocabulary now** with Timeline-append and link-rewrite operation contracts (new contract revision, review, ratification) before the vertical. Slower, serial.
- **C: drop non-B effects from fake runs** until O5. Rejected by coordinator: it silently removes existing capabilities.

Also needed: trusted internal recovery request with RunWire unchanged, and terminal-view confirmation bookkeeping (plan section 5).
