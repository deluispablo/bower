#!/usr/bin/env bash
# Coordinator gates (check, e2e demo and fake on the named specs) beside a read-only Codex adversarial pass.
# usage: gates-and-pass.sh <worktree> <adversarial prompt> <tag> <e2e spec>...
set -uo pipefail
wt="$1"; prompt="$2"; tag="$3"; shift 3
specs=("$@")
out="/tmp/gates-$tag"; mkdir -p "$out"
rm -rf "$wt/tmp-logs"
codex exec --json --sandbox read-only -C "$wt" -c model_reasoning_effort=high - < "$prompt" > "/tmp/codex-$tag-adv.jsonl" 2>&1 &
adv=$!
pnpm -C "$wt" check > "$out/check.log" 2>&1; echo "check=$?"
pnpm -C "$wt" e2e "${specs[@]}" --reporter=line > "$out/e2e.log" 2>&1; echo "e2e=$?"
pnpm -C "$wt" e2e:fake "${specs[@]}" --reporter=line > "$out/e2e-fake.log" 2>&1; echo "e2e-fake=$?"
tail -2 "$out/e2e.log" "$out/e2e-fake.log"
grep -E 'FAIL|×| is a changed test|harness ok' "$out/check.log" | head -8
wait "$adv"; echo "adv-exit=$?"
grep "^{" "/tmp/codex-$tag-adv.jsonl" | jq -rs '[.[]|select(.type=="item.completed" and .item.type=="agent_message")|.item.text]|last' > "$out/adv.md"
cat "$out/adv.md"
grep "^{" "/tmp/codex-$tag-adv.jsonl" | jq -rs '[.[]|select(.type=="turn.completed")|.usage]|last|[.input_tokens,.cached_input_tokens,.output_tokens]|tostring'
