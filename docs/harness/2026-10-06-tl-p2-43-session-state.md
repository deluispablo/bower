# Technical-lead decision TL-P2-2026-10-06-43: every session documents its own state

**Owner ruling, 2026-10-06:** each session must document its own state in the repository, so that nothing is lost when a session is cleared, compacted, interrupted or replaced. Together with [TL-P2-41](2026-10-06-tl-p2-41-token-budget.md) rule 8, this makes clearing sessions safe, and it is what lets a session clear itself automatically.

## Where each session keeps its state

| Session | State file(s) | Must hold |
| --- | --- | --- |
| Technical lead | [LEAD.md](LEAD.md), with [DECISIONS.md](DECISIONS.md) | Role, checkout, last deployed staging SHA, open owner questions, what it waits for, recurring duties |
| Coordinator | `HANDOFF.md` (5 KB or less) and `ACTIVE.md` (3 KB or less) | Exact resume state: integration SHA, running workers with their checkouts and models, queue, next batch, pending messages to the lead |
| Worker | Its committed candidate, and its delivery (15 lines or fewer) | SHAs, red→green evidence, gates, anything left out. Nothing important lives only in its chat |

## When to write it

- **At every batch boundary,** after each ruling or delivery that changes what comes next, and before any clear or compaction.
- **Committed and readable before the session clears.** A decision exists only once it is on `main` or the integration branch; a chat message is never the only record.

## Clearing sessions automatically

- **The coordinator.** At each batch boundary it updates `HANDOFF` and `ACTIVE`, commits them, then clears its own session with the app's session tool. It is in bypass mode, so this needs no approval. It resumes from `HANDOFF` and `ACTIVE`.
- **The lead.** It updates `LEAD.md` and `DECISIONS.md` after each major round of rulings, commits them, then clears itself with the same tool, which the owner approves. It resumes from `LEAD.md`.
- **Workers** end with their task, so they have nothing to clear.

Clearing is preferred to `/compact`, because only the owner can run `/compact`. Clearing is also cleaner when the state is already in the repository, and the owner can still restore a cleared conversation from "Resume previous session".

As a backstop, the owner can export `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50` in the shell before launching sessions. Its behaviour is unreliable in some versions, so it is optional.
