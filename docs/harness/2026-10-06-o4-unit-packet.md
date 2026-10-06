# O4 packet: run-report-save-barrier (U1 legacy barrier, U2 B-path recovery)

Read-only plan by a Claude planner at `e102fcb`, assigned by coordinator `claude-orchestrator-2026-10-06-e759b272`, under TL-P2-06/TL-P2-09. Coordinator splits it into entry `run-report-save-barrier-legacy` (U1) and the parent `run-report-save-barrier` (closes after U2). Open questions 1–5 sent to the technical lead.

## U1 `run-report-save-barrier-legacy` (now; owns only `fake-worker.ts` and `fake-worker.test.ts`)

In `fake-worker.ts` `start()`: when the terminal `done` view write fails, log the caught BowerError, do NOT `Object.assign` the end (run stays `saving`, no `finishedAt`), keep `pendingEnd = end` in memory. `status()`/`process()` retry `writeLastRun(pendingEnd)` once per call with the same object/report/`finishedAt`, only if the stored view is still this run's id; a retry failure is logged and never rejects the call. `runFake` is never called again. `load()` unchanged for legacy runs (reload → `failed` with the honest wording). Fault injection: `vi.spyOn(drive, 'writeText' | 'createText')` refusing only `last-run.json` text whose `run.phase==='done'` with a report, `driveError('offline')` before any effect.

Scenarios under `describe('report save failure cannot publish done or repeat effects')` › `describe('on the legacy path')`: terminal report refusal keeps saving after actual filing (default seed; status saving, no finishedAt; stored view saving without report; Inbox consumed; BowerError logged); same-session retry publishes the same report without refiling (deep-equal report; domain snapshot except last-run.json unchanged; fresh DriveVault/live runs read it); after reload a cut-off saving run fails honestly and is never refiled.

Verify: `pnpm vitest run src/data/fake/fake-worker.test.ts -t "report save failure cannot publish done or repeat effects on the legacy path"`.

## U2 (after readiness integrates)

New `fake-run-service.ts` (control store per `account:rootId`, admission, claims/epochs, executor, recovery, derived status, publication) and `fake-run-records.ts` (canonical records under `.bower/runs/<runId>/`, chain load via `parseRunCheckpoint`/`verifyCheckpointChain`, report materialization and grounding, reconcile by evidence); `fake-runner.ts` gains `planRun(...)` → `{path:'b', manifest} | {path:'legacy', why}` reusing readiness capture; `fake-drive.ts` gains `fenced(check)`, a `fault` hook and `evidence(id)`; `fake-worker.ts` routes by classification and lets the service own B runs; `pretend.ts` persists the service JSON under `bower:fake:<scenario>:runs`; `choose.ts` passes the service. Classifier sends to legacy any plan with: files marked new, hub Timeline updates, link-as-note, merges, non-empty journal, empty pile (generated note), `plan.note`, or a readiness-blocked pile. Minimum B world: scope all from the template folder with only ready non-link pile files → create-folder, move, bin, write-runner-json. Terminal view order and derived done per TL-P2-06 §3; `finishedAt` = done checkpoint `phaseAt`; never overwrite a later run's view. Scenarios under `› describe('on the B path')`: classification fixed before effects; terminal view refusal preserves saving; second client republishes without domain effects; reload restores service and drive; first pending checkpoint refusal rebuilds identical report; lost move reply reconciles without replay; lost report/view reply reconciles by exact body; stale epochs and other scopes refused at the mutation boundary; a later run's view is never overwritten; declared pile publishes its consumed disposition before done.

Do not claim: legacy recovery, any seeded/demo run on the B path, real Drive CAS or exactly-once (the fence is fake-only), closed-browser scheduling, Journey 7/C12/C14 closure, P2 acceptance.

## Open questions for the lead

1. May clearing a "new" mark be a B `move` keeping parent and name (only `bowerNew:null`)? Otherwise the B path is one-shot per folder.
2. Should the barrier also hold back `failed` endings whose save failed?
3. Journal and generated notes on the B path need grounding rules for `requests`/`yourChanges` and a generated-destination rule.
4. Created folders reconciled by name, parent and absence from the capture (no create-key property) — acceptable for the fake?
5. If U2 grows, may declared piles be classified legacy until a disposition sub-unit lands?

## TL-P2-10 answers (main `cf206a5`)

1. Clearing "new" is a B `move` to the same parent and name with properties exactly `{bowerNew:null}`; file must be still as seen and the mark one Bower set; adds nothing to the report; evidence shows same place and mark cleared.
2. B path: `failed` is held back like `done` (terminal checkpoint first, then view written and read back; until then the last confirmed non-terminal phase; `process()` returns the same run). Legacy path: `failed` shown at once with its text; its view save retried like done's.
3. Journal and generated notes go legacy in U2; registered `b-path-journal` and `b-path-generated-note`.
4. Created folders/text are not reconciled by name alone: prefer a reserved ID once upload-queue phase 1 brings `generateIds` to the fake; until then `bowerItem = createKey` on the created item, reconciled by key + name + parent; a lookalike without the key is unresolved, never applied.
5. If U2 grows, register `b-path-pile-disposition` before P2-H and before O5 relies on dispositions.
