#!/usr/bin/env bash
# Replace HANDOFF.md lines <first>-<last> (the Resume block) with a new block, then commit.
# usage: splice-handoff.sh <new block file> <first line> <last line>
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)" # the main checkout this script lives in
f="$repo/docs/harness/HANDOFF.md"
new="$1"; first="$2"; last="$3"
tmp=$(mktemp)
{ sed -n "1,$((first - 1))p" "$f"; cat "$new"; echo; sed -n "$((last + 1)),\$p" "$f"; } > "$tmp"
mv "$tmp" "$f"
git -C "$repo" add docs/harness/HANDOFF.md
git -C "$repo" commit -q -m "harness: HANDOFF resume

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
sed -n "1,$((first + 15))p" "$f"
