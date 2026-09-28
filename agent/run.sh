#!/usr/bin/env bash
# Bower runner: one agent run over one vault.
#
#   run.sh <vault_id> <ingest|lint>
#
# Fetches the vault's folder id and a 1 h Drive token from the API, syncs the
# vault down with rclone (configured only through environment variables),
# converts pending Office, HTML and EPUB files to Markdown with pandoc (for
# an ingest), asks Drive which inbox files the app itself wrote as
# instruction notes (see "instruction origin" below), pre-scans the pending
# text files for injection patterns and quarantines what is flagged, together
# with every instruction-shaped note the app did not write (agent/scan.sh,
# see "pre-scan" below) before Claude ever reads them, runs Claude Code inside it following the vault's
# own CLAUDE.md under the permission policy in claude-settings.json (next to
# this script), audits what the agent changed (see "post-run audit" below),
# moves in Drive itself each file the agent moved or renamed to an accepted
# place (a server-side move: the file keeps its Drive id and no copy stays at
# its old path), copies back up only the accepted files the agent added or
# changed and did not move (so a note edited in the app during the run keeps
# its newer content), deletes from Drive only the pending originals the agent
# moved to an accepted place that the move phase did not move, and reports
# the outcome to the API. Nothing else in Drive is ever deleted or moved.
#
# Settings, read from $RUNNER_TEMP/bower-secrets when that file exists (the
# instance workflows write it; see "runner settings" below), otherwise from
# the environment:
#   BOWER_API_URL            the Worker's origin, e.g. https://api.example.com
#   BOWER_RUN_TICKET         this run's ticket (Authorization: Bearer): the
#                            Worker minted it for this vault and this run
#                            only, and sent it in the repository_dispatch
#   BOWER_API_KEY            only without BOWER_RUN_TICKET: the operator key,
#                            for a local run or an instance repo whose
#                            workflows predate run tickets; the Worker takes
#                            it only while RUNNER_ACCEPT_LEGACY_KEY=1
#   BOWER_MAX_TURNS          optional; defaults to the API's maxTurns
#   BOWER_ALLOW_WEB          optional; the instance's switch: 1 lets the
#                            agent use WebSearch and WebFetch when the run
#                            allows them too, anything else (the default)
#                            denies them
#   BOWER_RUN_ALLOW_WEB      optional; the run's switch, from the user's
#                            "Let Bower look things up on the web" setting
#                            (the dispatch's allow_web): the web tools need
#                            this and BOWER_ALLOW_WEB both set to 1
#   BOWER_MAX_CHANGES        optional; the most files one run may add or
#                            change (default 200); above it nothing is saved
#   BOWER_REPORT_BACKOFF     optional; seconds the final report waits before
#                            its second try, twice that before its third
#                            (default 5)
#   BOWER_SCOPE              optional, ingest only; `all` (the default, a
#                            tidy-up) or `instructions` (a request's Do it
#                            now: only the instruction notes, see "list
#                            pending" below)
#
# Environment:
#   CLAUDE_CODE_OAUTH_TOKEN  or ANTHROPIC_API_KEY; not needed when the API
#                            returns the user's own apiKey
#   RUNNER_TEMP              optional; set by GitHub Actions
#
# Requires bash, curl, jq, rclone, pandoc, timeout (coreutils) and claude on
# PATH.
#
# `claude` itself runs under `env -i` with its own, smaller allow-list (see
# the comment above the agent run step): the Drive token, the run ticket and
# every BOWER_*/RCLONE_CONFIG_* value stay in this shell only.
#
# The log carries timestamps, step names and counts only: never a file name,
# a path inside the vault, the agent's output or a credential. The agent's
# stdout stays in the work dir; its stderr and rclone's output go to private
# log files (see LOG_DIR below).
#
# Exit codes: 0 done, 2 failed (reported to the API when it is reachable).

set -euo pipefail

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

# The run's own web switch (#374), handled like the settings below.
export -n BOWER_RUN_ALLOW_WEB

# --- runner settings --------------------------------------------------------
# A process's initial environment stays readable in /proc/<pid>/environ for
# its whole life, by anything running as the same user: the agent too, as a
# child of this shell. So the instance workflows do not put the run ticket
# (or any BOWER_* value) in this step's environment. A step before this one
# writes them to $RUNNER_TEMP/bower-secrets (mode 600, one NAME=value per
# line); they are read here into plain shell variables, never exported, and
# the file is deleted before anything else runs. Only the settings listed
# above are taken; any other line is ignored. Without the file (a local run,
# or an instance repo whose workflows predate it) the same names come from
# the environment, with a warning: the credential then sits in this shell's
# /proc entry for the whole run.
#
# Whichever way they come, the settings are un-exported first: a name that
# arrived in the environment (even empty, next to the file) would otherwise
# stay exported, and printf -v below would hand the file's value to every
# child's environment (curl, rclone, jq; issue #276).
export -n BOWER_API_URL BOWER_RUN_TICKET BOWER_API_KEY BOWER_MAX_TURNS BOWER_ALLOW_WEB BOWER_MAX_CHANGES BOWER_SCOPE BOWER_REPORT_BACKOFF
secrets_file="${RUNNER_TEMP:-}/bower-secrets"
if [ -n "${RUNNER_TEMP:-}" ] && [ -f "$secrets_file" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "${line%%=*}" in
      BOWER_API_URL | BOWER_RUN_TICKET | BOWER_API_KEY | BOWER_MAX_TURNS | BOWER_ALLOW_WEB | BOWER_MAX_CHANGES | BOWER_SCOPE | BOWER_REPORT_BACKOFF)
        printf -v "${line%%=*}" '%s' "${line#*=}"
        ;;
      BOWER_RUN_ALLOW_WEB)
        BOWER_RUN_ALLOW_WEB=${line#*=}
        ;;
    esac
  done <"$secrets_file"
  if ! rm -f "$secrets_file"; then
    log 'could not delete the runner settings file'
    exit 2
  fi
else
  log 'warning: no runner settings file, BOWER_* settings come from the environment'
fi
unset secrets_file line

# Everything in 0-Inbox/ and Clippings/ is untrusted text (clipped web pages,
# forwarded files), so by default the agent gets no tool that reaches the
# network: a prompt-injected note must not be able to send vault content out.
# Bash is limited to mv, mkdir and ls. pandoc is not an agent tool (it takes
# a URL as input, a way out) and neither is cp (it can copy /proc/self/environ
# or any other file on the runner into the vault): documents are converted by
# this script before the agent runs (see "convert documents" below). The web
# tools come back only when both switches say yes: the instance opts in with
# BOWER_ALLOW_WEB=1 and the user turned on "Let Bower look things up on the
# web", which reaches this run as BOWER_RUN_ALLOW_WEB=1 (#374). That is the
# one way a run can reach the network. The deny list wins over any allow
# rule, including one in a settings file inside the vault.
readonly BASE_TOOLS='Read,Write,Edit,MultiEdit,Glob,Grep,LS,Bash(mv:*),Bash(mkdir:*),Bash(ls:*)'
readonly WEB_TOOLS='WebSearch,WebFetch'
readonly NETWORK_COMMANDS='Bash(curl:*),Bash(wget:*)'
if [ "${BOWER_ALLOW_WEB:-}" = 1 ] && [ "${BOWER_RUN_ALLOW_WEB:-}" = 1 ]; then
  readonly ALLOWED_TOOLS="$BASE_TOOLS,$WEB_TOOLS"
  readonly DISALLOWED_TOOLS="$NETWORK_COMMANDS"
else
  readonly ALLOWED_TOOLS="$BASE_TOOLS"
  readonly DISALLOWED_TOOLS="$WEB_TOOLS,$NETWORK_COMMANDS"
fi

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

if [ -z "${BOWER_API_URL:-}" ]; then
  log "missing setting BOWER_API_URL"
  exit 2
fi
# The one credential sent to the Worker: this run's ticket. The operator key
# is only a fallback for a local run or an old instance repo, and works only
# while the Worker's transition flag is on.
if [ -n "${BOWER_RUN_TICKET:-}" ]; then
  API_CREDENTIAL=$BOWER_RUN_TICKET
elif [ -n "${BOWER_API_KEY:-}" ]; then
  log 'warning: no run ticket, using the operator key (needs RUNNER_ACCEPT_LEGACY_KEY=1 on the Worker)'
  API_CREDENTIAL=$BOWER_API_KEY
else
  log "missing setting BOWER_RUN_TICKET"
  exit 2
fi
unset BOWER_RUN_TICKET BOWER_API_KEY
readonly API_CREDENTIAL

MAX_CHANGES=${BOWER_MAX_CHANGES:-200}
case "$MAX_CHANGES" in
  '' | *[!0-9]*)
    log "BOWER_MAX_CHANGES is not a number"
    exit 2
    ;;
esac
readonly MAX_CHANGES

REPORT_BACKOFF=${BOWER_REPORT_BACKOFF:-5}
case "$REPORT_BACKOFF" in
  '' | *[!0-9]*)
    log "BOWER_REPORT_BACKOFF is not a number"
    exit 2
    ;;
esac
readonly REPORT_BACKOFF

# The Worker sends `all` or `instructions` and refuses anything else; an
# empty value (an instance repo whose ingest.yml predates the setting, or a
# lint, which has none) is a tidy-up.
SCOPE=${BOWER_SCOPE:-all}
case "$SCOPE" in
  all | instructions) ;;
  *)
    log "BOWER_SCOPE is not all or instructions"
    exit 2
    ;;
esac
readonly SCOPE

AGENT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
readonly AGENT_DIR
readonly PROMPT_FILE="$AGENT_DIR/prompts/$MODE.md"
readonly SETTINGS_FILE="$AGENT_DIR/claude-settings.json"
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
readonly MANIFEST_BEFORE="$WORK_DIR/manifest-before.txt"
readonly MANIFEST_AFTER="$WORK_DIR/manifest-after.txt"
readonly CHANGED_FILE="$WORK_DIR/changed.txt"
readonly REFUSED_FILE="$WORK_DIR/refused.txt"
# The move phase's files (see find_moves and move_up below): the moves found
# ("<old path><TAB><new path>"), the old and new paths Drive moved, and what
# is left to copy up.
readonly MOVES_FILE="$WORK_DIR/moves.txt"
readonly MOVED_OLD="$WORK_DIR/moved-old.txt"
readonly MOVED_NEW="$WORK_DIR/moved-new.txt"
readonly UPLOAD_FILE="$WORK_DIR/upload.txt"
readonly FLAGGED_FILE="$WORK_DIR/flagged.txt"
readonly QUARANTINED_FILE="$WORK_DIR/quarantined.txt"
# The instruction-origin step's files: in the work dir, never in the vault,
# so the model never sees them.
readonly CANDIDATES_FILE="$WORK_DIR/instruction-candidates.txt"
readonly DRIVE_LIST_JSON="$WORK_DIR/instruction-listing.json"
readonly INSTRUCTIONS_FILE="$WORK_DIR/instruction-notes.txt"
readonly UNLISTED_FILE="$WORK_DIR/instruction-unlisted.txt"
readonly SAVED_KEYS="$WORK_DIR/saved-keys.txt"
readonly PRE_RUN_DIR="$WORK_DIR/pre-run"
readonly AGENT_OUT="$WORK_DIR/agent.out"
readonly AGENT_ERR="$LOG_DIR/agent.err"
readonly RCLONE_LOG="$LOG_DIR/rclone.log"
readonly PANDOC_LOG="$LOG_DIR/pandoc.log"
readonly DRIVE_LOG="$LOG_DIR/drive.log"
readonly DRIVE_FILES_URL='https://www.googleapis.com/drive/v3/files'
mkdir -p "$VAULT_DIR" "$LOG_DIR"

# System and sync files (desktop.ini, Thumbs.db, ~$Offer.docx, ...) are never
# downloaded, uploaded, deleted, read, filed, moved or listed (#581). One list,
# used twice: as an rclone filter file on every rclone call, and as find tests
# that keep them out of the manifest and the pending list. The patterns mirror
# SYSTEM_FILE_PATTERNS in app/src/vault-index.ts: keep the two in step.
# Matching is case-insensitive (--ignore-case, -iname).
readonly SYSTEM_FILTER_FILE="$WORK_DIR/system-files.filter"
{
  printf '%s\n' '- desktop.ini' '- Thumbs.db' '- ehthumbs.db' '- .DS_Store'
  # Icon plus a carriage return: a character class, because a bare CR at the
  # end of a line would be read as a line ending.
  printf '%s\n' '- Icon[\r]' '- ~$*' '- .~lock.*#' '- .tmp.driveupload/**'
} >"$SYSTEM_FILTER_FILE"
readonly RCLONE_FILTER=(--filter-from "$SYSTEM_FILTER_FILE" --ignore-case)
readonly SYSTEM_FIND_TESTS=(
  ! -iname desktop.ini ! -iname Thumbs.db ! -iname ehthumbs.db ! -iname .DS_Store
  ! -iname $'Icon\r' ! -iname '~$*' ! -iname '.~lock.*#'
  ! -ipath '*/.tmp.driveupload/*' ! -ipath '.tmp.driveupload/*'
)

STEP='start'   # the step in progress, named in any failure report
REASON=''      # the failure's reason for people, set by fail() (see there)
REPORTED=0     # 1 once a final state (done or failed) was reported
RUN_STARTED=0  # 1 once the agent may have changed the local copy
REFUSED_JSON=''      # the audit's refused paths, a JSON array, once it ran
QUARANTINED_JSON=''  # the pre-scan's quarantined paths, a JSON array, once it ran
TOO_MANY_CHANGES=0   # 1 when the audit refused the whole run
RULES_WRITABLE=0     # 1 once an instruction note the app wrote reaches the agent

on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "$REPORTED" -eq 0 ]; then
    # An unexpected error that no explicit check caught.
    REPORTED=1
    copy_up_after_failure
    REASON=unknown
    write_outcome failed "$(failed_sentence)" >/dev/null 2>&1 || true
    PROCESSED_JSON='' SUMMARY='' report_final failed "$STEP: unexpected error" >/dev/null 2>&1 || true
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
  [ -n "$REASON" ] && args+=(--arg reason "$REASON")
  [ -n "${PROCESSED_JSON:-}" ] && args+=(--argjson processed "$PROCESSED_JSON")
  [ -n "${SUMMARY:-}" ] && args+=(--arg summary "$SUMMARY")
  [ -n "$REFUSED_JSON" ] && args+=(--argjson refused "$REFUSED_JSON")
  [ -n "${QUARANTINED_JSON:-}" ] && args+=(--argjson quarantined "$QUARANTINED_JSON")
  jq -cn "${args[@]}" '$ARGS.named' |
    curl -fsS -X POST \
      -H "Authorization: Bearer $API_CREDENTIAL" \
      -H 'Content-Type: application/json' \
      --data-binary @- -o /dev/null "$API_BASE/status"
}

# The final report (done or failed), tried up to three times: a report lost
# to a passing network or Worker error would otherwise leave the run
# "running" in the app until the Worker gives up on it (#315). Waits
# REPORT_BACKOFF seconds before the second try and twice that before the
# third. Usage: report_final <state> [error], like report.
report_final() {
  local attempt delay=$REPORT_BACKOFF
  for attempt in 1 2 3; do
    if report "$@"; then
      return 0
    fi
    [ "$attempt" -lt 3 ] || break
    log "report $1: try $attempt failed, trying again in ${delay}s"
    sleep "$delay"
    delay=$((delay * 2))
  done
  return 1
}

# One sentence for people about a failed run, by its reason (#375); the app
# says the same (app/src/run-failure.ts). Without a reason: unknown.
failed_sentence() {
  case "${REASON:-unknown}" in
    drive_unavailable) echo 'Google Drive stopped answering half way through copying things back.' ;;
    timeout) echo 'The tidy-up took too long and was stopped.' ;;
    model_unavailable) echo 'Claude was not available, so nothing could be read.' ;;
    vault_changed) echo 'Your Bower folder changed while Bower was working in it.' ;;
    *) echo 'Something went wrong before Bower could finish.' ;;
  esac
}

# The number of non-empty lines of file $1, 0 when it does not exist.
count_lines() {
  if [ -f "$1" ]; then
    grep -c . "$1" || true
  else
    echo 0
  fi
}

# Best effort, ingest only: writes the run's outcome into the vault in Drive,
# so the app can read it even when the Worker never heard back (#315):
# .bower/last-run.json ({ state, kind, runId, finishedAt, processed,
# quarantined, refused, sentence, and reason when failed }) and one line
# appended to the log.md Drive holds now (fetched afresh, so neither an
# edit made during the run nor a change the audit refused is overwritten).
# Counts only, never a name. A failure here is logged and never fails the
# run. Usage: write_outcome <done|failed> <sentence>.
write_outcome() {
  [ "$MODE" = ingest ] || return 0
  local state=$1 sentence=$2 dir="$WORK_DIR/outcome" processed quarantined refused
  local args=() pending_now="$WORK_DIR/pending-after-scan.txt"
  # No Drive access yet (the run stopped before the vault info): nowhere to write.
  [ -n "${RCLONE_CONFIG_VAULT_TOKEN:-}" ] || return 0
  [ -f "$pending_now" ] || pending_now=$PENDING_FILE
  processed=$(count_lines "$pending_now")
  quarantined=$(count_lines "$QUARANTINED_FILE")
  refused=$(count_lines "$REFUSED_FILE")
  if [ "$state" = failed ] || [ "$TOO_MANY_CHANGES" -eq 1 ]; then
    processed=0
  fi
  rm -rf "$dir" && mkdir -p "$dir/.bower" || return 0
  args=(--arg state "$state" --arg kind "$MODE" --arg runId "$RUN_ID"
    --arg finishedAt "$(date -u +%FT%TZ)" --arg sentence "$sentence"
    --argjson processed "$processed" --argjson quarantined "$quarantined"
    --argjson refused "$refused")
  [ "$state" != failed ] || args+=(--arg reason "${REASON:-unknown}")
  if ! jq -cn "${args[@]}" '$ARGS.named' >"$dir/.bower/last-run.json"; then
    log "outcome not written"
    return 0
  fi
  echo '.bower/last-run.json' >"$dir/files.txt"
  if rclone copyto vault:log.md "$dir/log.md" --retries 1 --low-level-retries 2 \
    "${RCLONE_FILTER[@]}" </dev/null >>"$RCLONE_LOG" 2>&1; then
    echo "- $(date -u '+%F %H:%M') · Tidy-up $state · $sentence ($processed filed, $quarantined set aside, $refused refused)" >>"$dir/log.md"
    echo 'log.md' >>"$dir/files.txt"
  fi
  if ! rclone copy "$dir" vault: --files-from-raw "$dir/files.txt" --retries 1 \
    --low-level-retries 2 "${RCLONE_FILTER[@]}" </dev/null >>"$RCLONE_LOG" 2>&1; then
    log "outcome not saved to Drive"
  fi
}

# Print one "<checksum> <size> <path>" line per file of the local copy,
# .obsidian/ and .claude/ excluded, sorted bytewise; paths are relative to the
# vault. cksum is POSIX and reads content, so an edit is seen whatever its
# mtime. Leaving .claude/ out means nothing in it is ever uploaded: not the
# permission policy copied in before the run, not anything the agent writes
# there.
manifest() {
  (
    cd "$VAULT_DIR" &&
      find . -type f ! -path './.obsidian/*' ! -path './.claude/*' \
        "${SYSTEM_FIND_TESTS[@]}" -exec cksum {} + |
      sed 's|^\([0-9]* [0-9]*\) \./|\1 |' |
        LC_ALL=C sort
  )
}

# The places a run may write to: the PARA folders, the inboxes, Answers/ and
# the few root notes the rulebook maintains. CLAUDE.md and README.md are
# deliberately not here (the rulebook is protected: the owner's own rules go
# to Rules.md), and neither is anything else at the vault's root.
in_known_root() {
  case "$1" in
    0-Inbox/* | 1-Projects/* | 2-Areas/* | 3-Resources/* | 4-Archives/* | \
      Answers/* | Clippings/*) return 0 ;;
    Rules.md | About-Me.md | index.md | log.md | 'Lint Report.md') return 0 ;;
    # The run's outcome for the app (#315), which run.sh writes itself.
    .bower/*) return 0 ;;
  esac
  return 1
}

# Whether the agent may add or change this path: inside the known roots, but
# never a CLAUDE.md at any depth (Claude Code loads a nested one as memory in
# every later run), and Rules.md, which the rulebook includes with the last
# word, only in a run whose agent was given an instruction note the app wrote
# (RULES_WRITABLE, set after the pre-scan). Otherwise one injected note could
# plant a standing "rule" in an ordinary ingest (issue #263).
may_write() {
  case "$1" in
    CLAUDE.md | */CLAUDE.md) return 1 ;;
    Rules.md) [ "$RULES_WRITABLE" -eq 1 ] || return 1 ;;
  esac
  in_known_root "$1"
}

# Before the run: keep a copy of every file the audit may have to put back:
# those outside the known roots (CLAUDE.md and README.md among them),
# Rules.md and any nested CLAUDE.md. Whether Rules.md may change is not
# known yet at this point, so it is always kept.
keep_pre_run_copy() {
  local path
  while IFS= read -r path; do
    case "$path" in
      Rules.md | */CLAUDE.md) ;;
      *) in_known_root "$path" && continue ;;
    esac
    mkdir -p "$PRE_RUN_DIR/$(dirname "$path")" &&
      cp -p "$VAULT_DIR/$path" "$PRE_RUN_DIR/$path" || return 1
  done < <(cut -d ' ' -f 3- "$MANIFEST_BEFORE")
}

# Post-run audit. Lists the files that are new or changed since
# MANIFEST_BEFORE was taken and decides what may be uploaded:
# - more than MAX_CHANGES of them: nothing is (refused ["*"]);
# - otherwise each one the agent may not write (may_write above: outside the
#   known roots, a CLAUDE.md at any depth, or Rules.md in a run without an
#   instruction note) is refused and reverted in the local copy (put back
#   from the pre-run copy, or removed when it is new), and the rest is
#   accepted.
# Writes the accepted paths to CHANGED_FILE, sets REFUSED_JSON and
# TOO_MANY_CHANGES. Logs counts only.
audit() {
  manifest >"$MANIFEST_AFTER" || return 1
  LC_ALL=C comm -13 "$MANIFEST_BEFORE" "$MANIFEST_AFTER" |
    cut -d ' ' -f 3- >"$WORK_DIR/all-changed.txt" || return 1
  local count path
  count=$(grep -c . "$WORK_DIR/all-changed.txt" || true)
  log "$count files changed"
  : >"$CHANGED_FILE"
  : >"$REFUSED_FILE"
  if [ "$count" -gt "$MAX_CHANGES" ]; then
    TOO_MANY_CHANGES=1
    REFUSED_JSON='["*"]'
    log "more than $MAX_CHANGES files changed: nothing saved"
    return 0
  fi
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if may_write "$path"; then
      printf '%s\n' "$path" >>"$CHANGED_FILE"
      continue
    fi
    printf '%s\n' "$path" >>"$REFUSED_FILE"
    if [ -f "$PRE_RUN_DIR/$path" ]; then
      cp -p "$PRE_RUN_DIR/$path" "$VAULT_DIR/$path" || return 1
    else
      rm -f "$VAULT_DIR/$path" || return 1
    fi
  done <"$WORK_DIR/all-changed.txt"
  REFUSED_JSON=$(LC_ALL=C sort "$REFUSED_FILE" | jq -Rn '[inputs]') || return 1
  log "$(grep -c . "$REFUSED_FILE" || true) changes refused"
}

# After the audit: records the "<checksum> <size>" of every file Drive holds
# after the upload as far as this run knows (the accepted ones plus those
# nobody changed), for the pending-original deletes; none when the whole run
# was refused.
record_saved_keys() {
  : >"$SAVED_KEYS"
  [ "$TOO_MANY_CHANGES" -eq 0 ] || return 0
  {
    awk 'FILENAME == ARGV[1] { up[$0] = 1; next }
      { p = $0; sub(/^[^ ]* [^ ]* /, "", p); if (p in up) print $1 " " $2 }' \
      "$CHANGED_FILE" "$MANIFEST_AFTER" &&
      LC_ALL=C comm -12 "$MANIFEST_BEFORE" "$MANIFEST_AFTER" | cut -d ' ' -f 1-2
  } | LC_ALL=C sort -u >"$SAVED_KEYS"
}

# Copies up, never deleting, the paths listed in file $1, so a note edited in
# Drive during the run (for example from the app) is not overwritten by the
# older local copy. --files-from-raw reads each line as a path as is (no
# comment or whitespace handling).
copy_up() {
  [ -s "$1" ] || return 0
  rclone copy "$VAULT_DIR" vault: --files-from-raw "$1" \
    "${RCLONE_FILTER[@]}" >>"$RCLONE_LOG" 2>&1
}

# Audit, then copy up only the accepted files (no move phase: used after a
# failure, when the originals must stay where they are).
copy_changed_up() {
  audit || return 1
  record_saved_keys || return 1
  copy_up "$CHANGED_FILE"
}

# Move detection (#595), after the audit: a move is a path in MANIFEST_BEFORE
# that no longer exists locally and an accepted path (CHANGED_FILE) that was
# not in MANIFEST_BEFORE, with the same "<checksum> <size>"; a rename is a
# move with a new name. Only unambiguous pairs count: the content must be
# held by exactly that one path before the run and exactly that one path
# after it. Anything else with a matching content (the same content twice,
# for example) is not guessed: it falls back to the copy up and the
# pending-original delete, and only the count is logged. The old path must
# be one the agent may write (may_write), so a move never takes a protected
# file out of its place in Drive. None after a refused run.
# Writes "<old><TAB><new>" lines to MOVES_FILE.
find_moves() {
  : >"$MOVES_FILE"
  [ "$TOO_MANY_CHANGES" -eq 0 ] || return 0
  local path gone="$WORK_DIR/gone.txt" ambiguous="$WORK_DIR/moves-ambiguous.txt"
  : >"$gone"
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    [ ! -e "$VAULT_DIR/$path" ] || continue
    may_write "$path" || continue
    printf '%s\n' "$path" >>"$gone"
  done < <(awk 'FILENAME == ARGV[1] { p = $0; sub(/^[^ ]* [^ ]* /, "", p); now[p] = 1; next }
    { p = $0; sub(/^[^ ]* [^ ]* /, "", p); if (!(p in now)) print p }' \
    "$MANIFEST_AFTER" "$MANIFEST_BEFORE")
  awk -v amb="$ambiguous" '
    function path_of(line) { sub(/^[^ ]* [^ ]* /, "", line); return line }
    FILENAME == ARGV[1] { k = $1 " " $2; p = path_of($0); before[p] = k; nb[k]++; next }
    FILENAME == ARGV[2] { k = $1 " " $2; p = path_of($0); after[p] = k; na[k]++; next }
    FILENAME == ARGV[3] {
      if ($0 != "" && !($0 in before) && ($0 in after)) { k = after[$0]; nn[k]++; dest[k] = $0 }
      next
    }
    $0 != "" {
      k = before[$0]
      if (!(k in nn)) next
      if (nb[k] == 1 && na[k] == 1 && nn[k] == 1 && index($0, "\t") == 0 && index(dest[k], "\t") == 0)
        print $0 "\t" dest[k]
      else n++
    }
    END { print n + 0 >amb }' \
    "$MANIFEST_BEFORE" "$MANIFEST_AFTER" "$CHANGED_FILE" "$gone" |
    LC_ALL=C sort >"$MOVES_FILE" || return 1
  local count
  count=$(cat "$ambiguous")
  [ "$count" -eq 0 ] || log "$count moves not guessed: the same content twice"
}

# The move phase (#595): each move in MOVES_FILE is done in Drive itself, as
# a server-side move (rclone moveto; on Drive that changes the file's parent
# folder and keeps its id), after creating the new parent folder. So a moved
# file keeps its id and leaves no copy at its old path. A move Drive could
# not do (for example: the file was moved or removed in Drive during the
# run) falls back to the copy up. Writes the paths Drive moved to MOVED_OLD
# and MOVED_NEW, and the accepted paths left to copy up to UPLOAD_FILE.
# Logs counts only.
move_up() {
  : >"$MOVED_OLD"
  : >"$MOVED_NEW"
  local old new dir moved=0 fell_back=0
  while IFS=$'\t' read -r old new <&3; do
    [ -n "$old" ] && [ -n "$new" ] || continue
    dir=$(dirname "$new")
    if { [ "$dir" = . ] ||
      rclone mkdir "vault:$dir" "${RCLONE_FILTER[@]}" </dev/null >>"$RCLONE_LOG" 2>&1; } &&
      rclone moveto "vault:$old" "vault:$new" "${RCLONE_FILTER[@]}" </dev/null >>"$RCLONE_LOG" 2>&1; then
      printf '%s\n' "$old" >>"$MOVED_OLD"
      printf '%s\n' "$new" >>"$MOVED_NEW"
      moved=$((moved + 1))
    else
      fell_back=$((fell_back + 1))
    fi
  done 3<"$MOVES_FILE"
  [ "$moved" -eq 0 ] || log "$moved files moved in Drive"
  [ "$fell_back" -eq 0 ] || log "$fell_back moves copied up instead"
  awk 'FILENAME == ARGV[1] { done[$0] = 1; next } !($0 in done)' \
    "$MOVED_NEW" "$CHANGED_FILE" >"$UPLOAD_FILE"
}

# The bookkeeping phase (#596), after the move phase, without AI: for each
# move Drive did (MOVED_OLD and MOVED_NEW, line by line), the links that
# name the file are rewritten in every Markdown file the agent may write
# (index.md's row among them): a link by path ([[<old path>]], and for a
# note the path without .md) always, a link by name ([[<old name>]], for a
# note also without .md) when the name changed, keeping what follows the
# target (an alias after "|", a heading after "#"). Lines inside fenced code
# blocks (``` or ~~~) are never touched. Then one log.md line per move, all
# with the same time stamp: a file filed out of 0-Inbox/ gets the line the
# app's Activity reads ("Filed: <name> → <folder>", ending ", renamed from
# <old name>" for a rename), any other move "Moved: <old> → <new>". A line
# already in log.md is not added again, so running the phase twice changes
# nothing. Every file it changed joins UPLOAD_FILE.
# Usage: book_moves <vault dir> <old paths file> <new paths file> <stamp>
book_moves() {
  local vault=$1 olds=$2 news=$3 stamp=$4
  local pairs="$WORK_DIR/book-pairs.txt" targets="$WORK_DIR/book-targets.txt"
  local candidates="$WORK_DIR/book-candidates.txt" lines="$WORK_DIR/book-log.txt"
  local path tmp count=0
  paste "$olds" "$news" | awk -F '\t' '$1 != "" && $2 != ""' >"$pairs" || return 1
  [ -s "$pairs" ] || return 0
  # "<from><TAB><to>" link targets: by path, then by name when it changed.
  awk -F '\t' '
    function base(p) { sub(/.*\//, "", p); return p }
    function bare(p) { if (p ~ /\.md$/) return substr(p, 1, length(p) - 3); return "" }
    function add(a, b) { if (a != "" && b != "" && a != b && !(a in seen)) { seen[a] = 1; print a "\t" b } }
    {
      add($1, $2); add(bare($1), bare($2))
      if (base($1) != base($2)) {
        add(base($1), base($2)); add(bare(base($1)), bare(base($2)))
      }
    }' "$pairs" >"$targets" || return 1
  : >"$candidates"
  if [ -s "$targets" ]; then
    (cd "$vault" && cut -f 1 "$targets" | sed 's/^/[[/' |
      grep -rlF --include='*.md' -f - . 2>/dev/null) | sed 's#^\./##' >"$candidates" || true
  fi
  while IFS= read -r path; do
    [ -n "$path" ] && [ -f "$vault/$path" ] || continue
    may_write "$path" || continue
    tmp="$vault/$path.bower-book"
    awk -F '\t' '
      FILENAME == ARGV[1] { n++; from[n] = "[[" $1; to[n] = "[[" $2; next }
      {
        line = $0
        if (line ~ /^[ \t]*(```|~~~)/) { fenced = !fenced; print line; next }
        if (fenced) { print line; next }
        for (i = 1; i <= n; i++) {
          out = ""; rest = line; len = length(from[i])
          while ((at = index(rest, from[i])) > 0) {
            after = substr(rest, at + len, 2)
            if (after == "]]" || substr(after, 1, 1) == "|" || substr(after, 1, 1) == "#") {
              out = out substr(rest, 1, at - 1) to[i]
            } else {
              out = out substr(rest, 1, at - 1 + len)
            }
            rest = substr(rest, at + len)
          }
          line = out rest
        }
        print line
      }' "$targets" "$vault/$path" >"$tmp" || { rm -f "$tmp"; return 1; }
    if cmp -s "$tmp" "$vault/$path"; then
      rm -f "$tmp"
      continue
    fi
    cat "$tmp" >"$vault/$path" && rm -f "$tmp" || return 1
    printf '%s\n' "$path" >>"$UPLOAD_FILE"
    count=$((count + 1))
  done <"$candidates"
  [ "$count" -eq 0 ] || log "links updated in $count notes"
  # The log.md lines, those not there yet only.
  STAMP="$stamp" awk -F '\t' '
    function base(p) { sub(/.*\//, "", p); return p }
    function dir(p) { if (p !~ /\//) return "."; sub(/\/[^\/]*$/, "", p); return p }
    {
      line = "- " ENVIRON["STAMP"] " · "
      if ($1 ~ /^0-Inbox\// && $2 !~ /^0-Inbox\//) {
        line = line "Filed: " base($2) " → " dir($2)
        if (base($1) != base($2)) line = line ", renamed from " base($1)
      } else line = line "Moved: " $1 " → " $2
      print line
    }' "$pairs" >"$lines" || return 1
  touch "$vault/log.md" || return 1
  if [ -s "$vault/log.md" ] && [ -n "$(tail -c 1 "$vault/log.md")" ]; then
    echo >>"$vault/log.md" || return 1
  fi
  count=0
  while IFS= read -r path; do
    grep -qxF -- "$path" "$vault/log.md" && continue
    printf '%s\n' "$path" >>"$vault/log.md" || return 1
    count=$((count + 1))
  done <"$lines"
  [ "$count" -eq 0 ] || printf '%s\n' log.md >>"$UPLOAD_FILE"
  # Each path once, in the order it was listed.
  awk '!seen[$0]++' "$UPLOAD_FILE" >"$UPLOAD_FILE.tmp" && mv "$UPLOAD_FILE.tmp" "$UPLOAD_FILE"
}

# Best effort after a failure: upload whatever the agent already added or
# changed, with copy only (never deletes), so originals stay in the inbox.
copy_up_after_failure() {
  if [ "$RUN_STARTED" -eq 1 ]; then
    log "sync up (copy only)"
    copy_changed_up || log "sync up (copy only) failed"
  fi
}

# Report failed with a short error naming the step (for the operator) and a
# reason for people (the app turns it into a sentence, #375), then exit 2.
# Usage: fail <error> [reason]; the reason is one of
#   drive_unavailable  Google Drive did not answer, or access to it is gone
#   timeout            the agent ran out of time or turns
#   model_unavailable  Claude could not be reached or refused the credential
#   vault_changed      the Bower folder is not what the run expected
#   unknown            anything else (the default)
fail() {
  local error=$1
  REASON=${2:-unknown}
  REPORTED=1
  copy_up_after_failure
  write_outcome failed "$(failed_sentence)"
  PROCESSED_JSON='' SUMMARY='' report_final failed "$error" || log "report failed: API unreachable"
  log "failed: $error"
  exit 2
}

# Whether the local file at vault path $1 is Add's context note: its
# frontmatter (the lines between the first two `---`) says `kind: context`
# (app/src/tell.ts, #335).
is_context_note() {
  awk '{ sub(/\r$/, "") }
    NR == 1 { if ($0 != "---") exit; next }
    $0 == "---" { exit }
    /^kind:[[:space:]]*context[[:space:]]*$/ { found = 1; exit }
    END { exit !found }' "$VAULT_DIR/$1"
}

# Whether pending path $1 belongs to an instructions-only run: an
# instruction-shaped note directly in 0-Inbox/ (`Bower - *.md`, any letter
# case, as the instruction-origin step below matches them) that is not a
# context note. A context note applies to the files it names, which such a
# run leaves alone, so it waits with them for the next tidy-up. Whether the
# app really wrote the note is checked later, as in any run.
in_instructions_scope() {
  local name
  case "$1" in
    0-Inbox/*/*) return 1 ;;
    0-Inbox/*) name=${1#0-Inbox/} ;;
    *) return 1 ;;
  esac
  case "${name,,}" in
    'bower - '*.md) ;;
    *) return 1 ;;
  esac
  ! is_context_note "$1"
}

# The processed list for the status report (#345), from the pending paths in
# file $1: each path with its kind, so the app never guesses from a name.
# `context` for Add's context note, `request` for any other instruction note
# (see in_instructions_scope), `file` for everything else. Whether a request
# turned out a question, a job or a rule is the agent's call, not known here.
processed_json() {
  local path kind
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    kind=file
    if [ -f "$VAULT_DIR/$path" ]; then
      if in_instructions_scope "$path"; then
        kind=request
      elif is_context_note "$path"; then
        kind=context
      fi
    fi
    jq -cn --arg path "$path" --arg kind "$kind" '$ARGS.named'
  done <"$1" | {
    local items
    items=$(paste -sd, -)
    printf '[%s]
' "$items"
  }
}

# The reason for people behind a failed agent run: `timeout` when the
# agent's own time limit stopped it (timeout's exit code 124, or 137 when it
# had to be killed) or it ran out of turns; `model_unavailable` when its
# private error log shows Claude could not be reached or the credential was
# refused; `unknown` otherwise. The log is read here, never printed.
agent_failure_reason() {
  case "$1" in
    124 | 137)
      echo timeout
      return
      ;;
  esac
  if grep -Eiq 'max(imum)?[ _-]?turns' "$AGENT_ERR" 2>/dev/null; then
    echo timeout
  elif grep -Eiq 'overloaded|rate[ _-]?limit|credit balance|api error|authentication|invalid (api key|x-api-key|bearer)|oauth token|529|503 service' \
    "$AGENT_ERR" 2>/dev/null; then
    echo model_unavailable
  else
    echo unknown
  fi
}

# Read one string field of the vault info; empty when absent or null.
field() { jq -r --arg k "$1" '.[$k] // empty' "$VAULT_JSON"; }

# One Drive files.list call, made from this shell with the Drive token (the
# agent never has it): writes to INSTRUCTIONS_FILE the name of every file
# directly in the inbox folder that carries the app property the app sets on
# an instruction note it writes (bower=instruction, app/src/drive.ts). Drive
# keeps appProperties private to the OAuth client that set them, the one this
# token belongs to, so nothing uploaded, clipped or dropped into the folder
# by hand carries it. One page of up to 1000 names: a note past it is
# unlisted, so quarantined, never trusted. Returns non-zero, having listed
# nothing, when the inbox id is missing or malformed, the call fails or the
# answer cannot be read. curl's own messages go to a private log file.
list_instruction_notes() {
  : >"$INSTRUCTIONS_FILE"
  case "$INBOX_ID" in
    '' | *[!A-Za-z0-9_-]*) return 1 ;;
  esac
  local q="'$INBOX_ID' in parents and appProperties has { key='bower' and value='instruction' } and trashed=false"
  curl -fsS --get -o "$DRIVE_LIST_JSON"     -H "Authorization: Bearer $ACCESS_TOKEN"     --data-urlencode "q=$q"     --data-urlencode 'fields=files(name)'     --data-urlencode 'pageSize=1000'     "$DRIVE_FILES_URL" </dev/null 2>>"$DRIVE_LOG" || return 1
  if ! jq -r '.files[].name' "$DRIVE_LIST_JSON" >"$INSTRUCTIONS_FILE" 2>>"$DRIVE_LOG"; then
    : >"$INSTRUCTIONS_FILE"
    return 1
  fi
}

# --- fetch vault info -------------------------------------------------------
STEP='fetch vault info'
log "$STEP"
if ! http_code=$(curl -sS -o "$VAULT_JSON" -w '%{http_code}' \
  -H "Authorization: Bearer $API_CREDENTIAL" "$API_BASE"); then
  fail "$STEP: request failed"
fi
case "$http_code" in
  200) ;;
  409) fail "$STEP: Google access revoked, the user must sign in again" drive_unavailable ;;
  *)
    # The Worker always answers an error as JSON { error: { code, message } }.
    # Anything else was answered before the request reached it, at
    # Cloudflare's edge: a zone security setting blocking the runner (issue
    # #276; docs/runbook.md, Troubleshooting). Saying which saves looking
    # for a wrong key that is not there.
    if [ -n "$(field error 2>/dev/null || true)" ]; then
      fail "$STEP: HTTP $http_code"
    fi
    fail "$STEP: HTTP $http_code, not answered by the Worker"
    ;;
esac

FOLDER_ID=$(field folderId)
INBOX_ID=$(field inboxFolderId)
ACCESS_TOKEN=$(field driveAccessToken)
EXPIRES_AT=$(field expiresAt)
API_MAX_TURNS=$(field maxTurns)
USER_API_KEY=$(field apiKey)
# When this run was asked for (ISO-8601, from the Worker's clock); empty
# from an older Worker. See "sent during this run" below.
REQUESTED_AT=$(field requestedAt)
# The answer holds the Drive token and the user's API key: from here on they
# live in shell variables only, and the file is gone long before the agent
# starts.
if ! rm -f "$VAULT_JSON"; then
  fail "$STEP: could not delete the answer"
fi
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
  fail "$STEP: no Claude credentials" model_unavailable
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
if ! rclone sync vault: "$VAULT_DIR" --exclude '.obsidian/**' "${RCLONE_FILTER[@]}" >>"$RCLONE_LOG" 2>&1; then
  fail "$STEP: rclone failed" drive_unavailable
fi

STEP='check rulebook'
if [ ! -f "$VAULT_DIR/CLAUDE.md" ]; then
  fail "$STEP: CLAUDE.md missing, not a Bower folder" vault_changed
fi

# The permission policy comes from the instance repo, never from the vault:
# claude-settings.json replaces the vault's own .claude/settings.json, and
# .claude/settings.local.json (which Claude Code would rank above it) is
# removed from the local copy. It denies writes to the protected paths
# (CLAUDE.md at any depth, README.md, .claude/, .obsidian/) and Bash
# commands that name a URL. .claude/ is left out of the manifest, so none of
# this is uploaded.
STEP='permission policy'
if [ ! -f "$SETTINGS_FILE" ]; then
  fail "$STEP: claude-settings.json missing next to run.sh"
fi
if ! {
  mkdir -p "$VAULT_DIR/.claude" &&
    rm -f "$VAULT_DIR/.claude/settings.local.json" &&
    cp "$SETTINGS_FILE" "$VAULT_DIR/.claude/settings.json"
}; then
  fail "$STEP: copy failed"
fi

# --- pending files ----------------------------------------------------------
# Everything in 0-Inbox/ and Clippings/ except processed originals, the
# folder notes (_*.md), .gitkeep and anything already under
# 0-Inbox/Quarantine/ (a file quarantined in an earlier run: reported once,
# the run that flagged it, never pending again; issue #264). Paths are
# relative to the vault.
STEP='list pending'
(
  cd "$VAULT_DIR"
  dirs=()
  for d in 0-Inbox Clippings; do
    [ -d "$d" ] && dirs+=("$d")
  done
  if [ "${#dirs[@]}" -gt 0 ]; then
    find "${dirs[@]}" -type f \
      ! -path '0-Inbox/Processed/*' ! -path '0-Inbox/Quarantine/*' \
      ! -name '_*.md' ! -name '.gitkeep' "${SYSTEM_FIND_TESTS[@]}" |
      LC_ALL=C sort
  fi
) >"$PENDING_FILE"
# An instructions-only run (BOWER_SCOPE=instructions, a request's Do it now)
# keeps only the instruction notes pending (in_instructions_scope above).
# Every other pending file, Clippings/ included, is removed from the local
# copy before the manifest is taken, so the agent never sees it, the upload
# never touches it and the pending-original deletes never name it: in Drive
# it stays exactly where it is, for the next tidy-up. The log counts, never
# names.
if [ "$MODE" = ingest ] && [ "$SCOPE" = instructions ]; then
  : >"$WORK_DIR/in-scope.txt"
  held=0
  while IFS= read -r path <&3; do
    [ -n "$path" ] || continue
    if in_instructions_scope "$path"; then
      printf '%s\n' "$path" >>"$WORK_DIR/in-scope.txt"
    else
      rm -f "$VAULT_DIR/$path" || fail "$STEP: could not set a file aside"
      held=$((held + 1))
    fi
  done 3<"$PENDING_FILE"
  mv "$WORK_DIR/in-scope.txt" "$PENDING_FILE"
  log "instructions only: $held files left for the next tidy-up"
fi
# --- sent during this run ---------------------------------------------------
# A request the owner sends while this run is queued or running (a
# `Bower - *.md` instruction note directly in 0-Inbox/, not Add's context
# note, which goes with its files) belongs to the next tidy-up, as the app
# shows it: Waiting (#491). Sync down gives each local file Drive's
# modifiedTime, so a note written or edited after the run was asked for
# (REQUESTED_AT) is removed from the local copy and the pending list here,
# exactly like the files an instructions-only run holds back: the agent
# never sees it, the upload never touches it and the pending-original
# deletes never name it, so in Drive it stays where it is. Without this,
# such a note written just before sync down was taken by this run, and
# one Drive did not list yet as the app's own (its search catches up with
# a new file only after a while) was quarantined as not written by the
# app, out of the owner's sight. No REQUESTED_AT (an older Worker), no hold.
# The log counts, never names.
if [ "$MODE" = ingest ] && [[ "$REQUESTED_AT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$ ]]; then
  : >"$WORK_DIR/not-sent-during.txt"
  held=0
  while IFS= read -r path <&3; do
    [ -n "$path" ] || continue
    if in_instructions_scope "$path" &&
      [ -n "$(find "$VAULT_DIR/$path" -maxdepth 0 -newermt "$REQUESTED_AT" 2>/dev/null)" ]; then
      rm -f "$VAULT_DIR/$path" || fail "$STEP: could not set a file aside"
      held=$((held + 1))
    else
      printf '%s\n' "$path" >>"$WORK_DIR/not-sent-during.txt"
    fi
  done 3<"$PENDING_FILE"
  mv "$WORK_DIR/not-sent-during.txt" "$PENDING_FILE"
  [ "$held" -eq 0 ] || log "$held requests sent during the run left for the next tidy-up"
fi
PENDING_COUNT=$(grep -c . "$PENDING_FILE" || true)
# Only an ingest processes the pending files; a lint reports its summary
# without a processed list.
PROCESSED_JSON=''
if [ "$MODE" = ingest ]; then
  PROCESSED_JSON=$(processed_json "$PENDING_FILE")
fi
log "$PENDING_COUNT files pending"

if [ "$MODE" = ingest ] && [ "$PENDING_COUNT" -eq 0 ]; then
  STEP='report done'
  log "$STEP"
  write_outcome done 'Nothing new to tidy up.'
  if ! report_final done; then
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

# The local copy is still exactly what sync down fetched: record it, so the
# upload can tell what the agent added or changed. Taken here rather than
# right after sync down so a run with nothing pending reads no file.
STEP='manifest'
log "$STEP"
if ! manifest >"$MANIFEST_BEFORE"; then
  fail "$STEP: listing the local copy failed"
fi
if ! keep_pre_run_copy; then
  fail "$STEP: keeping a pre-run copy failed"
fi

# --- convert documents ------------------------------------------------------
# The agent has no pandoc, so Office, HTML and EPUB files pending in 0-Inbox/
# and Clippings/ are converted here, before it runs: each becomes a Markdown
# sibling with the same base name (report.docx -> report.md), which the agent
# files and then moves to 0-Inbox/Processed/ with the original (ingest.md).
# A file whose sibling already exists is left as it is. --sandbox keeps
# pandoc to the one input file: no other file, no URL, no network. Taken
# after the manifest, so the siblings are new files and go up with the
# agent's changes. A lint processes nothing, so it converts nothing. A file
# pandoc cannot read stays as it is, for the agent to move to Processed/ as
# unconvertible; the log counts, never names, and pandoc's own messages go
# to a private log file.
STEP='convert documents'
if [ "$MODE" = ingest ]; then
  converted=0
  unconverted=0
  while IFS= read -r path <&3; do
    case "$path" in
      *.[dD][oO][cC][xX]) from=docx ;;
      *.[oO][dD][tT]) from=odt ;;
      *.[hH][tT][mM][lL] | *.[hH][tT][mM]) from=html ;;
      *.[eE][pP][uU][bB]) from=epub ;;
      *.[rR][tT][fF]) from=rtf ;;
      *) continue ;;
    esac
    sibling="${path%.*}.md"
    [ ! -e "$VAULT_DIR/$sibling" ] || continue
    if (cd "$VAULT_DIR" && pandoc --sandbox -f "$from" -t gfm --wrap=none \
      -o "$sibling" -- "$path") </dev/null >>"$PANDOC_LOG" 2>&1; then
      converted=$((converted + 1))
    else
      rm -f "$VAULT_DIR/$sibling"
      unconverted=$((unconverted + 1))
    fi
  done 3<"$PENDING_FILE"
  if [ $((converted + unconverted)) -gt 0 ]; then
    log "$STEP: $converted converted, $unconverted could not be converted"
  fi
fi

# --- instruction origin -----------------------------------------------------
# An instruction note's name and frontmatter are not proof of origin: a file
# uploaded through Add, clipped or dropped into the folder can copy both
# (red-team fixture 05). So, while this shell still holds the Drive token and
# before Claude starts, every `Bower - *.md` directly in 0-Inbox/ (any letter
# case) is checked against Drive's own record of which files the app wrote
# as instruction notes (list_instruction_notes above); each one not listed
# joins the pre-scan's flagged list below and is quarantined like any other
# flagged file. If the listing fails, nothing is listed and every one of
# them is quarantined: the check fails closed. No Drive call when there is
# no such file. The log carries counts, never a name.
STEP='instruction origin'
: >"$UNLISTED_FILE"
(
  cd "$VAULT_DIR"
  if [ -d 0-Inbox ]; then
    find 0-Inbox -mindepth 1 -maxdepth 1 -type f -iname 'Bower - *.md' | LC_ALL=C sort
  fi
) >"$CANDIDATES_FILE"
candidate_count=$(grep -c . "$CANDIDATES_FILE" || true)
if [ "$candidate_count" -gt 0 ]; then
  if list_instruction_notes; then
    while IFS= read -r path <&3; do
      [ -n "$path" ] || continue
      grep -Fxq -- "${path#0-Inbox/}" "$INSTRUCTIONS_FILE" ||
        printf '%s\n' "$path" >>"$UNLISTED_FILE"
    done 3<"$CANDIDATES_FILE"
  else
    log "$STEP: listing failed, none trusted"
    cp "$CANDIDATES_FILE" "$UNLISTED_FILE"
  fi
  log "$STEP: $(grep -c . "$UNLISTED_FILE" || true) of $candidate_count not written by the app"
fi

# --- pre-scan ----------------------------------------------------------
# Everything pending is untrusted text, so before Claude reads any of it,
# agent/scan.sh (best-effort, grep/awk, no network) looks over 0-Inbox/
# and Clippings/ (Quarantine/ itself, and Processed/, excluded) for
# patterns that read like instructions aimed at an assistant, including
# in the Markdown siblings the conversion step just wrote. A flagged
# file is moved to 0-Inbox/Quarantine/ (created here if missing, its
# path under 0-Inbox/ or Clippings/ kept underneath so two files sharing
# a name never collide) so Claude never sees it, and is dropped from the
# pending list before `processed` is built. The instruction-shaped notes
# the app did not write (see "instruction origin" above) are flagged too.
# Reported as `quarantined`, names only; the log carries the count, never a
# name.
STEP='pre-scan'
(
  cd "$VAULT_DIR"
  dirs=()
  for d in 0-Inbox Clippings; do
    [ -d "$d" ] && dirs+=("$d")
  done
  [ "${#dirs[@]}" -eq 0 ] || bash "$AGENT_DIR/scan.sh" "${dirs[@]}"
) >"$WORK_DIR/scanned.txt" 2>>"$AGENT_ERR" || true
LC_ALL=C sort -u "$WORK_DIR/scanned.txt" "$UNLISTED_FILE" | grep -v '^$' >"$FLAGGED_FILE" || true
flagged_count=$(grep -c . "$FLAGGED_FILE" || true)
: >"$QUARANTINED_FILE"
if [ "$flagged_count" -gt 0 ]; then
  while IFS= read -r path <&3; do
    [ -n "$path" ] || continue
    rel=$path
    case "$rel" in
      0-Inbox/*) rel=${rel#0-Inbox/} ;;
    esac
    dest="0-Inbox/Quarantine/$rel"
    if mkdir -p "$VAULT_DIR/$(dirname "$dest")" &&
      mv "$VAULT_DIR/$path" "$VAULT_DIR/$dest"; then
      printf '%s\n' "$dest" >>"$QUARANTINED_FILE"
    fi
  done 3<"$FLAGGED_FILE"
fi
QUARANTINED_JSON=$(LC_ALL=C sort "$QUARANTINED_FILE" | jq -Rn '[inputs]') || QUARANTINED_JSON='[]'
log "$STEP: $flagged_count files quarantined"

if [ "$MODE" = ingest ] && [ "$flagged_count" -gt 0 ]; then
  LC_ALL=C comm -23 <(LC_ALL=C sort "$PENDING_FILE") <(LC_ALL=C sort "$FLAGGED_FILE") \
    >"$WORK_DIR/pending-after-scan.txt" || true
  PROCESSED_JSON=$(processed_json "$WORK_DIR/pending-after-scan.txt")
fi

# The instruction allow-list: the instruction-shaped notes still at their
# pending path, that is listed by Drive as written by the app and not
# flagged by the pre-scan. Only an ingest runs the Instructions workflow,
# and only a run with at least one such note may change Rules.md; in any
# other run the audit reverts a change to it (may_write above, issue #263).
if [ "$MODE" = ingest ] && [ "$candidate_count" -gt 0 ]; then
  allowed_count=$(LC_ALL=C comm -23 "$CANDIDATES_FILE" "$FLAGGED_FILE" | grep -c . || true)
  if [ "$allowed_count" -gt 0 ]; then
    RULES_WRITABLE=1
  fi
fi

# Claude itself runs under `env -i` with an explicit allow-list, so an
# instruction that reaches the model despite the tool allow/deny list above
# still finds no Drive token, no run ticket and no BOWER_* value in its own
# process; only the shell around it (sync down, sync up, the status report)
# keeps those. Allowed through:
#   HOME, PATH        to run at all, including the tools in $ALLOWED_TOOLS
#                      (mv, mkdir, ls)
#   LANG, LC_ALL       stable text encoding while the agent reads vault files
#   TMPDIR             Claude Code's own scratch space
#   TERM               non-interactive output formatting
#   CI, GITHUB_ACTIONS Claude Code's own environment detection; passed
#                      through only when the workflow set them
#   ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN
#                      the model credential (never both, see above)
# Checked against `claude --help` and the strings in the installed binary:
# nothing else is documented or discoverable as required for a
# non-interactive `-p` run. RCLONE_CONFIG_*, BOWER_*, FOLDER_ID, INBOX_ID
# and ACCESS_TOKEN are deliberately left out.
readonly CLAUDE_ENV_ALLOWLIST=(
  HOME PATH LANG LC_ALL TMPDIR TERM CI GITHUB_ACTIONS
  ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN
)
claude_env=()
for name in "${CLAUDE_ENV_ALLOWLIST[@]}"; do
  if [ -n "${!name:-}" ]; then
    claude_env+=("$name=${!name}")
  fi
done

# The agent gets AGENT_TIME_LIMIT seconds (15 minutes), well inside the
# job's own 20-minute limit, so a run that takes too long is stopped here,
# with time left to copy back what is done and report `timeout` (#375),
# instead of GitHub killing the job before anything is reported. timeout
# runs outside `env -i`, so it starts with this shell's environment and the
# agent under it with the allow-list only.
readonly AGENT_TIME_LIMIT=900
STEP='agent run'
log "$STEP"
PROMPT=$(cat "$PROMPT_FILE")
RUN_STARTED=1
set +e
(
  cd "$VAULT_DIR"
  timeout -k 30 "$AGENT_TIME_LIMIT" env -i "${claude_env[@]}" \
    claude -p "$PROMPT" --max-turns "$MAX_TURNS" --output-format text \
      --allowedTools "$ALLOWED_TOOLS" --disallowedTools "$DISALLOWED_TOOLS" </dev/null
) >"$AGENT_OUT" 2>"$AGENT_ERR"
agent_rc=$?
set -e
if [ "$agent_rc" -ne 0 ]; then
  fail "$STEP: exit $agent_rc" "$(agent_failure_reason "$agent_rc")"
fi

# --- post-run audit, move phase and sync up --------------------------------
# The audit (see audit() above) reverts what the agent may not change: the
# protected paths, anything outside the known roots, a CLAUDE.md at any
# depth, Rules.md in a run without an instruction note, or, past MAX_CHANGES
# files, the whole run. Then the move phase (find_moves and move_up above,
# #595): each file the agent moved or renamed to an accepted place, found by
# its unchanged content, is moved in Drive itself, so it keeps its id and
# leaves no copy at its old path, whatever folder it came from. Then the
# bookkeeping phase (book_moves above, #596) books each of those moves in
# index.md, in the links that name the file and in log.md. Then only
# the accepted files the agent added or changed and did not move are
# copied, and copy never deletes: a file added or edited in Drive during the
# run keeps its content. Last, the pending-original delete, which now covers
# only what the move phase did not: each file that was pending at the
# start, is gone from the local copy, was not moved in Drive, and whose
# content Drive holds under another path (a move not guessed because the
# same content is there twice, or one Drive could not do) is deleted from
# Drive by its own path, so processed originals leave the inbox; one moved
# to a refused place, or any after a refused run, stays where it was.
# Nothing else is removed or moved.
STEP='sync up'
log "$STEP"
if ! audit || ! record_saved_keys; then
  fail "$STEP: copy failed" drive_unavailable
fi
if ! find_moves; then
  fail "$STEP: move failed"
fi
if ! move_up; then
  fail "$STEP: move failed"
fi
if ! book_moves "$VAULT_DIR" "$MOVED_OLD" "$MOVED_NEW" "$(date -u '+%F %H:%M')"; then
  fail "$STEP: bookkeeping failed"
fi
if ! copy_up "$UPLOAD_FILE"; then
  fail "$STEP: copy failed" drive_unavailable
fi
RUN_STARTED=0  # the copy is done; a later failure needs no second copy
kept=0
while IFS= read -r path <&3; do
  [ -n "$path" ] || continue
  [ ! -e "$VAULT_DIR/$path" ] || continue
  # Moved in Drive already: nothing is left at its old path.
  ! grep -qxF -- "$path" "$MOVED_OLD" || continue
  key=$(P="$path" awk '{ p = $0; sub(/^[^ ]* [^ ]* /, "", p)
    if (p == ENVIRON["P"]) { print $1 " " $2; exit } }' "$MANIFEST_BEFORE")
  if [ -z "$key" ] || ! grep -qxF -- "$key" "$SAVED_KEYS"; then
    kept=$((kept + 1))
    continue
  fi
  delete_rc=0
  rclone deletefile "vault:$path" "${RCLONE_FILTER[@]}" </dev/null >>"$RCLONE_LOG" 2>&1 || delete_rc=$?
  # 4 is rclone's "file not found": someone removed it from Drive during the
  # run, so it is already gone.
  if [ "$delete_rc" -ne 0 ] && [ "$delete_rc" -ne 4 ]; then
    fail "$STEP: delete failed" drive_unavailable
  fi
done 3<"$PENDING_FILE"
[ "$kept" -eq 0 ] || log "$kept originals kept in the inbox"

# --- report done ------------------------------------------------------------
STEP='report done'
log "$STEP"
# The agent's final report is its last lines: six for an ingest (Processed,
# Filed, Created, Updated, Rules, Problems; issue #368), five for a lint (no
# Filed line). The Filed count is logged as a number, nothing else.
report_lines=5
[ "$MODE" != ingest ] || report_lines=6
SUMMARY=$(tail -n "$report_lines" "$AGENT_OUT")
filed=$(awk '/^Filed: [0-9]+ files?$/ { n = $2 } END { print n }' <<<"$SUMMARY")
[ -z "$filed" ] || log "$filed originals filed"
if [ "$TOO_MANY_CHANGES" -eq 1 ]; then
  # Nothing was saved, so nothing was processed, whatever the agent said.
  SUMMARY="Refused: too many changes (more than $MAX_CHANGES files). Nothing was saved."
  [ -z "$PROCESSED_JSON" ] || PROCESSED_JSON='[]'
  write_outcome done 'Nothing was saved: the tidy-up changed too many files.'
else
  filed=$(count_lines "$WORK_DIR/pending-after-scan.txt")
  [ -f "$WORK_DIR/pending-after-scan.txt" ] || filed=$(count_lines "$PENDING_FILE")
  write_outcome done "Tidied up $filed $([ "$filed" -eq 1 ] && echo thing || echo things)."
fi
if ! report_final done; then
  REPORTED=1
  log "report done failed: API unreachable"
  exit 2
fi
REPORTED=1
log "done"
