# Fix packet: runner-stale-attempt-signal (P3-9 review)

Starting model: `bower-implementer` (Sonnet), fresh session. Reason: the P3-9 Opus delta review blocked on the runner's stale-attempt mapping. The fix is small and the direction is clear.

- **Entry:** `runner-stale-attempt-signal`. Checkout `/private/tmp/bower-p3-attempt`, branch `claude/p3-attempt`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, [the adapter packet](2026-10-07-p3-9-runner-adapter-packet.md), the "Runner wire" error lines of `docs/specs/2026-10-04-worker-contract.md`, `runner/src/token.ts`, `runner/src/drive.ts` (`batch`), `runner/test/drive-v3.ts`, `runner/test/drive.test.ts`, and `api/test/runner.test.ts:130-160` (the Worker's real replies).
- **The finding:** `staleAttempt()` (`runner/src/token.ts:64`) fires only on a flat `{ error: 'stale-attempt' }` 409, which the Worker never sends. The Worker answers an older attempt's ticket on the token route with 401 `{ error: { code: 'signed-out' } }`. So after a takeover, `batch()` fails with `auth` instead of the stale-attempt error. Writes are still blocked, but the named test passes only against the fake reply in `runner/test/drive-v3.ts:55`.
- **The fix:**
  - Parse the nested `{ error: { code } }` shape.
  - A 409 `stale-attempt` raises the stale-attempt error.
  - A 401 `signed-out` from the token route **after an earlier successful grant in the same run** also raises it: the ticket was replaced by a newer attempt.
  - A 401 on the first grant stays an auth error.
  - Change the fakes in `drive-v3.ts` to replay the Worker's real shapes, as in `api/test/runner.test.ts`.
- **Named tests, red first:**
  - `the adapter refuses with stale-attempt when the Worker signs out an older attempt's ticket`;
  - `a first grant refused stays an auth error`.
- **Files in scope:** `runner/src/token.ts`, `runner/src/drive.ts` (only if the error type flows through it), `runner/test/drive-v3.ts`, `runner/test/drive.test.ts`.
- **Gates:** the verify, the runner suite, and `pnpm check` in full. Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
