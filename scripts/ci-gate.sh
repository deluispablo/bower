#!/usr/bin/env bash
# The merge gate on GitHub Actions: pushes one sdd/batch-* branch to the private backup repository, waits for the
# gate workflow's run of that commit, prints the conclusion (and the tail of the failing log) and exits 0 only on success.
#
#   scripts/ci-gate.sh sdd/batch-N              push, wait, report
#   scripts/ci-gate.sh --cleanup sdd/batch-N    delete the remote branch after `sdd integrate`
#
# Only a name matching ^sdd/batch-[A-Za-z0-9._-]+$ is ever pushed, and never with a rewrite of history: no other branch,
# no tag. Each call keeps its own state, so two batches can be in flight. CI_GATE_POLL_SECONDS (default 10) and
# CI_GATE_POLL_TRIES (default 12) bound the wait for the run to appear. docs/runbook.md ("The CI gate") is the procedure.
set -euo pipefail

REPO=deluispablo/bower
usage() { echo "usage: ci-gate.sh sdd/batch-N | ci-gate.sh --cleanup sdd/batch-N" >&2; exit 2; }

cleanup=0
if [ "${1:-}" = "--cleanup" ]; then cleanup=1; shift; fi
[ $# -eq 1 ] || usage
branch=$1
[[ $branch =~ ^sdd/batch-[A-Za-z0-9._-]+$ ]] || { echo "Only branches named sdd/batch-<name> go to CI." >&2; exit 2; }

cd "$(dirname "$0")/.."

if [ "$cleanup" = 1 ]; then
  git push backup --delete "$branch"
  echo "ci-gate: deleted $branch from backup"
  exit 0
fi

sha=$(git rev-parse --verify "refs/heads/$branch")
git push backup "$branch"

# The run appears a few seconds after the push: look for it by workflow, branch and commit, a bounded number of times.
id=
for ((try = 1; try <= ${CI_GATE_POLL_TRIES:-12}; try++)); do
  id=$(gh run list --repo "$REPO" --workflow gate.yml --branch "$branch" --commit "$sha" --json databaseId,headSha \
    --jq ".[] | select(.headSha == \"$sha\") | .databaseId" 2>/dev/null | head -n 1) || id=
  [ -n "$id" ] && break
  sleep "${CI_GATE_POLL_SECONDS:-10}"
done
[ -n "$id" ] || { echo "No run of the gate found for $branch at ${sha:0:7}; look at the Actions tab." >&2; exit 1; }

log=$(mktemp)
trap 'rm -f "$log"' EXIT
watched=0
# Every poll reads each job: 30 s keeps two gates at once under the API limit (the default 3 s does not).
gh run watch "$id" --repo "$REPO" --exit-status --interval "${CI_GATE_WATCH_SECONDS:-30}" >"$log" 2>&1 || watched=$?
conclusion=$(gh run view "$id" --repo "$REPO" --json conclusion --jq .conclusion 2>/dev/null) || conclusion=
echo "ci-gate: $branch ${conclusion:-unknown} (run $id)"
if [ "$watched" = 0 ] && [ "$conclusion" = success ]; then exit 0; fi

(gh run view "$id" --repo "$REPO" --log-failed 2>&1 | tail -n 150) || echo "The failing log is not available; open run $id on GitHub." >&2
exit 1
