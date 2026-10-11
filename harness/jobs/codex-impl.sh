#!/usr/bin/env bash
# One Codex implementation session on a worktree; prints the card and status.
# usage: codex-impl.sh <worktree> <prompt> <effort> <tag>
set -uo pipefail
wt="$1"; p="$2"; effort="$3"; tag="$4"
codex exec --json --sandbox workspace-write -C "$wt" -c "model_reasoning_effort=$effort" - < "$p" > "/tmp/codex-$tag.jsonl" 2>&1
echo "== $tag exit=$?"
grep '^{' "/tmp/codex-$tag.jsonl" | jq -rs '[.[]|select(.type=="item.completed" and .item.type=="agent_message")|.item.text]|last'
git -C "$wt" status --porcelain
