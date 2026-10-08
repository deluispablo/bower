# Packet: P4-17 delta check (duplicates to the Bin, no duplicate fallback line)

Starting model: `bower-escalated` (Opus), fresh and read-only. TL-P2-46 fallback until Codex is back on 2026-10-12. Read only this packet, the rulings named here and the diffs, never workers' deliveries.

- **Diff:** `git diff c8b4313..<SHA in your prompt> -- runner src`.
  - `duplicate-by-hash`: red `6488613`, code `2cf38a4`, compatibility row `d854a39`.
  - `fallback-no-duplicate`: red `29f3fac`, code `8250e96`.
- **Contracts:** TL-P4-10 addendum 2 in DECISIONS.md: a thing with the same content hash as a filed file goes to the Drive Bin, reported "already saved as <name>", with no line and no note. AGENTS.md: never hard-delete; every move checks the name and place it read (`stillAsSeen`); errors never swallowed.
- **Look hardest at:**
  - **Data safety of the Bin.** Can a thing be binned whose twin is not really filed (the twin in the Bin, in the Inbox, in `.bower`, moved or deleted between listing and bin, a Google Doc or link with no md5, an empty file, a different file with the same name)? Is the original rechecked before the bin? Is the bin idempotent across a kill and resume, and is undo possible from the manifest?
  - **Within a pile.** Two identical things in one pile: one kept, one binned? Pile words and the pile note kept?
  - **The report and the app.** Is "already saved as <name>" a closed form the app reads safely? Older bundles: deploy together, as the row says?
  - **Questions.** Does a binned duplicate's open question close?
  - **Fallback dedup.** Can it drop a fallback whose news differs from the cited line (a different fact about the same thing)?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-17-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-17-review-notes.md`.
