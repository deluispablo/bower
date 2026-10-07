# Fix packet: runner-stale-attempt-signal (P3-9 review), revised by the TL-P3-18 addendum

Starting model: `bower-implementer` (Sonnet), fresh session. Reason: the P3-9 Opus delta review blocked on the stale-attempt signal. The lead ruled that the **Worker** keeps the contract.

- **Entry:** `runner-stale-attempt-signal`. Checkout `/private/tmp/bower-p3-attempt`, branch `claude/p3-attempt`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, the "Runner wire" ticket and error lines of `docs/specs/2026-10-04-worker-contract.md`, the TL-P3-18 addendum in `docs/harness/DECISIONS.md`. Then the code: `api/src/person.ts` (`mintTicket`, the ticket lookup in `runnerAccess` and `runnerReport`, retiring), `api/src/run-ticket.ts`, `api/src/runner.ts`, `api/test/runner.test.ts`, `runner/src/token.ts`, `runner/src/drive.ts` (`batch`), `runner/test/drive-v3.ts`, `runner/test/drive.test.ts`.
- **The finding:**
  - The Worker answers an older attempt's ticket with 401 `signed-out`, because a new attempt deletes or replaces the row. The contract says 409 `stale-attempt`.
  - The runner matched a flat `{ error: 'stale-attempt' }` the Worker never sends.
  - A resent final report gets 401, because the ticket is already retired. The contract's repeat rule says it gets the current state.
- **The fix:**
  - **Worker.**
    - A new attempt **retires** the older attempt's `run_ticket` row and never deletes it.
    - A lookup finds the row by hash. Each case answers:
      - **retired because superseded:** 409 `stale-attempt`;
      - **retired because the run ended:** a status report with the same attempt and the last `seq` answers the current `{ run, revision }`; anything else answers 401;
      - **unknown or expired:** 401 `signed-out`.
    - Add a v9 migration with a test if a column is needed, for example the retire reason.
  - **Runner.**
    - Parse `{ error: { code } }`.
    - 409 `stale-attempt` raises the stale-attempt error.
    - **Never infer a takeover from a 401**: a 401 stays an auth error.
    - The fakes in `drive-v3.ts` replay the Worker's real shapes.
- **Named tests, red first:**
  - api: `a superseded attempt's ticket answers stale-attempt`, `an unknown ticket is signed out`, `a resent final report answers the current state`;
  - runner: `the adapter refuses with stale-attempt on the Worker's real reply`, `a refused ticket stays an auth error`.
- **Files in scope:** `api/src/person.ts` (ticket lookup and retire only), `api/src/person-schema.ts` (only if needed), `api/src/runner.ts`, `api/test/runner.test.ts`, `api/test/person.test.ts` (migration only), and `runner/src/token.ts`, `runner/src/drive.ts`, `runner/test/*`. Another worker edits `expire()` and recovery in `person.ts`, so stay out of those.
- **Gates:** the verify, the api and runner suites, and `pnpm check` in full. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
