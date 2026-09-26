#!/usr/bin/env bash
# Hermetic check that agent/workflows/ingest.yml and lint.yml pass every
# instance-repo variable the runbook documents as going to the runner.
# Plain grep against the tracked workflow files: no network, no GitHub.
#
# Prints "ok <case>" per case and exits non-zero on the first failure,
# naming the missing variable and file.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORKFLOWS_DIR="$HERE/../../agent/workflows"

# Kept in sync with the "Secrets and variable the instance repo needs" table
# in docs/runbook.md (section 4): every name listed there as passed to
# run.sh must appear in both workflows' Run step env.
VARS=(
  BOWER_API_URL
  BOWER_API_KEY
  BOWER_MAX_TURNS
  BOWER_ALLOW_WEB
  CLAUDE_CODE_OAUTH_TOKEN
  ANTHROPIC_API_KEY
)

die() {
  echo "FAIL: $1" >&2
  exit 1
}

for file in ingest.yml lint.yml; do
  path="$WORKFLOWS_DIR/$file"
  [ -f "$path" ] || die "$file: not found at $path"
  for name in "${VARS[@]}"; do
    grep -q "$name" "$path" || die "$file: missing $name"
  done
  echo "ok $file passes every documented runner variable"
done

echo DONE
