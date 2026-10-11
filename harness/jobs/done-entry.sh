#!/usr/bin/env bash
# Close an entry with --fixed-in <sha>.
# usage: done-entry.sh <entry> <message> <fix sha>
set -uo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)" # the main checkout this script lives in
bash "$repo/harness/done.sh" "$1" "$2" --fixed-in "$3" > "/tmp/done-$1.log" 2>&1; echo "done=$?"
tail -6 "/tmp/done-$1.log"
git -C "$repo" status --porcelain
