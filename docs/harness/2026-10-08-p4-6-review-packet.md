# Packet: P4-6 delta review (gone fix round, reads and report, checkpoint per batch, gone rows expire)

Starting model: `bower-escalated` (Opus), fresh and read-only. This is the TL-P2-46 fallback until Codex is back on 2026-10-12. Counters: read only this packet, the rulings named here and the diffs, never workers' deliveries.

- **Diff:** `git diff 4d8191a..<SHA in your prompt> -- api runner src scripts`.
  - `runner-stops-when-gone` fix round: `e51d469` (the token route answers 410 on revoked or unreadable access).
  - `runner-reads-and-report`: `94f5a2f`.
  - `checkpoint-per-batch`: red `438e7bf`, code `daa67fe`, merge `569e566`.
  - `gone-ticket-rows-expire`: red `983f5cf`, code `3f27502`, test `c48706c`.
- **Contracts:** [TL-P4-04](2026-10-08-tl-p4-04-where-the-time-goes.md) with addenda 1 and 2, and [TL-P4-05](2026-10-08-tl-p4-05-c04-comparison-and-checkpoints.md) with addenda 1 and 2.
- **Look hardest at:**
  - **Checkpoint per batch (TL-P3-23, TL-P4-05).**
    - Kill at every point, mid-batch included: does reconcile give the same Drive state as an uninterrupted run?
    - On present, the op counts as landed and a person's later change is kept. On absent, the op is sent only if things are still as planned. On unreadable, the run stops honestly.
    - The stamp is the first 32 hex of sha256(run_id:op id). Is it written in the same request as the effect, overwritten and never accumulated? Is it under Drive's appProperties limits? Cite them.
    - Can a stamp from an older run or attempt be mistaken for this one?
    - Do the 5 changed tests keep their old protection?
    - It touches `src/data/drive/{fake-drive,drive-http}.ts`: is any app path changed?
  - **Reads and report.**
    - Is the plan identical, paging included, when notes change during the reads?
    - Does the report keep its barrier order (record, dispositions.json, last-run.json, then the read back)?
    - Does `src/data/spine` behave the same in the app?
  - **Gone rows.**
    - After Delete me, only {hash, expiresAt, attempt} is kept, with no run id or personal data.
    - Does the alarm prune them without breaking the shared recovery alarm (the 60 s dispatch look-up, phaseAt + 30 min)?
    - Is the hash compared in constant time?
    - Can a gone row let a wrong ticket in, or make a valid one get 401?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-6-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network beyond docs.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-6-review-notes.md`.
