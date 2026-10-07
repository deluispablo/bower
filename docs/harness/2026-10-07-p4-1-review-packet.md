# Packet: P4-1 delta review (corpus and Claude provider)

Starting model: `bower-escalated` (Opus), fresh and read-only. `claude-provider` adds a new external boundary that touches data safety ([TL-P4-01](2026-10-07-tl-p4-01-p4-start.md)), so it gets the TL-P2-46 fallback review until Codex is back on 2026-10-12. Counters: read only this packet, the P4-1 packet and the diffs, never workers' deliveries.

- **Diff:** `git diff 54a7548..<SHA in your prompt> -- runner harness/corpus`.
  - `claude-provider`: red `42658af`, code `7bff7c0`.
  - `p4-corpus`: red `02d8e22`, code `be43662`.
- **Contracts:** the TL-P4-01 rows and its addendum (speed baseline), and `2026-10-07-p4-1-packet.md`.
- **Look hardest at:**
  - **The permission policy.**
    - Do the spawn arguments really deny every Drive, write, shell and network tool, as the original's `agent/claude-settings.json` does?
    - Can the prompt or the context make Claude act outside the structured reply?
    - Cite the Claude Code settings docs.
  - **The token.**
    - Is it never in a log, an error, the timing line or a spawn argument? It must be in the environment only.
    - Is `tidy.yml` passing exactly one secret, with every action pinned by SHA?
  - **The reply.**
    - Is every malformed, out-of-schema or over-budget reply a truthful failure with no write?
    - The model returns a whole manifest, hashes included. Can a model-supplied hash or id make the spine write the wrong thing, or skip a still-as-seen check? Rate it, even though `provider-contract` (P4-2) takes it up.
  - **The timing line:** numbers and phase names only.
  - **The corpus.**
    - Is anything in it personal?
    - Are the five bench cases unchanged from the original?
    - Does the scorer fail on an assertion for each kind of unmet expectation?
- **Run:** single test files only, one at a time. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-1-review-notes.md`.
