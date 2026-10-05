# Renewed independent run-order review

Session `p2-run-order-review-2026-10-05`; `run-status-monotonic`; adopted revision `2026-10-05-contracts-2`, P2/C12,C14 with C01 lifecycle inspected.

Immutable range `6305ca9dfa126fd08ef9fe819a4ba2000cb78437..fb80bd1df4c74a7e0ecda19cf37dab5494cd666d`. Clean frozen worker `/private/tmp/bower-p2-journal-ack`, branch `codex/p2-run-order` per packet. Only runs.ts/live.test.ts changed. Reviewed the complete assignment and `803b62d..fb80bd1` rework, actual lifecycle dependencies and supplied logs. No tests/builds/installs/browser/provider calls, repository/shared-record edits or delegation by reviewer.

## Verdict

**Changes requested: one Minor returned-state invariant finding.** The previous Important unconditional-null regression and the admission-preparation disposal gap are corrected in this exact candidate, with inspected genuine new assertion red/green evidence. A remaining raw-process-wire fallback can return discarded state after accepted idle or disposal. The packet explicitly requires returned/subscribed state coherence; add actual regression proof and a bounded correction before renewed immutable review. No integration, closure or full C12/C14 acceptance is certified.

## Minor — start can return a discarded wire after accepted idle

`src/data/live/runs.ts:92–94` awaits hydration, then returns `state(this.last ?? wire)`. When an eligible null clears accepted state during that await, the fallback returns the raw process wire even though current/subscribed state is now null and locks are empty (`153–163`). There is also no checkOpen after hydration, so disposal during hydration can let start return its cached run as successful after the page has closed.

Concrete controlled trigger: process supplies an existing typed RunWire; while start waits for terminal refresh/report, another eligible current reply accepts null. Releasing the old hydration makes its guarded loadReport correctly abandon the report commit, but start returns the abandoned wire. A queued process reply with a reentrant subscriber requesting current/null can also reach the fallback: take emits synchronously, the subscriber's resolved status continuation accepts null before start resumes from its asynchronous hydrate call. Thus the defect does not require the client to sort unknown IDs or introduce new wire fields.

Evidence classification: **source-derived candidate finding, not reproduced by this reviewer or disproved by supplied green logs**. Current TidySheet Confirm/retry consumers await startRun but do not use its returned object (`src/features/tidy/TidySheet.tsx:50–59,175`; `start-run.ts:6–8`), so no visible user effect or extra Drive write is established. Shared last remains idle; this is not shared-state resurrection. Minor severity reflects that limit while retaining the explicit returned-state obligation.

Suggested same-wire remedy: recheck lifecycle and accepted state after hydration; if disposed use the existing plain BowerError; if last is null reject with a truthful BowerError instead of reviving the raw wire. Keep RunSource.start's non-null Promise<RunState> signature. Do not describe an already sent/admitted process as cancelled. Preserve queue failure recovery and current's eligible-null behavior.

Planned exact meaningful assertion prefix: `older run responses cannot replace newer observed state (start cannot return discarded state after accepted idle)`. Hold admission hydration or exercise real subscriber reentry, accept current/null, then settle start; assert no stale RunState resolves, subscribers/current remain null, locks remain empty, and the next queued admission can still be tried. Add the disposal-during-hydration companion if claiming post-admission disposal behavior. Require genuine assertion red against fb80bd1 before the production fix; these tests are recommendations, not executions.

## Prior findings resolved within this candidate

**Null compatibility:** `runs.ts:153–163` now accepts null only after current's existing ticket/generation/disposal gate (`101–111`). It clears last/took, updates cadence and emits once when leaving an observed run. Older pending/pre-successful-admission null still loses at that gate. The old test overclaim was properly split: the delayed null still proves generation protection; a subsequently issued eligible null now clears. No session reset API or new public schema was adopted.

**Actual lifecycle compatibility:** `live.test.ts:101–139`, `(idle after session reset clears reading)` and `(idle after session reset clears done)`, reuse the same actual makeLiveSources/session/runs. Existing typed Worker me/signIn/signOut replies model Alex leaving and Sam entering a real second synthetic folder. Session callbacks actually run, rootId changes, seen storage clears, old current/report is no longer returned, subscribed reads become null, locks clear, and old folder outbox bytes remain. The test openly states FakeWorker itself retains its scripted run; it does not pretend this is a real two-account provider or full account-isolation implementation.

Source lifetime remains one LiveRuns per makeLiveSources/main document, with session events changing routes rather than sources. Normal real WorkerHttp.signIn navigates/reloads; generic in-page transitions and existing session callbacks still do not recreate LiveRuns. The correction restores baseline eligible-null semantics without claiming a document is an account boundary. Persistent report/retired-ID maps, cross-context identity reuse and cached vault contents are not certified as isolated.

**Old hydration across idle:** new `(old refresh cannot cross accepted idle)` and `(old lastRun cannot cross accepted idle)` cases (`142–165`) prove a delayed current/report path cannot republish after null and cannot emit an obsolete report. These test **current**, not the start fallback finding above.

**Preparation disposal:** checkOpen now runs after flushJournal, after piles, and after process (`runs.ts:79–99`). Two real deferred-wrapper cases, `(dispose while flushJournal prepares admission)` and `(dispose while piles prepares admission)`, demonstrate process is not called and the caller receives a plain failure. Piles is not even read after disposal during flush. They do not promise cancellation of a request already sent or cover disposal while terminal admission hydration awaits.

## Retained ordering review

Issued/accepted tickets select locally newer successful status replies; successful admission generation invalidates status already outstanding. Failed newer requests do not permanently suppress older successful replies. Known retired IDs and monotonic same-run active phases remain guarded; terminal conflicts are diagnosed rather than ordered by timestamps. Start preparations serialize and their caller errors survive while the queue releases for retry.

Take commits accepted state synchronously, locks follow accepted active/terminal/idle state, and reports share an in-flight promise per ID. Report reads check generation/current ID/disposal after refresh and lastRun awaits, cache only the matching report and then notify. Old successful hydration cannot overwrite newer report/seen/locks. Subscriber current/markSeen reentry remains exercised. The rework leaves these tests intact and does not widen the Worker/public contract.

## Evidence inspected

| Log | Result and scope |
| --- | --- |
| `/private/tmp/bower-run-order-rework-red.log` | Against superseded803b62d: 7 genuine failures/10 passes; 15 other tests excluded by filter. Failures show retained NEW on fresh null, retained OLD reading/done after reused session reset, old refresh/report crossing idle, and process called once after disposal during each preparation boundary. |
| `/private/tmp/bower-run-order-rework-green.log` | 17 named cases pass; 15 existing cases excluded by targeted filter. Retains original stale replies, report/lock/reentry/failure cases and adds six rework cases. |
| `/private/tmp/bower-run-order-rework-check.log` | Full check succeeds, 51 files/437 tests including all32 live tests, lint/typecheck/build/harness/bundle/landing. Existing lint/chunk-size warnings and intentional injected-error logging retained. |
| Prior `/private/tmp/bower-run-order-{red,red-extended,green,check}.log` | Superseded803 proof remains separate: initial7/1, expanded10/1 assertion reds,11 named green/full431. Not relabeled as replacement execution. |

The exact named verify remains `pnpm vitest run src/data/live/live.test.ts -t "older run responses cannot replace newer observed state"`. New tests use controlled Worker/report replies and real LiveRuns/session/vault paths; they prove client behavior, not authoritative service state or runner effects. No reviewer execution occurred.

## Limits

Eligible null retains the existing API meaning; the wire cannot prove whether a newly issued backend null is semantically stale. Unknown cross-device IDs, same-ID retry attempts and authoritative revision ordering remain O3/R3 pending. Broader account isolation, report production/save barrier, browser-independent accepted work and Drive precondition atomicity remain unproven. Superseded hydration failures may still reject original callers without committing shared state; that choice is not covered by the new successful-wait cases. No browser/manual gate or closure occurred. A new immutable candidate and actual assertion red/green are required for the remaining Minor finding.
