#!/usr/bin/env bash
# Hermetic check that agent/workflows/ingest.yml and lint.yml pass every
# instance-repo variable the runbook documents as going to the runner, and
# that only the model credential goes through the Run step's environment:
# the runner key and settings go through $RUNNER_TEMP/bower-secrets, written
# (mode 600) by a step before it (issue #258).
# Plain grep against the tracked workflow files: no network, no GitHub.
#
# Prints "ok <case>" per case and exits non-zero on the first failure,
# naming the missing variable and file.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORKFLOWS_DIR="$HERE/../../agent/workflows"

# Kept in sync with the "Secrets and variable the instance repo needs" table
# in docs/runbook.md (section 4): every name listed there as passed to
# run.sh must appear in both workflows.
VARS=(
  BOWER_API_URL
  BOWER_API_KEY
  BOWER_MAX_TURNS
  BOWER_ALLOW_WEB
  CLAUDE_CODE_OAUTH_TOKEN
  ANTHROPIC_API_KEY
)

# What run.sh reads from the settings file rather than its environment.
FILE_VARS=(
  BOWER_API_URL
  BOWER_API_KEY
  BOWER_MAX_TURNS
  BOWER_ALLOW_WEB
)

die() {
  echo "FAIL: $1" >&2
  exit 1
}

# step <file> <step name>: the lines of that step, up to the next step.
step() {
  awk -v want="      - name: $2" '
    /^      - name: / { inside = ($0 == want) }
    inside { print }' "$1"
}

for mode in ingest lint; do
  file="$mode.yml"
  path="$WORKFLOWS_DIR/$file"
  [ -f "$path" ] || die "$file: not found at $path"
  for name in "${VARS[@]}"; do
    grep -q "$name" "$path" || die "$file: missing $name"
  done
  echo "ok $file passes every documented runner variable"

  run_step=$(step "$path" "Run $mode")
  [ -n "$run_step" ] || die "$file: no 'Run $mode' step"
  run_env=$(printf '%s\n' "$run_step" | grep -Eo '^ {10}[A-Z][A-Z0-9_]*:' | tr -d ' :' |
    LC_ALL=C sort | tr '\n' ' ')
  [ "$run_env" = 'ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN ' ] ||
    die "$file: the Run step's env is [$run_env], expected only the model credential"
  echo "ok $file gives the Run step only the model credential"

  hand_off=$(step "$path" 'Hand the runner settings to run.sh')
  [ -n "$hand_off" ] || die "$file: no step writes the runner settings file"
  for name in "${FILE_VARS[@]}"; do
    printf '%s\n' "$hand_off" | grep -q "^ \{10\}$name: " || die "$file: settings step env lacks $name"
    printf '%s\n' "$hand_off" | grep -Fq "printf '$name=%s\n' \"\$$name\"" ||
      die "$file: settings step does not write $name"
  done
  printf '%s\n' "$hand_off" | grep -Fq '>"$RUNNER_TEMP/bower-secrets"' ||
    die "$file: settings step does not write \$RUNNER_TEMP/bower-secrets"
  printf '%s\n' "$hand_off" | grep -Fq 'umask 077' || die "$file: settings file not created private"
  printf '%s\n' "$hand_off" | grep -Fq 'chmod 600 "$RUNNER_TEMP/bower-secrets"' ||
    die "$file: settings file not mode 600"
  hand_off_line=$(grep -n '^      - name: Hand the runner settings to run.sh$' "$path" | cut -d: -f1)
  run_line=$(grep -n "^      - name: Run $mode\$" "$path" | cut -d: -f1)
  [ "$hand_off_line" -lt "$run_line" ] || die "$file: the settings step does not come before the Run step"
  echo "ok $file hands the runner settings over in a private file first"
done

echo DONE
