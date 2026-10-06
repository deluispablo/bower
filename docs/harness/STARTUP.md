# Session startup

Token budget first ([TL-P2-41](2026-10-06-tl-p2-41-token-budget.md)): read only what your role needs.

1. **Orient.** Run `pwd`, `git status --short`, the branch, `git log --oneline -5` and `git worktree list`. Preserve any dirty work that is not yours.
2. **Read by role.**
   - Worker: [WORKER.md](WORKER.md) and your packet.
   - Coordinator: [HANDOFF.md](HANDOFF.md) and [ACTIVE.md](ACTIVE.md), plus `harness/briefs/coordinator.md` once per session.
   - Technical lead: [DECISIONS.md](DECISIONS.md) and `harness/briefs/technical-lead.md`.
3. **Ownership.** Write only where your assignment says. An unassigned session stays read-only and asks for an assignment.
4. **Init.** An assigned writer with its own checkout runs `bash harness/init.sh > /tmp/init.log 2>&1` and reads only the tail. Reviewers and evaluators do not run it.
5. **Report in up to five lines:** role, checkout and SHA, assignment, baseline result, next action.
