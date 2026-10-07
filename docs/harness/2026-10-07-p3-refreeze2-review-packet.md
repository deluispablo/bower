# Packet: P3 second re-freeze review (TL-P3-28 fixes)

Starting model: `bower-escalated` (Opus), fresh and read-only. This is a short delta review at the second re-freeze ([TL-P3-28](2026-10-07-tl-p3-28-c16-findings.md)). The first re-freeze review passed at cc28922. Counters: read only this packet, the fix packet and the diffs, never workers' deliveries.

- **Diffs:** `git diff cc28922..<frozen SHA in your prompt> -- src api runner`. Per change:
  - `40ec716`, `62fa8c5`: `rules-repair-existing-folder` (red `b8076e6`);
  - `c8c7908`, `f5ba996`: `home-sheet-and-focus` (red `747e8bb`);
  - `71ee4ad`: `runner-network-retry` (red `f038611`);
  - `1bef02d`: `save-timeout-honest` (red `c08a5ca`), and the test fix `f18397b`.
- **Contracts:** TL-P3-28 and `2026-10-07-p3-23-c16-fixes-packet.md`.
- **Look hardest at:**
  - **Rules repair (runner/src/rules-repair.ts).**
    - Is it byte-exact, fenced and still as seen?
    - It writes the text first and the mark second. Can a run that stops in between mark a file the person edited?
    - Can it ever touch the original app's plain `Rules.md` or an edited one?
  - **Network retry (runner/src/retry.ts and the adapters).**
    - Is only idempotent work retried?
    - Is the status report really idempotent by seq?
    - On a write's network error, is exactly one write sent?
    - A write that lands after its read-back is counted as not done. Can a later run then duplicate a file or a note? Rate the risk.
    - The exit code is non-zero only for a non-terminal end. Can it be wrong after `done`?
    - Three tests were changed (recovery "attempt 2 reconciles…", real-adapters "duplicate dispatch…cut mid-run", real.contract "browser close mid-run"). Were their changes honest?
  - **Save timeout (src/data/wait.ts).**
    - Does the 30 s bound plus body time ever cut a healthy resumable chunk upload?
    - Does a timeout always reach the lost-reply read-back, never a silent retry or a duplicate?
    - Stalled body reads are not bounded. Rate that.
  - **Home and focus.** The sheet shows a run's end only for a run it watched, plus an unseen failed run. Does anything that relied on the old behaviour now hide a result the person needs?
- **Run:** single test files only, one at a time. Never run the scripts, `wrangler`, `gh` or any network call.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters (TL-P3-29).
