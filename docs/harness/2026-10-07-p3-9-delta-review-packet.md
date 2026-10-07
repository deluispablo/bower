# Packet: P3-9 delta review (runner tickets, dispatch, stale recovery, runner Drive adapter)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: the TL-P2-46 and TL-P3-16 fallback at the batch close. Runner authentication, attempt fencing, recovery and the runner's Drive writes are security and data-safety work. Counters: read only this packet, the packets below and the diffs, never workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs:** `git diff 0b64dcb..<HEAD in your prompt> -- src api runner scripts`. Per change:
  - `65a29c1` (tickets; stub `5ca5ee4`);
  - `d35e5c7` (adapter; stub `fef4f44`, tests `6f97ea9`);
  - `c71dc5a` (dispatch; stub `9dc68bb`);
  - `438e913` (recovery; stub `7493f88`, seam `73f5338`);
  - `d5d12f5` (version skew);
  - `43c4d69` (harness runner paths).
- **Contracts:**
  - the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`;
  - [TL-P3-18](2026-10-07-tl-p3-18-runner-wire.md);
  - the packets `2026-10-07-p3-9-runner-tickets-packet.md`, `-runner-adapter-packet.md`, `-dispatch-packet.md`, `-stale-recovery-packet.md`, `-version-skew-packet.md` and `-runner-paths-packet.md`.
- **Look hardest at:**
  - **Tickets.** Constant-time hash compare. Expiry. A ticket never logged or returned after mint. `idFromString` on a hostile id. Can a retired or older-attempt ticket ever read a token or move a run? Is the `seq` and phase ordering airtight under repeats? Does every accepted report raise the revision exactly once?
  - **Dispatch.** Is the payload exactly the contract's? Is the token never logged? Do a repeat or an active run never dispatch? Does a failed dispatch leave the run discoverable? Is the alarm set on every new run?
  - **Recovery.** Can it ever redispatch twice, run two attempts at once, expire a run that a live job holds, or let attempt 1 still write after attempt 2 exists? Is the `recoveryWatch` KV entry cleared on every end path? What does a lookup failure do?
  - **Adapter.** Does the still-as-seen precheck and the attempt check cover every write? The create path checks the parent's name, parents and Bin state but **not** its `modifiedTime` (a stated deviation): is that safe? Do the fake and the adapter really agree? Are faults injected only through the fetch hook?
  - **Version skew.** Only that one TypeError maps to 503.
- **Run:** single test files only (`pnpm exec vitest run <file>`, `pnpm -C api exec vitest run <file>` or `pnpm -C runner exec vitest run <file>`), one at a time. Reproductions go under `/private/tmp/p3-9-review/` in your own worktree, which you remove afterwards.
- **Reply:** the review card in `docs/harness/WORKER.md`.
