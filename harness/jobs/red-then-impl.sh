#!/usr/bin/env bash
# Red repair (tests only) -> commit the test files -> continue the implementation on the retained diff.
# usage: red-then-impl.sh <worktree> <red prompt> <red effort> <red commit message> <impl prompt> <impl effort> <tag>
set -uo pipefail
wt="$1"; red_prompt="$2"; red_effort="$3"; red_msg="$4"; impl_prompt="$5"; impl_effort="$6"; tag="$7"
card() {
  grep '^{' "$1" | jq -rs '[.[]|select(.type=="item.completed" and .item.type=="agent_message")|.item.text]|last'
  grep '^{' "$1" | jq -rs '[.[]|select(.type=="turn.completed")|.usage]|last|[.input_tokens,.cached_input_tokens,.output_tokens]|tostring'
}
rm -rf "$wt/tmp-logs"
codex exec --json --sandbox workspace-write -C "$wt" -c "model_reasoning_effort=$red_effort" - < "$red_prompt" > "/tmp/codex-$tag-red.jsonl" 2>&1
echo "== $tag red exit=$?"; card "/tmp/codex-$tag-red.jsonl"
git -C "$wt" status --porcelain | grep -v tmp-logs
files=()
while IFS= read -r f; do files+=("$f"); done < <(git -C "$wt" status --porcelain | awk '{print $2}' | grep -E '(\.test\.tsx?$|^runner/test/|^harness/corpus/|^e2e/.*\.spec\.ts$|-notes\.md$)')
if [ "${#files[@]}" -gt 0 ]; then
  git -C "$wt" add -- "${files[@]}"
  git -C "$wt" commit -q -m "$red_msg

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && echo "red commit $(git -C "$wt" rev-parse --short HEAD)"
fi
git -C "$wt" status --porcelain | grep -v tmp-logs
rm -rf "$wt/tmp-logs"
codex exec --json --sandbox workspace-write -C "$wt" -c "model_reasoning_effort=$impl_effort" - < "$impl_prompt" > "/tmp/codex-$tag-impl.jsonl" 2>&1
echo "== $tag impl exit=$?"; card "/tmp/codex-$tag-impl.jsonl"
git -C "$wt" status --porcelain | grep -v tmp-logs
