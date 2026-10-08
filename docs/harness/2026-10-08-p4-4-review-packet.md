# Packet: P4-4 delta review (admission reads, attempt check, dispatch retry)

Starting model: `bower-escalated` (Opus), fresh and read-only. This is the TL-P2-46 fallback until Codex is back on 2026-10-12. Counters: read only this packet, `2026-10-08-p4-4-packet.md` and the diffs, never workers' deliveries.

- **Diff:** `git diff fcb999a..<SHA in your prompt> -- api runner src/data`.
  - `attempt-check-light`: red `afde52c`, code `4ba075c`.
  - `admission-reads-cost`: red `41ba68d`, code `a0c06de`.
  - `dispatch-retry`: red `8e700c8`, code `f7e13f1`.
- **Contracts:** [TL-P4-04](2026-10-08-tl-p4-04-where-the-time-goes.md) and the P4-4 packet.
- **Look hardest at:**
  - **The attempt route.**
    - Is it authenticated exactly like the other runner routes (ticket, run id)?
    - Can it leak another person's run state?
    - Is 409 `stale-attempt` still returned before every fenced write?
    - Can a cached Drive token outlive a sign-out or a token-key rotation (TL-P3-26 F1)? What happens when Google revokes it mid-run?
  - **Admission reads.**
    - Is the manifest identical, including paging past one page and pile notes that change during the reads?
    - Is the bounded concurrency safe against Drive's rate limits? Cite them.
    - It touches `src/data/drive/drive-http.ts` and `drive-api.ts`, the app's own Drive client. Is any app path's behaviour changed?
  - **Dispatch retry.**
    - Can a retry create two Actions runs for one attempt (a network error after GitHub accepted)? How does the run name or the ticket make a duplicate harmless (R3, TL-P3-18)?
    - Is 4xx never retried?
    - Does the 60 s alarm keep the "attempt 1 redispatched once" rule?
    - Was the changed old test honest?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-4-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-4-review-notes.md`.
