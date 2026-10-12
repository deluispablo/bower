#!/usr/bin/env bash
# Coordinator gates: check, then e2e demo and fake on the named specs.
# usage: gates.sh <worktree> <tag> <e2e spec>...
set -uo pipefail
# Clear browsers left by an interrupted gate before starting another.
pkill -f ms-playwright || true
pkill -f "headless.*[Cc]hrome|[Cc]hrome.*headless" || true
wt="$1"; tag="$2"; shift 2
specs=("$@")
out="/tmp/gates-$tag"; mkdir -p "$out"
rm -rf "$wt/tmp-logs"
pnpm -C "$wt" check > "$out/check.log" 2>&1; echo "check=$?"
pnpm -C "$wt" e2e "${specs[@]}" --reporter=line > "$out/e2e.log" 2>&1; echo "e2e=$?"
pnpm -C "$wt" e2e:fake "${specs[@]}" --reporter=line > "$out/e2e-fake.log" 2>&1; echo "e2e-fake=$?"
tail -2 "$out/e2e.log" "$out/e2e-fake.log"
grep -E 'FAIL|×| is a changed test|harness ok' "$out/check.log" | head -8
