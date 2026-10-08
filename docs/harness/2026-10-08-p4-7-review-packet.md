# Packet: P4-7 delta review (checkpoint count, placement guidance, model input fingerprint)

Starting model: `bower-escalated` (Opus), fresh and read-only. This is the TL-P2-46 fallback until Codex is back on 2026-10-12. Counters: read only this packet, the ruling named here and the diffs, never workers' deliveries.

- **Diff:** `git diff a566241..<SHA in your prompt> -- runner harness/corpus`.
  - `checkpoint-count`: `99b030e`. Only `checkpoint-` records are timed as checkpoints.
  - `placement-guidance`: red `fa50169`, code `e8f4c8f`. The prompt's placement wording, plus the C04 rubric in `expected.json` and `corpus.ts`.
  - `model-input-fingerprint`: red `3ccfd78`, code `f1206f1`, tests `e5daaa4`.
- **Contract:** [TL-P4-07](2026-10-08-tl-p4-07-c04-placement-regression.md) with its addendum.
- **Look hardest at:**
  - **Placement wording.**
    - Is it faithful to the original's rules (`/Users/deluisp/Projects/bower/agent/prompts/ingest.md`, step "Decide the PARA destination"; read only)?
    - Does it contradict any other line of the prompt or the rules a person writes?
    - Could it push things that belong in an existing Area or Project into Resources?
  - **The scorer's `placement` rubric.**
    - Does it refuse Areas/Community garden with no link to the plot note?
    - Can a run pass by putting the files anywhere now that `present` no longer names the folder?
    - Do the other 28 corpus cases score as before?
  - **The fingerprint.**
    - Is the hash taken over the exact input sent?
    - Does nothing of the content reach the logs?
    - Is the golden normalisation too loose to catch a real change?
  - **The checkpoint count.** Is any real checkpoint write now untimed, and is the timing line still honest about where the time goes?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-7-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-7-review-notes.md`.
