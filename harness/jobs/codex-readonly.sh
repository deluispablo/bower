#!/usr/bin/env bash
# One read-only Codex session; writes its final message to <out>.
# usage: codex-readonly.sh <dir> <prompt> <effort> <out>
set -uo pipefail
dir="$1"; p="$2"; effort="$3"; out="$4"
codex exec --json --sandbox read-only -C "$dir" -c "model_reasoning_effort=$effort" -o "$out" - < "$p" > "$out.jsonl" 2>&1
echo "exit=$?"
cat "$out"
