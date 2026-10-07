# Fix packet: recovery-status-poll-race (P3-9 review)

Starting model: `bower-escalated` (Opus), fresh session. Reason: the P3-9 Opus delta review blocked on a concurrency finding in run expiry versus recovery.

- **Entry:** `recovery-status-poll-race`. Checkout `/private/tmp/bower-p3-race`, branch `claude/p3-race`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, [the recovery packet](2026-10-07-p3-9-stale-recovery-packet.md), the "Recovery without the browser" bullet of `docs/specs/2026-10-04-worker-contract.md`, `git show 438e913`, `api/src/person.ts` (`expire`, `recoveryWatch`, `runStatus`, `admit`, the runner routes' calls), `api/src/recovery.ts`, `api/test/recovery.test.ts`.
- **The finding:** `expire()` (`person.ts:753`) is called by `runStatus`, `admit`, `runnerAccess` and `runnerReport`. With a GitHub token set, it still fails a run `stale` at its own deadline before any lookup has run. That happens when a `/status` poll lands before the alarm, or while `recover()` awaits GitHub. A run whose job is still queued on GitHub is then failed and its ticket retired. The reviewer reproduced this with two scenarios, logged at `/private/tmp/p3-9-review/repro.log`.
- **The fix:**
  - **With dispatch configured** (a `GITHUB_TOKEN`), the read and write paths never fail a run `stale` on their own before recovery has decided. Only the alarm's recovery marks it, plus a hard ceiling past the deadline (for example two stale windows) so a run can't hang forever if alarms never fire. Choose the ceiling and name it in a comment.
  - **Without a token,** today's expiry at the deadline stays exactly as it is.
  - The person object knows whether dispatch is configured from its env.
- **Named tests, red first,** in `api/test/recovery.test.ts`:
  - `a status poll during the lookup leaves a live job's run alone`;
  - `a status poll past the deadline waits for recovery when dispatch is configured`;
  - `without a GitHub token a status poll still expires the run`.
- **Files in scope:** `api/src/person.ts`, `api/src/recovery.ts`, `api/test/recovery.test.ts`, and `api/test/process.test.ts` and `api/test/dispatch.test.ts` only where their expiry expectations need a token-less env.
- **Gates:** the verify, the whole api suite, and `pnpm check` in full. Never write `harness/` records, run `done.sh`, run `wrangler` or call GitHub.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
