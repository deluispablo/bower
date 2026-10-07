# Packet: P3-8 delta review (admission, quota, expiry, revision, in-flight vault)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: TL-P2-46 and TL-P3-16 fallback at the batch close. Admission and the folder step's guards are concurrency and data-safety work in the person object. Counters: read only this packet, the packets below and the diffs, never workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs** (read-only; no edits, commits, e2e or `pnpm check`):
  - the batch: `git diff 50108ab..<HEAD in your prompt> -- src api`;
  - per change: `555d672` (admission; stub `a84cee4`), `e7e3bae` (in-flight vault), `8c0f1c1` (client revision).
- **Contracts:**
  - [admission packet](2026-10-07-p3-8-admission-packet.md);
  - [status-revision packet](2026-10-07-p3-8-status-revision-packet.md);
  - [in-flight vault packet](2026-10-07-p3-8-inflight-vault-packet.md);
  - [TL-P3-15](2026-10-07-tl-p3-15-admission-and-revision.md);
  - the `/process` and `/status` rows of `docs/specs/2026-10-04-worker-contract.md`.
- **Look hardest at:**
  - **Admission:**
    - No `await` inside a section.
    - The order: expiry, requestId repeat, active run, quota, admit.
    - The quota counts only new runs and refuses with nothing written.
    - The revision rises on every runs write and on nothing else.
    - Expiry is written once.
    - The bounded history never drops the active run, or a run a live requestId still points to.
    - The v6→v7 migration.
    - Pruning quota rows.
    - The requestId validation.
  - **Client revision:**
    - No answer below the highest revision taken can replace state, in any reply order.
    - `start()` and `/status` interleaving.
    - Requiring `revision` on every reply.
    - The `refused` logic.
  - **In-flight vault:**
    - Every folder-step write carries and checks the generation inside its own SQL.
    - A refused write never leaves a half state.
    - Errors after a sign-out answer 401, not 500.
- **Run:** single unit test files only, one at a time. Reproductions go under `/private/tmp/p3-8-review/` in your own worktree, which you remove afterwards.
- **Reply:** the review card in `docs/harness/WORKER.md`.
