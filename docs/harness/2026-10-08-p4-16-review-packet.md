# Packet: P4-16 delta check (no adoption of a person's Current state, Home reads once)

Starting model: `bower-escalated` (Opus), fresh and read-only. TL-P2-46 fallback until Codex is back on 2026-10-12. Read only this packet, the rulings named here and the diffs, never workers' deliveries.

- **Diff:** `git diff 5754d88..<SHA in your prompt> -- runner src`.
  - `state-no-adoption`: red `b485b75`, code `208ea5c`, compatibility row `3fb0d3d`.
  - `home-reads-once`: red `2568ed2`, code `624f8be`.
- **Contracts:** [TL-P4-10](2026-10-08-tl-p4-10-current-state-ownership.md) and its addendum in DECISIONS.md (point 2, adoption by md5, withdrawn: an unmarked Current state is the person's unless a rule grants it; a Bower write never adopts). AGENTS.md: every content write passes the modifiedTime it read.
- **Look hardest at:**
  - **Ownership.** Is there any remaining path where Bower rewrites a section it does not own (missing mark, a mark copied by a person, a note Bower made but the person edited, undo of a rewrite)? Is `bowerMd5` gone everywhere, and do files written with it still read?
  - **The fallback line.** Is it true and plain? It must not present the person's own lines as news ("New: One application open, …").
  - **Home reads.** Can the per-load share serve stale bytes to a later write (a write must pass the modifiedTime it read, never a cached one from before a change)? Does an in-flight failure poison later reads in the same load, or is any error swallowed? Is the per-load scope really per load (no cross-load cache hiding a person's change)?
  - **The golden.** Does it pin the live shape (declared pile, dispositions, changes) and fail on a duplicate read?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-16-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-16-review-notes.md`.
