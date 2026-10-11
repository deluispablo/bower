#!/usr/bin/env bash
# usage: disjoint.sh <owned file list> <worktree>...  — prints owned files that any worktree changes vs claude/p3.
set -uo pipefail
owned="$1"; shift
for wt in "$@"; do
  { git -C "$wt" diff --name-only claude/p3...HEAD; git -C "$wt" status --porcelain | awk '{print $2}'; } | sort -u > /tmp/disjoint-wt.txt
  hits=$(grep -Fxf "$owned" /tmp/disjoint-wt.txt)
  echo "$wt: ${hits:-disjoint}"
done
