# Packet: P4-20 delta check (an answer applies at once)

Starting model: `bower-escalated` (Opus), fresh and read-only. TL-P2-46 fallback until Codex is back on 2026-10-12. Read only this packet, the rulings named here and the diffs, never workers' deliveries.

- **Diff:** `git diff f91eea1..<SHA in your prompt> -- api runner src e2e`. `ask-answer-loop`: red `adc533f`, code `517dc9b`, row `40593c3`, merge `33db41a`, C06 e2e `feccb15`.
- **Contracts:** TL-P4-08 addendum 8 in DECISIONS.md (the owner chose: an answer applies at once; stored with its question idempotently; admission takes a run scoped to the subject with the question and answer in the manifest; counts in the daily quota; waits while a run is active; a no or no-change closes with no run). TL-P4-11 (Worker subrequest budget 35). TL-P3-14 (rate limits). ask-one-per-thing (questions keyed by subject).
- **Look hardest at:**
  - **Idempotency and races.** Two devices answering, a double press, an answer racing a run's start or its end, a resumed run: one answer, one run, never two runs on one subject, never a lost answer.
  - **Scope.** Can a scoped run touch anything outside its subject (other piles, other notes)? Does it still honour held piles, ownership of Current state and duplicate-by-hash?
  - **Quota and budget.** Does an answer run count once? Can repeated answers burn the quota or exceed 35 subrequests per invocation?
  - **The model input.** Question and answer reach the model bounded and as data, not instructions (a person's free text cannot steer the run beyond its subject).
  - **Which yes triggers a run** (the worker's list in its notes): is q-state's "starts no run yet" honest in the app copy?
  - **Compatibility:** app, Worker and runner deploy together?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-20-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-20-review-notes.md`.
