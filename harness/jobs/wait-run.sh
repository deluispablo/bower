#!/usr/bin/env bash
# Wait for a runner run to finish, then print its duration and the runner's timing line.
# usage: wait-run.sh <owner/repo of the runner> <run id>
set -uo pipefail
gh_repo="$1"; id="$2"
gh run watch "$id" -R "$gh_repo" --exit-status > /dev/null 2>&1
gh run view "$id" -R "$gh_repo" --json status,conclusion,createdAt,updatedAt,startedAt
gh run view "$id" -R "$gh_repo" --log 2>/dev/null | grep -E 'timing:|reads=|Drive calls' | sed -E 's/^.*(timing:)/\1/' | head -5
