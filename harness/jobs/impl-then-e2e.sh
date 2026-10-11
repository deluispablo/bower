#!/usr/bin/env bash
# Codex implementation, then the coordinator's e2e run on the named pnpm script.
# usage: impl-then-e2e.sh <worktree> <prompt> <effort> <tag> <pnpm script>
set -uo pipefail
wt="$1"; prompt="$2"; effort="$3"; tag="$4"; script="$5"
rm -rf "$wt/tmp-logs"
codex exec --json --sandbox workspace-write -C "$wt" -c "model_reasoning_effort=$effort" - < "$prompt" > "/tmp/codex-$tag.jsonl" 2>&1; echo "impl-exit=$?"
jq -rs '[.[]|select(.type=="item.completed" and .item.type=="agent_message")|.item.text]|last' "/tmp/codex-$tag.jsonl"
jq -rs '[.[]|select(.type=="turn.completed")|.usage]|last|[.input_tokens,.cached_input_tokens,.output_tokens]|tostring' "/tmp/codex-$tag.jsonl"
git -C "$wt" status --porcelain
pnpm -C "$wt" "$script" > "/tmp/$tag-$script.log" 2>&1; echo "$script=$?"
grep -E '✓|✘|passed|failed' "/tmp/$tag-$script.log" | tail -20
