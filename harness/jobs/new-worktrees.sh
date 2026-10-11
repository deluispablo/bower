#!/usr/bin/env bash
# Create worktrees from claude/p3 and install dependencies offline.
# usage: new-worktrees.sh <branch>...
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)" # the main checkout this script lives in
for b in "$@"; do
  wt="${BOWER_WORKTREES:-/private/tmp}/bower-$b"
  git -C "$repo" worktree add -q -b "$b" "$wt" claude/p3
  pnpm -C "$wt" install --offline --frozen-lockfile > "/tmp/install-$b.log" 2>&1
  echo "$b: $(tail -1 /tmp/install-$b.log)"
done
