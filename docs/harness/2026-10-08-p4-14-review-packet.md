# Packet: P4-14 delta check (admission subrequest budget, honest start error)

Starting model: `bower-escalated` (Opus), fresh and read-only. TL-P2-46 fallback until Codex is back on 2026-10-12. Read only this packet, the ruling named here and the diffs, never workers' deliveries.

- **Diff:** `git diff 6db97ce..<SHA in your prompt> -- api src e2e`.
  - `admission-subrequest-budget`: red `5764bd7`, code `718914a`.
  - `process-error-honest`: red `1ea7c5d`, code `b8fd381`, compatibility row `f676cc6`.
- **Contract:** [TL-P4-11](2026-10-08-tl-p4-11-admission-subrequest-budget.md) and its addendum's first points. Cloudflare free plan: 50 subrequests per invocation; budget 35.
- **Look hardest at:**
  - **The count.** Does the budget count every fetch of one `/process` invocation (token, listing pages, reads, dispatch), or can a path (retries, pagination, a refresh) spend more than counted? Can a folder still reach 50?
  - **Skipped pile notes.** A skipped note is treated as unread. Can that change the admission outcome or the manifest (a pile marked ready that is not, or a declared pile lost)? Is anything swallowed instead of a `BowerError`?
  - **The sheet.** After a failed start: is the Worker's sentence kept, does Try again start one run (no double dispatch on double press), and is busy reset on every path?
  - **Fake scenario `start-fails`.** Does it stay out of the demo and real sources?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-14-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-14-review-notes.md`.
