# Packet: c3-branch-cleanup (stage 3)

- **Entry:** `c3-branch-cleanup` (harness). Rulings: TL-P4-19 and its addendum 2 (DECISIONS; COORDINATION "Branch and worktree cleanup"). Defect `cleanup-removed-active-worktrees`. Worktree `/private/tmp/bower-c3-clean`, branch `c3-branch-cleanup` from `claude/p3`.
- **Starting model:** `bower-implementer` (Sonnet).
- **Live evidence:**
  - 274 local branches and 100 worktrees had piled up, because no step removed them.
  - The one-time pass then removed two active role worktrees, because "merged" was the only test.

## Contract

- **After a green merge,** `harness/integrate.sh` removes the merged branch's worktree with `git worktree remove` (never `--force`) and then runs `git branch -d <branch>`.
- **A dirty worktree** is kept, with a printed line; the branch then stays too.
- **Protected by name, whatever the merge state:** main, claude/p3, claude/tl-planning, claude/design, archive/\*, codex/\*, and the deploy worktree (`/private/tmp/bower-deploy`).
- **Protected by use:** any worktree with a running process (`lsof +D <path>`) or another session in it.
- **One home for the list:** one protected list in `scripts/harness-git.mjs`, or a small data file it reads, used by integrate.sh.

## Red

Fixture repos in temp dirs; never the real repos:

- "integrate removes a merged branch and its clean worktree"
- "a merged claude/design worktree survives integrate"
- "a worktree with a running process survives integrate" (start a `sleep` with its cwd there)

## Verify (exact, from features.json)

`pnpm exec vitest run src/harness-git.test.ts -t` with the three names above. Then `pnpm check` must be green.

## Checklist

- Every printed line is backed by a test.
- No real timers of 100 ms or more (timer gate).
- Commits: red, then fix, then notes in their own commit.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
