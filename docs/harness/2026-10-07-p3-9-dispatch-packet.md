# Packet: worker-dispatch (P3-9)

Starting model: `bower-implementer` (Sonnet). Reason: one outbound call behind an injected fetch, with ticket and alarm hooks that already exist or are small ([TL-P3-18](2026-10-07-tl-p3-18-runner-wire.md)).

- **Entry:** `worker-dispatch`. Checkout `/private/tmp/bower-p3-dispatch`, branch `claude/p3-dispatch`. Never push or deploy.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`, and invariant 2 in `docs/ARCHITECTURE.md` (line 44).
  - Api: `api/src/process.ts` (the route, `reach`), `api/src/person.ts` (`admit`, `mintTicket`, `expire`, the constructor), `api/src/run-ticket.ts` (run id helper), `api/src/env.ts` (`GITHUB_TOKEN` optional, `GITHUB_REPO`), `api/test/process.test.ts`, `api/test/runner.test.ts`.
  - Reuse: `/Users/deluisp/Projects/bower/api/src/github.ts` (headers, URL, error handling).
- **Acceptance contract:**
  - **Run ids.** `admit` gives new runs the routing id `<person object id hex>-<random>` with the tickets helper. Existing rows keep their ids.
  - **Dispatch.** When `admit` admits a **new** run (not a repeat, not an active one), the route:
    1. mints a ticket for attempt 1 (`mintTicket`);
    2. sends one `POST https://api.github.com/repos/<GITHUB_REPO>/dispatches` through the injected fetch (`AuthDeps.fetchImpl`), with `Authorization: Bearer <GITHUB_TOKEN>`, GitHub's JSON accept header and API version header, and body `{ "event_type": "bower-tidy", "client_payload": { "run_id", "attempt": 1, "ticket", "scope", "allow_web" } }`.
    - The folder id is not in the payload.
    - Never log the ticket or the token.
  - **Answers.**
    - A 204 leaves the run `queued`: accepted, not yet observed.
    - A non-204 or a network failure is logged by status only. The run stays `queued`, and the `/process` answer is unchanged (`{ run, revision }`). The alarm finds and recovers it.
    - With no `GITHUB_TOKEN`, nothing is sent, and one log line says dispatch is not configured.
  - **Alarm.** The person object sets its alarm (`ctx.storage.setAlarm`) for the run's queued stale deadline when it admits a new run. `alarm()` writes the stale expiry (the existing `expire`). `worker-stale-run-recovery` will add the lookup and the redispatch.
  - **Named tests, red first** (`api/test/dispatch.test.ts`):
    - `a new run is dispatched once with its ticket`: the payload shape, and the ticket works on the token route;
    - `a repeat or an active run dispatches nothing`;
    - `a failed dispatch leaves the run queued`;
    - `no GitHub token sends nothing`;
    - `admission sets the stale alarm`: read the alarm time, and run `alarm()` past the deadline to see failed `stale`.
  - **Files in scope:** a new `api/src/github.ts`; `api/src/process.ts`, `api/src/person.ts`, `api/src/run-ticket.ts` (only if the helper needs exporting); the new test; `api/test/process.test.ts` only where run ids change.
- **Out of scope:** recovery lookup and redispatch, the runner, the workflow, and setting the secret.
- **Gates:** the verify (red first on assertions) and `pnpm check` in full. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
