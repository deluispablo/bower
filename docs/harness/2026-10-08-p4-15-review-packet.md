# Packet: P4-15 delta check (one open question per thing)

Starting model: `bower-escalated` (Opus), fresh and read-only. TL-P2-46 fallback until Codex is back on 2026-10-12. Read only this packet, the ruling named here and the diffs, never workers' deliveries.

- **Diff:** `git diff 553e267..<SHA in your prompt> -- runner src`. `ask-one-per-thing`: red `b703f84`, code `c0c8dec`, compatibility row `b3012d1`.
- **Contract:** [TL-P4-11](2026-10-08-tl-p4-11-admission-subrequest-budget.md), the addendum on one open question per thing: an open question is keyed by its subject (fileId or pileId, plus the content hash for a re-upload), never its text; a later ask about the same subject adds nothing; when the thing leaves the inbox, its question closes on its own.
- **Look hardest at:**
  - **The key.** Can two different things share a key (two photos with the same bytes in different piles, an empty file's hash, a missing md5Checksum on a Google Doc or link)? Can one thing get two keys (pile ask plus thing ask)?
  - **Closing.** Does a question close only when its thing truly left the inbox (filed, binned, moved), never when a listing page or a read fails? Is a closed question ever reopened by the same thing?
  - **Answers in flight.** A question the person is answering (C11) when its thing leaves: is the answer lost silently?
  - **Compatibility.** Old `q-ask-<fileId>` questions without subject or hash: do they read, and close as the card says? Is the contract change additive for an older app bundle?
  - **Undo and recovery.** Is the question write idempotent across a kill and a checkpoint resume?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-15-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-15-review-notes.md`.
