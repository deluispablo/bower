#!/usr/bin/env bash
# Merges a worker branch into the current branch only if the merged tree passes the check.
#  git merge --no-ff --no-commit <branch>, then `pnpm check` (output to a log under /tmp);
#  green: commit with the standard merge message, then remove the branch's worktree and branch (scripts/harness-git.mjs cleanup: protected list, dirty or busy worktrees kept); red: git merge --abort and print only the failures.
# Runs in the repository it is started in. INTEGRATE_CHECK replaces `pnpm check` (tests use a stub).
# usage: bash harness/integrate.sh <branch>
set -euo pipefail
branch=${1:-}
[ -z "$branch" ] && { echo "usage: integrate.sh <branch>"; exit 2; }
cd "$(git rev-parse --show-toplevel)"
[ -n "$(git status --porcelain --untracked-files=all)" ] && { echo "The tree has changes: commit or set them aside before merging $branch."; exit 1; }
git rev-parse --verify --quiet "$branch^{commit}" >/dev/null || { echo "No branch $branch."; exit 1; }
if ! git merge --no-ff --no-commit "$branch" >/dev/null 2>&1; then
  git merge --abort 2>/dev/null || true
  echo "$branch does not merge cleanly: nothing merged. Resolve it on the branch first."; exit 1
fi
if [ ! -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then echo "$branch has nothing new to merge."; exit 0; fi
# A changed or deleted test needs its tests-changed line before anything slow runs (one rule, in scripts/harness-rules.mjs).
if ! tampered=$(node "$(dirname "$0")/../scripts/check-harness.mjs" --tests-changed HEAD 2>&1); then
  git merge --abort
  echo "$tampered"; echo "$branch is not merged: add the lines to a notes file on the branch."; exit 1
fi
log=$(mktemp /tmp/integrate-check.XXXXXX)
# One lock for heavy runs, shared with done.sh (harness/with-lock.sh); its messages stay on the terminal.
if bash "$(dirname "$0")/with-lock.sh" bash -c 'bash -c "$2" >"$1" 2>&1' _ "$log" "${INTEGRATE_CHECK:-pnpm check}"; then
  git commit -q --no-edit && git log --oneline -1
  node "$(dirname "$0")/../scripts/harness-git.mjs" cleanup "$branch"
else
  git merge --abort
  { grep -E "FAIL|✗|×|AssertionError|error TS|Error:" "$log" | head -40; } || tail -20 "$log"
  echo "check failed: $branch is not merged (full log $log)"; exit 1
fi
