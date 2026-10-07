# Packet: P4-2 delta review (provider-contract, runner-overhead, corpus fix)

Starting model: `bower-escalated` (Opus), fresh and read-only. This is the TL-P2-46 fallback until Codex is back on 2026-10-12. Counters: read only this packet, the named packets and the diffs, never workers' deliveries.

- **Diff:** `git diff c98c378..<SHA in your prompt> -- runner src/data/spine harness/corpus`.
  - `provider-contract`: red `7eb51e9`, code `f9d2c90`;
  - `runner-overhead`: red `6bb5d80`/`dcc7005`, cuts `ba4593e`/`19da741`;
  - `p4-corpus` fix: red `1e33a4a`, fix `7c47836`.
- **Contracts:**
  - `2026-10-07-p4-2-provider-contract-packet.md`;
  - `2026-10-07-p4-2-runner-overhead-packet.md`;
  - the P4-1 review notes (`/private/tmp/p4-1-review-notes.md`);
  - the lead's rulings: no live model until `provider-contract` closes, and no to the two checkpoint cuts.
- **Look hardest at:**
  - **Admitted-only targets.**
    - Can any reply still move, bin or edit something not admitted: a folder, a note outside the plan, `Rules.md`, `.bower/`?
    - Are the hub-line and rule-wording exceptions narrow?
  - **Intent only.**
    - Do ids, hashes, digests and create keys all come from the runner?
    - Can a crafted place or name escape the folder (`..`, absolute paths, reserved names, `.bower`)?
  - **Settings isolation.**
    - Is `--setting-sources ""` plus an empty HOME and `CLAUDE_CONFIG_DIR` enough that no `CLAUDE.md`, memory or user settings load? Cite the docs.
    - The local `claude --help` (2.1.293) lists `--setting-sources`.
  - **The secret:** does it reach only the "Tidy up with Claude" step?
  - **Overhead cuts.**
    - Is the attempt fence still checked before every write?
    - Is still-as-seen kept?
    - Can a cached listing or token go stale within an attempt in a way that matters?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-2-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` model call or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-2-review-notes.md`.
