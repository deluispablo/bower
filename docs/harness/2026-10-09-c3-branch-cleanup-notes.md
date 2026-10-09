# c3-branch-cleanup notes

- Protected list: `PROTECTED_BRANCHES` and `PROTECTED_WORKTREES` in `scripts/harness-git.mjs` (read by `harness/integrate.sh` through `node scripts/harness-git.mjs cleanup <branch>`).
- After the green merge commit: `git worktree remove` (no force), then `git branch -d`. Printed lines, each tested: Removed, Kept (protected / changes / process running / not merged / checkout in use).
- In use = `lsof +D <path>` non-empty, or lsof missing (kept, safe side). Another session's cwd counts as a process.
- Sources: https://git-scm.com/docs/git-worktree#_commands, https://git-scm.com/docs/git-branch
- Left out: superseded unmerged branches (owner OK per TL-P4-19); no pass set.
