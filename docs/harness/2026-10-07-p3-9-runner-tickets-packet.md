# Packet: worker-runner-tickets (P3-9)

Starting model: `bower-escalated` (Opus). Reason: authentication and ordering for the runner, in the person object ([TL-P3-18](2026-10-07-tl-p3-18-runner-wire.md)).

- **Entry:** `worker-runner-tickets`. Checkout `/private/tmp/bower-p3-tickets`, branch `claude/p3-tickets`. Never push or deploy.
- **Read:**
  - Docs: `docs/harness/WORKER.md`, this packet, TL-P3-18, and the "Runner wire" section plus the general error codes of `docs/specs/2026-10-04-worker-contract.md`.
  - Api: `api/src/person.ts` (runs, `raiseRevision`, `transactionSync` sections), `api/src/person-schema.ts` (v1 `run_ticket` table; `SCHEMA_VERSION` 7), `api/src/process.ts` (`RunWire`, `personFor`, `reach`), `api/src/drive-token.ts` (`accessTokenFor`), `api/src/crypto.ts`, `api/src/index.ts`, `api/test/process.test.ts` as the pattern.
  - Reuse: the original app's `/Users/deluisp/Projects/bower/api/src/run-ticket.ts` and `runner.ts` (routes and checks only; adapt to the person object).
- **Stub first** for new modules. To make `done.sh`'s red reliable, commit the stub on its own before the behaviour.
- **Acceptance contract:**
  - **Ticket.** 32 random bytes as base64url, minted per attempt by a person-object method that `worker-dispatch` will call (`mintTicket(runId, attempt, now)` → ticket). Only the SHA-256 is kept, with `run_id`, attempt and expiry at now + 60 min. A new attempt replaces the stored ticket. Never log a ticket. Use the v1 `run_ticket` table, or a v8 migration with a test if its shape doesn't fit.
  - **Routing.** `run_id` is `<person object id hex>-<random>`. The routes get the person object with `idFromString(hex)`; a malformed id answers 401 `signed-out`. Add a helper that makes run ids this way. `worker-dispatch` will use it; admission's own run ids stay as they are until then.
  - **`GET /runner/runs/:id/token`** (`Authorization: Bearer <ticket>`) answers `{ accessToken, expiresAt, folderId, attempt }`. The Drive token comes through `accessTokenFor`. Not same-origin and no cookie: the ticket is the only credential. A missing, wrong or expired ticket answers 401 `signed-out`.
  - **`POST /runner/runs/:id/status`** takes `{ attempt, seq, phase, total?, failure? }` (JSON, validated; a bad body answers 415) and answers `{ run, revision }`. It runs in one synchronous section:
    1. Ticket check.
    2. Attempt current, else 409 `stale-attempt`.
    3. `seq` greater than the last for this attempt, and the phase not going backwards along `queued` → `reading` → `writing` → `saving` → `done` | `failed`, else 409 `stale-report`.
    4. A repeat of the last `seq` answers the current state and changes nothing.
    5. Write the run's phase, `phaseAt` and `total`/`failure`/`finishedAt` as given, and raise the revision.
    6. `done` or `failed` retires the ticket.
  - **Named tests, red first,** in a new `api/test/runner.test.ts`, each with a fake runner calling the routes:
    - `a runner ticket gets the folder and a Drive token`;
    - `a wrong or expired ticket is signed out`;
    - `a new attempt fences the old one`;
    - `reports move forward by seq and phase`;
    - `a repeated report changes nothing`;
    - `an ended run retires its ticket`.
  - **Errors.** Person-object failures answer 500 `internal` with no cause. Use only the contract's codes.
  - **Files in scope:** a new `api/src/runner.ts` and `api/src/run-ticket.ts`; `api/src/person.ts`, `api/src/person-schema.ts` (only if a migration is needed), `api/src/index.ts`; the new test and, where natural, `person.test.ts`.
- **Out of scope:** dispatch, alarms, recovery, the runner itself, and the app.
- **Gates:** the verify (red first on assertions) and `pnpm check` in full. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
