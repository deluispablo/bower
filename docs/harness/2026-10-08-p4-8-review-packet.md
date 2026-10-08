# Packet: P4-8 delta review (placement check, fingerprint, Drive-call golden, second-brain method)

Starting model: `bower-escalated` (Opus), fresh and read-only. This is the TL-P2-46 fallback until Codex is back on 2026-10-12. Counters: read only this packet, the rulings named here and the diffs, never workers' deliveries.

- **Diff:** `git diff cd3af43..<SHA in your prompt> -- runner src harness/corpus`.
  - `placement-check`:
    - first round: red `057b8c9`, code `8be2059`;
    - fix round: red `1555652` (the corpus revert), code `5092e03`.
  - `fingerprint-normalised`: red `266c99c`, code `c339e50`.
  - `drive-calls-golden`: tests only, `0012203` and `7b76f00`.
  - `second-brain-method`: red `e20e8c3`, code `4ce0c68`; the rubric log is `2026-10-08-p4-method-rubric-changes.md`.
- **Contracts:**
  - [TL-P4-07](2026-10-08-tl-p4-07-c04-placement-regression.md), addenda 2 and 3;
  - [TL-P4-08](2026-10-08-tl-p4-08-second-brain-method.md);
  - the compatibility row for `5092e03` in `2026-10-07-p3-compatibility.md`.
- **Look hardest at:**
  - **Placement check.**
    - A new Area needs a responsibility phrase, and a new Project needs a rules line or a shown note. Can the check be bypassed, for example by a nested path, a case difference or a name near an existing folder?
    - Does the retry happen exactly once? Does a second refusal end the run as C12 does, never with a silent fallback?
    - Is the corpus byte-identical where the ruling says so?
    - Is the report's `area` text safe? It is the model's words shown on screen, so check its length, its markup and that it can't break the closed forms.
  - **The new op `asks`.**
    - Does the item stay in the Inbox untouched, with its question, while the rest of the run is processed?
    - Undo, recovery and checkpoints: is the op idempotent across a kill?
    - Does the app show the question (C11)?
  - **The instructions.**
    - Are they faithful to TL-P4-08 points 1–8?
    - Are they still bounded, with the data-not-instructions line kept and no vault content?
    - Does any line contradict the intent schema or placement-check?
  - **The rubric changes.** Each change must fix a contradiction with the method, not bend the corpus to fit the code.
  - **Fingerprint.** Is the normalisation too loose (for example `"id":"…"` inside note text), or too tight?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-8-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-8-review-notes.md`.
