# Packet: recovery-redispatch-after-dead-job (P3-13 review fix)

Starting model: `bower-escalated` (Opus). Reason: recovery without the browser, which is concurrency and data safety. The P3-13 delta review found `decide()` in `api/src/recovery.ts` ending a run failed `stale` when attempt 1's job had finished (failed or cancelled) with no report. The contract's "Runner wire" says the Worker "redispatches once, as attempt + 1 with a new ticket, if no live job holds the run". TL-P3-23 says the alarm, the redispatch and the runner alone complete the run. As things stand, the new resume code never runs after a kill, and the `gh run cancel` journey would end `stale`. This fix implements the contract as written, so no new ruling is needed.

- **Entry:** `recovery-redispatch-after-dead-job`. Checkout `/private/tmp/bower-p3-redispatch`, branch `claude/p3-redispatch`, from the commit named in your prompt. Never push or deploy, and never run `gh` or `wrangler`.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, [TL-P3-23](2026-10-07-tl-p3-23-recovery-and-ordered-status.md), and the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`.
  - `api/src/recovery.ts`, the person object's alarm and redispatch path in `api/src/person.ts`, and `api/src/dispatch.ts` if present.
  - `api/test/recovery.test.ts` (line ~216 asserts the current behaviour).
  - How the runner resumes: `runner/src/main.ts`, `runner/src/spine/run.ts`.
- **Acceptance contract:**
  - **Rule.**
    - At attempt 1 with no live job, attempt 1 is redispatched once as attempt 2, with a new ticket. "No live job" means none found, or every job for `tidy <run_id> 1` completed.
    - At attempt 2 with no live job, the run ends failed with the existing `staleFailure(phase)`.
    - A live job (queued or in progress) still waits once, until its own deadline, as it does today.
    - A lookup failure stays as it is.
    - Update the header comment of `recovery.ts` to match.
  - **The old ticket is retired at the redispatch,** as for a lost dispatch, so a late attempt-1 job gets `stale-attempt` (TL-P3-18).
  - **Named tests, red first** (commit them on their own before the fix):
    - `the alarm redispatches a run whose first job finished without a report`. It drives the person object's alarm with a lookup whose attempt-1 job is `completed`. It then runs the resumed runner against the faked Worker and Drive, as the runner's recovery tests do, or asserts the redispatch payload and attempt 2 if crossing packages is not possible. The run must end `done`. Say in your card which form you chose.
    - `a second attempt with no live job ends stale`.
    - Change the existing test that asserts `failed stale` after a finished attempt-1 job, and say so in your card.
  - **Files in scope:** `api/src/recovery.ts`, `api/src/person.ts` (the alarm path only), `api/test/recovery.test.ts` and `api/test/person.test.ts`. Name anything else you touch.
- **Out of scope:** the runner, the routes test (another worker is fixing it in parallel in `/private/tmp/bower-p3-routing`), and any live call.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full.
  - No e2e is needed, since no app code changes.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
