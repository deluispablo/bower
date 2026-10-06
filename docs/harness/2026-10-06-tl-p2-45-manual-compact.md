# Technical-lead decision TL-P2-2026-10-06-45: no self-clearing; the owner compacts

**Owner ruling, 2026-10-06:** sessions no longer clear themselves. The owner compacts the lead and the coordinator by hand when needed. This amends [TL-P2-43](2026-10-06-tl-p2-43-session-state.md) and rule 9 of [TL-P2-44](2026-10-06-tl-p2-44-enforced-token-method.md).

- **No session clears itself.** The lead and the coordinator never call the app's clear tool and never ask to be cleared. They keep working in the same session across batches.
- **State is still written.** At every batch boundary, after each ruling or delivery that changes what comes next, the lead updates `LEAD.md` and the coordinator updates `HANDOFF.md` and `ACTIVE.md`, and they commit them. A manual compaction, an interruption or a restart then loses nothing.
- **Compaction is the owner's.** When the owner compacts a session, it re-reads its own state file before acting again.
- **Short sessions by other means.** Messages stay at 10 lines or fewer, gate output goes to logs, and workers still run in fresh sessions for every fix round and climb (TL-P2-44 rules 4 and 7). The `CLAUDE_CODE_AUTO_COMPACT_WINDOW` backstop of TL-P2-44 rule 9 stays optional, at the owner's choice.
