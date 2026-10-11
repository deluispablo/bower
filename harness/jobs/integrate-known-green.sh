#!/usr/bin/env bash
# Integrate a branch, then close its entry known-green.
# usage: integrate-known-green.sh <branch> <entry> <message> <why>
set -uo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)" # the main checkout this script lives in
branch="$1"; entry="$2"; msg="$3"; why="$4"
bash "$repo/harness/integrate.sh" "$branch" > "/tmp/int-$branch.log" 2>&1; echo "int=$?"
tail -4 "/tmp/int-$branch.log"
bash "$repo/harness/done.sh" "$entry" "$msg" --known-green "$why" > "/tmp/done-$entry.log" 2>&1; echo "done=$?"
tail -6 "/tmp/done-$entry.log"
