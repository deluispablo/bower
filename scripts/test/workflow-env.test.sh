#!/usr/bin/env bash
# Hermetic check that agent/workflows/ingest.yml and lint.yml pass every
# instance-repo variable the runbook documents as going to the runner, and
# that only the model credential goes through the Run step's environment:
# the run ticket and settings go through $RUNNER_TEMP/bower-secrets, written
# (mode 600) by a step before it (issue #258). The ticket comes from the
# Worker's dispatch, and no job that runs the agent holds BOWER_API_KEY: only
# lint.yml's `dispatch` job does (issue #259).
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
  BOWER_RUN_TICKET
  BOWER_MAX_TURNS
  BOWER_ALLOW_WEB
  CLAUDE_CODE_OAUTH_TOKEN
  ANTHROPIC_API_KEY
)

# What run.sh reads from the settings file rather than its environment.
FILE_VARS=(
  BOWER_API_URL
  BOWER_RUN_TICKET
  BOWER_MAX_TURNS
  BOWER_ALLOW_WEB
)

die() {
  echo "FAIL: $1" >&2
  exit 1
}

# job <file> <job name>: the lines of that job, up to the next job.
job() {
  awk -v want="  $2:" '
    /^  [A-Za-z0-9_-]+:$/ { inside = ($0 == want) }
    inside { print }' "$1"
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

  printf '%s\n' "$hand_off" |
    grep -Fq 'BOWER_RUN_TICKET: ${{ github.event.client_payload.ticket }}' ||
    die "$file: the run ticket does not come from the dispatch"
  printf '%s\n' "$hand_off" | grep -Fq 'echo "::add-mask::$BOWER_RUN_TICKET"' ||
    die "$file: the run ticket is not masked"
  echo "ok $file takes the run ticket from the dispatch, masked"
done

# No job that runs the agent holds the operator key (issue #259).
! grep -q 'BOWER_API_KEY' "$WORKFLOWS_DIR/ingest.yml" || die 'ingest.yml: mentions BOWER_API_KEY'
! grep -q 'workflow_dispatch' "$WORKFLOWS_DIR/ingest.yml" ||
  die 'ingest.yml: a manual run would have no ticket'
echo 'ok ingest.yml holds no BOWER_API_KEY'
lint_job=$(job "$WORKFLOWS_DIR/lint.yml" lint)
[ -n "$lint_job" ] || die "lint.yml: no 'lint' job"
! printf '%s\n' "$lint_job" | grep -q 'BOWER_API_KEY' || die "lint.yml: the 'lint' job mentions BOWER_API_KEY"
printf '%s\n' "$lint_job" | grep -Fq "if: github.event_name == 'repository_dispatch'" ||
  die "lint.yml: the 'lint' job runs on something other than the Worker's dispatch"
dispatch_job=$(job "$WORKFLOWS_DIR/lint.yml" dispatch)
printf '%s\n' "$dispatch_job" | grep -Fq 'BOWER_API_KEY: ${{ secrets.BOWER_API_KEY }}' ||
  die "lint.yml: the 'dispatch' job does not get BOWER_API_KEY"
printf '%s\n' "$dispatch_job" | grep -Fq '/runner/lint/dispatch' ||
  die "lint.yml: the 'dispatch' job does not call /runner/lint/dispatch"
! printf '%s\n' "$dispatch_job" | grep -q 'run.sh' || die "lint.yml: the 'dispatch' job runs the agent"
[ "$(grep -c 'secrets.BOWER_API_KEY' "$WORKFLOWS_DIR/lint.yml")" = 1 ] ||
  die 'lint.yml: BOWER_API_KEY is passed somewhere other than the dispatch job'
echo "ok lint.yml gives BOWER_API_KEY to the 'dispatch' job only"

echo DONE
