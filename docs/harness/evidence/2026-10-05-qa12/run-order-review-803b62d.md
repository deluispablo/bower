# Independent run-order candidate review

Session `p2-run-order-review-2026-10-05`; entry `run-status-monotonic`; adopted revision `2026-10-05-contracts-2`, P2, C12/C14 with C01 lifecycle interactions inspected.

Exact immutable base `6305ca9dfa126fd08ef9fe819a4ba2000cb78437`; candidate `803b62ddfc09ceedc24f73c26a64972aba1fe60b`. Clean owned worker `/private/tmp/bower-p2-journal-ack`, branch `codex/p2-run-order` per packet. Only `src/data/live/runs.ts` and `src/data/live/live.test.ts` changed. Read-only Git/source/supplied-log inspection; no reviewer tests/builds/installs/browser/provider calls, source/shared-record edits, delegation or closure.

## Verdict

**Changes requested: one Important introduced compatibility finding.** The local ordering/report implementation substantially addresses the demonstrated races, with honest assertion red/green evidence, but unconditionally preserving a previous run on null assumes a stable account/folder lifetime that the actual source lifecycle does not enforce. Restore eligible null replies to their baseline API meaning and add real lifecycle regression assertions before integrating a replacement candidate. The wider account-isolation contract remains open; that does not permit this new null-handling regression to be set aside.

## Important finding — null cannot permanently preserve a run across session/folder reset

At `src/data/live/runs.ts:147–150`, every null answer is rejected once any run was observed. Nothing clears `last`, `reports`, `retired`, or `took` on a session/account/folder transition. `generation` changes only on successful process admission or disposal, not on such a transition (`56–58,79–89`).

Trigger under the existing API: client observes account/folder A's reading run (or hydrates its done report); the session is reset and a currently authenticated context with no run answers null. This may follow account deletion/recovery, an in-page session adapter transition, or a session cookie changed in another tab while this page remains open. Subsequent current calls return A's reading/terminal state rather than null. Reading retains captured locks or `*`; terminal retains A's report and can offer its replay after device seen storage was cleared. Null polling cannot recover it. Before this candidate, take assigned null to last and cleared took (`6305ca9:src/data/live/runs.ts:116–131`), so accepting an actual new-context idle reply cleared those particular stale states.

Actual lifetime trace:

- `src/data/live/index.ts:54–73` constructs one session/vault/LiveRuns and links the vault root callback to the mutable session. Session events are not wired to any run reset/recreation; only the folder-created callback refreshes the vault.
- `src/data/live/session.ts:42–64,70–95` signIn/signOut/deleteAccount/createFolder/expire invalidate cached me and emit, but never reset/dispose LiveRuns.
- `src/main.tsx:24–32` builds Sources once. `src/app/App.tsx:56–109` Gatekeeper responds to session events by replacing its displayed routes; DataProvider and its sources survive that route change.
- `src/data/device.ts:25–29` forgets browser keys, not LiveRuns' maps/last/took.
- The existing Worker contract scopes run state to the person; DELETE /me forgets runs and /status admits null (`docs/specs/2026-10-04-worker-contract.md:11,31–38`). `WorkerHttp` uses the current cookie for each request (`src/data/worker/worker-http.ts:84–90`).

Scope precision: normal **local real** WorkerHttp.signIn navigates to OAuth and reloads the document (`worker-http.ts:49–51`), so that specific happy path constructs fresh sources. Do not claim it is an in-page switch. Current FakeWorker supports only its scripted Alex identity and retains run state even on delete, so it is not itself a truthful two-account/null-reset reproduction. Nevertheless the public session/source abstraction and cookie-backed remaining page do not establish page lifetime equals authenticated context lifetime. The source trace establishes the missing invalidation and new unconditional rejection; this reviewer did **not** reproduce an account-switch runtime failure.

Suggested smallest correction under the existing wire: **allow an eligible latest accepted-ticket/current-generation null to clear last and took, with the normal notification/cadence update**. Older pending replies and replies issued before successful admission already fail the ticket/generation checks; they do not need the unconditional null refusal. Existing baseline null semantics should remain authoritative for an eligible reply. The client cannot distinguish a newly issued backend-stale null from a legitimate authenticated context with no run using this wire, so do not claim that it can. No new public fields or internal session-reset API is required to repair this specific regression. Pending old hydration must still recheck the current ID and cannot republish after accepted null. Keep existing outbox storage untouched.

The existing `(admission supersedes null)` assertion currently combines two different situations. Its delayed null issued during process admission should still return the new admitted run, proving the generation barrier. Its later newly issued null expecting NEW to persist overclaims wire authority. Split that expectation so an eligible fresh null clears, while the known old-ID case retains the retired-ID protection. This is a contract-compatibility correction, not permission to delete the meaningful original delayed-null assertion.

Planned meaningful assertions retaining the verify prefix:

- `older run responses cannot replace newer observed state (idle after a session reset clears the previous run)` — reuse actual makeLiveSources/session callbacks, with a typed WorkerApi test adapter whose synthetic me/folder changes under existing semantics and whose new context legitimately returns null. Observe old reading and terminal/report in separate cases; trigger actual session transition without constructing new Sources. Assert current/subscribed idle, empty locks, no old report/replay, and retained folder-outbox bytes. Current candidate should fail on returned retained run, rather than relying only on private-map inspection. This is simulated lifecycle compatibility, not a real two-account provider reproduction.
- `older run responses cannot replace newer observed state (old hydration cannot cross an accepted idle reply)` — hold old refresh/report, accept an eligible null, release old I/O; no old run/report/notification/locks reappear.
- `older run responses cannot replace newer observed state (disposal before admission preparation finishes prevents process)` — defer real admission preparation through a wrapper, begin start, dispose, resolve it; process spy count remains zero and caller fails plainly. This covers a pre-existing disposal gap without claiming cancellation after process was already sent.

These names are recommendations, not existing/executed tests or schema adoption.

## Ordering implementation assessed

Within a fixed context, the implementation has coherent bounded behavior:

- Every status read has a local issued ticket and captures admission generation; only successful replies newer than accepted, in the same generation and before disposal, may take state (`runs.ts:95–105`). A newer failed request does not advance accepted, allowing an earlier successful reply as tested. Returned values use accepted last rather than the raw delayed response.
- Successful process admission advances generation and issue/accepted counters, including requests issued while process awaited (`79–92`). Sequential start queue delivers errors to each caller while allowing the next admission after failure (`71–76`). Existing journal-before-process prerequisite remains.
- `take` commits without asynchronous I/O. Known retired IDs are ignored, same-run active phase rank cannot decrease, terminal phase is sticky, and conflicting done/failed is diagnosed without replacing accepted terminal state (`147–167`). Captured pile IDs update for a newly admitted run; an externally observed active run retains the existing wildcard fallback. Terminal state clears locks.
- Report hydration shares an in-flight promise per ID, checks disposal/generation/current ID after refresh and report awaits, caches only a matching report, and emits only after hydration succeeds (`170–193`). An old completion cannot clear newer captured locks or emit its outdated report. While loops re-evaluate accepted state after waiting; failures release the in-flight map entry for retry.
- Reentrant subscribers may call current without waiting inside a serialized state-commit critical section. Report cache is set before emission, preventing the normal subscriber read from starting another report read. markSeen remains device-based and returns coherent seen/report state. Disposed current returns cached accepted state without polling; subscribe cannot restart its timer.

No new fields/enums/public contracts, timestamps-as-revisions, lexical ID ordering, backend executor or fake producer behavior was added. Scope remains a local observation/admission-order guard, not authoritative backend ordering.

## Disposal preparation limitation

`startNow` checks disposed at entry and **after** Worker.process, but not after flushJournal/piles (`runs.ts:80–85`). If disposal happens while admission preparation waits, resolving that wait still calls process after disposal and can admit work, then rejects the caller as no longer open. This path also existed before the candidate, so it is **not classified as a second introduced regression**. It remains a concrete unproved path in the assigned disposal scope, not covered by the new pending-status or start-after-dispose tests. Before claiming complete disposal guarantees, add a deferred preparation assertion and a pre-process lifecycle check. Cancelling a process request already sent is a different unsupported guarantee.

Other limits: obsolete hydration errors can still reject their original caller after a newer run was accepted; they cannot commit old shared state. The supplied tests cover newer success states, not that superseded-error choice. General in-flight Drive refresh/mutation atomicity is not established by this run-state guard.

## Named tests and supplied evidence

Every new test uses the exact verify prefix **`older run responses cannot replace newer observed state`** in `src/data/live/live.test.ts`. These are controlled client-ordering assertions over actual LiveRuns/makeLiveSources with real vault refresh; Worker status/process and report reads are stubbed/deferred to isolate timing. They do not prove runner effects or real report production.

| Named suffix | Cases and observed scope |
| --- | --- |
| `(reversed terminal replies and subscribers)` | Later done settles before earlier reading; returns/subscriber reads remain done with report and empty locks. |
| `(admission supersedes old-id)` / `(admission supersedes null)` | Status issued while process waits cannot replace new admission; sequential known-old/null also ignored, captured locks retained. |
| `(delayed old refresh)` / `(delayed old lastRun)` | New run accepted across old hydration; old caller returns new run, no obsolete report or extra notification, captured locks retained. |
| `(old report after a newer report)` | New terminal report/seen remains after old report response; no extra notification/old report; report reads counted. |
| `(sequential phases and initial null)` | Initial null preserved; active phases advance and resist queued regressions; conflicting terminal diagnosed. |
| `(request and report failures retry)` | Newer status error permits older success, failed report read retries, seen persists. This compatibility case already passed at baseline. |
| `(report loading is shared and disposal stops polling)` | Shared report read, subscriber reentry/markSeen and visibility after disposal. |
| `(parallel admissions serialize and retry after failure)` | Process preparation queue does not overlap; first admission failure releases next; known old status resisted. |
| `(pending reply after disposal has no effects)` | Pending status cannot commit/hydrate/notify after disposal; fresh start after disposal rejected. |

Logs inspected:

- `/private/tmp/bower-run-order-red.log`: genuine assertions, 7 failed/1 passed, 15 filter exclusions; failures concern state/phase, locks/report read counts, not startup.
- `/private/tmp/bower-run-order-red-extended.log`: baseline expanded suite, 10 failed/1 passed, 15 filter exclusions, including concurrent process count and post-disposal status state.
- `/private/tmp/bower-run-order-green.log`: 11 named cases passed, 15 other cases excluded by this targeted filter. Exclusions are not claimed as targeted proof.
- `/private/tmp/bower-run-order-check.log`: final complete check, 51 files/431 tests, lint/typecheck/build/harness/bundle/landing pass with existing warnings.
- Earlier `/private/tmp/bower-run-order-check-lint.log` and `-check-architecture.log` failed helper lint and queue error-comment sensor checks. Final candidate fixes those; they are retained failed intermediate gates, not real behavioral reds or current failures. Queue catch is documented because next preserves the caller's rejection; sensor changes were not made.

Existing normal phase/report/failure/seen/lock, fast polling and journal-before-start tests remain; full check exercised them. Git whitespace diff is clean. No lifecycle/context-reset assertion exists, and no supplied green disproves the Important finding.

## Final limits

Unknown cross-device run IDs cannot be ordered authoritatively using this wire; a previously unseen delayed ID may be mistaken for a new run. Same-ID retry attempt epochs/backend revision are absent. Current-or-last/phase monotonicity here are bounded client policy under existing shapes; O3/R3 authority remains unproven. Browser-independent accepted work, report-save barrier and whole C12/C14 recovery remain separately open. No browser gates or manual evaluation were performed for this candidate. Return a replacement immutable range after eligible-null compatibility correction; independent review and coordinator integration/proof are still required.
