#!/usr/bin/env bash
# Bower runner: one agent run over one vault.
#
#   run.sh <vault_id> <ingest|lint>
#
# Fetches the vault's folder id and a 1 h Drive token from the API, syncs the
# vault down with rclone (configured only through environment variables),
# runs Claude Code inside it following the vault's own CLAUDE.md, copies the
# result back up, deletes from Drive only the pending originals the agent
# moved away, and reports the outcome to the API.
#
# Environment:
#   BOWER_API_URL            the Worker's origin, e.g. https://api.example.com
#   BOWER_API_KEY            the runner key (Authorization: Bearer)
#   CLAUDE_CODE_OAUTH_TOKEN  or ANTHROPIC_API_KEY; not needed when the API
#                            returns the user's own apiKey
#   BOWER_MAX_TURNS          optional; defaults to the API's maxTurns
#   RUNNER_TEMP              optional; set by GitHub Actions
#
# Requires bash, curl, jq, rclone and claude on PATH.
#
# The log carries timestamps, step names and counts only: never a file name,
# a path inside the vault, the agent's output or a credential. The agent's
# stdout stays in the work dir; its stderr and rclone's output go to private
# log files (see LOG_DIR below).
#
# Exit codes: 0 done, 2 failed (reported to the API when it is reachable).

set -euo pipefail

readonly ALLOWED_TOOLS='Read,Write,Edit,MultiEdit,Glob,Grep,LS,WebSearch,WebFetch,Bash(mv:*),Bash(mkdir:*),Bash(ls:*),Bash(cp:*),Bash(pandoc:*)'

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

usage() {
  printf 'usage: run.sh <vault_id> <ingest|lint>\n' >&2
  exit 2
}

[ "$#" -eq 2 ] || usage
VAULT_ID=$1
MODE=$2
case "$MODE" in
  ingest | lint) ;;
  *) usage ;;
esac

for name in BOWER_API_URL BOWER_API_KEY; do
  if [ -z "${!name:-}" ]; then
    log "missing environment variable $name"
    exit 2
  fi
done

AGENT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
readonly AGENT_DIR
readonly PROMPT_FILE="$AGENT_DIR/prompts/$MODE.md"
readonly API_BASE="${BOWER_API_URL%/}/runner/vaults/$VAULT_ID"
readonly RUN_ID="${GITHUB_RUN_ID:-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')}"

if [ -n "${RUNNER_TEMP:-}" ]; then
  WORK_DIR=$(mktemp -d "$RUNNER_TEMP/bower.XXXXXX")
  # Outside the work dir so the workflow can upload it on failure; GitHub
  # clears RUNNER_TEMP at the end of the job.
  LOG_DIR="$RUNNER_TEMP/bower-logs"
else
  WORK_DIR=$(mktemp -d)
  LOG_DIR="$WORK_DIR/logs"
fi
readonly WORK_DIR LOG_DIR
readonly VAULT_DIR="$WORK_DIR/vault"
readonly VAULT_JSON="$WORK_DIR/vault.json"
readonly PENDING_FILE="$WORK_DIR/pending.txt"
readonly AGENT_OUT="$WORK_DIR/agent.out"
readonly AGENT_ERR="$LOG_DIR/agent.err"
readonly RCLONE_LOG="$LOG_DIR/rclone.log"
mkdir -p "$VAULT_DIR" "$LOG_DIR"

STEP='start'   # the step in progress, named in any failure report
REPORTED=0     # 1 once a final state (done or failed) was reported
RUN_STARTED=0  # 1 once the agent may have changed the local copy

on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "$REPORTED" -eq 0 ]; then
    # An unexpected error that no explicit check caught.
    REPORTED=1
    copy_up_after_failure
    PROCESSED_JSON='' SUMMARY='' report failed "$STEP: unexpected error" >/dev/null 2>&1 || true
    log "failed at $STEP"
    rc=2
  fi
  rm -rf "$WORK_DIR"
  exit "$rc"
}
trap on_exit EXIT

# POST a status report. Values go into the payload through jq, never through
# the log. Every report carries the mode as its kind (ingest or lint), so the
# API keeps a lint apart from the user's ingest runs. Usage: report <state>
# [error]; reads PROCESSED_JSON and SUMMARY when set.
report() {
  local state=$1 error=${2:-}
  local args=(--arg state "$state" --arg kind "$MODE" --arg runId "$RUN_ID")
  [ -n "$error" ] && args+=(--arg error "$error")
  [ -n "${PROCESSED_JSON:-}" ] && args+=(--argjson processed "$PROCESSED_JSON")
  [ -n "${SUMMARY:-}" ] && args+=(--arg summary "$SUMMARY")
  jq -cn "${args[@]}" '$ARGS.named' |
    curl -fsS -X POST \
      -H "Authorization: Bearer $BOWER_API_KEY" \
      -H 'Content-Type: application/json' \
      --data-binary @- -o /dev/null "$API_BASE/status"
}

# Best effort after a failure: upload whatever the agent already wrote, with
# copy only (never deletes), so originals stay in the inbox.
copy_up_after_failure() {
  if [ "$RUN_STARTED" -eq 1 ]; then
    log "sync up (copy only)"
    rclone copy "$VAULT_DIR" vault: --exclude '.obsidian/**' >>"$RCLONE_LOG" 2>&1 ||
      log "sync up (copy only) failed"
  fi
}

# Report failed with a short error naming the step, then exit 2.
fail() {
  local error=$1
  REPORTED=1
  copy_up_after_failure
  PROCESSED_JSON='' SUMMARY='' report failed "$error" || log "report failed: API unreachable"
  log "failed: $error"
  exit 2
}

# Read one string field of the vault info; empty when absent or null.
field() { jq -r --arg k "$1" '.[$k] // empty' "$VAULT_JSON"; }

# --- fetch vault info -------------------------------------------------------
STEP='fetch vault info'
log "$STEP"
if ! http_code=$(curl -sS -o "$VAULT_JSON" -w '%{http_code}' \
  -H "Authorization: Bearer $BOWER_API_KEY" "$API_BASE"); then
  fail "$STEP: request failed"
fi
case "$http_code" in
  200) ;;
  409) fail "$STEP: Google access revoked, the user must sign in again" ;;
  *) fail "$STEP: HTTP $http_code" ;;
esac

FOLDER_ID=$(field folderId)
ACCESS_TOKEN=$(field driveAccessToken)
EXPIRES_AT=$(field expiresAt)
API_MAX_TURNS=$(field maxTurns)
USER_API_KEY=$(field apiKey)
if [ -z "$FOLDER_ID" ] || [ -z "$ACCESS_TOKEN" ] || [ -z "$EXPIRES_AT" ]; then
  fail "$STEP: incomplete answer"
fi

MAX_TURNS=${BOWER_MAX_TURNS:-$API_MAX_TURNS}
case "$MAX_TURNS" in
  '' | *[!0-9]*) fail "$STEP: max turns is not a number" ;;
esac

if [ -n "$USER_API_KEY" ]; then
  # The user's own key wins for this run.
  export ANTHROPIC_API_KEY="$USER_API_KEY"
  unset CLAUDE_CODE_OAUTH_TOKEN
elif [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  fail "$STEP: no Claude credentials"
fi

# rclone reads its remote "vault" from these variables; no config file.
export RCLONE_CONFIG_VAULT_TYPE=drive
export RCLONE_CONFIG_VAULT_SCOPE=drive
export RCLONE_CONFIG_VAULT_ROOT_FOLDER_ID="$FOLDER_ID"
RCLONE_CONFIG_VAULT_TOKEN=$(jq -cn --arg access_token "$ACCESS_TOKEN" \
  --arg token_type Bearer --arg expiry "$EXPIRES_AT" '$ARGS.named')
export RCLONE_CONFIG_VAULT_TOKEN
export RCLONE_CONFIG_VAULT_EXPORT_FORMATS=txt

# --- sync down --------------------------------------------------------------
STEP='sync down'
log "$STEP"
if ! rclone sync vault: "$VAULT_DIR" --exclude '.obsidian/**' >>"$RCLONE_LOG" 2>&1; then
  fail "$STEP: rclone failed"
fi

STEP='check rulebook'
if [ ! -f "$VAULT_DIR/CLAUDE.md" ]; then
  fail "$STEP: CLAUDE.md missing, not a Bower folder"
fi

# --- pending files ----------------------------------------------------------
# Everything in 0-Inbox/ and Clippings/ except processed originals, the
# folder notes (_*.md) and .gitkeep. Paths are relative to the vault.
STEP='list pending'
(
  cd "$VAULT_DIR"
  dirs=()
  for d in 0-Inbox Clippings; do
    [ -d "$d" ] && dirs+=("$d")
  done
  if [ "${#dirs[@]}" -gt 0 ]; then
    find "${dirs[@]}" -type f \
      ! -path '0-Inbox/Processed/*' ! -name '_*.md' ! -name '.gitkeep' |
      LC_ALL=C sort
  fi
) >"$PENDING_FILE"
PENDING_COUNT=$(grep -c . "$PENDING_FILE" || true)
# Only an ingest processes the pending files; a lint reports its summary
# without a processed list.
PROCESSED_JSON=''
if [ "$MODE" = ingest ]; then
  PROCESSED_JSON=$(jq -Rn '[inputs]' <"$PENDING_FILE")
fi
log "$PENDING_COUNT files pending"

if [ "$MODE" = ingest ] && [ "$PENDING_COUNT" -eq 0 ]; then
  STEP='report done'
  log "$STEP"
  if ! report done; then
    REPORTED=1
    log "report done failed: API unreachable"
    exit 2
  fi
  REPORTED=1
  exit 0
fi

# --- agent run --------------------------------------------------------------
STEP='report running'
log "$STEP"
if ! PROCESSED_JSON='' report running; then
  fail "$STEP: API unreachable"
fi

STEP='agent run'
log "$STEP"
PROMPT=$(cat "$PROMPT_FILE")
RUN_STARTED=1
set +e
(
  cd "$VAULT_DIR"
  claude -p "$PROMPT" --max-turns "$MAX_TURNS" --output-format text \
    --allowedTools "$ALLOWED_TOOLS" </dev/null
) >"$AGENT_OUT" 2>"$AGENT_ERR"
agent_rc=$?
set -e
if [ "$agent_rc" -ne 0 ]; then
  fail "$STEP: exit $agent_rc"
fi

# --- sync up ----------------------------------------------------------------
# copy never deletes. Then each file that was pending at the start and is gone
# from the local copy (the agent moved it to 0-Inbox/Processed/) is deleted
# from Drive by its own path, so processed originals leave the inbox. Nothing
# else is removed: a file added to Drive during the run stays.
STEP='sync up'
log "$STEP"
if ! rclone copy "$VAULT_DIR" vault: --exclude '.obsidian/**' >>"$RCLONE_LOG" 2>&1; then
  fail "$STEP: copy failed"
fi
RUN_STARTED=0  # the copy is done; a later failure needs no second copy
while IFS= read -r path <&3; do
  [ -n "$path" ] || continue
  [ ! -e "$VAULT_DIR/$path" ] || continue
  delete_rc=0
  rclone deletefile "vault:$path" </dev/null >>"$RCLONE_LOG" 2>&1 || delete_rc=$?
  # 4 is rclone's "file not found": someone removed it from Drive during the
  # run, so it is already gone.
  if [ "$delete_rc" -ne 0 ] && [ "$delete_rc" -ne 4 ]; then
    fail "$STEP: delete failed"
  fi
done 3<"$PENDING_FILE"

# --- report done ------------------------------------------------------------
STEP='report done'
log "$STEP"
SUMMARY=$(tail -n 5 "$AGENT_OUT")
if ! report done; then
  REPORTED=1
  log "report done failed: API unreachable"
  exit 2
fi
REPORTED=1
log "done"
