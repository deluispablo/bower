# Packet: P3-13 delta review (recovery without the browser, ordered status, runner routes)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: the TL-P2-46 and TL-P3-16 fallback at the batch close. A resumed run must never repeat an effect, a fenced-out attempt must never write, and status must be ordered across attempts; all three are data-safety and concurrency work. Counters: read only this packet, the packets below and the diffs, never workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs:** `git diff 7a96c5e..<HEAD in your prompt> -- src api runner scripts docs/specs`. Per change:
  - `186ddc3` (ordered status; red tests `b0ef53e`; Worker schema v9→v10, `run_ticket.report_phase`);
  - `a078625` (recovery; stub and red tests `30434d4`);
  - the `staging-runner-routes` commits named in your prompt.
- **Contracts:**
  - [TL-P3-23](2026-10-07-tl-p3-23-recovery-and-ordered-status.md);
  - TL-P3-19 with its amendment (the runner checks the attempt before every fenced write) in `docs/harness/DECISIONS.md`;
  - the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`;
  - the packets `2026-10-07-p3-13-recovery-packet.md`, `-ordered-status-packet.md` and `-runner-routes-packet.md`.
- **Look hardest at:**
  - **Ordered status.**
    - List every case `runnerReport` answers, with its code, and check each against the packet: a repeat; a later attempt behind the visible phase (200, recorded, no change); a lower `seq`; a backward phase within one attempt; an ended run; a superseded attempt; a retired ticket.
    - Does the revision rise only when phase, `total`, `failure` or the report changes?
    - Is the v9→v10 migration additive?
    - Do the fake's `ReportLedger` and the Worker really agree, or does the contract test only exercise a copy?
  - **Recovery.**
    - Can attempt 2 ever resend an operation that landed?
    - Does an unreadable read-back stop the run without a send?
    - Does the per-write attempt check close the old attempt's window entirely, or is there still a gap between the check and the write?
    - What does the extra token-route read per write cost against the Worker and Drive limits on a large run?
    - Are journal lines archived once and dispositions consistent after a resume?
  - **Routes.**
    - Does the test cover every route module and method, including ones added later?
    - Is `/runner/*` the only addition?
    - Should any Worker path also be in the service worker's `navigateFallbackDenylist` (`vite.config.ts`)?
- **Run:** single test files only, one at a time. Make reproductions in your own worktree under `/private/tmp/p3-13-review/`, and remove it afterwards.
- **Reply:** the review card in `docs/harness/WORKER.md`.
