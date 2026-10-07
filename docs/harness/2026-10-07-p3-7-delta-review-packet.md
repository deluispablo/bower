# Packet: P3-7 delta review (session lease, DELETE /me, run beat re-arm)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: TL-P2-46 fallback at the batch close. The session lease is fencing and concurrency in the person object, and `DELETE /me` forgets a person, so both are data-safety work. Counters: read only this packet, the three packets below and the diffs, never the workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs** (read-only; do not edit, commit or run e2e): `git diff 7bd77ce..HEAD -- src api` on `claude/p3` (where HEAD is the commit named in your prompt), and per change `c7c675a` (lease, squashed), `df56b60` (DELETE /me), `7af7932` (beat re-arm).
- **Contracts:**
  - [session-lease packet](2026-10-07-p3-7-session-lease-packet.md), with the "One active session" part of `docs/specs/2026-10-04-worker-contract.md` and `src/data/fake/fake-lease.ts` as the reference semantics;
  - [me-and-delete packet](2026-10-07-p3-7-me-and-delete-packet.md);
  - [beat-rearm packet](2026-10-07-p3-6-beat-rearm-packet.md).
- **Look hardest at:**
  - **Lease:** whether any `await` sits between a read and its write in the person object (input gates). Are the Worker and the fake identical on check, take and leave, on expiry with and without another place, on leave-then-check, and on stale `gen` (missing counts as 0)? Can a discarded check ever renew `beatAt`? Does `requireLease` accept an expired lease nobody took, and refuse every other mismatch? Is the v5→v6 migration safe for every existing row? Is the `''` sentinel for "no holder" handled everywhere? Does pruning leave rows after a day reopen the stale-check hole? Is `gen` persisted in `sessionStorage` correct across reloads and tabs?
  - **DELETE /me:** the order (revoke, then forget, then 204); what a concurrent request sees between `deleteAll()` and the re-migration; whether the refresh token or any id can reach a log; whether the old cookie can still do anything afterwards.
  - **Beat re-arm:** the `ticket > accepted` condition and the `schedule()` on clear, including a stale good answer arriving after a newer 4xx.
- **Run:** only unit test files you name, one at a time (`pnpm exec vitest run <file>` or `pnpm -C api exec vitest run <file>`). Reproductions go under `/private/tmp/p3-7-review/` in your own worktree; remove the worktree afterwards.
- **Report, under 20 lines:** verdict first (`PASS` or `BLOCKING`). Only Critical and Important findings against the contracts block, each with a reproduction. Minors in one line each.
