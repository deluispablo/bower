# Final renewed independent run-order review

Session `p2-run-order-review-2026-10-05`; entry `run-status-monotonic`; adopted revision `2026-10-05-contracts-2`, P2/C12,C14, with C01 lifecycle interactions inspected.

Exact immutable range: `6305ca9dfa126fd08ef9fe819a4ba2000cb78437..71ef6be0dc636ae032c9835a943308614241d260`. Clean worker `/private/tmp/bower-p2-journal-ack`, verified branch `codex/p2-run-order`, frozen HEAD at candidate. Only `src/data/live/runs.ts` and `src/data/live/live.test.ts` changed. Inspected complete assigned behavior and the final `fb80bd1..71ef6be` delta, actual source/session lifecycle and supplied proof. No reviewer tests/build/install/browser/provider execution, repository/shared-record edits, delegation or closure.

## Verdict

**No remaining correctness findings in the reviewed bounded candidate.** Both previous candidate findings and assigned preparation-disposal coverage are addressed within this exact range. Final Minor returned-state inconsistency has genuine assertion red/green evidence, and the corrected path preserves queue recovery and the non-null start API. Suitable for coordinator serial integration and proof closure within the assigned entry scope. This is not full C01/C12/C14 acceptance, provider certification or a claim of authoritative backend ordering.

## Final correction

`src/data/live/runs.ts:92–96` now checks lifecycle after hydration, rejects accepted idle with a plain conflict BowerError, and returns only the accepted last run. The raw process wire fallback is removed. No new public fields/types/enums or session-reset API were added. Rejection describes changed status and permits retry; it does not claim that work already dispatched was cancelled. The existing start queue keeps the caller's error and allows the next admission.

Actual new tests at `src/data/live/live.test.ts:335–379`, with exact verify prefix `older run responses cannot replace newer observed state`:

- **`(start cannot return discarded state after accepted idle)`** holds a controlled terminal admission's report read, accepts current/null, observes subscribed idle and empty locks, queues a subsequent admission, and then releases hydration. Start must reject instead of resolving the obsolete wire. The queued NEXT start proceeds, current and subscribers remain idle/NEXT, and captured locks match current piles.
- **`(dispose during admission hydration rejects start)`** holds the report read after process was already called, disposes actual sources, releases it, and requires a plain closed-page rejection with no notification/report commit. The test explicitly verifies that process was already called once and does not pretend the lifecycle guard cancelled it.

The supplied red log shows both promises resolving OLD/done instead of rejecting on fb80bd1. This turns the earlier source-derived finding into an actually reproduced controlled client failure, separate from this reviewer's read-only work.

## Earlier corrections retained

Eligible latest-ticket/current-generation null keeps the existing API meaning: last/took clear, cadence updates and subscribers receive idle (`runs.ts:155–165`). Older pending/pre-successful-admission null is still rejected by current's ticket/generation gate (`103–113`). The admission-null test preserves the meaningful delayed-null assertion and treats a later eligible null separately.

Reused real makeLiveSources/session callbacks are tested with typed synthetic me/signIn/signOut replies changing Alex to Sam and a second fake folder. Both reading and hydrated terminal state become idle after the new context's eligible null; locks and old returned report disappear, seen storage clears, and old folder outbox bytes remain. Source lifetime still spans session route changes: makeLiveSources constructs one LiveRuns, and Gatekeeper does not reconstruct it. Normal real WorkerHttp OAuth sign-in navigates/reloads; the test does not mislabel the synthetic in-page adapter as that real flow or certify all account caches as isolated.

Old refresh/report reads cannot cross accepted idle. Disposal during deferred flushJournal/piles checks open state before a later process call; process is never invoked after those preparation waits settle. This remains distinct from cancelling an already sent request.

## Complete bounded ordering assessment

- Successful local status tickets advance accepted observation order; a failed newer status request does not permanently suppress an older successful answer.
- Successful process admission advances generation and invalidates outstanding status replies, including those issued while process waited.
- Known retired IDs do not resurrect within the observed local sequence; same-run queued/reading/writing/saving ranks cannot regress. Terminal done/failed are alternative outcomes, not an invented rank; conflicts are diagnosed while the accepted terminal phase remains sticky.
- State commitment does not await I/O; locks correspond to accepted active/terminal/idle state. Newly admitted local piles retain captured IDs, while externally observed active work retains the existing wildcard fallback.
- Reports share per-ID loading, retry after failed reads and check current ID/generation/disposal after each I/O boundary. Old successful hydration cannot publish its report or overwrite newer report/seen/locks. Subscriber reentry and markSeen do not create a report-loading deadlock.
- Starts serialize; an admission failure, superseded-idle failure or closed-page failure reaches its own caller and releases queue progress. Initial null, ordinary phase/report/failure/seen/lock behavior, polling and journal-before-start remain covered by supplied full check.

No source/write schema, backend executor, fake producer, timestamp revision or lexical ID authority was added. Git whitespace diff is clean. No remaining actionable regression was found in these inspected paths.

## Supplied evidence

| Evidence | Result and attribution |
| --- | --- |
| `/private/tmp/bower-run-order-start-red.log` | Genuine two assertion failures against fb80bd1;17 prior named cases pass;15 other tests excluded by filter. Both failures are resolved-promise OLD/done versus required rejection, not setup or lint failures. |
| `/private/tmp/bower-run-order-start-green.log` | Final19 named cases pass;15 existing cases excluded only by the targeted filter. Includes all prior ordering/null/lifecycle/report/error cases plus the two final assertions. |
| `/private/tmp/bower-run-order-start-check.log` | Full final check passes:51 test files/439 tests, including all34 live tests, lint/typecheck/build/harness/bundle/landing. Existing lint/chunk-size warnings and intentional fault logging remain. |
| Prior `/private/tmp/bower-run-order-rework-{red,green,check}.log` | Preserved fb80 evidence:7 genuine rework failures/10 passes against803,17 named green/full437. Not relabeled as final execution. |
| Prior `/private/tmp/bower-run-order-{red,red-extended,green,check}.log` | Preserved original803 ordering proof and intermediate failed lint/error-comment sensor gates, distinguished from behavioral reds. |

Exact named verify is unchanged: `pnpm vitest run src/data/live/live.test.ts -t "older run responses cannot replace newer observed state"`. All runtime evidence is supplied by the implementer/coordinator, not independently executed by this reviewer. Controlled Worker/report replies isolate client timing over real LiveRuns/session/vault code; they do not establish runner side effects, real account switching or authoritative service revisions.

## Limits

The existing wire cannot distinguish an eligible freshly issued backend-stale null from legitimate idle, order unknown cross-device IDs, or identify same-ID retry attempts. Those authoritative choices remain O3/R3 pending. Broader report-cache/retired-ID account isolation, browser-independent accepted execution, truthful producer completion/report-save barrier, and real Drive precondition atomicity remain separate open obligations. Superseded failed hydration may still reject its original caller while shared accepted state remains protected; the suite proves the specified successful-wait and retry paths, not every possible transport schedule. No browser/manual gates or phase acceptance were performed here. Later behavioral changes require renewed immutable review; integration and proof records remain coordinator-owned.
