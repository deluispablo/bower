# Packet: P4-3 delta review (checkpoint cost and C04 incorporation)

Starting model: `bower-escalated` (Opus), fresh and read-only. This is the TL-P2-46 fallback until Codex is back on 2026-10-12. Counters: read only this packet, the two P4-3 packets and the diffs, never workers' deliveries.

- **Diff:** `git diff 57b9048..<SHA in your prompt> -- runner api/src src/data/spine harness/corpus`.
  - `runner-checkpoint-cost`: red `fcce87c`, code `b681161`.
  - `c04-incorporation`: red `5afe85c`, code `97ebefb`.
- **Contracts:**
  - [TL-P4-03](2026-10-08-tl-p4-03-first-model-run-and-p4-3.md);
  - `2026-10-08-p4-3-checkpoint-cost-packet.md`;
  - `2026-10-08-p4-3-c04-incorporation-packet.md`.
- **Look hardest at:**
  - **Checkpoints without a read-back.**
    - Does the write's own answer (checksum, `modifiedTime`) prove what the read-back proved?
    - What if Drive answers 200 but stores something else, or the answer is lost? Is the lost-reply reconcile still reached?
    - Do the kill-after-every-step tests still cover every step, and were any of them weakened? Check the diffs to `checkpoints.test.ts` and `recovery.test.ts`.
  - **Admission timing:** numbers only, no ids or paths in the log.
  - **The Claude Code cache:**
    - Is `actions/cache` pinned by SHA?
    - Is the key the version?
    - Can a poisoned cache from another branch reach this run? Cite the GitHub cache scoping docs.
  - **Content to the model.**
    - Are the bounds real, and is truncation marked?
    - Can extracted text or note text carry instructions that change what the runner does? The model only proposes; check that nothing in its text can widen what the spine writes.
    - Is `unpdf` 1.8.1 maintained, and does it run without native binaries?
  - **Note text from the model.**
    - Is it written only into Bower's sections, never the person's own?
    - Is it bounded, with no front-matter injection?
    - Are links validated?
    - The scripted provider's tests must be unchanged.
  - **Corpus PDFs remade:** were only C04 cases changed, never the five bench cases or `_bench-vault`?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-3-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-3-review-notes.md`.
