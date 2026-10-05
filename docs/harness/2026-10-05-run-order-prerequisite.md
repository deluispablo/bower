# Prerequisite recommendation: run-status-monotonic

Proposal only, under the existing public wire. No contract/schema adoption, implementation, tests, builds, installations, browser/provider use, delegation or shared-record edits. Only this authorized temporary handoff written.

- Exact inspected integration target: `28d2ce2359a940f2e2d25b4f58af04636dd15a7b`.
- Planning: `2026-10-05-contracts-2`, P2/C12,C14, qa-13 `run-status-monotonic`.
- Independent reviewer: Codex `/root/o1_audit`; live ACTIVE refreshed. Other source/browser reservations preserved.
- Current evidence: committed O1 `docs/harness/evidence/2026-10-05-o1/probe-results-143ae2b.txt` records old reading replacing newer done and pile lock `*`; run code remains unchanged at inspected target. Existing named regression in features.json is planned/unexecuted, not a green test.

## Existing defect and compatible scope

`src/data/live/runs.ts:72–75` accepts every raw status reply and returns a state built from that raw reply. `take` at 116–133 sets last before awaiting refresh/report, then can change took, schedule and emit after those awaits. Merely guarding the initial assignment does not prevent old asynchronous cleanup from touching a newer accepted run. `start` at 61–69 also returns its raw reply and sets took before asynchronous acceptance. React useLoad's per-hook sequence at `provider.tsx` cannot protect shared LiveRuns state or other callers.

`RunWire` (`worker/worker-api.ts:10`) contains id/scope/phase/requestedAt/phaseAt/optional finishedAt,total,failure, with no revision/attempt/lease identity. Existing phases are queued → reading → writing → saving → done or failed; status returns current or last run. Use those established semantics and local request identity to prevent visible regression without pretending to solve authoritative service ordering.

## Recommended bounded strategy

Keep public WorkerApi, RunSource, RunWire and durable file versions unchanged. Confine the initial candidate to `src/data/live/runs.ts` and `live/live.test.ts` unless a relevant caller defect requires explicit new reservation.

1. **Separate network reply from accepted state.** Assign local monotonically increasing tickets to status requests. Record accepted ticket/generation, and return a snapshot derived from the current accepted state after acceptance/hydration, never blindly from raw response. A losing caller must resolve to the newer accepted state (or appropriate current error), including report/seen/pile-lock semantics.
2. **Make successful start an explicit supersession barrier.** On a successful process reply, invalidate outstanding status requests issued before that admission was accepted, including ones issued while process was pending. Do not let a later-issued old-status ticket outrank the confirmed start merely because it was issued during process. A separate local generation increment on successful admission avoids that problem. If parallel start calls are allowed, serialize/coalesce their admission handling or explicitly guard their replies; do not add server idempotency guarantees locally.
3. **Apply same-run monotonic phase rules.** An accepted terminal state must not become active again; active stage rank must not decrease. A sequential later request can still contain a stale reading reply, so request ordering alone is insufficient. Existing enum order supplies the active ranks. Treat done and failed as terminal alternatives, not two ranked steps; conflicting terminal replies require diagnostic/contract clarification, not an arbitrary done-over-failed rank. Current fake retries create a new run ID. Same-ID attempt restarts are not representable/proven by this wire and remain O3 work.
4. **Handle identity and null conservatively.** Remember identities explicitly superseded by a newer accepted run so a later stale reply for a known old ID cannot become current again. Discard pre-admission-generation null. Within an unchanged account/folder/source lifetime, status is current-or-last, so a bare null after a known run must not casually erase it/relock state inconsistently. Preserve initial genuine null before any known run. Actual sign-out/account/folder reset needs the established source lifecycle; do not make old state persist across another account by inventing an implicit session guarantee.
5. **Guard all mutations around awaits.** Acceptance must have one defined commit point and winner identity. Either serialize state commits or use generation/token checks before AND after refresh/lastRun awaits. Superseded hydration may store an immutable report under its own run ID, but cannot assign last, clear took for the new run, reschedule based on the old run, publish its result as current or resolve a caller to an obsolete raw state. Deduplicate same-run report loading to avoid competing reads/mismatched late cleanup. Emit only coherent accepted-state notifications, with reentrant subscribers safe.
6. **Preserve existing errors and polling.** Failed requests/hydration must reach callers and diagnostics as before; release queues/in-flight slots in finally so retries work. If newest request fails, an older successful response must not be mistaken for a newer authoritative response; explicitly choose conservative fallback behavior rather than using last-issued ticket as an unconditional permanent barrier. Maintain fast/slow polling, dispose cleanup, no report fetch for active states, markSeen behavior and bounded emission. Do not cache a rejection forever.

Coalescing current() calls can reduce duplicate requests, but is optional optimization and not the entire safety fix: serialized stale replies and status-versus-start still exist. If chosen, retain a concrete assertion red against the old behavior and test the coalesced behavior explicitly rather than assuming two distinct outstanding Worker calls still exist.

Timestamp caution: requestedAt/phaseAt are epoch times, not negotiated revision/attempt numbers. Do not sort opaque run IDs lexicographically, infer attempt ordering from local Date.now, or claim timestamps prove authoritative order. Local retired IDs solve known-old-run resurrection; an unknown different ID from a sequential reply may be a genuinely new run or stale unseen run. Existing wire cannot prove that distinction, especially with equal/clock-adjusted timestamps. Keep that limitation explicit for O3 instead of fabricating complete cross-device/attempt ordering.

## Concrete regression plan

Registered unchanged verify:

`pnpm vitest run src/data/live/live.test.ts -t "older run responses cannot replace newer observed state"`

Use actual Vitest assertions in that existing test file, with controlled typed Worker replies and deferred promises. Proposed `it.each` display name:

`older run responses cannot replace newer observed state (%s)`

The scenarios below are **new planned assertions, not existing executed coverage**. They all retain the verify prefix. Use actual `LiveRuns` plus a prepared DriveVault/controlled report fixture or narrowly stub its reads; do not substitute a mock of the acceptance implementation itself. Prefer the real fake Drive/report path where practical. Do not use uncontrolled sleep to determine response order.

| Case suffix | Controlled interleaving | Assertions |
| --- | --- | --- |
| same-run reverse replies | Issue two status requests; resolve newer done and matching persisted report first, then old reading. | Both settled return states and subsequent current remain done with same report; subscriber-observed states never regress after done; runningPiles empty. Real baseline assertion red. |
| old run after new admission | Pending old-run status; process successfully admits a different ID/new captured pile set; resolve old status last. | start/current returns new ID; last stays new; took/lock references new piles; no old terminal cleanup unlocks new work. |
| stale null after admission | Pending status=null response spans successful process reply. | Null cannot erase new ID; returned state matches new; lock remains new captured set. Initial null before a run remains supported separately. |
| new response during old report refresh | Older done enters deferred vault.refresh; a newer process/current accepts new run; then release old refresh/lastRun. | No stale old-run emit or return, no clearing new took, no old report attached to new ID, no old-phase polling schedule. |
| old report response after newer report | Deferred old lastRun; newer accepted run/report becomes current; old read resolves afterward. | Current report remains tied to current run ID; stale hydration cannot overwrite state or cause duplicate visible terminal result. |
| serialized stale same-run stage | Await saving/done, then a later fresh status call returns reading (not overlapping). | Phase and lock do not regress despite higher local issue ticket. Cover queued/reading/writing/saving ranks and terminal active regression. |
| known superseded ID returned later | Accept old ID, then new ID; a subsequent later status returns old ID. | Known retired ID cannot become current even though its request ticket is newer. Do not describe this as proof for unknown IDs or attempt authority. |
| failed request / report retry | Reject status or report load, then resolve a following request successfully. | Error reaches caller/logs; no permanently stuck in-flight promise/queue; valid state retained and retry works. No change to separate report-save-barrier producer semantics. |
| subscriber reentry and seen | Subscribe with callback that calls current; exercise completion and markSeen. | No deadlock/infinite emission; callbacks resolve accepted state; seen/report stable; dispose stops scheduling/listeners. |

For asynchronous interleaving tests, assert visible state and pile locks while hydration is pending as well as after all promises settle; a final-only assertion can miss stale emission/lock windows. Assert the complete ordered subscriber observation sequence or the no-regression invariant, not only latest private field. Use access through public methods; inspect worker call count only where coalescing is itself intentional.

Existing named tests to preserve: `a tidy-up does not start while journal lines still wait`; `a run walks the phases and ends with its report`; `a failed run carries its sentence and leaves the inbox`; `seen survives a new LiveRuns`; `the inbox is locked while a run is going`; `a run already going when the app opens is followed at the fast pace`.

## Limits and dependency handoff

This candidate can stop local stale replies and asynchronous report cleanup from corrupting observed state. It cannot authenticate backend attempts, order unseen different runs, make dispatch durable, validate server recovery, ensure report persistence, establish ready-input membership or guarantee real provider/executor behavior. Those remain O3/O4 and R1–R4 obligations. Keep `run-report-save-barrier`, readiness and browser-independent execution separate; do not quietly adopt new enums/fields to complete this local entry.

Coordinator should turn the bounded recommendation into an owned test-first packet, capture the exact named assertion red, implement the smallest consistent state acceptance rule, inspect failures/reentrancy, run targeted verify/full check and return an immutable candidate for fresh independent review. Planned tests above are not registered/implemented by this prerequisite audit. No entry or capability is closed by this proposal.
