# Technical-lead decision TL-P3-2026-10-07-18: the runner wire, and batch P3-9

**Coordinator questions, 2026-10-07:**
- What comes after P3-8?
- Should a `/process` smoke run on staging?

## The runner wire

The [Worker contract](../specs/2026-10-04-worker-contract.md#runner-wire-p3-tl-p3-18) now says how the Worker and the runner talk. It reuses the original's per-run tickets and its runner token and status routes, adapted in three ways:
- **Routing.** Runs are keyed by run, not by folder, and the run id carries the person object's id, so no lookup table is needed.
- **Attempts and ordering.** A new attempt fences off the older one, so an expired attempt cannot finalize (ARCHITECTURE invariant 3). Reports carry a sequence number, so out-of-order reports are refused.
- **Recovery with no browser.** Each person object's own alarm finds a stuck run, instead of a global cron. Durable Object alarms are the platform's per-object timer and are on the free plan. R3 showed that a lookup by `run-name` and the job's timestamps are enough to reconcile.

## Batch P3-9

Two workers, P3-C and P3-D in parallel, as WORK_PLAN allows once the contract is fixed:
1. **`worker-runner-tickets`** (`bower-escalated`: authentication and ordering). Ticket mint and hash, the token and status routes, attempt fencing, `seq` and phase ordering, and retiring the ticket at the end. Tests use a fake runner.
2. **`runner-drive-adapter`** (`bower-escalated`: the fenced mutation boundary) in parallel. It does not depend on the wire.
3. **`worker-dispatch`** (`bower-implementer`), after 1. It does the `repository_dispatch` call behind an injected fetch, mints the ticket at dispatch, sets the alarm, and treats a 204 as "accepted, not yet observed". Live dispatch on staging waits for the owner's `GITHUB_TOKEN`; tests do not.
4. **`worker-stale-run-recovery`** (`bower-escalated`), after 3. The alarm, the run lookup by `run-name`, one redispatch, then failed `stale`. Thresholds come from R3 and from TL-P3-15.

The other spine entries follow `runner-drive-adapter` in P3-D order. When `worker-dispatch` is ready, the lead asks the owner for the GitHub token. The `bower-home` replacement (TL-P3-13) comes with the first spine entry that runs on Actions.

## `/process` smoke on staging

Approved, as A in the pane: press Tidy up once. Expect a queued run, a raised revision and no dispatch. It uses 1 of the 100 daily runs and holds the active-run slot until it expires as failed `stale` after 17 minutes. The expiry is checked by one `/status` read after the deadline.

## Addendum, P3-9 review: two Important findings

- **I1 → `recovery-status-poll-race`, as packeted.** When a GitHub token is configured, only recovery may end a dispatched run, with a hard ceiling past the deadline. Without one, the expiry from TL-P3-15 stays.
- **I2 → `runner-stale-attempt-signal`: the Worker keeps the contract, and the runner reads it.**
  - **Worker.** Ticket rows are retired, not deleted (schema v1). A ticket replaced by a newer attempt answers 409 `stale-attempt`, as the contract says, and a ticket the Worker has never seen answers 401.
  - **Runner.** It parses the nested error shape. It does not infer a takeover from a 401, because that would treat an expired or wrong ticket as a takeover.
  - **The fakes** replay the Worker's real shapes.
  - **Same lookup, same entry:** a resend of the final report (same attempt, same `seq`) with the ticket retired at `done` returns the current state, as the contract's repeat rule says, instead of 401.
- **Minors go to polish,** including a `mintTicket` failure after admission: the admitted run stays recoverable, and a retry with the same `requestId` returns it.
- After both fixes, one delta re-review of the fixes only, then `main` and the deploy SHA.
