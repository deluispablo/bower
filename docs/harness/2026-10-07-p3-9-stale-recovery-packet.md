# Packet: worker-stale-run-recovery (P3-9)

Starting model: `bower-escalated` (Opus). Reason: recovery without the browser, which means attempts, fencing and the alarm in the person object ([TL-P3-18](2026-10-07-tl-p3-18-runner-wire.md)).

- **Entry:** `worker-stale-run-recovery`. Checkout `/private/tmp/bower-p3-recovery`, branch `claude/p3-recovery`. Never push or deploy.
- **Read:**
  - Docs: `docs/harness/WORKER.md`, this packet, the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md` (the "Recovery without the browser" bullet), TL-P3-18, and the R3 results in `docs/harness/ACTIVE.md` (search "R3").
  - Code: `api/src/person.ts` (`alarm`, `expire`, `mintTicket`, runs and attempts), `api/src/github.ts` (dispatch), `api/src/process.ts` (thresholds), `api/test/dispatch.test.ts` and `api/test/runner.test.ts`.
- **Acceptance contract.** All GitHub calls go through the injected fetch, and every person-object decision runs in one synchronous section. The person object needs the env and fetch it was built with; reuse how `worker-dispatch` reaches GitHub. When `alarm()` fires:
  1. **No change needed.** If the run ended, or its deadline moved (a report arrived), set the alarm for the new deadline, or none, and change nothing. Named test: `an alarm on a run that progressed changes nothing`.
  2. **Stale: look it up.** List `repository_dispatch` runs (`GET /repos/<GITHUB_REPO>/actions/runs?event=repository_dispatch`, a bounded page). Find the one whose `display_title` is `tidy <run_id> <attempt>` for the **current** attempt, and read its jobs' `started_at`, `completed_at` and status.
     - **No such run** (a lost dispatch) **and attempt 1:** redispatch once as attempt 2 with a new ticket from `mintTicket`, which fences attempt 1. The run stays `queued`; set the alarm for the new queued deadline. Named test: `a lost dispatch is redispatched once with a new ticket`. It checks the payload's attempt is 2 and that attempt 1's ticket gets 409 `stale-attempt`.
     - **A job queued or in progress:** leave it alone, and set the alarm for that job's running deadline (`started_at` + 30 min, or now + 17 min while it is still queued). Named test: `a live job is left alone until its own deadline`.
     - **A job completed but the run never reported `done` or `failed`:** mark the run failed `stale` once. The spine's report-artifact reconcile comes later and is out of scope. Named test: `a finished job with no report is marked failed stale`.
     - **No such run at attempt 2 or later, or a second stale deadline:** mark the run failed `stale` once. Named test: `a run stuck twice is marked failed stale`.
     - **No `GITHUB_TOKEN`, or the lookup fails** (non-2xx or network): mark the run failed `stale` at the deadline, as today. Log by status only.
  - Every failed `stale` raises the revision once and retires the ticket. Never log the token or a ticket.
  - **Files in scope:** `api/src/person.ts`, `api/src/github.ts`, a new `api/src/recovery.ts` if it keeps `person.ts` smaller, and a new `api/test/recovery.test.ts`.
- **Out of scope:** the runner, the workflow, reading the report artifact, and the app.
- **Gates:** the verify (red first on assertions; commit a stub on its own first if you add a module) and `pnpm check` in full. Never write `harness/` records, run `done.sh`, run `wrangler` or call GitHub.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`. Name any interpretation of the contract you chose under `left out`.
