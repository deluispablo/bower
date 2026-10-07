# Packet: do-version-skew (P3-9)

Starting model: `bower-mechanical` (Haiku). Reason: one error mapping and one test (lead ruling after the staging `/status` 500 at `0b64dcb`).

- **Entry:** `do-version-skew`. Checkout `/private/tmp/bower-p3-skew`, branch `claude/p3-skew`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `api/src/process.ts` (`reach`), `api/src/errors.ts` (`HttpError`, the error handler, headers), `api/test/status.test.ts` and `api/test/process.test.ts` as patterns.
- **What happened:** after a deploy that added `Person.runStatus`, a Worker on the new version reached a person object still on the old class. The call threw `TypeError: The RPC receiver does not implement the method "runStatus"`, which answered 500 for minutes. Cloudflare documents this window: Workers docs, "Gradual deployments with Durable Objects".
- **Acceptance contract:**
  - In `reach()`, a `TypeError` whose message starts with `The RPC receiver does not implement the method` answers **503** `internal` with `Retry-After: 5`. The body is the standard `internal` message, and the cause goes to the log only.
  - Every other error keeps today's 500 `internal`. Add a `HttpError` status or header option only if needed.
  - The client's existing retry already treats 503 as retryable. Don't change the app.
  - Named test `a person object on the previous version answers 503 with Retry-After`: a route reaches a stub that throws that `TypeError` and gets 503 `internal` with `Retry-After`. A second case with another error still gets 500.
  - Files in scope: `api/src/process.ts`, `api/src/errors.ts` (if needed), and the test (a new `api/test/reach.test.ts`, or `status.test.ts`).
- **Gates:** the verify (red first on an assertion) and `pnpm check` in full. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Reply:** the mechanical card in `docs/harness/WORKER.md`.
