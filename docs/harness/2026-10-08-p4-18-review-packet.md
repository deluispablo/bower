# Packet: P4-18 delta check (Home draws the Inbox first)

Starting model: `bower-escalated` (Opus), fresh and read-only. TL-P2-46 fallback until Codex is back on 2026-10-12. Read only this packet, the ruling named here and the diffs, never workers' deliveries.

- **Diff:** `git diff 658dda2..<SHA in your prompt> -- src e2e`. `home-inbox-first`: b6394af, 0032fff, 5d8dea6, red c6fc7c3, code 0514571, row 0bd9bf2.
- **Contract:** TL-P4-10 addendum 2 in DECISIONS.md: the Inbox renders from the listing first; the report and questions fill in after; Inbox within 3 s. AGENTS.md: errors never swallowed; every content write passes the modifiedTime it read.
- **Look hardest at:**
  - **What the person can press early.** The Inbox and Tidy up show from the listing before readiness is known. Can a press then start a run on a pile that the full read would hold (newer format, damaged, still arriving), or show a count that drops under the finger? Is the admission path unchanged (the Worker decides)?
  - **Shared reads.** Stored digests asked once and dispositions read together: can a failure in one poison the rest, or a stale digest pass a changed file? Concurrency bounded?
  - **The refresh that drops reads** (left out by the worker): is it safe, only slow?
  - **Layout.** Stopped and Away cards moved below the Inbox: copy and reading order still sensible on phone and desktop?
  - **The latency fake** (`live-shape.ts`, `pretend.ts`): kept out of demo and real sources?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-18-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-18-review-notes.md`.
