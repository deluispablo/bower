# Packet: P4-13 delta review (drive-calls-cut)

Starting model: `bower-escalated` (Opus), fresh and read-only. This is the TL-P2-46 fallback until Codex is back on 2026-10-12. Counters: read only this packet, the rulings named here and the diff, never workers' deliveries.

- **Diff:** `git diff fd99ca3..<SHA in your prompt> -- runner src/data/drive` (red `9fec362`, code `f41e508`).
- **Contracts:**
  - [TL-P4-08](2026-10-08-tl-p4-08-second-brain-method.md) addendum 6: at least 40% fewer Drive calls; independent effects run with bounded concurrency; bowerOp stamps, per-effect stillAsSeen and the checkpoint barrier stay unchanged;
  - [TL-P4-05](2026-10-08-tl-p4-05-c04-comparison-and-checkpoints.md) addenda: checkpoint per batch and the bowerOp stamp;
  - TL-P3-23 recovery.
- **The worker states these trade-offs:**
  - one read now serves both an effect's check and the fence;
  - the fence reads a folder the run made only once per 3 s, so the window between that read and the write grows to at most 3 s;
  - after a send, the effect is read back from the write's own answer (Drive checksums);
  - earlier runners' operations run alone, in plan order.
- **Look hardest at:**
  - **The 3-second window.** Is it still within what TL-P4-05 and TL-P3-23 allow? Can a person's change in that window be overwritten?
  - **stillAsSeen.** Is it still checked per effect, against the modifiedTime the plan read, immediately before each write?
  - **Stale attempts.** Is 409 stale-attempt still returned before every fenced write (the attempt check)?
  - **Concurrency.** Only independent effects may overlap: a folder before what goes into it, and a note before a line that cites it.
    - Are writes really one at a time?
    - Can two effects on the same file or folder overlap?
  - **Read-back from the write's answer.** Does a missing checksum fall back to a real read, and is a mismatch honest?
  - **Kill at every step.** Does a run killed mid-pool still reconcile to the same Drive state? Which tests prove it?
  - **The test changes.** Each existing test edited on purpose (overhead, checkpoints, barrier, recovery, drive-v3 fake) must keep its protection.
  - **App paths.** `src/data/drive/drive-http.ts` gained one optional argument; is any app path changed?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-13-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-13-review-notes.md`.
