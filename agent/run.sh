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
# own CLAUDE.md (moved out of the folder for the run and handed in as a
# system prompt with the run's facts, see take_rulebook_out and "context
# pack" below) under the permission policy in claude-settings.json (next to
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
#   BOWER_MODEL              optional; the model the agent runs on (default
#                            claude-sonnet-5-5); a value that is not a plain
#                            model name is ignored with a warning
#   BOWER_EFFORT_LOW         optional; the effort for a lint, and for an
#                            ingest with no instruction note and no context
#                            note (default low)
#   BOWER_EFFORT_MEDIUM      optional; the effort for an ingest whose only
#                            reason for more is a context note from Add
#                            (default medium)
#   BOWER_EFFORT_HIGH        optional; the effort for an ingest given an
#                            instruction note the app wrote (default high).
#                            All three take low, medium, high, xhigh or max;
#                            any other value is ignored with a warning (see
#                            "model and effort" below)
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
export -n BOWER_API_URL BOWER_RUN_TICKET BOWER_API_KEY BOWER_MAX_TURNS BOWER_ALLOW_WEB BOWER_MAX_CHANGES BOWER_SCOPE BOWER_REPORT_BACKOFF BOWER_MODEL BOWER_EFFORT_LOW BOWER_EFFORT_MEDIUM BOWER_EFFORT_HIGH
secrets_file="${RUNNER_TEMP:-}/bower-secrets"
if [ -n "${RUNNER_TEMP:-}" ] && [ -f "$secrets_file" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "${line%%=*}" in
      BOWER_API_URL | BOWER_RUN_TICKET | BOWER_API_KEY | BOWER_MAX_TURNS | BOWER_ALLOW_WEB | BOWER_MAX_CHANGES | BOWER_SCOPE | BOWER_REPORT_BACKOFF | BOWER_MODEL | BOWER_EFFORT_LOW | BOWER_EFFORT_MEDIUM | BOWER_EFFORT_HIGH)
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
# The one credential sent to the Worker: this run's ticket. There is no
# fallback: the Worker refuses the operator key on these routes.
if [ -n "${BOWER_RUN_TICKET:-}" ]; then
  API_CREDENTIAL=$BOWER_RUN_TICKET
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

# --- model and effort -------------------------------------------------------
# R-SS-3 (#965, #1000): the agent runs on MODEL, at EFFORT_HIGH for an
# ingest given an instruction note the app wrote, at EFFORT_MEDIUM for an
# ingest whose only reason for more is a pending context note, and at
# EFFORT_LOW otherwise, a lint included (choose_effort, in the context pack
# below). Both
# are passed to `claude -p` as arguments, never as environment. A setting
# that does not pass its check falls back to the default with a warning
# that names the setting, never its value.
readonly DEFAULT_MODEL='claude-sonnet-5-5'
MODEL=${BOWER_MODEL:-$DEFAULT_MODEL}
if ! [[ "$MODEL" =~ ^[a-z][a-z0-9.-]*$ ]]; then
  log "warning: BOWER_MODEL is not a model name, using $DEFAULT_MODEL"
  MODEL=$DEFAULT_MODEL
fi
readonly MODEL
# Usage: effort_setting <setting name> <default>: sets the variable named
# after the setting without its BOWER_ prefix (EFFORT_LOW, EFFORT_MEDIUM,
# EFFORT_HIGH).
effort_setting() {
  local value=${!1:-}
  case "$value" in
    '') value=$2 ;;
    low | medium | high | xhigh | max) ;;
    *)
      log "warning: $1 is not low, medium, high, xhigh or max, using $2"
      value=$2
      ;;
  esac
  printf -v "${1#BOWER_}" '%s' "$value"
}
effort_setting BOWER_EFFORT_LOW low
effort_setting BOWER_EFFORT_MEDIUM medium
effort_setting BOWER_EFFORT_HIGH high
readonly EFFORT_LOW EFFORT_MEDIUM EFFORT_HIGH

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
# Every move to book: those Drive did and those that fell back to a copy up.
readonly BOOKED_OLD="$WORK_DIR/booked-old.txt"
readonly BOOKED_NEW="$WORK_DIR/booked-new.txt"
readonly UPLOAD_FILE="$WORK_DIR/upload.txt"
# The map of Drive id to path each run leaves in the vault for the next
# one's reconcile phase (see reconcile below, #597).
readonly PATHS_FILE='.bower/paths.json'
readonly FLAGGED_FILE="$WORK_DIR/flagged.txt"
readonly QUARANTINED_FILE="$WORK_DIR/quarantined.txt"
# Report v2 (#598): each pending path with its kind ("<path><TAB><kind>"),
# the documents pandoc could not convert, and what the run set aside
# ("<reason><TAB><path>"), all in the work dir.
readonly KINDS_FILE="$WORK_DIR/kinds.txt"
readonly UNCONVERTED_FILE="$WORK_DIR/unconverted.txt"
# The Markdown copies the conversion wrote in the vault this run, one path
# per line, so the filing sheet moves each one with its original (#995).
readonly CONVERTED_FILE="$WORK_DIR/converted.txt"
readonly SET_ASIDE_FILE="$WORK_DIR/set-aside.txt"
# The text of each pending document (R-RUNNER-7, R-AG-9), kept before the agent
# runs so nothing it writes can change it: one "<file name><TAB><text file or
# ->" line per document in DOC_TEXT_MAP (the text files are in DOC_TEXT_DIR;
# "-" means a PDF with no text layer), appended to the document's text copy
# after the run. AUDIT_WARNING is the name audit's one-line warning.
readonly DOC_TEXT_DIR="$WORK_DIR/doc-text"
readonly DOC_TEXT_MAP="$WORK_DIR/doc-text-map.txt"
AUDIT_WARNING=''
# index.md as the session starts (R-SS-9, R-SS-10), and the row check's
# one-line warning.
readonly INDEX_BEFORE="$WORK_DIR/index-before.md"
ROWS_WARNING=''
# The filing sheet (#978) once the session is over, moved out of the local
# copy so it is never uploaded, and the one-line warning for its skipped
# lines.
readonly SHEET_TAKEN="$WORK_DIR/filing.tsv"
SHEET_WARNING=''
# In the vault: the pending files over the size limit, for the agent to file
# by name and date without reading them (written before the agent starts),
# and the one clause the agent may write about what it added besides filing
# (read after it ends). Neither is ever uploaded: both are removed from the
# local copy before the audit.
readonly TOO_LARGE_LIST='.bower/too-large.txt'
readonly ADDED_NOTE='.bower/added.txt'
# R-RUNNER-1: the agent's optional one line per note it updated
# ("<path><TAB><what>"), read and removed like ADDED_NOTE, never uploaded.
readonly UPDATED_NOTE='.bower/updated.txt'
# R-MEAN-1: the agent's optional lines about what the run means, read and
# removed like ADDED_NOTE, never uploaded: one per pair of notes that
# disagree ("<path A><TAB><path B><TAB><reason>") and one per thing that is
# next for the person ("<path or -><TAB><action>").
readonly CHECKS_NOTE='.bower/checks.txt'
readonly NEXT_NOTE='.bower/next.txt'
# In the work dir: each note's `status:` before the run (R-RUNNER-9).
readonly STATUS_BEFORE="$WORK_DIR/status-before.txt"
# In the work dir: the `what` lines kept from UPDATED_NOTE, every path a
# copy up actually uploaded (the upload list, not the intent), and every
# pending original deleted from Drive.
readonly UPDATED_WHAT_FILE="$WORK_DIR/updated-what.txt"
readonly UPLOADED_FILE="$WORK_DIR/uploaded.txt"
readonly DELETED_FILE="$WORK_DIR/deleted.txt"
: >"$UPDATED_WHAT_FILE"
: >"$UPLOADED_FILE"
: >"$DELETED_FILE"
# The Worker's caps (api/src/runner.ts): an `updated[].what` is cut to
# MAX_WHAT_LENGTH characters, each list to MAX_REPORT_LIST entries, and a
# report carrying more than MAX_REPORT_ENTRIES entries across processed,
# created, updated, left and setAside is refused. The runner cuts first, so
# a final report is never refused for its size.
readonly MAX_WHAT_LENGTH=120
readonly MAX_REPORT_LIST=200
readonly MAX_REPORT_ENTRIES=400
# The size limits (R-SYS-10): a file over 50 MB, or a PDF over 300 pages, is
# kept, not read.
readonly MAX_READ_BYTES=$((50 * 1024 * 1024))
readonly MAX_PDF_PAGES=300
# Longest `added` clause sent; the Worker keeps as much (MAX_ADDED_LENGTH).
readonly MAX_ADDED_LENGTH=200
# R-MEAN-1, the Worker's caps too: at most MAX_DISAGREE lines from
# CHECKS_NOTE and MAX_NEXT from NEXT_NOTE, each reason or action at most
# MAX_MEANING_LENGTH characters. A line out of the fixed format is dropped.
readonly MAX_DISAGREE=5
readonly MAX_NEXT=3
readonly MAX_MEANING_LENGTH=120
# The instruction-origin step's files: in the work dir, never in the vault,
# so the model never sees them.
readonly CANDIDATES_FILE="$WORK_DIR/instruction-candidates.txt"
readonly DRIVE_LIST_JSON="$WORK_DIR/instruction-listing.json"
readonly INSTRUCTIONS_FILE="$WORK_DIR/instruction-notes.txt"
readonly UNLISTED_FILE="$WORK_DIR/instruction-unlisted.txt"
readonly SAVED_KEYS="$WORK_DIR/saved-keys.txt"
readonly PRE_RUN_DIR="$WORK_DIR/pre-run"
readonly AGENT_OUT="$WORK_DIR/agent.out"
# The agent's stream-json transcript (R-SS-2): every message, tool call and
# tool result of the session, so vault content. It stays in the work dir,
# never under LOG_DIR, which the workflow uploads when a run fails.
readonly AGENT_STREAM="$WORK_DIR/agent.stream.jsonl"
# R-SS-5 (#966): the vault's CLAUDE.md while the agent runs, and the system
# prompt built from it. Both hold vault text, so both stay in the work dir,
# which the agent cannot read (blockReadsOutsideWorkingDirectories in
# claude-settings.json) and which is never uploaded.
readonly RULEBOOK_FILE="$WORK_DIR/rulebook.md"
readonly SYSTEM_FILE="$WORK_DIR/system.md"
readonly AGENT_ERR="$LOG_DIR/agent.err"
readonly RCLONE_LOG="$LOG_DIR/rclone.log"
readonly PANDOC_LOG="$LOG_DIR/pandoc.log"
readonly DRIVE_LOG="$LOG_DIR/drive.log"
readonly DRIVE_FOLDER_JSON="$WORK_DIR/folder-check.json"
readonly DRIVE_FILES_URL='https://www.googleapis.com/drive/v3/files'
mkdir -p "$VAULT_DIR" "$LOG_DIR"

# System and sync files (desktop.ini, Thumbs.db, ~$Offer.docx, ...) are never
# downloaded, uploaded, deleted, read, filed, moved or listed (#581). One list,
# used twice: as an rclone filter file on every call that walks a tree (sync down,
# listings; calls on an exact path or list take manifest paths and real rclone
# refuses a filter on them), and as find tests
# that keep them out of the manifest and the pending list. The patterns mirror
# SYSTEM_FILE_PATTERNS in app/src/vault-index.ts: keep the two in step.
# Matching is case-insensitive (--ignore-case, -iname).
# Seconds added to requestedAt before a pending file counts as sent during
# the run (R-RUNNER-6): the gap between Drive's clock and the Worker's.
readonly HOLD_GRACE=15
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
RULEBOOK_OUT=0 # 1 while CLAUDE.md is out of the local copy (R-SS-5)
REFUSED_JSON=''      # the audit's refused paths, a JSON array, once it ran
QUARANTINED_JSON=''  # the pre-scan's quarantined paths, a JSON array, once it ran
SET_ASIDE_JSON=''    # report v2: what the run set aside and why, a JSON array
ADDED=''             # report v2: the agent's one clause about what it added
TOO_MANY_CHANGES=0   # 1 when the audit refused the whole run
RULES_WRITABLE=0     # 1 once an instruction note the app wrote reaches the agent
RECONCILED=0         # 1 once the reconcile phase listed the tree (#597)
# R-RUNNER-1: what the run created, updated and left in the inbox, JSON
# arrays set by report_lists just before the final report.
CREATED_JSON=''
UPDATED_JSON=''
LEFT_JSON=''
# R-MEAN-1: what the run means, JSON arrays set by read_meaning; sent on a
# done report only, and only when not empty.
DISAGREE_JSON=''
NEXT_JSON=''

# The jq filter a final report and last-run.json go through (R-RUNNER-1):
# created, updated and left are each cut to MAX_REPORT_LIST entries, then,
# while processed (or items), setAside, created, updated and left carry more
# than MAX_REPORT_ENTRIES together (each counted after the Worker's own cut
# to MAX_REPORT_LIST), left is cut first, then updated, then created.
# `processed` in last-run.json is a count, not a list, and counts nothing.
readonly REPORT_FILTER='def n($v): $v | if type == "array" then .[0:$list] | length else 0 end;
  $ARGS.named | del(.list, .max)
  | reduce ("created", "updated", "left") as $k (.;
    if has($k) then .[$k] |= .[0:$list] else . end)
  | reduce ("left", "updated", "created") as $k (.;
    if has($k) then
      (n(.processed) + n(.items) + n(.setAside) + n(.created) + n(.updated)
        + n(.left) - $max) as $over
      | if $over > 0 then .[$k] |= .[0:([length - $over, 0] | max)] else . end
    else . end)'
# R-AG-10: the non-empty created[] paths of a failed last-run.json, one per
# line (a line break inside a path becomes a space); nothing for any other
# state.
readonly ALREADY_WRITTEN_FILTER='if type == "object" and .state == "failed" and (.created | type) == "array"
  then .created[] | strings | select(length > 0) | gsub("[\r\n]"; " ") else empty end'
# "<path>" or "<path><TAB><what>" lines as updated entries (R-RUNNER-1),
# `what` cut to $cut characters.
readonly UPDATED_FILTER='[inputs | . as $line | split("\t") as $p | {path: $p[0]}
  + (if ($p | length) > 1 then {what: ($p[1:] | join("\t") | .[0:$cut])} else {} end)]'
# R-MEAN-1: CHECKS_NOTE's lines as disagree entries and NEXT_NOTE's as next
# entries. Each field is trimmed; a line with another number of fields, an
# empty field, or a reason or action over $cut characters is dropped; the
# first $max lines left are kept. A path of "-" in next.txt means none.
readonly DISAGREE_FILTER='[inputs | sub("\r$"; "") | split("\t") | map(gsub("^\\s+|\\s+$"; ""))
  | select(length == 3 and all(.[]; length > 0) and (.[2] | length) <= $cut)
  | {a: .[0], b: .[1], reason: .[2]}] | .[0:$max]'
readonly NEXT_FILTER='[inputs | sub("\r$"; "") | split("\t") | map(gsub("^\\s+|\\s+$"; ""))
  | select(length == 2 and all(.[]; length > 0) and (.[1] | length) <= $cut)
  | (if .[0] == "-" then {} else {path: .[0]} end) + {action: .[1]}] | .[0:$max]'

# R-SS-5 (#966): the agent runs without the vault's CLAUDE.md in its folder,
# so Claude Code does not load all of it and the agent cannot read it; the
# runner hands it the sections the run needs in the system prompt instead.
# The move out is the last thing before the agent starts (take_rulebook_out
# below); the file goes back byte for byte right after the agent ends,
# before the audit, so the audit sees it unchanged, and on every other way
# out after the move too: fail() and on_exit() call restore_rulebook before
# anything is copied up. A missing CLAUDE.md in Drive would break the
# folder, so a copy up must never run while it is out. Anything the agent
# left at that path (the permission policy denies writing it) is replaced.
# The copy in the work dir is checked against the sha256 taken when it was
# moved out: if anything changed it during the run, CLAUDE.md is restored
# from the pre-run copy (PRE_RUN_DIR, keep_pre_run_copy above) instead.
RULEBOOK_SUM=''
take_rulebook_out() {
  cp -p "$VAULT_DIR/CLAUDE.md" "$RULEBOOK_FILE" || return 1
  RULEBOOK_SUM=$(sha256sum <"$RULEBOOK_FILE") || return 1
  RULEBOOK_OUT=1
  rm -f "$VAULT_DIR/CLAUDE.md"
}
restore_rulebook() {
  [ "${RULEBOOK_OUT:-0}" -eq 1 ] || return 0
  local from=$RULEBOOK_FILE
  if [ "$(sha256sum <"$RULEBOOK_FILE" 2>/dev/null)" != "$RULEBOOK_SUM" ]; then
    log "rulebook copy changed during the run: restored from the pre-run copy"
    from="$PRE_RUN_DIR/CLAUDE.md"
  fi
  if [ -e "$VAULT_DIR/CLAUDE.md" ] || [ -L "$VAULT_DIR/CLAUDE.md" ]; then
    log "rulebook: a CLAUDE.md written during the run was replaced"
    rm -rf "$VAULT_DIR/CLAUDE.md" || return 1
  fi
  cp -p "$from" "$VAULT_DIR/CLAUDE.md" || return 1
  RULEBOOK_OUT=0
}

on_exit() {
  local rc=$?
  restore_rulebook || log "rulebook not restored"
  if [ "$rc" -ne 0 ] && [ "$REPORTED" -eq 0 ]; then
    # An unexpected error that no explicit check caught.
    REPORTED=1
    copy_up_after_failure
    report_lists >/dev/null 2>&1 || true
    PROCESSED_JSON=$(moved_items_json 2>/dev/null) || PROCESSED_JSON=''
    REASON=unknown
    write_outcome failed "$(failed_sentence)" >/dev/null 2>&1 || true
    write_paths >/dev/null 2>&1 || true
    SUMMARY='' report_final failed "$STEP: unexpected error" >/dev/null 2>&1 || true
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
# [error]; reads PROCESSED_JSON and SUMMARY when set, and SET_ASIDE_JSON and
# ADDED on a done report.
report() {
  local state=$1 error=${2:-}
  local args=(--arg state "$state" --arg kind "$MODE" --arg runId "$RUN_ID")
  [ -n "$error" ] && args+=(--arg error "$error")
  [ -n "$REASON" ] && args+=(--arg reason "$REASON")
  [ -n "${PROCESSED_JSON:-}" ] && args+=(--argjson processed "$PROCESSED_JSON")
  [ -n "${SUMMARY:-}" ] && args+=(--arg summary "$SUMMARY")
  [ -n "$REFUSED_JSON" ] && args+=(--argjson refused "$REFUSED_JSON")
  [ -n "${QUARANTINED_JSON:-}" ] && args+=(--argjson quarantined "$QUARANTINED_JSON")
  # Report v2 (#598): only a finished run says what it set aside and added.
  if [ "$state" = done ]; then
    [ -n "$SET_ASIDE_JSON" ] && args+=(--argjson setAside "$SET_ASIDE_JSON")
    [ -n "$ADDED" ] && args+=(--arg added "$ADDED")
    # R-MEAN-1: what the run means, when the agent said anything.
    [ -n "$DISAGREE_JSON" ] && [ "$DISAGREE_JSON" != '[]' ] &&
      args+=(--argjson disagree "$DISAGREE_JSON")
    [ -n "$NEXT_JSON" ] && [ "$NEXT_JSON" != '[]' ] && args+=(--argjson next "$NEXT_JSON")
  fi
  # R-RUNNER-1: a final report, done or failed, says what was created,
  # updated and left in the inbox.
  if [ "$state" != running ]; then
    [ -n "$CREATED_JSON" ] && args+=(--argjson created "$CREATED_JSON")
    [ -n "$UPDATED_JSON" ] && args+=(--argjson updated "$UPDATED_JSON")
    [ -n "$LEFT_JSON" ] && args+=(--argjson left "$LEFT_JSON")
  fi
  # R-RUNNER-4: a running report may carry the phase, and a total when
  # known (PHASE and TOTAL, set by report_phase).
  if [ "$state" = running ] && [ -n "${PHASE:-}" ]; then
    args+=(--arg phase "$PHASE")
    [ -z "${TOTAL:-}" ] || args+=(--argjson total "$TOTAL")
  fi
  jq -cn --argjson list "$MAX_REPORT_LIST" --argjson max "$MAX_REPORT_ENTRIES" \
    "${args[@]}" "$REPORT_FILTER" |
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
    vault_missing) echo 'Your Bower folder is no longer in your Drive. Nothing was changed.' ;;
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
# A done run that saved its changes also carries report v2 (#598): `items`
# (each processed item with its kind, and `to` and `renamedFrom` when it
# moved), `setAside` ({ path, reason }) and `added`, the same as the status
# report; these name paths, because the app shows where each thing went.
# Every run, a failed one too, also carries the final report's `created`,
# `updated` and `left` (R-RUNNER-2), so a recovered stale run is complete.
# The log.md line carries counts only, never a name. A failure here is
# logged and never fails the run. Usage: write_outcome <done|failed> <sentence>.
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
  if [ "$state" = done ] && [ "$TOO_MANY_CHANGES" -eq 0 ]; then
    [ -z "${PROCESSED_JSON:-}" ] || args+=(--argjson items "$PROCESSED_JSON")
    [ -z "$SET_ASIDE_JSON" ] || args+=(--argjson setAside "$SET_ASIDE_JSON")
    [ -z "$ADDED" ] || args+=(--arg added "$ADDED")
    [ -z "$DISAGREE_JSON" ] || [ "$DISAGREE_JSON" = '[]' ] ||
      args+=(--argjson disagree "$DISAGREE_JSON")
    [ -z "$NEXT_JSON" ] || [ "$NEXT_JSON" = '[]' ] || args+=(--argjson next "$NEXT_JSON")
  elif [ "$state" = failed ]; then
    # The items already moved in Drive, as the failed report (R-RUNNER-5).
    [ -z "${PROCESSED_JSON:-}" ] || args+=(--argjson items "$PROCESSED_JSON")
  fi
  # R-RUNNER-2: the same created, updated and left as the final report, on
  # a failed run too, so a recovered stale run tells the full story.
  [ -z "$CREATED_JSON" ] || args+=(--argjson created "$CREATED_JSON")
  [ -z "$UPDATED_JSON" ] || args+=(--argjson updated "$UPDATED_JSON")
  [ -z "$LEFT_JSON" ] || args+=(--argjson left "$LEFT_JSON")
  if ! jq -cn --argjson list "$MAX_REPORT_LIST" --argjson max "$MAX_REPORT_ENTRIES" \
    "${args[@]}" "$REPORT_FILTER" >"$dir/.bower/last-run.json"; then
    log "outcome not written"
    return 0
  fi
  echo '.bower/last-run.json' >"$dir/files.txt"
  if rclone copyto vault:log.md "$dir/log.md" --retries 1 --low-level-retries 2 \
    </dev/null >>"$RCLONE_LOG" 2>&1; then
    echo "- $(date -u '+%F %H:%M') · Tidy-up $state · $sentence ($processed filed, $quarantined set aside, $refused refused)" >>"$dir/log.md"
    echo 'log.md' >>"$dir/files.txt"
  fi
  if ! rclone copy "$dir" vault: --files-from-raw "$dir/files.txt" --retries 1 \
    --low-level-retries 2 </dev/null >>"$RCLONE_LOG" 2>&1; then
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
  ! is_memory_file "$1" || return 1
  case "$1" in
    Rules.md) [ "$RULES_WRITABLE" -eq 1 ] || return 1 ;;
  esac
  in_known_root "$1"
}

# Whether the path $1 is a file Claude Code loads as memory: a CLAUDE.md or
# a CLAUDE.local.md at any depth, in any letter case (a case-insensitive
# disk or Drive client may serve one as the other).
is_memory_file() {
  case "${1,,}" in
    claude.md | */claude.md | claude.local.md | */claude.local.md) return 0 ;;
  esac
  return 1
}

# Before the run: keep a copy of every file the audit may have to put back:
# those outside the known roots (CLAUDE.md and README.md among them),
# Rules.md and any nested memory file (is_memory_file). Whether Rules.md may
# change is not known yet at this point, so it is always kept.
keep_pre_run_copy() {
  local path
  while IFS= read -r path; do
    if [ "$path" != Rules.md ] && ! is_memory_file "$path"; then
      in_known_root "$path" && continue
    fi
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
    >>"$RCLONE_LOG" 2>&1 || return 1
  # R-RUNNER-1: only a copy that succeeded counts as uploaded.
  cat "$1" >>"$UPLOADED_FILE"
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

# The frontmatter of the note $1 as one "<by><TAB><kind><TAB><original>" line,
# "-" for a field it lacks. `original` is cut to the file name a link names
# ("[[Folder/Report.docx|alias]]" gives "Report.docx").
note_meta() {
  awk '{ sub(/\r$/, "") }
    NR == 1 { if ($0 != "---") exit; next }
    /^---[ \t]*$/ { exit }
    /^by:/ { by = $0; sub(/^by:/, "", by) }
    /^kind:/ { kind = $0; sub(/^kind:/, "", kind) }
    /^original:/ { orig = $0; sub(/^original:/, "", orig) }
    END {
      gsub(/[ \t"\047]/, "", by)
      gsub(/[ \t"\047]/, "", kind)
      sub(/^[ \t"\047]*(\[\[)?/, "", orig)
      sub(/(\]\])?["\047 \t]*$/, "", orig)
      sub(/[|#].*$/, "", orig)
      sub(/^.*\//, "", orig)
      printf "%s\t%s\t%s\n", (by == "" ? "-" : by), (kind == "" ? "-" : kind), (orig == "" ? "-" : orig)
    }' "$1"
}

# R-RUNNER-7, R-AG-9 (T9), after the move detection: appends "## The document"
# and the text kept before the run (DOC_TEXT_MAP) to each document's text
# copy, an accepted note the agent wrote (`by: bower`) whose `original:` names
# the document, whose name is the document's base name, and which has no
# "## The document" yet. The agent's rename of an original is followed
# through MOVES_FILE. A document with no kept text writes nothing: no empty
# section. A scan (no text layer) gets "Scanned: no text to copy". The
# document's name must be unique among the pending ones, else nothing is
# guessed. Logs a count only.
# R-SS-12: a new text copy (the agent created it in this session) whose
# original is a PDF with no kept text, next to it in the same folder and not
# pending (a filed PDF the agent was asked about), gets the PDF's text the
# same way: pdf_text runs on it now (too_large still applies, a PDF
# pdftotext cannot read gets nothing) and its text, or the scan line, is
# appended as above.
append_document_text() {
  [ "$TOO_MANY_CHANGES" -eq 0 ] || return 0
  local map="$WORK_DIR/doc-text-names.txt" before="$WORK_DIR/before-paths-text.txt"
  local path base by kind orig file n pdf appended=0 filed=0
  cut -d ' ' -f 3- "$MANIFEST_BEFORE" | LC_ALL=C sort -u >"$before" || return 1
  {
    cat "$DOC_TEXT_MAP"
    awk -F '\t' 'FILENAME == ARGV[1] { p = $1; sub(/^.*\//, "", p); f[p] = $2; next }
      { q = $2; sub(/^.*\//, "", q); p = $1; sub(/^.*\//, "", p); if (p in f) print q "\t" f[p] }' \
      "$DOC_TEXT_MAP" "$MOVES_FILE"
  } | LC_ALL=C sort -u >"$map" || return 1
  while IFS= read -r path; do
    case "$path" in *.md) ;; *) continue ;; esac
    [ -f "$VAULT_DIR/$path" ] || continue
    IFS=$'\t' read -r by kind orig < <(note_meta "$VAULT_DIR/$path")
    [ "$by" = bower ] && [ "$kind" = - ] && [ "$orig" != - ] || continue
    base=${path##*/}
    [ "${base%.md}" = "${orig%.*}" ] || continue
    if grep -qxF '## The document' "$VAULT_DIR/$path"; then continue; fi
    n=$(O="$orig" awk -F '\t' '$1 == ENVIRON["O"]' "$map" | grep -c . || true)
    if [ "$n" -eq 0 ]; then
      case "$orig" in
        *.[pP][dD][fF]) ;;
        *) continue ;;
      esac
      ! grep -qxF -- "$path" "$before" || continue
      pdf=$orig
      [ "${path%/*}" = "$path" ] || pdf="${path%/*}/$orig"
      [ -f "$VAULT_DIR/$pdf" ] || continue
      ! grep -qxF -- "$pdf" "$PENDING_FILE" || continue
      pdf_text "$pdf"
      file=$(O="$orig" awk -F '\t' '$1 == ENVIRON["O"] { f = $2 } END { print f }' "$DOC_TEXT_MAP")
      [ -n "$file" ] || continue
      filed=$((filed + 1))
    elif [ "$n" -eq 1 ]; then
      file=$(O="$orig" awk -F '\t' '$1 == ENVIRON["O"] { print $2 }' "$map")
    else
      continue
    fi
    {
      [ -z "$(tail -c1 "$VAULT_DIR/$path")" ] || printf '\n'
      printf '\n## The document\n\n'
      if [ "$file" = - ]; then
        printf 'Scanned: no text to copy\n'
      else
        cat "$file"
      fi
    } >>"$VAULT_DIR/$path" || return 1
    appended=$((appended + 1))
  done <"$CHANGED_FILE"
  [ "$appended" -eq 0 ] || log "$appended text copies completed"
  [ "$filed" -eq 0 ] || log "$filed of them for filed PDFs"
  # The appended text changed those files: the manifest must say so.
  [ "$appended" -eq 0 ] || manifest >"$MANIFEST_AFTER"
}

# R-AG-4 and R-AG-5, after the audit: a note the agent created that is named
# over 40 characters, or that is a companion note (it has a `kind`) named like
# its original's base name, is a warning in the run's summary (the status
# callback), never a refusal. A text copy (no `kind`, named like its
# original) is exempt, and so are hub notes, answers, the log and the index.
# Only counts are logged: no note name or path.
audit_note_names() {
  AUDIT_WARNING=''
  [ "$TOO_MANY_CHANGES" -eq 0 ] || return 0
  local before="$WORK_DIR/before-paths-audit.txt" path base by kind orig long=0 same=0 chars parts=()
  cut -d ' ' -f 3- "$MANIFEST_BEFORE" | LC_ALL=C sort -u >"$before" || return 1
  while IFS= read -r path; do
    case "$path" in
      *.md) ;;
      *) continue ;;
    esac
    case "$path" in
      index.md | log.md | Rules.md | README.md | Answers/* | .bower/* | */_*.md | _*.md | CLAUDE.md | */CLAUDE.md) continue ;;
    esac
    [ -f "$VAULT_DIR/$path" ] || continue
    ! grep -qxF -- "$path" "$before" || continue
    IFS=$'\t' read -r by kind orig < <(note_meta "$VAULT_DIR/$path")
    [ "$by" = bower ] || continue
    base=${path##*/}
    base=${base%.md}
    if [ "$orig" != - ] && [ "$base" = "${orig%.*}" ] && [ "${orig##*.}" != md ]; then
      # Named like its original: fine for a text copy, a violation for a
      # companion note.
      [ "$kind" = - ] || same=$((same + 1))
      continue
    fi
    chars=$(LC_ALL=C.UTF-8 bash -c 'printf "%s" "${#1}"' _ "$base" 2>/dev/null) || chars=${#base}
    [ "$chars" -le 40 ] || long=$((long + 1))
  done <"$CHANGED_FILE"
  [ "$long" -eq 0 ] || parts+=("$long note $([ "$long" -eq 1 ] && echo name || echo names) over 40 characters")
  [ "$same" -eq 0 ] || parts+=("$same $([ "$same" -eq 1 ] && echo note || echo notes) named like $([ "$same" -eq 1 ] && echo its || echo their) original")
  [ "${#parts[@]}" -gt 0 ] || return 0
  AUDIT_WARNING="Warning: ${parts[0]}${parts[1]:+; ${parts[1]}}."
  log "note name audit: $long over 40 characters, $same named like their original"
}

# >>> bookkeeping (R-SS-9, R-SS-10, R-SS-13): agent/test/bookkeeping.test.sh
# runs this block as is. Pure functions over index.md and log.md text, plus
# the two wrappers that write them in the local copy (book_tags,
# append_log_lines), so the changes go up with the run's other changes.

# The index file $1 with its `## Tags` section recounted (R-SS-9), printed.
# A row is a list item that starts with a wikilink, outside `## Tags`; its
# tag field is the third ` · ` field when that field is made of `#tag`
# tokens only (an older row's third field is its origin or a description,
# never counted). Each valid tag (`^#[a-z0-9]+(-[a-z0-9]+)*$`) counts once
# per row; notes' frontmatter never counts. In the section each
# `- #<tag> · <meaning> · <count>` line gets the new count (0 for a tag no
# row uses any more: the line stays), a tag used in a row but missing gets
# `- #<tag> · — · <n>`, and the tag lines are sorted by tag (byte order).
# The lines of the section before its first tag line stay where they are
# (an `_(none yet)_` line goes once there is a tag), the other lines that
# are not blank follow the tag lines. With no section and a counted tag, a
# section is added at the end. When the tag lines come out exactly as they
# were, the file is printed unchanged. Line ends are printed as LF.
recount_tags() {
  LC_ALL=C awk '
    function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
    function valid(t) { return t ~ /^#[a-z0-9]+(-[a-z0-9]+)*$/ && length(t) <= 64 }
    { sub(/\r$/, ""); line[NR] = $0 }
    /^## / {
      if (s && !e) e = NR - 1
      if (!s && $0 ~ /^## Tags[ \t]*$/) s = NR
    }
    END {
      if (s && !e) e = NR
      for (i = 1; i <= NR; i++) {
        if (s && i >= s && i <= e) continue
        if (line[i] !~ /^[ \t]*[-*+][ \t]+\[\[/) continue
        n = split(line[i], f, " · ")
        if (n < 3) continue
        field = trim(f[3])
        if (field !~ /^#[^ \t]+([ \t]+#[^ \t]+)*$/) continue
        k = split(field, toks, /[ \t]+/)
        delete seen
        for (j = 1; j <= k; j++) {
          t = toks[j]
          if (!valid(t) || (t in seen)) continue
          seen[t] = 1
          count[t]++
        }
      }
      # The section as it is: its tag lines, the lines before the first one
      # and the other lines after it.
      ntag = 0; npre = 0; npost = 0; none = 0
      if (s) for (i = s + 1; i <= e; i++) {
        l = line[i]
        t = ""
        if (l ~ /^- #[^ \t]/) { t = substr(l, 3); sub(/[ \t].*$/, "", t) }
        # The line of an invalid tag stays as it is: not counted, not sorted.
        if (t != "" && valid(t)) {
          if (t in meaning) continue
          old[++ntag] = l
          m = split(l, p, " · ")
          if (m >= 3 && trim(p[m]) ~ /^[0-9]+$/) { mean = p[2]; for (j = 3; j < m; j++) mean = mean " · " p[j] }
          else if (m == 2 && trim(p[2]) !~ /^[0-9]+$/) mean = p[2]
          else if (m >= 3) { mean = p[2]; for (j = 3; j <= m; j++) mean = mean " · " p[j] }
          else mean = "—"
          mean = trim(mean)
          if (mean == "") mean = "—"
          meaning[t] = mean
          tags[++nt] = t
        } else if (ntag == 0) pre[++npre] = l
        else if (l ~ /[^ \t]/) post[++npost] = l
      }
      for (t in count) if (!(t in meaning)) { meaning[t] = "—"; tags[++nt] = t }
      for (i = 2; i <= nt; i++) {
        v = tags[i]
        for (j = i - 1; j >= 1 && tags[j] > v; j--) tags[j + 1] = tags[j]
        tags[j + 1] = v
      }
      for (i = 1; i <= nt; i++) out[i] = "- " tags[i] " · " meaning[tags[i]] " · " (count[tags[i]] + 0)
      same = (nt == ntag)
      for (i = 1; same && i <= nt; i++) if (out[i] != old[i]) same = 0
      if (same) {
        for (i = 1; i <= NR; i++) print line[i]
        exit
      }
      for (i = 1; i <= NR; i++) {
        if (!s || i < s || i > e) { print line[i]; continue }
        if (i > s) continue
        print line[i]
        for (j = 1; j <= npre; j++) if (!(nt > 0 && trim(pre[j]) == "_(none yet)_")) print pre[j]
        for (j = 1; j <= nt; j++) print out[j]
        for (j = 1; j <= npost; j++) print post[j]
        if (e < NR) print ""
      }
      if (!s && nt > 0) {
        if (NR > 0 && line[NR] != "") print ""
        print "## Tags"
        for (j = 1; j <= nt; j++) print out[j]
      }
    }' "$1"
}

# The valid tags (`^#[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters) of
# the first `## Tags` section of the index file $1, as recount_tags reads
# it, one per line, sorted; nothing when there is no file or no section.
# Only these ever reach a `Tag added:` line.
section_tags() {
  [ -f "$1" ] || return 0
  awk '{ sub(/\r$/, "") }
    /^## / { if (on) exit; on = ($0 ~ /^## Tags[ \t]*$/); next }
    on && /^- #[^ \t]/ {
      t = substr($0, 3); sub(/[ \t].*$/, "", t)
      if (t ~ /^#[a-z0-9]+(-[a-z0-9]+)*$/ && length(t) <= 64) print t
    }' "$1" |
    LC_ALL=C sort -u
}

# Appends each line of file $2 that log.md (in the folder $1) does not hold
# yet, after a line break if its last line has none. Adds log.md to
# UPLOAD_FILE when it changed. LOG_LINES_ADDED is the number of lines
# added. The `Filed:` lines (book_moves) and the `Tag added:` lines
# (book_tags) both go through here.
append_log_lines() {
  local vault=$1 lines=$2 line
  LOG_LINES_ADDED=0
  [ -s "$lines" ] || return 0
  touch "$vault/log.md" || return 1
  if [ -s "$vault/log.md" ] && [ -n "$(tail -c 1 "$vault/log.md")" ]; then
    echo >>"$vault/log.md" || return 1
  fi
  while IFS= read -r line; do
    grep -qxF -- "$line" "$vault/log.md" && continue
    printf '%s\n' "$line" >>"$vault/log.md" || return 1
    LOG_LINES_ADDED=$((LOG_LINES_ADDED + 1))
  done <"$lines"
  [ "$LOG_LINES_ADDED" -eq 0 ] || printf '%s\n' log.md >>"$UPLOAD_FILE"
}

# R-SS-9, R-SS-13, in the bookkeeping phase: recounts `## Tags` in the
# folder $1's index.md (recount_tags) and, for each tag of the section that
# was not in the section of $2 (index.md before the session), appends
# `- <stamp $3> · Tag added: #<tag>` to log.md, the stamp and helper the
# `Filed:` lines use. Each file it changed joins UPLOAD_FILE. Logs counts.
book_tags() {
  local vault=$1 before=$2 stamp=$3 out="$WORK_DIR/index-recount.md" lines="$WORK_DIR/tag-log.txt"
  local now="$WORK_DIR/tags-after.txt" was="$WORK_DIR/tags-before.txt"
  [ -f "$vault/index.md" ] || return 0
  recount_tags "$vault/index.md" >"$out" || return 1
  if ! tr -d '\r' <"$vault/index.md" | cmp -s - "$out"; then
    # Windows line ends stay Windows line ends.
    if [ -n "$(tr -cd '\r' <"$vault/index.md" | head -c 1)" ]; then
      sed 's/$/\r/' "$out" >"$vault/index.md" || return 1
    else
      cat "$out" >"$vault/index.md" || return 1
    fi
    printf '%s\n' index.md >>"$UPLOAD_FILE"
  fi
  rm -f "$out"
  section_tags "$before" >"$was" || return 1
  section_tags "$vault/index.md" >"$now" || return 1
  LC_ALL=C comm -13 "$was" "$now" | sed "s/^/- $stamp · Tag added: /" >"$lines" || return 1
  append_log_lines "$vault" "$lines" || return 1
  awk '!seen[$0]++' "$UPLOAD_FILE" >"$UPLOAD_FILE.tmp" && mv "$UPLOAD_FILE.tmp" "$UPLOAD_FILE" || return 1
  log "tags: $(grep -c . "$now" || true) counted, $LOG_LINES_ADDED added"
}

# The rows of the index file $2 that are not in the index file $1 word for
# word (added or changed), outside `## Tags`, one per line. $1 may be
# missing (no index before): every row is new.
changed_rows() {
  local before=$1
  [ -f "$before" ] || before=/dev/null
  awk 'FILENAME == ARGV[1] { sub(/\r$/, ""); had[$0] = 1; next }
    { sub(/\r$/, "") }
    /^## / { tags = ($0 ~ /^## Tags[ \t]*$/); next }
    !tags && /^[ \t]*[-*+][ \t]+\[\[/ && !($0 in had)' "$before" "$2"
}

# Whether the index row $1 is in the rules v24 form (R-SS-8, R-SS-10):
#   - [[<path>]] · <Type> · <#tag #tag> · <description> · <origin>
# with an optional trailing ` · [[<original>]]`. The type is not empty (the
# app's words, app/src/vault-index.ts FILE_KIND_LABELS: Note, PDF, Photo,
# iPhone photo, Image, Google Doc, Google Sheet, Google Slides, Excel
# spreadsheet, Spreadsheet (CSV), Word document, PowerPoint, OpenDocument,
# Text, Markdown, ZIP archive, Email, Web page, Audio, Video, File; the
# rulebook asks for one word, the check does not hold it to the list); one
# to five tags matching `^#[a-z0-9]+(-[a-z0-9]+)*$`; a description of 1 to
# 100 characters with no `[[`; an origin the app knows, any letter case
# (app/src/file-origin.ts ORIGIN_LABELS, keys and labels: filed, yours,
# asked, drive, "filed by Bower", "your note", "Bower wrote it when you
# asked", "from your Drive, as Markdown").
row_ok() {
  local rest=${1%$'\r'} fields=() n tag tags=() desc origin chars
  while [[ $rest == *' · '* ]]; do
    fields+=("${rest%% · *}")
    rest=${rest#* · }
  done
  fields+=("$rest")
  n=${#fields[@]}
  if [ "$n" -eq 6 ]; then
    [[ ${fields[5]} =~ ^[[:space:]]*\[\[[^]]+\]\][[:space:]]*$ ]] || return 1
  elif [ "$n" -ne 5 ]; then
    return 1
  fi
  [[ ${fields[0]} =~ ^[[:space:]]*[-*+][[:space:]]+\[\[[^]]+\]\][[:space:]]*$ ]] || return 1
  [[ ${fields[1]} =~ [^[:space:]] ]] || return 1
  read -r -a tags <<<"${fields[2]}"
  [ "${#tags[@]}" -ge 1 ] && [ "${#tags[@]}" -le 5 ] || return 1
  for tag in "${tags[@]}"; do
    [[ $tag =~ ^#[a-z0-9]+(-[a-z0-9]+)*$ ]] || return 1
  done
  desc=${fields[3]}
  desc=${desc#"${desc%%[![:space:]]*}"}
  desc=${desc%"${desc##*[![:space:]]}"}
  [ -n "$desc" ] && [[ $desc != *'[['* ]] || return 1
  # Characters, not bytes: UTF-8 continuation bytes are not counted.
  chars=$(printf '%s' "$desc" | LC_ALL=C tr -d '\200-\277' | wc -c | tr -d ' ')
  [ "$chars" -le 100 ] || return 1
  origin=${fields[4]}
  origin=${origin#"${origin%%[![:space:]]*}"}
  origin=${origin%"${origin##*[![:space:]]}"}
  case "${origin,,}" in
    filed | yours | asked | drive | 'filed by bower' | 'your note' | \
      'bower wrote it when you asked' | 'from your drive, as markdown') return 0 ;;
  esac
  return 1
}

# R-SS-10: "<bad> <checked>", the number of rows the session added or
# changed (index file $1 before it, $2 after it) that are not in the v24
# form (row_ok), and the number checked. A row is never refused or
# rewritten.
check_rows() {
  local row bad=0 checked=0
  while IFS= read -r row; do
    checked=$((checked + 1))
    row_ok "$row" || bad=$((bad + 1))
  done < <(changed_rows "$1" "$2")
  printf '%s %s\n' "$bad" "$checked"
}
# <<< bookkeeping

# >>> filing sheet (#978): agent/test/filing.test.sh runs this block as is.
# Rules v25 (vault-template/CLAUDE.md, **index.md and log.md**): the agent
# writes its filing decisions to SHEET_FILE, one TAB-separated line each,
#   file<TAB><pending path><TAB><destination folder><TAB><file name><TAB><#tag #tag><TAB><description>
#   note<TAB><note path><TAB><original path or -><TAB><#tag #tag><TAB><description>
#   tag<TAB><#tag><TAB><meaning>
# and the runner carries them out after the session, before the audit and
# the move phase. The agent reads untrusted files, so every field is
# hostile: each line is checked on its own and a bad one is skipped (its
# file stays where it was, nothing is written for it). No field is ever run
# through a shell; paths are quoted and passed after `--`. A `file` line is
# carried out by moving the file in the local copy only: the move phase
# (find_moves, move_up, book_moves) then repeats it in Drive and writes its
# `Filed:` line, so the sheet adds no Drive write of its own. Nothing here
# logs a path, a name or a field.
readonly SHEET_FILE='.bower/filing.tsv'
readonly SHEET_MAX_LINES=2000
readonly SHEET_MAX_BYTES=1048576
readonly SHEET_MAX_LINE=2048

# The number of characters (not bytes) of $1.
sheet_chars() { printf '%s' "$1" | LC_ALL=C tr -d '\200-\277' | wc -c | tr -d ' '; }

# Whether $1 is a safe relative path in the vault: not empty, no `/` at
# either end, no `//`, no `\`, no drive letter, no control character, no
# segment that is empty or starts with `.` (so no `.`, no `..`, nothing
# under `.claude/`, `.obsidian/` or `.bower/`), and no `CLAUDE.md` at any
# depth (any letter case). A path the runner writes into a wikilink or a
# row also has no `[ ] | # ^ ·`, and no segment with a space or a `.` at
# its end; with $2 = pending (a path as the runner's own pending list
# gives it, only compared) those are allowed.
#
# Also refused, except for a pending path: the characters Windows forbids
# in a name (`: * ? " < >`), a Unicode format character (sheet_has_format),
# a Windows reserved name (CON, PRN, AUX, NUL, COM1-9, LPT1-9, with or
# without an extension), a folder named `claude` or `claude.local`, and a
# name the runner or Claude Code owns: index.md, log.md, Rules.md,
# README.md, About-Me.md, CLAUDE.md and CLAUDE.local.md, any letter case.
# Memory files (CLAUDE.md, CLAUDE.local.md) are refused in a pending path too.
sheet_path_ok() {
  local p=$1 rest seg low
  [ -n "$p" ] || return 1
  case "$p" in /* | */ | *//* | *\\* | [A-Za-z]:*) return 1 ;; esac
  [[ $p != *[[:cntrl:]]* ]] || return 1
  if [ "${2:-}" != pending ]; then
    case "$p" in *'['* | *']'* | *'|'* | *'#'* | *'^'* | *'·'* | *[*?:\"\<\>]*) return 1 ;; esac
    ! sheet_has_format "$p" || return 1
  fi
  rest=$p
  while :; do
    seg=${rest%%/*}
    low=${seg,,}
    case "$seg" in '' | .*) return 1 ;; esac
    case "$low" in claude.md | claude.local.md) return 1 ;; esac
    if [ "${2:-}" != pending ]; then
      case "$seg" in ' '* | *' ' | *.) return 1 ;; esac
      case "$low" in
        index.md | log.md | rules.md | readme.md | about-me.md | claude | claude.local) return 1 ;;
      esac
      case "${low%%.*}" in
        con | prn | aux | nul | com[1-9] | lpt[1-9]) return 1 ;;
      esac
    fi
    [ "$seg" != "$rest" ] || return 0
    rest=${rest#*/}
  done
}

# Whether $1 holds a Unicode format character (category Cf) that can hide
# or reorder text: the soft hyphen, the Arabic and Syriac marks, the
# Mongolian vowel separator, zero-width characters and joiners, the
# left-to-right and right-to-left marks, embeddings, overrides and
# isolates, word joiners and invisible operators, the byte order mark,
# the interlinear annotation characters and the tag characters. Matched
# on their UTF-8 bytes, so the locale does not matter.
sheet_has_format() {
  printf '%s' "$1" | LC_ALL=C grep -aqE \
    $'\xc2\xad|\xd8[\x80-\x85\x9c]|\xdb\x9d|\xdc\x8f|\xe0\xa3\xa2|\xe1\xa0\x8e|\xe2\x80[\x8b-\x8f\xaa-\xae]|\xe2\x81[\xa0-\xa4\xa6-\xaf]|\xef\xbb\xbf|\xef\xbf[\xb9-\xbb]|\xf3\xa0[\x80-\x81]'
}

# Whether every segment of the checked path $2 (sheet_path_ok: no glob
# character) is in the vault $1 under exactly that name.
sheet_exact() {
  local dir=$1 rest=$2 seg
  while [ -n "$rest" ]; do
    seg=${rest%%/*}
    [ -n "$(find "$dir" -mindepth 1 -maxdepth 1 -name "$seg" -print -quit 2>/dev/null)" ] || return 1
    dir="$dir/$seg"
    [ "$seg" != "$rest" ] || return 0
    rest=${rest#*/}
  done
}

# Whether the folder $1 holds an entry named $2 in any letter case (or
# exactly, a link included): such a name counts as taken. $2 is a checked
# name (sheet_path_ok), so it holds no glob character.
sheet_taken() {
  [ ! -e "$1/$2" ] && [ ! -L "$1/$2" ] || return 0
  [ -d "$1" ] || return 1
  [ -n "$(find "$1" -mindepth 1 -maxdepth 1 -iname "$2" -print -quit 2>/dev/null)" ]
}

# The extension of the file name $1 in lower case, or nothing.
sheet_ext() {
  local e=''
  [[ $1 != ?*.* ]] || e=${1##*.}
  printf '%s' "${e,,}"
}

# The number of bytes (not characters) of $1.
sheet_bytes() {
  local LC_ALL=C
  printf '%s' "${#1}"
}

# Whether $1 is a usable file name for the original named $2, as written:
# a safe path (sheet_path_ok) of one segment with the original's extension
# (any letter case). A name the agent kept (exactly $2) may be up to 200
# bytes long: the rulebook keeps a name that already says what the file
# is, whatever its length (#995). A name the agent changed is at most 60
# characters.
sheet_name_ok() {
  sheet_path_ok "$1" || return 1
  [[ $1 != */* ]] || return 1
  [ "$(sheet_ext "$1")" = "$(sheet_ext "$2")" ] || return 1
  if [ "$1" = "$2" ]; then
    [ "$(sheet_bytes "$1")" -le 200 ]
  else
    [ "$(sheet_chars "$1")" -le 60 ]
  fi
}

# Whether $1 is a name the agent changed (not $2, the original's name) that
# is usable but for its length: a safe path of one segment, with the
# original's extension, over 60 characters. The runner shortens such a
# name (sheet_name_short) instead of refusing the line (#995).
sheet_name_long() {
  [ "$1" != "$2" ] || return 1
  sheet_path_ok "$1" || return 1
  [[ $1 != */* ]] || return 1
  [ "$(sheet_ext "$1")" = "$(sheet_ext "$2")" ] || return 1
  [ "$(sheet_chars "$1")" -gt 60 ]
}

# The stem of the file name $1: the name without its extension.
sheet_stem() {
  if [[ $1 == ?*.* ]]; then printf '%s' "${1%.*}"; else printf '%s' "$1"; fi
}

# The long name $1 (sheet_name_long) shortened to at most 60 characters and
# free in the folder $2, printed: the extension kept, the stem cut at the
# last word boundary that fits (a first word that does not fit alone is cut
# by characters), trailing spaces and punctuation trimmed, and ` (2)`,
# ` (3)`, ... ` (9)` added before the extension while the name is taken
# there in any letter case (sheet_taken). Pure string work, no pattern
# built from the name; the stem is cut once with no suffix and once for
# the suffixes (all four characters long), with no process per word, so a
# hostile sheet cannot make it slow. Returns 1 when no such name is left
# or the result is not a safe name.
sheet_name_short() {
  local LC_ALL=C
  local name=$1 dir=$2 ext="" stem words=() n cut cand len
  [[ $name != ?*.* ]] || ext=.${name##*.}
  stem=${name%"$ext"}
  read -r -a words <<<"$stem"
  [ "${#words[@]}" -gt 0 ] || return 1
  sheet_nchars "$ext"
  len=$SHEET_N
  sheet_cut $((60 - len)) "${words[@]}" || return 1
  cand=$SHEET_CUT$ext
  sheet_path_ok "$cand" || return 1
  if ! sheet_taken "$dir" "$cand"; then
    printf '%s' "$cand"
    return 0
  fi
  sheet_cut $((60 - len - 4)) "${words[@]}" || return 1
  cut=$SHEET_CUT
  sheet_path_ok "$cut (2)$ext" || return 1
  for n in 2 3 4 5 6 7 8 9; do
    cand="$cut ($n)$ext"
    if ! sheet_taken "$dir" "$cand"; then
      printf '%s' "$cand"
      return 0
    fi
  done
  return 1
}

# SHEET_N: the number of characters of $1 (its bytes less the UTF-8
# continuation bytes), counted in the shell with no process.
sheet_nchars() {
  local LC_ALL=C
  local s=${1//[$'\x80'-$'\xbf']/}
  SHEET_N=${#s}
}

# SHEET_CUT: the words $2... joined by spaces, as many as fit in $1
# characters (the first word alone cut by characters when it does not fit),
# then trailing spaces and punctuation trimmed. Returns 1 when nothing is
# left. No process is started.
sheet_cut() {
  local LC_ALL=C
  local budget=$1 acc='' w
  shift
  [ "$budget" -gt 0 ] || return 1
  for w in "$@"; do
    sheet_nchars "${acc:+$acc }$w"
    [ "$SHEET_N" -le "$budget" ] || break
    acc=${acc:+$acc }$w
  done
  if [ -z "$acc" ]; then
    acc=$1
    sheet_nchars "$acc"
    while [ -n "$acc" ] && [ "$SHEET_N" -gt "$budget" ]; do
      # One character off the end: its UTF-8 continuation bytes, then its
      # first byte.
      while [[ $acc == *[$'\x80'-$'\xbf'] ]]; do acc=${acc%?}; done
      acc=${acc%?}
      sheet_nchars "$acc"
    done
  fi
  while [[ $acc == *[' ,;:.!_&+(-'] || $acc == *'–' || $acc == *'—' ]]; do
    if [[ $acc == *[' ,;:.!_&+(-'] ]]; then acc=${acc%?}; else acc=${acc%???}; fi
  done
  SHEET_CUT=$acc
  [ -n "$acc" ]
}

# The renames the runner made this run (#995), in step: SHEET_MAP_FROM[i]
# is a path as the agent wrote it, SHEET_MAP_TO[i] the path used. Compared
# as plain strings only.
SHEET_MAP_FROM=()
SHEET_MAP_TO=()
# The pending paths whose name the runner tried to shorten this run, the
# text copies it moved and booked itself (sheet_sibling), and the notes
# booked without their original (counts only).
SHEET_SHORT_SRC=()
SHEET_SIBLINGS=()
SHEET_UNLINKED_COUNT=0

# Whether $1 is one of $2...: plain string comparison.
sheet_has() {
  local x=$1
  shift
  while [ "$#" -gt 0 ]; do
    [ "$1" != "$x" ] || return 0
    shift
  done
  return 1
}

# The path $1 as the runner filed it: its entry in SHEET_MAP_TO when the
# agent's path is in SHEET_MAP_FROM, else $1 as it is.
sheet_mapped() {
  local i
  for i in "${!SHEET_MAP_FROM[@]}"; do
    if [ "${SHEET_MAP_FROM[$i]}" = "$1" ]; then
      printf '%s' "${SHEET_MAP_TO[$i]}"
      return 0
    fi
  done
  printf '%s' "$1"
}

# Replaces every link to a name the runner changed this run in the note $2
# (vault $1) by the renamed form: `[[<x>]]`, `[[<x>|` and `[[<x>#`, where
# <x> is the agent's name, its stem, its path from the top of the folder
# or that path without the extension. A literal replace (awk index, no
# regex built from a name). A note whose content was held before the run
# (the manifest $3) is left as it is: the move phase finds a moved file by
# its content. Returns 1 when a rewrite fails.
sheet_relink() {
  local file="$1/$2" before=$3 key i j f t from to suf old new
  local froms=() tos=()
  [ "${#SHEET_MAP_FROM[@]}" -gt 0 ] || return 0
  key=$(cksum <"$file" | awk '{ print $1 " " $2 }') || return 1
  ! K="$key" awk '$1 " " $2 == ENVIRON["K"] { f = 1; exit } END { exit !f }' "$before" || return 0
  for i in "${!SHEET_MAP_FROM[@]}"; do
    from=${SHEET_MAP_FROM[$i]}
    to=${SHEET_MAP_TO[$i]}
    f=${from##*/}
    t=${to##*/}
    froms=("$f" "$(sheet_stem "$f")" "$from" "${from%/*}/$(sheet_stem "$f")")
    tos=("$t" "$(sheet_stem "$t")" "$to" "${to%/*}/$(sheet_stem "$t")")
    for j in 0 1 2 3; do
      for suf in ']]' '|' '#'; do
        old="[[${froms[$j]}$suf"
        new="[[${tos[$j]}$suf"
        grep -qF -- "$old" "$file" || continue
        O="$old" N="$new" sheet_rewrite "$file" '
        { sub(/\r$/, ""); s = $0; out = ""
          while ((i = index(s, ENVIRON["O"])) > 0) {
            out = out substr(s, 1, i - 1) ENVIRON["N"]
            s = substr(s, i + length(ENVIRON["O"]))
          }
          print out s }' || return 1
      done
    done
  done
}

# Whether $1 holds 1 to 5 tags in the rules v24 form, as row_ok checks
# them: `^#[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters each.
sheet_tags_ok() {
  local tags=() t
  read -r -a tags <<<"$1"
  [ "${#tags[@]}" -ge 1 ] && [ "${#tags[@]}" -le 5 ] || return 1
  for t in "${tags[@]}"; do
    [[ $t =~ ^#[a-z0-9]+(-[a-z0-9]+)*$ ]] && [ "${#t}" -le 64 ] || return 1
  done
}

# Whether $1 is a usable row text of at most $2 characters (100 for a
# description, 80 for a tag's meaning): not empty, not `-`, no control
# character, no `·` and no wikilink.
sheet_text_ok() {
  [ -n "$1" ] && [ "$1" != - ] || return 1
  [[ $1 != *[[:cntrl:]]* && $1 != *'·'* && $1 != *'[['* && $1 != *']]'* ]] || return 1
  ! sheet_has_format "$1" || return 1
  [ "$(sheet_chars "$1")" -le "$2" ]
}

# The row text $1 for a limit of $2 characters, printed: every rule of
# sheet_text_ok but the length is checked on the whole text (returns 1 when
# one fails), then a text over the limit is shortened instead of refused
# (the rulebook still asks the agent for at most 100; the runner is only
# lenient here): its first words, as many as fit with a trailing `…`
# (counted in the limit), a `,`, `;`, `:` or space before the `…` dropped.
# Returns 1 when not even the first word fits.
sheet_text_fit() {
  local text=$1 max=$2 words=() w acc='' try
  sheet_text_ok "$text" 1000000 || return 1
  if [ "$(sheet_chars "$text")" -le "$max" ]; then
    printf '%s' "$text"
    return 0
  fi
  read -r -a words <<<"$text"
  for w in "${words[@]}"; do
    try=${acc:+$acc }$w
    [ "$(sheet_chars "$try")" -le $((max - 1)) ] || break
    acc=$try
  done
  while [[ $acc == *[,\;:\ ] ]]; do acc=${acc%?}; done
  [ -n "$acc" ] || return 1
  printf '%s…' "$acc"
}

# The row type for the file name $1, from its extension: the app's kinds
# (app/src/vault-index.ts EXTENSION_KINDS and FILE_KIND_LABELS) folded into
# the rulebook's words:
#   md                                   Note
#   pdf                                  PDF
#   jpg jpeg png webp heic heif          Photo
#   gif svg                              Image
#   xlsx xls csv ods                     Spreadsheet
#   docx doc pptx ppt odt odp rtf txt    Document
#   markdown html htm epub eml
#   mp3 m4a wav                          Audio
#   mp4 mov                              Video
#   anything else (zip, none, ...)       File
sheet_type_of() {
  case "$(sheet_ext "$1")" in
    md) echo Note ;;
    pdf) echo PDF ;;
    jpg | jpeg | png | webp | heic | heif) echo Photo ;;
    gif | svg) echo Image ;;
    xlsx | xls | csv | ods) echo Spreadsheet ;;
    docx | doc | pptx | ppt | odt | odp | rtf | txt | markdown | html | htm | epub | eml) echo Document ;;
    mp3 | m4a | wav) echo Audio ;;
    mp4 | mov) echo Video ;;
    *) echo File ;;
  esac
}

# What the destination folder $2 is in the vault $1, printed: `processed`
# (exactly `0-Inbox/Processed`), `existing` (a folder at any depth under
# one of the four PARA folders, a real folder reached through no link) or
# `new` (a direct subfolder of one of them, not there yet, its name at
# most 60 characters). Returns 1 for anything else, the PARA folders
# themselves included.
sheet_dest_kind() {
  local vault=$1 dest=$2 real top
  if [ "$dest" = 0-Inbox/Processed ]; then
    [ ! -L "$vault/0-Inbox" ] && [ ! -L "$vault/$dest" ] || return 1
    [ ! -e "$vault/0-Inbox" ] || [ -d "$vault/0-Inbox" ] || return 1
    [ ! -e "$vault/$dest" ] || [ -d "$vault/$dest" ] || return 1
    echo processed
    return 0
  fi
  sheet_path_ok "$dest" || return 1
  case "$dest" in 1-Projects/?* | 2-Areas/?* | 3-Resources/?* | 4-Archives/?*) ;; *) return 1 ;; esac
  [ ! -L "$vault/${dest%%/*}" ] || return 1
  if [ -e "$vault/$dest" ] || [ -L "$vault/$dest" ]; then
    [ -d "$vault/$dest" ] && [ ! -L "$vault/$dest" ] || return 1
    real=$(cd -- "$vault/$dest" && pwd -P) || return 1
    top=$(cd -- "$vault" && pwd -P) || return 1
    [ "$real" = "$top/$dest" ] || return 1
    # Each folder on the way under this exact letter case (a disk that
    # ignores case finds `finance` when `Finance` is there).
    sheet_exact "$vault" "$dest" || return 1
    echo existing
    return 0
  fi
  [[ ${dest#*/} != */* ]] || return 1
  [ "$(sheet_chars "${dest#*/}")" -le 60 ] || return 1
  # A folder there under another letter case is not a new one.
  ! sheet_taken "$vault/${dest%%/*}" "${dest#*/}" || return 1
  echo new
}

# The hub note for a line booked in the folder $2 (vault $1, the manifest
# before the run $3), decided before anything is written: its hub note as
# folders_block finds them (`<folder>/<name>.md`, else the folder note
# `<folder>/_<name>.md`), printed as its path; for a folder new in this run
# with neither (sheet_fresh_folder), `new <folder>/<name>.md`; nothing for
# any other folder. Returns 1 (the line is skipped) when one of those paths
# is a link or not a plain file, or when the new hub note's name is taken
# in another letter case.
sheet_hub_plan() {
  local name=${2##*/} p
  for p in "$2/$name.md" "$2/_$name.md"; do
    [ ! -L "$1/$p" ] || return 1
    [ -e "$1/$p" ] || continue
    [ -f "$1/$p" ] || return 1
    printf '%s\n' "$p"
    return 0
  done
  sheet_fresh_folder "$3" "$2" || return 0
  [ ! -d "$1/$2" ] || ! sheet_taken "$1/$2" "$name.md" || return 1
  printf 'new %s\n' "$2/$name.md"
}

# Whether the folder $2 is new in this run: a direct subfolder of a PARA
# folder that held no file before the run (the manifest $1).
sheet_fresh_folder() {
  case "$2" in 1-Projects/* | 2-Areas/* | 3-Resources/* | 4-Archives/*) ;; *) return 1 ;; esac
  [[ ${2#*/} != */* ]] || return 1
  D="$2/" awk '{ p = $0; sub(/^[^ ]* [^ ]* /, "", p) }
    index(p, ENVIRON["D"]) == 1 { f = 1; exit }
    END { exit f }' "$1"
}

# The hub note for a new folder $2 in the vault $1 (rules v25: the runner
# creates it), `<folder>/<name>.md` as the rulebook names hub notes: its
# frontmatter (`by: bower`, the type tags and the first domain tag of $4,
# the date $3; no `statuses:`, which Bower writes in a later run), the
# name as the title and, for a project, the project hub's sections; its
# list comes last, so the hub lines go under it.
sheet_new_hub() {
  local vault=$1 dir=$2 day=$3 name=${2##*/} tags=() kind
  read -r -a tags <<<"$4"
  case "$dir" in
    1-Projects/*) kind='hub, project' ;;
    2-Areas/*) kind='hub, area' ;;
    *) kind=hub ;;
  esac
  [ "${#tags[@]}" -eq 0 ] || kind+=", ${tags[0]#\#}"
  {
    printf -- '---\ntags: [%s]\nby: bower\ncreated: %s\n---\n\n# %s\n\n' "$kind" "$day" "$name"
    case "$dir" in
      1-Projects/*) printf '## Goal\n\n## Status\n\n## Next steps\n\n## Key dates\n\n' ;;
    esac
    printf '## Notes & documents\n'
  } >"$vault/$dir/$name.md"
}

# Writes the hub line `- [[<link $3>]] <description $4>` as the plan $2
# (sheet_hub_plan) says, in the vault $1: nothing for no plan; for `new`,
# first the new hub note (sheet_new_hub, the date $5 and tags $6), only
# while nothing is at its path.
sheet_hub_write() {
  local vault=$1 plan=$2 hub
  [ -n "$plan" ] || return 0
  hub=${plan#new }
  if [ "$hub" != "$plan" ]; then
    [ ! -e "$vault/$hub" ] && [ ! -L "$vault/$hub" ] || return 1
    sheet_new_hub "$vault" "${hub%/*}" "$5" "$6" || return 1
  fi
  sheet_hub_line "$vault/$hub" "$3" "$4"
}

# Whether index.md in the vault $1 may be written: a plain file reached
# through no link, or not there yet.
sheet_index_ok() {
  [ ! -L "$1/index.md" ] || return 1
  [ ! -e "$1/index.md" ] || [ -f "$1/index.md" ]
}

# Rewrites the file $1 with the awk program $2 (its strings, L, S or O and
# N, come from the environment), keeping Windows line ends when it has them. Only a plain
# file reached through no link is rewritten; the work file is outside the
# vault.
sheet_rewrite() {
  local file=$1 tmp
  [ -f "$file" ] && [ ! -L "$file" ] || return 1
  tmp=$(mktemp "${TMPDIR:-/tmp}/bower-sheet.XXXXXX") || return 1
  awk "$2" "$file" >"$tmp" || { rm -f "$tmp"; return 1; }
  if [ -n "$(tr -cd '\r' <"$file" | head -c 1)" ]; then
    sed 's/$/\r/' "$tmp" >"$file" || { rm -f "$tmp"; return 1; }
    rm -f "$tmp"
  else
    cat "$tmp" >"$file" && rm -f "$tmp" || return 1
  fi
}

# Appends the hub line `- [[<link $2>]] <description $3>` to the hub note
# $1, under its list: after its last list item that starts with a
# wikilink, or at the end. Nothing when the note links $2 already.
sheet_hub_line() {
  ! grep -qF -- "[[$2]]" "$1" || return 0
  L="- [[$2]] $3" sheet_rewrite "$1" '
    { sub(/\r$/, ""); line[NR] = $0 }
    NR == 1 && $0 == "---" { fm = 1; next }
    fm && /^---[ \t]*$/ { fm = 0; next }
    !fm && /^[ \t]*[-*+][ \t]+\[\[/ { last = NR }
    END {
      if (!last) {
        n = NR
        while (n > 0 && line[n] ~ /^[ \t]*$/) n--
        for (i = 1; i <= n; i++) print line[i]
        print ENVIRON["L"]
        exit
      }
      for (i = 1; i <= NR; i++) { print line[i]; if (i == last) print ENVIRON["L"] }
    }'
}

# Adds the line $3 to the section headed $2 (`## Projects`, `## Tags`) of
# the index file $1: after the section's last line that is not blank, its
# `_(none yet)_` line dropped (the tag recount drops it in `## Tags`). A
# missing section is added before `## Tags`, or at the end.
sheet_section_add() {
  if [ ! -e "$1" ] && [ ! -L "$1" ]; then
    printf '# Index\n' >"$1" || return 1
  fi
  S="$2" L="$3" sheet_rewrite "$1" '
    { sub(/\r$/, ""); line[++n] = $0 }
    END {
      for (i = 1; i <= n; i++) {
        if (line[i] ~ /^## /) { if (s && !e) e = i - 1; if (!s && line[i] == ENVIRON["S"]) s = i }
        if (!t && line[i] ~ /^## Tags[ \t]*$/) t = i
      }
      if (s && !e) e = n
      if (s) {
        at = s
        for (i = s + 1; i <= e; i++) {
          if (ENVIRON["S"] != "## Tags" && line[i] ~ /^[ \t]*_\(none yet\)_[ \t]*$/) { drop[i] = 1; continue }
          if (line[i] ~ /[^ \t]/) at = i
        }
        for (i = 1; i <= n; i++) { if (!(i in drop)) print line[i]; if (i == at) print ENVIRON["L"] }
        exit
      }
      if (t && ENVIRON["S"] != "## Tags") {
        for (i = 1; i < t; i++) print line[i]
        print ENVIRON["S"]; print ENVIRON["L"]; print ""
        for (i = t; i <= n; i++) print line[i]
        exit
      }
      while (n > 0 && line[n] ~ /^[ \t]*$/) n--
      for (i = 1; i <= n; i++) print line[i]
      print ""; print ENVIRON["S"]; print ENVIRON["L"]
    }'
}

# Adds the index row $2 for the path $3 (vault $1) under its folder's
# section; nothing when a row links that path already. Only the PARA
# folders and Answers/ have a section.
sheet_index_row() {
  local index="$1/index.md" section
  case "$3" in
    1-Projects/*) section='## Projects' ;;
    2-Areas/*) section='## Areas' ;;
    3-Resources/*) section='## Resources' ;;
    4-Archives/*) section='## Archives' ;;
    Answers/*) section='## Answers' ;;
    *) return 0 ;;
  esac
  [ ! -f "$index" ] || ! grep -qF -- "[[$3]]" "$index" || return 0
  sheet_section_add "$index" "$section" "$2"
}

# One `file` line: the vault $1, the pending list $2, the manifest before
# the run $3, the date $4, then the line's five fields. Returns 1, having
# changed nothing, when the line is not usable: the pending path is not on
# the pending list or not a file there; the destination is not one
# sheet_dest_kind accepts; the file name is not usable (sheet_name_ok, or
# sheet_name_long for a changed name over 60 characters) or, as written,
# names a file that is there already (in any letter case); the tags or the
# description are not in the v24 form (both `-` for 0-Inbox/Processed);
# index.md or the folder's hub note is a link or not a plain file
# (sheet_index_ok, sheet_hub_plan). A failed mkdir or mv also skips the
# line. A changed name over 60 characters is shortened (sheet_name_short,
# which also picks ` (2)`, ` (3)` on a clash) and the rename is kept in
# SHEET_MAP_FROM and SHEET_MAP_TO for the `note` lines. Otherwise moves the
# file in the local copy, then writes its hub line (in the folder's hub
# note, made for a new folder) and its index row; nothing more for
# Processed. Returns 2 when one of those writes fails after the move.
sheet_file_line() {
  local vault=$1 pending=$2 before=$3 day=$4 src=$5 dest=$6 name=$7 tags=$8 desc=$9
  local kind target plan='' arr=() final short=0
  SHEET_WHY=path
  sheet_path_ok "$src" pending || return 1
  grep -qxF -- "$src" "$pending" || return 1
  [ -f "$vault/$src" ] && [ ! -L "$vault/$src" ] || return 1
  kind=$(sheet_dest_kind "$vault" "$dest") || return 1
  SHEET_WHY=name
  if ! sheet_name_ok "$name" "${src##*/}"; then
    sheet_name_long "$name" "${src##*/}" || return 1
    short=1
  fi
  if [ "$kind" = processed ]; then
    SHEET_WHY=tag
    [ "$tags" = - ] || return 1
    SHEET_WHY=description
    [ "$desc" = - ] || return 1
  else
    SHEET_WHY=tag
    sheet_tags_ok "$tags" || return 1
    SHEET_WHY=description
    desc=$(sheet_text_fit "$desc" 100) || return 1
  fi
  SHEET_WHY=name
  if [ "$short" -eq 1 ]; then
    # One shortening per pending file in a run, whatever the sheet repeats.
    ! sheet_has "$src" ${SHEET_SHORT_SRC[@]+"${SHEET_SHORT_SRC[@]}"} || return 1
    SHEET_SHORT_SRC+=("$src")
    # A long name already used for this folder: the links that name it go
    # to the first file, so a second one is refused, as a repeated short
    # name is.
    ! sheet_has "$dest/$name" ${SHEET_MAP_FROM[@]+"${SHEET_MAP_FROM[@]}"} || return 1
    # A file there under the long name: links that name it mean that file,
    # so nothing is shortened or remapped.
    ! sheet_taken "$vault/$dest" "$name" || return 1
    final=$(sheet_name_short "$name" "$vault/$dest") || return 1
  else
    ! sheet_taken "$vault/$dest" "$name" || return 1
    final=$name
  fi
  target="$dest/$final"
  SHEET_WHY=other
  if [ "$kind" != processed ]; then
    sheet_index_ok "$vault" || return 1
    plan=$(sheet_hub_plan "$vault" "$dest" "$before") || return 1
  fi
  mkdir -p -- "$vault/$dest" 2>/dev/null || return 1
  mv -n -- "$vault/$src" "$vault/$target" 2>/dev/null || return 1
  [ -f "$vault/$target" ] && [ ! -e "$vault/$src" ] || return 1
  if [ "$final" != "$name" ]; then
    SHEET_MAP_FROM+=("$dest/$name")
    SHEET_MAP_TO+=("$target")
  fi
  if [ "$kind" != processed ]; then
    read -r -a arr <<<"$tags"
    tags="${arr[*]}"
    sheet_hub_write "$vault" "$plan" "$final" "$desc" "$day" "$tags" || return 2
    sheet_index_row "$vault" "- [[$target]] · $(sheet_type_of "$final") · $tags · $desc · filed by Bower" "$target" ||
      return 2
  fi
  sheet_sibling "$vault" "$before" "$day" "$src" "$dest" "$name" "$final" "$kind" "$tags" "$desc" || return 2
}

# The text copy the runner made this run for the original $4 (pandoc's
# `<stem>.md` next to it, listed in the file SHEET_CONVERTED; pdftotext
# writes nothing in the vault), once that original is filed (#995): the
# vault $1, the manifest before the run $2, the date $3, then the file
# line's destination $5, name as written $6, name used $7, destination kind
# $8 (sheet_dest_kind), tags $9 and description ${10}. A copy still where
# the runner wrote it, a plain file, moves next to the original as
# `<final stem>.md`, unless that name is taken there or not a safe path
# (it then stays where it was). Outside Processed it is booked as a note
# whose original is the filed file: its hub line and its index row, with
# the file line's tags and description. When the agent's name was
# shortened, `<agent's stem>.md` in the destination maps to it, so a `note`
# line for the copy finds it. Returns 2 when a write fails.
sheet_sibling() {
  local vault=$1 before=$2 day=$3 src=$4 dest=$5 name=$6 final=$7 kind=$8 tags=$9 desc=${10}
  local sib stem note plan row
  [ -n "${SHEET_CONVERTED:-}" ] && [ -f "$SHEET_CONVERTED" ] || return 0
  [[ ${src##*/} == ?*.* ]] || return 0
  sib="${src%.*}.md"
  [ "$sib" != "$src" ] || return 0
  grep -qxF -- "$sib" "$SHEET_CONVERTED" || return 0
  [ -f "$vault/$sib" ] && [ ! -L "$vault/$sib" ] || return 0
  stem=$(sheet_stem "$final")
  note="$dest/$stem.md"
  sheet_path_ok "$note" || return 0
  ! sheet_taken "$vault/$dest" "$stem.md" || return 0
  mv -n -- "$vault/$sib" "$vault/$note" 2>/dev/null || return 0
  [ -f "$vault/$note" ] && [ ! -e "$vault/$sib" ] || return 0
  if [ "$final" != "$name" ]; then
    SHEET_MAP_FROM+=("$dest/$(sheet_stem "$name").md")
    SHEET_MAP_TO+=("$note")
  fi
  [ "$kind" != processed ] || return 0
  plan=$(sheet_hub_plan "$vault" "$dest" "$before") || return 2
  [ "$plan" != "$note" ] || plan=''
  sheet_hub_write "$vault" "$plan" "$stem" "$desc" "$day" "$tags" || return 2
  row="- [[$note]] · Note · $tags · $desc · filed by Bower · [[$dest/$final]]"
  sheet_index_row "$vault" "$row" "$note" || return 2
  SHEET_NOTES=$((${SHEET_NOTES:-0} + 1))
  SHEET_SIBLINGS+=("$note")
}

# Whether the note $2 (vault $1, the manifest before the run $3) may be
# booked: a safe `.md` path (not a folder note `_*.md`) under a PARA folder
# or Answers/, a file there reached through no link, that this run created
# or changed (its "<cksum> <size> <path>" is not in the manifest), or moved
# here from 0-Inbox/ or Clippings/ (a converted document's `.md`, rules
# v25): when its content was held before the run by a path that is gone
# now, every such path is in one of those two.
sheet_note_ok() {
  local vault=$1 note=$2 before=$3 key from
  sheet_path_ok "$note" || return 1
  case "$note" in 1-Projects/?* | 2-Areas/?* | 3-Resources/?* | 4-Archives/?* | Answers/?*) ;; *) return 1 ;; esac
  [[ ${note,,} == *.md ]] || return 1
  case "${note##*/}" in _*) return 1 ;; esac
  [ -f "$vault/$note" ] && [ ! -L "$vault/$note" ] || return 1
  key=$(cksum <"$vault/$note" | awk '{ print $1 " " $2 }') || return 1
  ! grep -qxF -- "$key $note" "$before" || return 1
  # The path was there before with another content: changed in this run.
  ! P="$note" awk '{ p = $0; sub(/^[^ ]* [^ ]* /, "", p) } p == ENVIRON["P"] { f = 1; exit } END { exit !f }' \
    "$before" || return 0
  while IFS= read -r from; do
    [ ! -e "$vault/$from" ] || continue
    case "$from" in 0-Inbox/* | Clippings/*) ;; *) return 1 ;; esac
  done < <(K="$key" awk '{ k = $1 " " $2; p = $0; sub(/^[^ ]* [^ ]* /, "", p) } k == ENVIRON["K"] { print p }' "$before")
  return 0
}

# One `note` line: the vault $1, the manifest before the run $2, the date
# $3, then the line's four fields. Returns 1, having changed nothing, when
# the note may not be booked (sheet_note_ok), or the tags or the
# description are not in the v24 form. An original that is not a file there
# now (after the moves) is dropped: the note is booked with original `-`
# and SHEET_UNLINKED is 1 (else 0). An original the runner filed under a shorter
# name is read as that name (sheet_mapped), and the note's links to the
# long name are rewritten (sheet_relink). Otherwise writes the note's hub
# line (outside Answers/) and its index row, which ends
# ` · [[<original>]]` when it has one. Returns 2 when a write fails.
sheet_note_line() {
  local vault=$1 before=$2 day=$3 note=$4 orig=$5 tags=$6 desc=$7
  local dir name row plan='' arr=()
  SHEET_WHY=path
  # A text copy the runner moved under a shorter name (sheet_sibling).
  note=$(sheet_mapped "$note")
  # A copy the runner booked already (sheet_sibling): its row and hub line
  # are written, and SHEET_REPEAT tells the caller not to count it again.
  SHEET_UNLINKED=0 SHEET_REPEAT=0
  if sheet_has "$note" ${SHEET_SIBLINGS[@]+"${SHEET_SIBLINGS[@]}"}; then
    SHEET_REPEAT=1
    return 0
  fi
  sheet_note_ok "$vault" "$note" "$before" || return 1
  # An original the runner filed under a shorter name (#995).
  orig=$(sheet_mapped "$orig")
  # An original that is not a file there now (its `file` line was refused,
  # or it names nothing) does not keep the note out (#995): the note is
  # booked with original `-`, and SHEET_UNLINKED tells the caller.
  SHEET_UNLINKED=0
  if [ "$orig" != - ]; then
    if ! { sheet_path_ok "$orig" && [ -f "$vault/$orig" ] && [ ! -L "$vault/$orig" ]; }; then
      orig=-
      SHEET_UNLINKED=1
    fi
  fi
  SHEET_WHY=tag
  sheet_tags_ok "$tags" || return 1
  SHEET_WHY=description
  desc=$(sheet_text_fit "$desc" 100) || return 1
  SHEET_WHY=other
  sheet_index_ok "$vault" || return 1
  read -r -a arr <<<"$tags"
  tags="${arr[*]}"
  dir=${note%/*}
  name=${note##*/}
  case "$dir" in
    Answers | Answers/*) ;;
    *) plan=$(sheet_hub_plan "$vault" "$dir" "$before") || return 1 ;;
  esac
  # A hub note booked itself gets no line in itself.
  [ "$plan" != "$note" ] || plan=''
  # Its links to a name the runner shortened follow the rename (#995).
  sheet_relink "$vault" "$note" "$before" || return 2
  sheet_hub_write "$vault" "$plan" "${name%.*}" "$desc" "$day" "$tags" || return 2
  row="- [[$note]] · Note · $tags · $desc · filed by Bower"
  [ "$orig" = - ] || row+=" · [[$orig]]"
  sheet_index_row "$vault" "$row" "$note" || return 2
}

# One `tag` line: the vault $1, then the tag and its meaning. Returns 1
# when the tag is not in the v24 form or the meaning is not usable (at most
# 80 characters). Otherwise adds `- <tag> · <meaning> · 1` to `## Tags`
# unless the section has the tag already; book_tags then recounts it.
sheet_tag_line() {
  local index="$1/index.md" meaning
  SHEET_WHY=tag
  [[ $2 =~ ^#[a-z0-9]+(-[a-z0-9]+)*$ ]] && [ "${#2}" -le 64 ] || return 1
  # A meaning is counted with the descriptions.
  SHEET_WHY=description
  meaning=$(sheet_text_fit "$3" 80) || return 1
  SHEET_WHY=other
  sheet_index_ok "$1" || return 1
  if [ -f "$index" ] && T="$2" awk '{ sub(/\r$/, "") }
    /^## / { if (on) exit; on = ($0 ~ /^## Tags[ \t]*$/); next }
    on && /^- #/ { t = substr($0, 3); sub(/[ \t].*$/, "", t); if (t == ENVIRON["T"]) { f = 1; exit } }
    END { exit !f }' "$index"; then
    return 0
  fi
  sheet_section_add "$index" '## Tags' "- $2 · $meaning · 1"
}

# The fields of the sheet line $1 in SHEET_FIELDS: split at each TAB (an
# empty field kept), a Windows line end dropped, each field trimmed.
sheet_split() {
  local rest=${1%$'\r'} f i
  SHEET_FIELDS=()
  while [[ $rest == *$'\t'* ]]; do
    SHEET_FIELDS+=("${rest%%$'\t'*}")
    rest=${rest#*$'\t'}
  done
  SHEET_FIELDS+=("$rest")
  for i in "${!SHEET_FIELDS[@]}"; do
    f=${SHEET_FIELDS[$i]}
    f=${f#"${f%%[![:space:]]*}"}
    SHEET_FIELDS[$i]=${f%"${f##*[![:space:]]}"}
  done
}

# Carries out the filing sheet $2 in the vault $1: the pending list $3, the
# manifest before the run $4, today's date $5, and $6, the list of the text
# copies the runner made this run (one path per line; none when empty or
# missing; sheet_sibling) in SHEET_CONVERTED. The `file` lines first, in
# order, so a `note` line's original is checked where it was filed; then
# the `note` and `tag` lines. A blank line is ignored; any other line that
# is not one of the three kinds with its number of fields, or that its
# check refuses, is skipped. At most SHEET_MAX_LINES lines are read, the
# rest are skipped. Sets SHEET_FILED, SHEET_NOTES, SHEET_TAGS and
# SHEET_SKIPPED (counts only), SHEET_SKIP_REASONS (the skipped lines per
# reason) and SHEET_UNLINKED_COUNT, the `note` lines booked without their
# original (not skipped, so in neither of the two). Returns 1 when a write
# fails.
apply_filing_sheet() {
  # Bytes, not characters, everywhere below: a line that is not valid UTF-8
  # is counted the same way by every count, so the warning never
  # under-reports.
  local LC_ALL=C
  local vault=$1 sheet=$2 pending=$3 before=$4 day=$5 line total read rc pass reason
  local lines=()
  SHEET_FILED=0 SHEET_NOTES=0 SHEET_TAGS=0 SHEET_SKIPPED=0 SHEET_SKIP_REASONS=''
  SHEET_MAP_FROM=() SHEET_MAP_TO=() SHEET_SHORT_SRC=() SHEET_SIBLINGS=() SHEET_UNLINKED_COUNT=0
  SHEET_CONVERTED=${6:-}
  [ -f "$sheet" ] && [ ! -L "$sheet" ] || return 0
  total=$(tr -d '\000' <"$sheet" | grep -ac '[^[:space:]]' || true)
  # At most SHEET_MAX_BYTES and SHEET_MAX_LINES are read.
  mapfile -t lines < <(head -c "$SHEET_MAX_BYTES" "$sheet" | tr -d '\000' | head -n "$SHEET_MAX_LINES")
  read=0
  for line in ${lines[@]+"${lines[@]}"}; do
    [[ $line != *[^[:space:]]* ]] || read=$((read + 1))
  done
  SHEET_SKIPPED=$((total - read))
  [ "$SHEET_SKIPPED" -ge 0 ] || SHEET_SKIPPED=0
  local -A why=([description]=0 [path]=0 [name]=0 [tag]=0 [other]=$SHEET_SKIPPED)
  for pass in file other; do
    for line in ${lines[@]+"${lines[@]}"}; do
      [[ $line == *[^[:space:]]* ]] || continue
      # A line longer than SHEET_MAX_LINE bytes is skipped unread.
      if [ "${#line}" -gt "$SHEET_MAX_LINE" ]; then
        if [ "$pass" = file ]; then
          SHEET_SKIPPED=$((SHEET_SKIPPED + 1))
          why[other]=$((why[other] + 1))
        fi
        continue
      fi
      sheet_split "$line"
      rc=0
      SHEET_WHY=other
      case "${SHEET_FIELDS[0]}:${#SHEET_FIELDS[@]}:$pass" in
        file:6:file)
          sheet_file_line "$vault" "$pending" "$before" "$day" "${SHEET_FIELDS[@]:1}" || rc=$?
          [ "$rc" -ne 0 ] || SHEET_FILED=$((SHEET_FILED + 1))
          ;;
        note:5:other)
          sheet_note_line "$vault" "$before" "$day" "${SHEET_FIELDS[@]:1}" || rc=$?
          if [ "$rc" -eq 0 ] && [ "$SHEET_REPEAT" -eq 0 ]; then
            SHEET_NOTES=$((SHEET_NOTES + 1))
            # Booked without its original: counted, not skipped.
            [ "$SHEET_UNLINKED" -eq 0 ] || SHEET_UNLINKED_COUNT=$((SHEET_UNLINKED_COUNT + 1))
          fi
          ;;
        tag:3:other)
          sheet_tag_line "$vault" "${SHEET_FIELDS[@]:1}" || rc=$?
          [ "$rc" -ne 0 ] || SHEET_TAGS=$((SHEET_TAGS + 1))
          ;;
        file:6:other | note:5:file | tag:3:file) continue ;;
        *)
          [ "$pass" = file ] || continue
          rc=1
          ;;
      esac
      [ "$rc" -ne 2 ] || return 1
      [ "$rc" -eq 0 ] && continue
      SHEET_SKIPPED=$((SHEET_SKIPPED + 1))
      [ -n "${why[$SHEET_WHY]+x}" ] || SHEET_WHY=other
      why[$SHEET_WHY]=$((why[$SHEET_WHY] + 1))
    done
  done
  SHEET_SKIP_REASONS=''
  for reason in description path name tag other; do
    [ "${why[$reason]}" -eq 0 ] ||
      SHEET_SKIP_REASONS+="${SHEET_SKIP_REASONS:+, }${why[$reason]} $reason"
  done
}
# <<< filing sheet

# A hub note's `statuses:` (decision E-7, #921): "none" when its frontmatter
# has no such key, "bad" when the value is not a list, else "list" and one
# value per line (quotes removed). Reads a flow list (`[a, b]`, on one line
# or several) and a block list (`- a` lines).
readonly STATUSES_AWK='
  function emit(v) { sub(/^[ \t]+/, "", v); sub(/[ \t]+$/, "", v)
    if (v ~ /^".*"$/ || v ~ /^\047.*\047$/) v = substr(v, 2, length(v) - 2)
    out[++n] = v }
  { sub(/\r$/, "") }
  NR == 1 { if ($0 != "---") exit; next }
  /^---[ \t]*$/ { exit }
  mode == "flow" { flow = flow " " $0; if (index($0, "]")) exit; next }
  mode == "block" {
    if ($0 ~ /^[ \t]*-([ \t]|$)/) { v = $0; sub(/^[ \t]*-/, "", v); emit(v); next }
    if ($0 ~ /^[ \t]+[^ \t]/) { bad = 1; next }
    exit
  }
  /^statuses:/ {
    found = 1; v = $0; sub(/^statuses:[ \t]*/, "", v); sub(/[ \t]+(#.*)?$/, "", v)
    if (v == "") { mode = "block"; next }
    if (substr(v, 1, 1) == "[") { flow = v; if (index(v, "]")) exit; mode = "flow"; next }
    bad = 1; exit
  }
  END {
    if (!found) { print "none"; exit }
    if (mode == "flow" || flow != "") {
      sub(/^[ \t]*\[/, "", flow)
      if (flow !~ /\][ \t]*$/) { print "bad"; exit }
      sub(/\][ \t]*$/, "", flow)
      if (flow ~ /^[ \t]*$/) { print "list"; exit }
      k = split(flow, parts, ",")
      for (i = 1; i <= k; i++) emit(parts[i])
    }
    if (bad) { print "bad"; exit }
    print "list"
    for (i = 1; i <= n; i++) print out[i]
  }'

# Removes `statuses:` (and its list lines) from the frontmatter of file $1;
# nothing else in the file changes.
drop_statuses() {
  local tmp="$1.bower-statuses"
  awk '
    NR == 1 { fm = ($0 ~ /^---\r?$/); print; next }
    fm && /^---[ \t]*\r?$/ { fm = 0; skip = 0; print; next }
    fm && skip == 1 { if ($0 ~ /^[ \t]/) next; skip = 0 }
    fm && skip == 2 { if (index($0, "]")) skip = 0; next }
    fm && /^statuses:/ {
      v = $0; sub(/\r$/, "", v); sub(/^statuses:[ \t]*/, "", v)
      if (v == "") skip = 1
      else if (substr(v, 1, 1) == "[" && !index(v, "]")) skip = 2
      next
    }
    { print }' "$1" >"$tmp" || { rm -f "$tmp"; return 1; }
  cat "$tmp" >"$1" && rm -f "$tmp"
}

# Why the `statuses:` of the hub note $1 (relative to VAULT_DIR) is not
# usable, printed as one word, or nothing when it is usable or absent. A
# usable list has 3 to 10 values, each lower case, at most 24 characters and
# there once, and holds every `status:` a note next to the hub note uses.
statuses_problem() {
  local path=$1 dir name shape value chars used n=0 values=()
  local -A seen=()
  dir=${path%/*}
  name=${path##*/}
  { read -r shape; mapfile -t values; } < <(awk "$STATUSES_AWK" "$VAULT_DIR/$path")
  case "$shape" in
    none | '') return 0 ;;
    bad) echo shape; return 0 ;;
  esac
  for value in ${values[@]+"${values[@]}"}; do
    n=$((n + 1))
    [ -n "$value" ] || { echo blank; return 0; }
    chars=$(LC_ALL=C.UTF-8 bash -c 'printf "%s" "${#1}"' _ "$value" 2>/dev/null) || chars=${#value}
    [ "$chars" -le 24 ] || { echo long; return 0; }
    [ "$value" = "$(LC_ALL=C.UTF-8 tr '[:upper:]' '[:lower:]' <<<"$value")" ] || { echo case; return 0; }
    [ -z "${seen[$value]+x}" ] || { echo twice; return 0; }
    seen[$value]=1
  done
  [ "$n" -ge 3 ] && [ "$n" -le 10 ] || { echo count; return 0; }
  while IFS= read -r used; do
    [ -n "$used" ] || continue
    [ -n "${seen[$used]+x}" ] || { echo missing; return 0; }
  done < <(cd "$VAULT_DIR/$dir" && find . -maxdepth 1 -type f -name '*.md' -print0 |
    xargs -0 -r awk "$STATUS_AWK" | N="./$name" awk -F '\t' '$1 != ENVIRON["N"] { print $2 }')
}

# E-7 (#921), after the move detection: each hub note the run changed
# (`<folder>/<name>/<name>.md`, not one only moved) whose `statuses:` is not
# a usable list (statuses_problem above) has the list removed, so the app
# falls back to the kind's list, and the run's summary (the status callback)
# carries a warning. Only counts are logged: no note name or path.
STATUSES_WARNING=''
check_hub_statuses() {
  STATUSES_WARNING=''
  [ "$TOO_MANY_CHANGES" -eq 0 ] || return 0
  local path dir moved="$WORK_DIR/moved-to.txt" problem checked=0 removed=0
  cut -f 2 "$MOVES_FILE" >"$moved" || return 1
  while IFS= read -r path; do
    case "$path" in */*/*.md) ;; *) continue ;; esac
    dir=${path%/*}
    [ "${path##*/}" = "${dir##*/}.md" ] || continue
    [ -f "$VAULT_DIR/$path" ] || continue
    ! grep -qxF -- "$path" "$moved" || continue
    grep -q '^statuses:' "$VAULT_DIR/$path" || continue
    checked=$((checked + 1))
    problem=$(statuses_problem "$path") || return 1
    [ -n "$problem" ] || continue
    drop_statuses "$VAULT_DIR/$path" || return 1
    removed=$((removed + 1))
  done <"$CHANGED_FILE"
  [ "$checked" -eq 0 ] || log "status lists: $checked checked, $removed removed"
  [ "$removed" -gt 0 ] || return 0
  STATUSES_WARNING="Warning: $removed folder status $([ "$removed" -eq 1 ] && echo 'list was' || echo 'lists were') not usable and removed; those folders use the usual statuses."
  # The removal changed those files: the manifest must say so.
  manifest >"$MANIFEST_AFTER"
}

# The move phase (#595): each move in MOVES_FILE is done in Drive itself, as
# a server-side move (rclone moveto; on Drive that changes the file's parent
# folder and keeps its id), after creating the new parent folder. So a moved
# file keeps its id and leaves no copy at its old path. A move Drive could
# not do (for example: the file was moved or removed in Drive during the
# run) falls back to the copy up. Writes the paths Drive moved to MOVED_OLD
# and MOVED_NEW, every move, fallbacks included, to BOOKED_OLD and BOOKED_NEW
# (all of them are booked, #643), and the accepted paths left to copy up to
# UPLOAD_FILE.
# Logs counts only.
move_up() {
  : >"$MOVED_OLD"
  : >"$MOVED_NEW"
  : >"$BOOKED_OLD"
  : >"$BOOKED_NEW"
  local old new dir moved=0 fell_back=0
  while IFS=$'\t' read -r old new <&3; do
    [ -n "$old" ] && [ -n "$new" ] || continue
    dir=$(dirname "$new")
    printf '%s
' "$old" >>"$BOOKED_OLD"
    printf '%s
' "$new" >>"$BOOKED_NEW"
    if { [ "$dir" = . ] ||
      rclone mkdir "vault:$dir" </dev/null >>"$RCLONE_LOG" 2>&1; } &&
      rclone moveto "vault:$old" "vault:$new" </dev/null >>"$RCLONE_LOG" 2>&1; then
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
# move (BOOKED_OLD and BOOKED_NEW, line by line: Drive moves and fallbacks), the links that
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
# nothing. Every file it changed joins UPLOAD_FILE. With a fifth argument
# `by-you` (the reconcile phase, #597: moves the person made in Drive or
# Obsidian between runs), only index.md's rows are rewritten, never a link
# in another note, and each log.md line reads "Moved by you: <old> → <new>".
# Usage: book_moves <vault dir> <old paths file> <new paths file> <stamp> [by-you]
book_moves() {
  local vault=$1 olds=$2 news=$3 stamp=$4 by=${5:-}
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
  if [ "$by" = by-you ]; then
    [ ! -f "$vault/index.md" ] || printf '%s\n' index.md >"$candidates"
  elif [ -s "$targets" ]; then
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
  STAMP="$stamp" BY="$by" awk -F '\t' '
    function base(p) { sub(/.*\//, "", p); return p }
    function dir(p) { if (p !~ /\//) return "."; sub(/\/[^\/]*$/, "", p); return p }
    {
      line = "- " ENVIRON["STAMP"] " · "
      if (ENVIRON["BY"] == "by-you") line = line "Moved by you: " $1 " → " $2
      else if ($1 ~ /^0-Inbox\// && $2 !~ /^0-Inbox\//) {
        line = line "Filed: " base($2) " → " dir($2)
        if (base($1) != base($2)) line = line ", renamed from " base($1)
      } else line = line "Moved: " $1 " → " $2
      print line
    }' "$pairs" >"$lines" || return 1
  append_log_lines "$vault" "$lines" || return 1
  # Each path once, in the order it was listed.
  awk '!seen[$0]++' "$UPLOAD_FILE" >"$UPLOAD_FILE.tmp" && mv "$UPLOAD_FILE.tmp" "$UPLOAD_FILE"
}

# Lists every visible file in Drive with its Drive id (rclone lsjson -R),
# one "<id><TAB><path>" line per file into file $1: system files, .obsidian/,
# .claude/ and .bower/ left out, and a path with a tab or a line break
# skipped (never guessed at). Used by the reconcile phase and write_paths.
list_ids() {
  local json="$WORK_DIR/listing.json"
  rclone lsjson vault: -R --files-only --no-modtime --no-mimetype \
    --exclude '.obsidian/**' --exclude '.claude/**' --exclude '.bower/**' \
    "${RCLONE_FILTER[@]}" </dev/null >"$json" 2>>"$RCLONE_LOG" || return 1
  jq -r "$LISTING_FILTER" "$json" >"$1"
}
readonly LISTING_FILTER='.[] | select((.IsDir | not) and (.ID | type) == "string" and ((.ID + .Path) | test("[\t\n]") | not)) | "\(.ID)\t\(.Path)"'
readonly PATHS_READ_FILTER='to_entries[] | select((.value | type) == "string" and ((.key + .value) | test("[\t\n]") | not)) | "\(.key)\t\(.value)"'
readonly PATHS_WRITE_FILTER='[inputs | split("\t") | {key: .[0], value: .[1]}] | from_entries'

# Marks each index.md row (a list item) that links to a path listed in file
# $1 (by path, or for a note by the path without .md) with " (missing)" at
# its end; a row already marked, and anything in a fenced code block, is
# left as it is. Rows are never deleted. index.md joins UPLOAD_FILE when it
# changed. Logs the count only.
mark_missing() {
  local index="$VAULT_DIR/index.md" tmp count
  [ -s "$1" ] && [ -f "$index" ] || return 0
  tmp="$index.bower-missing"
  awk -v counted="$WORK_DIR/missing-count.txt" '
    function add(p) { t["[[" p "]]"] = 1; t["[[" p "|"] = 1; t["[[" p "#"] = 1 }
    FILENAME == ARGV[1] {
      if ($0 != "") { add($0); if ($0 ~ /\.md$/) add(substr($0, 1, length($0) - 3)) }
      next
    }
    {
      line = $0; cr = ""
      if (sub(/\r$/, "", line)) cr = "\r"
      if (line ~ /^[ \t]*(```|~~~)/) { fenced = !fenced; print $0; next }
      if (!fenced && line ~ /^[ \t]*[-*+] / && line !~ /\(missing\)[ \t]*$/) {
        for (k in t) if (index(line, k)) { line = line " (missing)"; n++; break }
      }
      print line cr
    }
    END { print n + 0 >counted }' "$1" "$index" >"$tmp" || { rm -f "$tmp"; return 1; }
  count=$(cat "$WORK_DIR/missing-count.txt")
  if [ "$count" -eq 0 ]; then
    rm -f "$tmp"
    return 0
  fi
  cat "$tmp" >"$index" && rm -f "$tmp" || return 1
  grep -qxF index.md "$UPLOAD_FILE" || printf '%s\n' index.md >>"$UPLOAD_FILE"
  log "$count index rows marked missing"
}

# The reconcile phase (#597), before the agent: people move files
# themselves, in Drive or in Obsidian, and index.md then points at old
# paths. The tree is listed again with Drive ids and compared with
# .bower/paths.json, the map of id to path the last run left. An id whose
# path changed is a move the person made: its index.md row is rewritten to
# the new path and log.md gets "Moved by you: <old> → <new>" (book_moves,
# by-you). An id that is gone has its rows marked "(missing)" (mark_missing).
# Links in other notes are left alone. The changed index.md and log.md go
# up to Drive at once, before the manifest, so they are never counted as
# the agent's changes. Without .bower/paths.json (the first run), or with
# one that cannot be read, nothing is reconciled. Sets RECONCILED=1 once
# the tree was listed, so write_paths may replace the map at the end.
reconcile() {
  local old="$WORK_DIR/paths-old.tsv" olds="$WORK_DIR/reconcile-old.txt"
  local news="$WORK_DIR/reconcile-new.txt" gone="$WORK_DIR/reconcile-gone.txt"
  list_ids "$WORK_DIR/listing-before.tsv" || return 1
  if [ ! -f "$VAULT_DIR/$PATHS_FILE" ]; then
    log "no paths file yet: nothing to reconcile"
    RECONCILED=1
    return 0
  fi
  if ! jq -r "$PATHS_READ_FILTER" "$VAULT_DIR/$PATHS_FILE" >"$old" 2>>"$RCLONE_LOG"; then
    log "paths file unreadable: nothing to reconcile"
    RECONCILED=1
    return 0
  fi
  : >"$olds"
  : >"$news"
  : >"$gone"
  LC_ALL=C sort -t "$(printf '\t')" -k 2 "$old" |
    awk -F '\t' -v olds="$olds" -v news="$news" -v gone="$gone" '
      FILENAME == ARGV[1] { now[$1] = $2; next }
      $1 == "" || $2 == "" { next }
      !($1 in now) { print $2 >gone; next }
      now[$1] != $2 { print $2 >olds; print now[$1] >news }' \
      "$WORK_DIR/listing-before.tsv" - || return 1
  : >"$UPLOAD_FILE"
  local moves
  moves=$(count_lines "$olds")
  if [ "$moves" -gt 0 ]; then
    book_moves "$VAULT_DIR" "$olds" "$news" "$(date -u '+%F %H:%M')" by-you || return 1
    log "$moves moves by you booked"
  fi
  mark_missing "$gone" || return 1
  copy_up "$UPLOAD_FILE" || return 1
  RECONCILED=1
}

# At the end of every run whose tree was listed at the start (RECONCILED):
# lists the tree with ids again and writes it to .bower/paths.json in Drive,
# a JSON object of Drive id to path, for the next run's reconcile phase.
# Best effort: a failure is logged and never fails the run.
write_paths() {
  [ "$RECONCILED" -eq 1 ] || return 0
  local dir="$WORK_DIR/paths-out"
  if ! {
    mkdir -p "$dir/.bower" &&
      list_ids "$WORK_DIR/listing-after.tsv" &&
      jq -Rn "$PATHS_WRITE_FILTER" <"$WORK_DIR/listing-after.tsv" >"$dir/$PATHS_FILE" &&
      printf '%s\n' "$PATHS_FILE" >"$dir/files.txt" &&
      rclone copy "$dir" vault: --files-from-raw "$dir/files.txt" \
        </dev/null >>"$RCLONE_LOG" 2>&1
  }; then
    log "paths file not saved"
  fi
}

# File facts (#610): what Drive's metadata does not say and the boards show,
# counted here without AI and left in .bower/file-facts.json for the app: a
# PDF's `pages` (pdfinfo, when the runner image has it), an Excel file's
# `sheets` (the worksheet entries of its archive listing) and a ZIP's
# `entries` (files, not folders). "k" is the file's checksum and size, so a
# fact is counted again only for a new or changed file; a fact whose file is
# gone is dropped. Only `pdfinfo` and an `unzip` listing (nothing is
# extracted) ever touch file contents, each under `timeout`. A file whose
# count fails simply has no fact; the log says how many, never which.
readonly FACTS_FILE='.bower/file-facts.json'
readonly FACTS_TIME_LIMIT=20
readonly FACTS_KEYS_FILTER='to_entries[] | select((.value | type) == "object" and (.value.k | type) == "string" and ((.key + .value.k) | test("[\t\n]") | not)) | "\(.key)\t\(.value.k)"'
readonly FACTS_WRITE_FILTER='$prev as $p | [inputs | split("\t") | if .[2] == "keep" then {key: .[0], value: $p[.[0]]} else {key: .[0], value: ({k: .[1]} + {(.[2]): (.[3] | tonumber)})} end] | from_entries'

# Prints the count of kind $1 ("pages", "sheets" or "entries") for file $2,
# or fails.
count_fact() {
  local n
  case "$1" in
    pages)
      command -v pdfinfo >/dev/null 2>&1 || return 1
      n=$(timeout -k 5 "$FACTS_TIME_LIMIT" pdfinfo "$2" 2>/dev/null </dev/null |
        awk '/^Pages:/ { n = $2 } END { print n }') || return 1
      ;;
    sheets)
      n=$(timeout -k 5 "$FACTS_TIME_LIMIT" unzip -Z1 "$2" 2>/dev/null </dev/null |
        grep -c '^xl/worksheets/[^/]*\.xml$') || return 1
      ;;
    entries)
      n=$(timeout -k 5 "$FACTS_TIME_LIMIT" unzip -Z1 "$2" 2>/dev/null </dev/null |
        grep -vc '/$') || return 1
      ;;
  esac
  case "$n" in '' | *[!0-9]*) return 1 ;; esac
  printf '%s\n' "$n"
}

# Best effort at the end of a run: never fails it.
write_file_facts() {
  command -v unzip >/dev/null 2>&1 || command -v pdfinfo >/dev/null 2>&1 || return 0
  local dir="$WORK_DIR/facts-out" old="$WORK_DIR/facts-old.json"
  local keys="$WORK_DIR/facts-keys.tsv" rows="$WORK_DIR/facts-rows.tsv"
  local path key kind n skipped=0 base
  mkdir -p "$dir/.bower" || return 0
  : >"$keys"
  : >"$rows"
  printf '{}\n' >"$old"
  # A previous file that is not a JSON object is ignored, as if absent.
  if [ -f "$VAULT_DIR/$FACTS_FILE" ] &&
    jq -r "$FACTS_KEYS_FILTER" "$VAULT_DIR/$FACTS_FILE" >"$keys.new" 2>/dev/null; then
    mv "$keys.new" "$keys"
    cp "$VAULT_DIR/$FACTS_FILE" "$old"
  fi
  while IFS= read -r path; do
    case "$path" in *$'\t'*) continue ;; esac
    base=${path##*/}
    case "${base##*.}" in
      pdf | PDF | Pdf) kind=pages ;;
      xlsx | XLSX) kind=sheets ;;
      zip | ZIP) kind=entries ;;
      *) continue ;;
    esac
    key=$(cksum <"$VAULT_DIR/$path" | awk '{ print $1 " " $2 }') || continue
    if grep -qxF -- "$path"$'\t'"$key" "$keys"; then
      printf '%s\t%s\tkeep\t\n' "$path" "$key" >>"$rows"
      continue
    fi
    if n=$(count_fact "$kind" "$VAULT_DIR/$path"); then
      printf '%s\t%s\t%s\t%s\n' "$path" "$key" "$kind" "$n" >>"$rows"
    else
      skipped=$((skipped + 1))
    fi
  done < <(cd "$VAULT_DIR" && find . -type f ! -path './.obsidian/*' ! -path './.claude/*' \
    ! -path './.bower/*' "${SYSTEM_FIND_TESTS[@]}" | sed 's|^\./||' | LC_ALL=C sort)
  [ "$skipped" -eq 0 ] || log "$skipped file facts skipped"
  if ! jq -Rn --argjson prev "$(cat "$old")" "$FACTS_WRITE_FILTER" <"$rows" >"$dir/$FACTS_FILE" 2>>"$RCLONE_LOG"; then
    log "file facts not saved"
    return 0
  fi
  # Nothing to say and nothing said before, or nothing new: no upload.
  if [ ! -f "$VAULT_DIR/$FACTS_FILE" ] && [ "$(tr -d ' \n' <"$dir/$FACTS_FILE")" = '{}' ]; then
    return 0
  fi
  if [ -f "$VAULT_DIR/$FACTS_FILE" ] && cmp -s "$dir/$FACTS_FILE" "$VAULT_DIR/$FACTS_FILE"; then
    return 0
  fi
  if ! {
    printf '%s\n' "$FACTS_FILE" >"$dir/files.txt" &&
      rclone copy "$dir" vault: --files-from-raw "$dir/files.txt" \
        </dev/null >>"$RCLONE_LOG" 2>&1
  }; then
    log "file facts not saved"
  fi
}

# Best effort after a failure: upload whatever the agent already added or
# changed, with copy only (never deletes), so originals stay in the inbox.
copy_up_after_failure() {
  if [ "$RUN_STARTED" -eq 1 ]; then
    log "sync up (copy only)"
    # The agent's added note and the too-large list are never uploaded (#598).
    rm -f "$VAULT_DIR/$ADDED_NOTE" "$VAULT_DIR/$TOO_LARGE_LIST"
    # Nor is the filing sheet (#978): a failed run files nothing from it.
    rm -rf -- "${VAULT_DIR:?}/$SHEET_FILE"
    # Its one line per updated note is kept for the report, never uploaded.
    read_updated
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
#   vault_missing      the Bower folder is gone from Drive or in the Bin (R-VAULT-7)
#   unknown            anything else (the default)
fail() {
  local error=$1
  REASON=${2:-unknown}
  REPORTED=1
  # R-SS-5: CLAUDE.md is back before anything is copied up.
  restore_rulebook || log "rulebook not restored"
  # R-VAULT-7: a missing folder gets nothing, not the agent's files, the
  # outcome file, the log line or the paths file.
  [ "$REASON" = vault_missing ] || copy_up_after_failure
  # R-RUNNER-1: a failed run says what it created, updated and left too.
  report_lists || log "report lists not built"
  # R-RUNNER-5: a run that fails after the move phase already moved
  # originals in Drive (for example at the bookkeeping) sends those items,
  # each with its `to`, so it reads as partly done; otherwise no processed.
  PROCESSED_JSON=$(moved_items_json) || PROCESSED_JSON=''
  if [ "$REASON" != vault_missing ]; then
    write_outcome failed "$(failed_sentence)"
    write_paths
  fi
  SUMMARY='' report_final failed "$error" || log "report failed: API unreachable"
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

# The files context note $1 (a vault path) applies to: each bullet of its
# `## Applies to` list (app/src/add.ts contextNote), a name as it is in
# 0-Inbox/, printed as a vault path; a bullet that already names 0-Inbox/
# or Clippings/ is printed as it is.
applies_to() {
  awk '{ sub(/\r$/, "") }
    /^## / { inlist = ($0 ~ /^## Applies to[[:space:]]*$/); next }
    inlist && /^- / {
      name = substr($0, 3)
      sub(/[[:space:]]+$/, "", name)
      if (name == "") next
      if (name ~ /^(0-Inbox|Clippings)\//) print name
      else print "0-Inbox/" name
    }' "$VAULT_DIR/$1"
}

# The moment after which a pending file waits for the next tidy-up
# (R-RUNNER-6): requestedAt $1 (ISO-8601, UTC) plus HOLD_GRACE seconds, as
# `@<epoch seconds>` for find -newermt. A fraction of a second rounds up, so
# nothing saved before the true cutoff is ever held.
hold_cutoff() {
  local secs
  secs=$(date -u -d "$1" +%s) || return 1
  [[ ! "$1" =~ \.[0-9]*[1-9][0-9]*Z$ ]] || secs=$((secs + 1))
  printf '@%s\n' "$((secs + HOLD_GRACE))"
}

# R-AG-10: finishing a tidy-up that stopped partway. When the previous
# run's .bower/last-run.json (R-RUNNER-2, as sync down brought it from
# Drive; the runner itself keeps nothing) says failed, prints the prompt
# block that lists its created[] paths as already written, so the agent
# files their originals and does not write those notes again. Prints
# nothing when the file is missing, says anything but failed (an
# instructions-only run in between overwrites it; the `original:` rule
# alone still prevents duplicates) or lists nothing. An unreadable file is
# a failure (return 1) and prints nothing: the caller logs it and goes on
# without a list. Names paths in the prompt only, never in the log.
already_written_block() {
  local file="$VAULT_DIR/.bower/last-run.json" paths
  [ -f "$file" ] || return 0
  paths=$(jq -r "$ALREADY_WRITTEN_FILTER" "$file" 2>/dev/null) || return 1
  [ -n "$paths" ] || return 0
  printf '%s\n' 'Finishing a tidy-up that stopped partway: the last run wrote the notes below before it stopped. They are already written; do not write these again. A pending file one of them names in its `original:` is filed only.'
  sed 's/.*/- `&`/' <<<"$paths"
}

# >>> context pack (R-SS-5, R-SS-6)
# What the agent is handed instead of reading the rulebook, index.md and
# log.md with tool calls (#966). Each function prints vault text for the
# system prompt or the prompt, which the caller writes only to files under
# WORK_DIR; the log gets counts. agent/test/context.test.sh runs this block
# as it is, against fixture files.

# R-SS-5: the rulebook sections a run needs, from $WORK_DIR/rulebook.md (the
# vault's CLAUDE.md, rules version 24): the text before the first `##`
# heading, every `##` section with no load marker (the core), and every
# section whose marker, the line right after its heading
# (`<!-- load: ingest, instructions -->`), names one of the modes given;
# the marker lines are left out. A `##` line inside a fenced code block
# (``` or ~~~, closed by a fence of the same character at least as long) is
# text, not a heading. A rulebook with no marker at all (rules version 23
# or older) is printed whole. Usage: rulebook_for [mode ...]
rulebook_for() {
  awk -v modes="$*" '
    # The fence run (```, ~~~~, ...) a line starts with after at most three
    # spaces, or nothing; REST is what follows it.
    function fence_run(t,   s, c, k) {
      s = t
      sub(/^ ? ? ?/, "", s)
      c = substr(s, 1, 1)
      if (c != "`" && c != "~") return ""
      k = 0
      while (substr(s, k + 1, 1) == c) k++
      if (k < 3) return ""
      REST = substr(s, k + 1)
      return substr(s, 1, k)
    }
    # The modes a marker line names, as " a b ", or nothing.
    function marker_of(t,   s, parts, k, i, out) {
      if (t !~ /^<!--[ \t]*load:/ || t !~ /-->[ \t]*$/) return ""
      s = t
      sub(/^<!--[ \t]*load:/, "", s)
      sub(/-->[ \t]*$/, "", s)
      k = split(s, parts, ",")
      out = ""
      for (i = 1; i <= k; i++) {
        gsub(/^[ \t]+|[ \t]+$/, "", parts[i])
        if (parts[i] != "") out = out " " parts[i]
      }
      return out == "" ? "" : out " "
    }
    BEGIN { n = split(modes, m, " "); for (i = 1; i <= n; i++) want[m[i]] = 1 }
    { raw[NR] = $0; t = $0; sub(/\r$/, "", t); txt[NR] = t }
    END {
      open = ""
      for (i = 1; i <= NR; i++) {
        r = fence_run(txt[i])
        if (open != "") {
          if (r != "" && substr(r, 1, 1) == substr(open, 1, 1) &&
            length(r) >= length(open) && REST ~ /^[ \t]*$/) open = ""
          continue
        }
        if (r != "" && !(substr(r, 1, 1) == "`" && index(REST, "`"))) { open = r; continue }
        if (txt[i] ~ /^## /) {
          head[i] = 1
          mk = marker_of(txt[i + 1])
          if (mk != "") { marks[i] = mk; any = 1 }
        }
      }
      if (!any) { for (i = 1; i <= NR; i++) print raw[i]; exit }
      keep = 1
      for (i = 1; i <= NR; i++) {
        if (i in head) {
          keep = 1
          if (i in marks) {
            keep = 0
            k = split(marks[i], ms, " ")
            for (j = 1; j <= k; j++) if (ms[j] in want) keep = 1
            if (keep) print raw[i]
            i++
            continue
          }
        }
        if (keep) print raw[i]
      }
    }' "$WORK_DIR/rulebook.md"
}

# R-SS-5: the system prompt, stable text only (nothing that changes from
# run to run, so the prompt cache keeps it across the session's turns):
# the rulebook sections for the modes given (rulebook_for), then Rules.md,
# then About-Me.md, each under a plain heading. Usage: build_system_prompt
# [mode ...]
build_system_prompt() {
  local name
  printf '# Your rulebook (CLAUDE.md)\n\n'
  rulebook_for "$@" || return 1
  for name in Rules.md About-Me.md; do
    printf '\n# %s\n\n' "$name"
    if [ -f "$VAULT_DIR/$name" ]; then
      awk 1 "$VAULT_DIR/$name" || return 1
    else
      printf '(none)\n'
    fi
  done
}

# R-SS-6 {{TAGS}}: the lines of the `## Tags` section of the index file $1
# (`- #<tag> · <meaning> · <count>`), blank lines left out, or `(none yet)`.
tags_block() {
  local out=''
  if [ -f "$1" ]; then
    out=$(awk '{ sub(/\r$/, "") }
      /^## / { on = ($0 ~ /^## Tags[ \t]*$/); next }
      on && /[^ \t]/' "$1") || return 1
  fi
  printf '%s\n' "${out:-(none yet)}"
}

# One hub note as two lines, its first descriptive line and its statuses:
# the first body line that is not blank, a heading or a callout's first
# line (a quote's `>` taken off), and the frontmatter's `statuses:` as
# `[a, b]`, or an empty line when it has none.
readonly HUB_AWK='
  { sub(/\r$/, "") }
  NR == 1 && $0 == "---" { fm = 1; next }
  fm && /^---[ \t]*$/ { fm = 0; next }
  fm && mode == "block" {
    if ($0 ~ /^[ \t]*-/) { v = $0; sub(/^[ \t]*-[ \t]*/, "", v); list = list (list == "" ? "" : ", ") v; next }
    mode = ""
  }
  fm && mode == "flow" { list = list " " $0; if (index($0, "]")) mode = ""; next }
  fm && /^statuses:/ {
    has = 1; v = $0; sub(/^statuses:[ \t]*/, "", v)
    if (v == "") mode = "block"
    else { list = v; if (!index(v, "]")) mode = "flow" }
    next
  }
  fm { next }
  desc == "" && /[^ \t]/ && !/^[ \t]*#/ && !/^[ \t]*>[ \t]*\[!/ {
    desc = $0; sub(/^[ \t]*(>[ \t]*)?/, "", desc); gsub(/\t/, " ", desc)
  }
  END {
    gsub(/[ \t]+/, " ", list); sub(/^ *\[ */, "", list); sub(/ *\] *$/, "", list)
    printf "%s\n%s\n", desc, (has ? "[" list "]" : "")
  }'

# R-SS-6 {{FOLDERS}}: one line per hub note in the PARA folders of the vault
# at $1, `- <folder> · <first descriptive line> · statuses: [a, b]` (the
# description cut to 120 characters, the statuses only when the note has
# them), or `(none yet)`. A hub note is `<folder>/<name>/<name>.md`, as
# check_hub_statuses finds them, or a folder note `_<name>.md`.
folders_block() {
  local LC_ALL=C.UTF-8
  local vault=$1 path dir name desc statuses line found=0
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    dir=${path%/*}
    name=${path##*/}
    case "$name" in
      _*.md | "${dir##*/}.md") ;;
      *) continue ;;
    esac
    { IFS= read -r desc && IFS= read -r statuses; } < <(awk "$HUB_AWK" "$vault/$path") || continue
    line="- $dir · ${desc:0:120}"
    [ -z "$desc" ] && line="- $dir"
    [ -z "$statuses" ] || line+=" · statuses: $statuses"
    printf '%s\n' "$line"
    found=1
  done < <(cd "$vault" && for d in 1-Projects 2-Areas 3-Resources 4-Archives; do
    [ ! -d "$d" ] || find "$d" -mindepth 2 -type f -name '*.md'
  done | LC_ALL=C sort)
  [ "$found" -eq 1 ] || printf '(none yet)\n'
}

# R-SS-6 {{CORRECTIONS}}: the `Correction: <from> -> <to> (<date>)` lines of
# the log file $1, counted per pair, one `- <from> -> <to>: <n>` line per
# pair in the order each first appears, or `(none)`.
corrections_block() {
  local out=''
  if [ -f "$1" ]; then
    out=$(awk '{ sub(/\r$/, "") }
      {
        i = index($0, "Correction:")
        if (!i) next
        s = substr($0, i + 11)
        j = index(s, " -> ")
        if (!j) next
        from = substr(s, 1, j - 1)
        to = substr(s, j + 4)
        if (match(to, / \([0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]\)/)) to = substr(to, 1, RSTART - 1)
        gsub(/^[ \t]+|[ \t]+$/, "", from)
        gsub(/^[ \t]+|[ \t]+$/, "", to)
        if (from == "" || to == "") next
        k = from " -> " to
        if (!(k in n)) order[++m] = k
        n[k]++
      }
      END { for (i = 1; i <= m; i++) printf "- %s: %d\n", order[i], n[order[i]] }' "$1") || return 1
  fi
  printf '%s\n' "${out:-(none)}"
}

# R-SS-6 {{PENDING}}: the pending files listed in $1 (vault paths), one per
# line, quoted as `- \`<path>\`` like already_written_block, since a name is
# untrusted text. A document converted before the run is followed by where its text
# is, the `.md` next to it (`(text: <path>)`); a PDF with no text layer by
# `(scanned: no text layer)`. `(none)` for an empty list. Reads VAULT_DIR
# and DOC_TEXT_MAP.
pending_block() {
  local path sibling extra found=0
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    extra=''
    case "${path,,}" in
      *.docx | *.odt | *.html | *.htm | *.epub | *.rtf)
        sibling="${path%.*}.md"
        if [ -f "$VAULT_DIR/$sibling" ] && ! grep -Fxq -- "$sibling" "$1"; then
          extra=" (text: \`$sibling\`)"
        fi
        ;;
      *.pdf)
        if [ -f "$DOC_TEXT_MAP" ] && N="${path##*/}" awk -F '\t' \
          '$1 == ENVIRON["N"] && $2 == "-" { f = 1 } END { exit !f }' "$DOC_TEXT_MAP"; then
          extra=' (scanned: no text layer)'
        fi
        ;;
    esac
    printf -- '- `%s`%s\n' "$path" "$extra"
    found=1
  done <"$1"
  [ "$found" -eq 1 ] || printf '(none)\n'
}

# R-SS-17 {{BACKFILL}}, a lint only: up to 50 rows of the index file $1
# that lack tags or a description in the rules version 24 sense (fewer
# than five `·`-separated fields), oldest first (file order), as they are,
# or `(none)`. The `## Meta` and `## Tags` sections are not rows to
# complete.
backfill_block() {
  local out=''
  if [ -f "$1" ]; then
    out=$(awk '{ sub(/\r$/, "") }
      /^## / { skip = ($0 ~ /^## (Meta|Tags)[ \t]*$/); next }
      skip { next }
      /^[ \t]*- \[\[/ && split($0, f, "·") < 5 { print; if (++n == 50) exit }' "$1") || return 1
  fi
  printf '%s\n' "${out:-(none)}"
}

# R-SS-6: fills a prompt read on stdin in one pass. Each line that is exactly
# `{{NAME}}` is replaced by the contents of $1/context-<name>.txt (the name in
# lower case) when that file exists; any other line is printed as it is.
# Inserted text is never scanned again, so vault text that holds a
# placeholder stays literal.
fill_placeholders() {
  D=$1 awk '
    { line = $0; sub(/\r$/, "", line) }
    line ~ /^\{\{[A-Z_]+\}\}$/ {
      file = ENVIRON["D"] "/context-" tolower(substr(line, 3, length(line) - 4)) ".txt"
      if ((getline text < file) > 0) {
        print text
        while ((getline text < file) > 0) print text
        close(file)
        next
      }
      close(file)
    }
    { print }'
}
# The effort and the rulebook sections for a run of mode $1 (#965, #1000),
# with RULES_WRITABLE $2 and the pending list after the pre-scan in file
# $3. Sets EFFORT and CONTEXT_MODES:
# - an ingest given an instruction note the app wrote (RULES_WRITABLE 1):
#   EFFORT_HIGH, with the `instructions` sections;
# - an ingest whose only reason for more is a pending context note from
#   Add (is_context_note): EFFORT_MEDIUM, also with the `instructions`
#   sections, because how a context note is handled is written in the
#   rulebook's **Instructions** section (`<!-- load: instructions -->`);
# - anything else, a lint included: EFFORT_LOW, with only the run's own
#   mode (`ingest` or `lint`).
choose_effort() {
  local mode=$1 writable=$2 pending=$3 path
  EFFORT=$EFFORT_LOW
  CONTEXT_MODES=("$mode")
  [ "$mode" = ingest ] || return 0
  if [ "$writable" -eq 1 ]; then
    EFFORT=$EFFORT_HIGH
    CONTEXT_MODES+=(instructions)
    return 0
  fi
  [ -f "$pending" ] || return 0
  while IFS= read -r path; do
    [ -n "$path" ] && [ -f "$VAULT_DIR/$path" ] || continue
    if is_context_note "$path"; then
      EFFORT=$EFFORT_MEDIUM
      CONTEXT_MODES+=(instructions)
      return 0
    fi
  done <"$pending"
}
# <<< context pack

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
# The kinds are kept in KINDS_FILE, so the list can be rebuilt with where
# each item went after the move phase (items_json).
processed_json() {
  local path kind
  : >"$KINDS_FILE"
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
    printf '%s\t%s\n' "$path" "$kind" >>"$KINDS_FILE"
  done <"$1"
  items_json
}

# The processed list from KINDS_FILE, as a JSON array of { path, kind }.
# Report v2 (#598): with a moves file ("<old><TAB><new>", MOVES_FILE), an
# item that moved also carries `to` (its new path) and, when its file name
# changed, `renamedFrom` (the old name).
items_json() {
  local path kind to='' moves=${1:-} only_moved=${2:-} args
  while IFS=$'\t' read -r path kind; do
    [ -n "$path" ] || continue
    args=(--arg path "$path" --arg kind "$kind")
    to=''
    if [ -n "$moves" ] && [ -f "$moves" ]; then
      to=$(P="$path" awk -F '\t' '$1 == ENVIRON["P"] { print $2; exit }' "$moves")
      if [ -n "$to" ]; then
        args+=(--arg to "$to")
        [ "${path##*/}" = "${to##*/}" ] || args+=(--arg renamedFrom "${path##*/}")
      fi
    fi
    # With a second argument, only the items that moved.
    [ -z "$only_moved" ] || [ -n "$to" ] || continue
    jq -cn "${args[@]}" '$ARGS.named'
  done <"$KINDS_FILE" | {
    local items
    items=$(paste -sd, -)
    printf '[%s]\n' "$items"
  }
}

# Whether Bower reads this kind of file (System-Formats, R-AG-9): notes and
# text, PDFs, photos, and the documents pandoc converts. Any other kind
# (video, audio, Excel, PowerPoint, iPhone photos, archives, anything else)
# is only kept: filed by name and date, never read.
reads_kind() {
  case "${1##*/}" in
    *.[mM][dD] | *.[tT][xX][tT] | *.[cC][sS][vV] | *.[jJ][sS][oO][nN] | *.[eE][mM][lL]) return 0 ;;
    *.[pP][dD][fF]) return 0 ;;
    *.[jJ][pP][gG] | *.[jJ][pP][eE][gG] | *.[pP][nN][gG] | *.[wW][eE][bB][pP] | *.[gG][iI][fF]) return 0 ;;
    *.[dD][oO][cC][xX] | *.[oO][dD][tT] | *.[rR][tT][fF] | *.[eE][pP][uU][bB] | \
      *.[hH][tT][mM][lL] | *.[hH][tT][mM]) return 0 ;;
  esac
  return 1
}

# Whether the local file $1 is over the size limits: more than
# MAX_READ_BYTES, or a PDF with more than MAX_PDF_PAGES pages. The page
# count is a best-effort count of the PDF's page objects (no PDF tool on the
# runner): a PDF that hides them in compressed streams counts as short.
too_large() {
  local size pages
  size=$(wc -c <"$1" | tr -d ' ') || return 1
  [ "$size" -le "$MAX_READ_BYTES" ] || return 0
  case "$1" in
    *.[pP][dD][fF])
      pages=$(LC_ALL=C grep -aoE '/Type[[:space:]]*/Page([^s]|$)' "$1" | grep -c . || true)
      [ "$pages" -le "$MAX_PDF_PAGES" ] || return 0
      ;;
  esac
  return 1
}

# The set-aside list (#598), before the agent starts, from the pending files
# still pending after the pre-scan (file $1): a file over the size limits is
# `too-large` and listed in TOO_LARGE_LIST for the agent, one of a kind
# Bower only keeps is `kept-not-read`, a document pandoc could not convert
# is `unconvertible`; then each quarantined path, `quarantined`. Only files
# (not instruction or context notes). Writes SET_ASIDE_FILE and
# TOO_LARGE_LIST; logs counts only.
set_aside() {
  local path kind large=0 kept=0
  : >"$SET_ASIDE_FILE"
  rm -f "$VAULT_DIR/$TOO_LARGE_LIST"
  while IFS=$'\t' read -r path kind; do
    [ -n "$path" ] && [ "$kind" = file ] && [ -f "$VAULT_DIR/$path" ] || continue
    grep -qxF -- "$path" "$1" || continue
    if too_large "$VAULT_DIR/$path"; then
      printf 'too-large\t%s\n' "$path" >>"$SET_ASIDE_FILE"
      mkdir -p "$VAULT_DIR/.bower" && printf '%s\n' "$path" >>"$VAULT_DIR/$TOO_LARGE_LIST" || return 1
      large=$((large + 1))
    elif ! reads_kind "$path"; then
      printf 'kept-not-read\t%s\n' "$path" >>"$SET_ASIDE_FILE"
      kept=$((kept + 1))
    elif grep -qxF -- "$path" "$UNCONVERTED_FILE"; then
      printf 'unconvertible\t%s\n' "$path" >>"$SET_ASIDE_FILE"
    fi
  done <"$KINDS_FILE"
  while IFS= read -r path; do
    [ -z "$path" ] || printf 'quarantined\t%s\n' "$path" >>"$SET_ASIDE_FILE"
  done <"$QUARANTINED_FILE"
  [ $((large + kept)) -eq 0 ] || log "$large files too large to read, $kept kept without reading"
}

# SET_ASIDE_FILE as a JSON array of { path, reason }.
set_aside_json() {
  local reason path
  while IFS=$'\t' read -r reason path; do
    [ -n "$path" ] || continue
    jq -cn --arg path "$path" --arg reason "$reason" '$ARGS.named'
  done <"$SET_ASIDE_FILE" | {
    local items
    items=$(paste -sd, -)
    printf '[%s]\n' "$items"
  }
}

# The agent's one clause about what it added besides filing (#598), from
# ADDED_NOTE: its first non-empty line, trimmed and cut to MAX_ADDED_LENGTH
# characters; empty when it wrote none. The file is removed from the local
# copy either way, so it is never uploaded, and so is TOO_LARGE_LIST.
read_added() {
  local file="$VAULT_DIR/$ADDED_NOTE" line=''
  if [ -f "$file" ]; then
    line=$(grep -m 1 -v '^[[:space:]]*$' "$file" | tr -d '\r' |
      sed 's/^[[:space:]]*//; s/[[:space:]]*$//' || true)
  fi
  ADDED=${line:0:$MAX_ADDED_LENGTH}
  rm -f "$file" "$VAULT_DIR/$TOO_LARGE_LIST"
}

# The agent's one line per note it updated (R-RUNNER-1), from UPDATED_NOTE
# ("<path><TAB><what>"): each line with a path and a non-empty `what`,
# trimmed, is kept in UPDATED_WHAT_FILE (the first line for a path wins;
# the Worker cuts `what` to MAX_WHAT_LENGTH, and so does report_lists). The
# file is removed from the local copy either way, so it is never uploaded.
# Its lines are never logged.
read_updated() {
  local file="$VAULT_DIR/$UPDATED_NOTE"
  : >"$UPDATED_WHAT_FILE"
  if [ -f "$file" ]; then
    tr -d '\r' <"$file" | awk -F '\t' '
      { path = $1; what = substr($0, length($1) + 2)
        sub(/^[[:space:]]+/, "", path); sub(/[[:space:]]+$/, "", path)
        sub(/^[[:space:]]+/, "", what); sub(/[[:space:]]+$/, "", what)
        if (path != "" && what != "" && !(path in seen)) {
          seen[path] = 1; print path "\t" what } }' >"$UPDATED_WHAT_FILE" || true
  fi
  rm -f "$file"
}

# What the run means (R-MEAN-1): DISAGREE_JSON from CHECKS_NOTE and
# NEXT_JSON from NEXT_NOTE, each a JSON array of the lines in the fixed
# format (DISAGREE_FILTER and NEXT_FILTER), empty when the agent wrote no
# file. Both files are removed from the local copy either way, so they are
# never uploaded. Their lines are never logged.
read_meaning() {
  local checks="$VAULT_DIR/$CHECKS_NOTE" next="$VAULT_DIR/$NEXT_NOTE"
  DISAGREE_JSON=''
  NEXT_JSON=''
  if [ -f "$checks" ]; then
    DISAGREE_JSON=$(jq -Rn --argjson cut "$MAX_MEANING_LENGTH" \
      --argjson max "$MAX_DISAGREE" "$DISAGREE_FILTER" <"$checks") || DISAGREE_JSON=''
  fi
  if [ -f "$next" ]; then
    NEXT_JSON=$(jq -Rn --argjson cut "$MAX_MEANING_LENGTH" \
      --argjson max "$MAX_NEXT" "$NEXT_FILTER" <"$next") || NEXT_JSON=''
  fi
  rm -f "$checks" "$next"
}

# The mechanical History lines (R-RUNNER-9, R-HIST): the runner, not the
# agent, appends one dated bullet to the `## History` section of a note
# Bower wrote (`by: bower` in its frontmatter), creating the section at the
# end of the note when it is missing, in the shape the app writes
# (app/src/history.ts): "- 29 Sep · Filed to <folder>, by Bower". A line
# already in the note is not added again, so running twice changes nothing.
# Usage: append_history <note file> <line without "- ">
append_history() {
  local file=$1 line=$2 tmp="$1.bower-history"
  grep -qxF -- "- $line" "$file" && return 1
  LINE="- $line" awk '
    { sub(/\r$/, ""); rows[++n] = $0 }
    END {
      for (i = 1; i <= n; i++) if (rows[i] ~ /^##[ \t]+History[ \t]*$/) { start = i; break }
      if (!start) {
        while (n > 0 && rows[n] ~ /^[ \t]*$/) n--
        for (i = 1; i <= n; i++) print rows[i]
        print ""; print "## History"; print ""; print ENVIRON["LINE"]
        exit
      }
      end = n + 1
      for (i = start + 1; i <= n; i++) if (rows[i] ~ /^##[ \t]+[^ \t]/) { end = i; break }
      last = end - 1
      while (last > start && rows[last] ~ /^[ \t]*$/) last--
      for (i = 1; i <= last; i++) print rows[i]
      if (last == start) print ""
      print ENVIRON["LINE"]
      for (i = last + 1; i <= n; i++) print rows[i]
    }' "$file" >"$tmp" || { rm -f "$tmp"; return 2; }
  cat "$tmp" >"$file" && rm -f "$tmp" || return 2
}

# The `status:` of every note before the run, "<path><TAB><status>" in
# STATUS_BEFORE, for the status History lines. Only notes that have one.
snapshot_status() {
  : >"$STATUS_BEFORE"
  (cd "$VAULT_DIR" && cut -d ' ' -f 3- "$MANIFEST_BEFORE" | { grep '\.md$' || true; } | tr '\n' '\0' |
    xargs -0 -r awk "$STATUS_AWK") >"$STATUS_BEFORE" || return 1
}

# One "<path><TAB><status>" line per note given that has a frontmatter
# `status:` (quotes removed). A path with a tab is skipped.
readonly STATUS_AWK='
  FNR == 1 { fm = ($0 ~ /^---\r?$/); done = 0; next }
  fm && !done && /^---[ \t]*\r?$/ { done = 1; next }
  fm && !done && /^status:/ {
    v = $0; sub(/\r$/, "", v); sub(/^status:[ \t]*/, "", v); sub(/[ \t]+$/, "", v)
    if (v ~ /^".*"$/ || v ~ /^\047.*\047$/) v = substr(v, 2, length(v) - 2)
    if (FILENAME !~ /\t/) print FILENAME "\t" v
    done = 1
  }'

# After the bookkeeping phase: the runner's own History lines (R-RUNNER-9),
# dated today, on the notes Bower wrote that this run touched:
# - a note moved out of 0-Inbox/ or Clippings/, or one the run created
#   anywhere else: "Filed to <folder>, by Bower";
# - any other moved note: "Moved to <folder>, by Bower", or "Renamed from
#   <old name>, by Bower" when only its name changed;
# - a note whose `status:` the agent changed: "Status <old> → <new>, by
#   Bower" (an empty status reads "none", as in the app).
# Every note it changed joins UPLOAD_FILE. Logs a count only.
write_history() {
  [ "$MODE" = ingest ] && [ "$TOO_MANY_CHANGES" -eq 0 ] || return 0
  local day lines="$WORK_DIR/history-lines.txt" before="$WORK_DIR/history-before.txt"
  local path line by kind orig old new count=0 rc
  day=$(LC_ALL=C date -u '+%-d %b')
  : >"$lines"
  : >"$before"
  [ ! -f "$MANIFEST_BEFORE" ] || cut -d ' ' -f 3- "$MANIFEST_BEFORE" >"$before"
  # Moves (Drive moves and fallbacks alike).
  paste "$BOOKED_OLD" "$BOOKED_NEW" | awk -F '\t' '
    function base(p) { sub(/.*\//, "", p); return p }
    function dir(p) { if (p !~ /\//) return "the Bower folder"; sub(/\/[^\/]*$/, "", p); return p }
    $1 != "" && $2 ~ /\.md$/ {
      if ($1 ~ /^(0-Inbox|Clippings)\// && $2 !~ /^(0-Inbox|Clippings)\//) what = "Filed to " dir($2)
      else if (dir($1) == dir($2)) what = "Renamed from " base($1)
      else what = "Moved to " dir($2)
      print $2 "\t" what
    }' >>"$lines" || return 1
  # Notes the run created, outside the inboxes: accepted, new, not a move.
  awk 'FILENAME == ARGV[1] { skip[$0] = 1; next } FILENAME == ARGV[2] { skip[$0] = 1; next }
    /\.md$/ && !($0 in skip) && $0 !~ /^(0-Inbox|Clippings|\.bower)\// &&
      $0 !~ /^(log|index|Rules)\.md$/ && $0 !~ /(^|\/)(CLAUDE|_[^\/]*)\.md$/ { print }' \
    "$before" "$BOOKED_NEW" "$CHANGED_FILE" |
    awk '{ p = $0; d = p; if (d !~ /\//) d = "the Bower folder"; else sub(/\/[^\/]*$/, "", d)
      print p "\tFiled to " d }' >>"$lines" || return 1
  # Status changes on the notes that were there before.
  (cd "$VAULT_DIR" && { grep '\.md$' "$CHANGED_FILE" || true; } | tr '\n' '\0' | xargs -0 -r awk "$STATUS_AWK") |
    awk -F '\t' 'FILENAME == ARGV[1] { was[$1] = $2; seen[$1] = 1; next }
      ($1 in seen) && was[$1] != $2 {
        print $1 "\tStatus " (was[$1] == "" ? "none" : was[$1]) " → " ($2 == "" ? "none" : $2) }' \
      "$STATUS_BEFORE" - >>"$lines" || return 1
  while IFS=$'\t' read -r path line; do
    [ -n "$path" ] && [ -f "$VAULT_DIR/$path" ] || continue
    may_write "$path" || continue
    IFS=$'\t' read -r by kind orig < <(note_meta "$VAULT_DIR/$path")
    [ "$by" = bower ] || continue
    rc=0
    append_history "$VAULT_DIR/$path" "$day · $line, by Bower" || rc=$?
    [ "$rc" -ne 2 ] || return 1
    [ "$rc" -eq 0 ] || continue
    printf '%s\n' "$path" >>"$UPLOAD_FILE"
    count=$((count + 1))
  done <"$lines"
  [ "$count" -eq 0 ] || log "$count History lines written"
  awk '!seen[$0]++' "$UPLOAD_FILE" >"$UPLOAD_FILE.tmp" && mv "$UPLOAD_FILE.tmp" "$UPLOAD_FILE"
}

# The pending inbox paths still there at the end (R-RUNNER-1): the pending
# list (after the pre-scan) minus the originals moved in Drive and those
# deleted from it; none before the pending list exists (a run that failed
# before or during sync down). Printed one per line, sorted.
left_paths() {
  local pending_now="$WORK_DIR/pending-after-scan.txt"
  [ -f "$pending_now" ] || pending_now=$PENDING_FILE
  [ "$MODE" = ingest ] && [ -f "$pending_now" ] || return 0
  touch "$MOVED_OLD"
  awk 'FILENAME != ARGV[3] { gone[$0] = 1; next } $0 != "" && !($0 in gone)' \
    "$MOVED_OLD" "$DELETED_FILE" "$pending_now" | LC_ALL=C sort -u
}

# Sets CREATED_JSON, UPDATED_JSON and LEFT_JSON (R-RUNNER-1) from what the
# copies up actually uploaded (UPLOADED_FILE, the upload list, not the
# intent), Bower's bookkeeping files left out: created is an uploaded path not in MANIFEST_BEFORE and not a
# move destination (MOVES_FILE), updated one in MANIFEST_BEFORE, with the
# agent's `what` when it wrote one; left is left_paths. Names paths, never
# logged.
report_lists() {
  local before="$WORK_DIR/before-paths.txt" dests="$WORK_DIR/move-dests.txt"
  local uploaded="$WORK_DIR/uploaded-sorted.txt"
  : >"$before"
  : >"$dests"
  [ ! -f "$MANIFEST_BEFORE" ] ||
    cut -d ' ' -f 3- "$MANIFEST_BEFORE" | LC_ALL=C sort -u >"$before"
  [ ! -f "$MOVES_FILE" ] || cut -f 2 "$MOVES_FILE" | LC_ALL=C sort -u >"$dests"
  # Only the person's notes count: Bower's bookkeeping (log.md, index.md,
  # Rules.md, any CLAUDE.md, anything under .bower/ and the folders' own
  # _<Folder>.md pages) is neither created nor updated for the app.
  { grep -v '^$' "$UPLOADED_FILE" || true; } |
    awk '!/^(log|index|Rules)\.md$/ && !/(^|\/)CLAUDE\.md$/ && !/^\.bower\// && !/(^|\/)_[^\/]*\.md$/' |
    LC_ALL=C sort -u >"$uploaded"
  CREATED_JSON=$(LC_ALL=C comm -23 "$uploaded" "$before" | LC_ALL=C comm -23 - "$dests" |
    jq -Rn '[inputs]')
  UPDATED_JSON=$(LC_ALL=C comm -12 "$uploaded" "$before" |
    awk -F '\t' 'FILENAME == ARGV[1] { what[$1] = $2; next }
      { print (($0 in what) ? $0 "\t" what[$0] : $0) }' "$UPDATED_WHAT_FILE" - |
    jq -Rn --argjson cut "$MAX_WHAT_LENGTH" "$UPDATED_FILTER")
  LEFT_JSON=$(left_paths | jq -Rn '[inputs]')
}

# The processed items the move phase already moved in Drive (MOVED_OLD),
# each with its `to` (R-RUNNER-5), as a JSON array; empty output when none
# moved, for a lint, or before the move phase.
moved_items_json() {
  local pairs="$WORK_DIR/moved-pairs.txt"
  [ "$MODE" = ingest ] && [ -s "$MOVED_OLD" ] && [ -f "$MOVES_FILE" ] &&
    [ -f "$KINDS_FILE" ] || return 0
  awk -F '\t' 'FILENAME == ARGV[1] { done[$0] = 1; next } ($1 in done)' \
    "$MOVED_OLD" "$MOVES_FILE" >"$pairs" || return 1
  [ -s "$pairs" ] || return 0
  items_json "$pairs" moved
}

# A running report with its phase (R-RUNNER-4) and, when known, a total.
# Best effort: a lost phase report is logged and the run goes on. Usage:
# report_phase <reading|writing|saving> [total].
report_phase() {
  if ! PROCESSED_JSON='' SUMMARY='' QUARANTINED_JSON='' PHASE=$1 TOTAL=${2:-} report running; then
    log "report $1 failed"
  fi
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
  # With stream-json the session's own error is in its last result event
  # (R-SS-2), next to whatever reached stderr. The result text is the CLI's
  # own error message only when it starts with one of the prefixes Claude
  # Code (2.1.283) prints for one (cli_errors); any other text is the
  # agent's own prose, which may well say "authentication" without the
  # model being unreachable, so it is not read for model errors.
  local model_errors='overloaded|rate[ _-]?limit|credit balance|api error|authentication|invalid (api key|x-api-key|bearer)|oauth token|529|503 service'
  local cli_errors="^(API Error|Authentication error|Invalid API key|Credit balance is too low|OAuth token|Repeated 529|You've hit your)"
  local result_error result_text
  result_error=$(agent_result_error "$AGENT_STREAM" 2>/dev/null) || result_error=''
  result_text=${result_error#error$'\n'}
  if [ "$result_error" = max_turns ] || grep -Eiq 'max(imum)?[ _-]?turns' "$AGENT_ERR" 2>/dev/null; then
    echo timeout
  elif grep -Eiq "$model_errors" "$AGENT_ERR" 2>/dev/null ||
    { [ "${result_error%%$'\n'*}" = error ] && [[ ${result_text%%$'\n'*} =~ $cli_errors ]] &&
      grep -Eiq "$model_errors" <<<"$result_text"; }; then
    echo model_unavailable
  else
    echo unknown
  fi
}

# >>> session stats (R-SS-2): agent/test/stats.test.sh runs this block as is.
# The text of the last `result` event of the stream-json transcript $1, as
# the text output used to print it. A line that is not JSON (a stream cut
# short by a timeout) is skipped. Prints nothing when there is no result.
readonly RESULT_TEXT_FILTER='[inputs | fromjson? | select(type == "object" and .type == "result")]
  | last | .result? | strings'
agent_result_text() {
  jq -rnR "$RESULT_TEXT_FILTER" "$1"
}
# The session's numbers from the transcript $1, as one line of numbers and
# tool names: the last `result` event's turns, API time and tokens, and the
# `tool_use` blocks of the assistant events counted by name (a block seen
# twice, same id, once), sorted by name. A value missing or not a number
# prints `-`; a tool name that is not a plain word counts as `other`. Never
# a path, a file name or any text from the stream.
readonly STATS_FILTER='def n($x): if ($x | type) == "number" then ($x | floor | tostring) else "-" end;
  [inputs | fromjson? | select(type == "object")] as $e
  | ([$e[] | select(.type == "result")] | last // {}) as $r
  | ($r.usage | if type == "object" then . else {} end) as $u
  | ([$e[] | select(.type == "assistant") | .message | objects | .content | arrays | .[]
      | select(type == "object" and .type == "tool_use")]
    | (map(select((.id | type) == "string")) | unique_by(.id)) + map(select((.id | type) != "string"))
    | map(.name | if type == "string" and test("^[A-Za-z0-9_-]+$") then . else "other" end)
    | group_by(.) | map("\(.[0]):\(length)") | join(",")) as $t
  | "turns=\(n($r.num_turns)) api_ms=\(n($r.duration_api_ms)) in=\(n($u.input_tokens)) out=\(n($u.output_tokens)) cache_read=\(n($u.cache_read_input_tokens)) cache_write=\(n($u.cache_creation_input_tokens)) tools=\(if $t == "" then "-" else $t end)"'
agent_stats() {
  jq -rnR "$STATS_FILTER" "$1"
}
# How the session in the transcript $1 says it failed, from its last
# `result` event (stream-json puts it there, not on stderr): `max_turns` for
# subtype error_max_turns; otherwise, when is_error is true, `error` and the
# event's text on the next lines; nothing for a session that did not fail or
# has no result event. Read only for a failed session (agent_failure_reason).
readonly RESULT_ERROR_FILTER='[inputs | fromjson? | select(type == "object" and .type == "result")]
  | last | objects
  | if .subtype == "error_max_turns" then "max_turns"
    elif .is_error == true then "error\n\(.result | if type == "string" then . else "" end)"
    else empty end'
agent_result_error() {
  jq -rnR "$RESULT_ERROR_FILTER" "$1"
}
# <<< session stats

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

# R-VAULT-7: one Drive files.get on the Bower folder, made from this shell
# with the Drive token. Fails the run with `vault_missing` when the folder
# answers 404 or is in the Bin (`trashed`), which rclone would not notice:
# it lists a trashed folder like any other, and a folder that is gone gives
# an error that looks like any Drive outage. Any other answer that is not
# a clean 200 (403, 5xx, no answer) is `drive_unavailable`, not a guess.
# Usage: check_folder <step>. Nothing is uploaded by the failure.
check_folder() {
  local step=$1 code
  case "$FOLDER_ID" in
    '' | *[!A-Za-z0-9_-]*) fail "$step: folder id is not usable" vault_missing ;;
  esac
  if ! code=$(curl -sS --get -o "$DRIVE_FOLDER_JSON" -w '%{http_code}'     -H "Authorization: Bearer $ACCESS_TOKEN"     --data-urlencode 'fields=id,trashed' --data-urlencode 'supportsAllDrives=true'     "$DRIVE_FILES_URL/$FOLDER_ID" </dev/null 2>>"$DRIVE_LOG"); then
    fail "$step: folder check failed" drive_unavailable
  fi
  case "$code" in
    200)
      if [ "$(jq -r --arg k trashed '.[$k] // empty' "$DRIVE_FOLDER_JSON" 2>>"$DRIVE_LOG")" = true ]; then
        fail "$step: the Bower folder is in the Bin" vault_missing
      fi
      ;;
    404) fail "$step: the Bower folder is gone" vault_missing ;;
    *) fail "$step: folder check answered HTTP $code" drive_unavailable ;;
  esac
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
check_folder "$STEP"
sync_started=$(date +%s)
if ! rclone sync vault: "$VAULT_DIR" --exclude '.obsidian/**' "${RCLONE_FILTER[@]}" >>"$RCLONE_LOG" 2>&1; then
  fail "$STEP: rclone failed" drive_unavailable
fi
# R-SS-15: how heavy the sync down is, numbers only: the files and bytes of
# the local copy and the seconds it took. When the time passes 20 s in
# normal use, the partial download (spec D-5) moves up.
# Best effort: a failure here never fails the run.
sync_seconds=$(($(date +%s) - sync_started)) || sync_seconds=0
sync_files=$(find "$VAULT_DIR" -type f 2>/dev/null | wc -l | tr -d ' ') || sync_files=0
sync_bytes=$(du -sb "$VAULT_DIR" 2>/dev/null | cut -f 1) || sync_bytes=0
[[ $sync_files =~ ^[0-9]+$ ]] || sync_files=0
[[ $sync_bytes =~ ^[0-9]+$ ]] || sync_bytes=0
log "$STEP: $sync_files files, $(awk -v b="$sync_bytes" 'BEGIN { printf "%.1f", b / 1048576 }') MB, $sync_seconds s"

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

# --- reconcile --------------------------------------------------------------
# Moves the person made between runs (see reconcile above, #597). Best
# effort: when the listing or the upload fails, the run goes on without it
# and the next run reconciles against the same, older map.
STEP='reconcile'
log "$STEP"
if ! reconcile; then
  RECONCILED=0
  log "$STEP failed: not reconciled"
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
# --- held for the next tidy-up (R-RUNNER-6) ---
# Everything that reached the inbox after the run was asked for belongs to
# the next tidy-up, as the app shows it: Waiting (#491). Sync down gives each
# local file Drive's modifiedTime, so every pending file created or modified
# after REQUESTED_AT plus HOLD_GRACE seconds is held: a request sent while
# the run is queued, a file still uploading when the run was asked for
# (R-UPL), a pile or context note rewritten after it. The grace covers the
# gap between Drive's clock and the Worker's, so a pile note or request
# note saved just before "Yes, tidy up" or "Just this, now" is never
# skipped. A held context note (Add's "What is this?" note or a pile note)
# takes the files its `## Applies to` list names with it, so they wait
# together for the next tidy-up. A held file is removed from the local
# copy and the pending list, exactly like the files an instructions-only
# run holds back: the agent never sees it, the upload never touches it and
# the pending-original deletes never name it, so in Drive it stays where it
# is. No REQUESTED_AT (an older Worker), no hold. The log counts, never
# names.
if [ "$MODE" = ingest ] && [[ "$REQUESTED_AT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$ ]]; then
  cutoff=$(hold_cutoff "$REQUESTED_AT") || fail "$STEP: could not read when the run was asked for"
  : >"$WORK_DIR/held.txt"
  while IFS= read -r path <&3; do
    [ -n "$path" ] || continue
    if [ -n "$(find "$VAULT_DIR/$path" -maxdepth 0 -newermt "$cutoff" 2>/dev/null)" ]; then
      printf '%s\n' "$path" >>"$WORK_DIR/held.txt"
      if is_context_note "$path"; then
        applies_to "$path" >>"$WORK_DIR/held.txt" || fail "$STEP: could not read a context note"
      fi
    fi
  done 3<"$PENDING_FILE"
  : >"$WORK_DIR/not-held.txt"
  held=0
  while IFS= read -r path <&3; do
    [ -n "$path" ] || continue
    if grep -Fxq -- "$path" "$WORK_DIR/held.txt"; then
      rm -f "$VAULT_DIR/$path" || fail "$STEP: could not set a file aside"
      held=$((held + 1))
    else
      printf '%s\n' "$path" >>"$WORK_DIR/not-held.txt"
    fi
  done 3<"$PENDING_FILE"
  mv "$WORK_DIR/not-held.txt" "$PENDING_FILE"
  [ "$held" -eq 0 ] || log "$held files sent during the run left for the next tidy-up"
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
  report_lists || fail "$STEP: report lists not built"
  write_outcome done 'Nothing new to tidy up.'
  write_file_facts
  write_paths
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
# Only this run's agent may say what it added (#598): a stale note in the
# local copy is dropped before the manifest, and so is a stale list of
# updated notes (R-RUNNER-1).
rm -f "$VAULT_DIR/$ADDED_NOTE" "$VAULT_DIR/$TOO_LARGE_LIST" "$VAULT_DIR/$UPDATED_NOTE" "$VAULT_DIR/$CHECKS_NOTE" "$VAULT_DIR/$NEXT_NOTE"
if ! manifest >"$MANIFEST_BEFORE"; then
  fail "$STEP: listing the local copy failed"
fi
if ! keep_pre_run_copy; then
  fail "$STEP: keeping a pre-run copy failed"
fi
# R-RUNNER-9: each note's status now, for the status History lines.
if ! snapshot_status 2>>"$LOG_DIR/bookkeeping.err"; then
  fail "$STEP: reading the statuses failed"
fi

# Keeps a copy of the text file $2 (a document's converted text) as the text
# of the original $1, for its text copy (R-RUNNER-7). An empty text is not
# kept: with no conversion, nothing is written.
keep_doc_text() {
  local n out
  [ -n "$(tr -d '[:space:]' <"$2")" ] || return 0
  n=$(grep -c . "$DOC_TEXT_MAP" || true)
  out="$DOC_TEXT_DIR/$((n + 1)).txt"
  cp "$2" "$out" || return 0
  printf '%s\t%s\n' "${1##*/}" "$out" >>"$DOC_TEXT_MAP"
}

# R-AG-9: the text of the pending PDF $1, by pdftotext -layout (poppler-utils,
# installed in the job). A PDF over the size limits is not converted (it is
# only kept), nor is one pdftotext cannot read: nothing is written for it.
# One with no text on any page (a scan) is listed with "-" instead of a text
# file. The vault gets no file: the agent reads the PDF itself.
pdf_text() {
  local out="$WORK_DIR/pdf-text.tmp"
  command -v pdftotext >/dev/null 2>&1 || return 0
  ! too_large "$VAULT_DIR/$1" || return 0
  timeout 120 pdftotext -layout "$VAULT_DIR/$1" "$out" </dev/null >>"$PANDOC_LOG" 2>&1 || return 0
  if [ -z "$(tr -d '[:space:]' <"$out")" ]; then
    printf '%s\t-\n' "${1##*/}" >>"$DOC_TEXT_MAP"
  else
    tr -d '\f' <"$out" >"$out.clean" && mv "$out.clean" "$out" || return 0
    keep_doc_text "$1" "$out"
  fi
  rm -f "$out"
}

# --- convert documents ------------------------------------------------------
# The agent has no pandoc, so Office, HTML and EPUB files pending in 0-Inbox/
# and Clippings/ are converted here, before it runs: each becomes a Markdown
# sibling with the same base name (report.docx -> report.md), which goes to
# the same folder as its original, with the original's final base name
# (the rulebook's converted-document rule): the agent moves it, or the
# filing sheet does when the agent filed only the original (each sibling
# is listed in CONVERTED_FILE; sheet_sibling). A file whose sibling already
# exists is left as it is. --sandbox keeps
# pandoc to the one input file: no other file, no URL, no network. Taken
# after the manifest, so the siblings are new files and go up with the
# agent's changes. A lint processes nothing, so it converts nothing. A file
# pandoc cannot read stays as it is, for the agent to move to Processed/ as
# unconvertible; the log counts, never names, and pandoc's own messages go
# to a private log file.
STEP='convert documents'
: >"$UNCONVERTED_FILE"
: >"$CONVERTED_FILE"
: >"$DOC_TEXT_MAP"
mkdir -p "$DOC_TEXT_DIR"
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
      *.[pP][dD][fF])
        pdf_text "$path"
        continue
        ;;
      *) continue ;;
    esac
    sibling="${path%.*}.md"
    [ ! -e "$VAULT_DIR/$sibling" ] || continue
    if (cd "$VAULT_DIR" && pandoc --sandbox -f "$from" -t gfm --wrap=none \
      -o "$sibling" -- "$path") </dev/null >>"$PANDOC_LOG" 2>&1; then
      keep_doc_text "$path" "$VAULT_DIR/$sibling"
      printf '%s\n' "$sibling" >>"$CONVERTED_FILE"
      converted=$((converted + 1))
    else
      rm -f "$VAULT_DIR/$sibling"
      printf '%s\n' "$path" >>"$UNCONVERTED_FILE"
      unconverted=$((unconverted + 1))
    fi
  done 3<"$PENDING_FILE"
  if [ $((converted + unconverted)) -gt 0 ]; then
    log "$STEP: $converted converted, $unconverted could not be converted"
  fi
fi
# R-RUNNER-4: reading, after the conversion, with the number of things
# pending for an ingest.
if [ "$MODE" = ingest ]; then
  report_phase reading "$PENDING_COUNT"
else
  report_phase reading
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

# --- set aside -------------------------------------------------------------
# Report v2 (#598): what the agent will only keep (a kind Bower does not
# read, or a file over the size limits, which the agent finds listed in
# TOO_LARGE_LIST) and what the run set aside before it started
# (unconvertible, quarantined). See set_aside above.
if [ "$MODE" = ingest ]; then
  STEP='set aside'
  pending_now="$WORK_DIR/pending-after-scan.txt"
  [ -f "$pending_now" ] || pending_now=$PENDING_FILE
  if ! set_aside "$pending_now"; then
    fail "$STEP: listing failed"
  fi
  SET_ASIDE_JSON=$(set_aside_json)
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
STEP='agent prompt'
PROMPT=$(cat "$PROMPT_FILE")
# R-AG-10: the notes a failed run already wrote, in the ingest prompt's
# placeholder line; without them the line goes, blank line and all.
if [ "$MODE" = ingest ]; then
  already_written=$(already_written_block) || {
    already_written=''
    log "previous run report unreadable: no already-written list"
  }
  if [ -n "$already_written" ]; then
    PROMPT=${PROMPT//'{{ALREADY_WRITTEN}}'/"$already_written"}
  else
    PROMPT=${PROMPT//$'{{ALREADY_WRITTEN}}\n\n'/}
  fi
fi
# R-RUNNER-4: writing, as the agent starts, with the number of things it
# was given for an ingest (the pending list after the pre-scan). No `done`
# count: the agent does not report its progress.
if [ "$MODE" = ingest ]; then
  pending_now="$WORK_DIR/pending-after-scan.txt"
  [ -f "$pending_now" ] || pending_now=$PENDING_FILE
  report_phase writing "$(count_lines "$pending_now")"
else
  report_phase writing
fi
# The effort and the rulebook sections (see "model and effort" above and
# choose_effort in the context pack).
choose_effort "$MODE" "$RULES_WRITABLE" "${pending_now:-}"
readonly EFFORT
# R-SS-6 (#966): the run's facts, filled into the prompt the way
# {{ALREADY_WRITTEN}} is, so the agent never reads index.md or log.md to
# get them. Built while CLAUDE.md is still in place; vault text goes only
# into the prompt and into files under the work dir, the log gets counts.
pending_now="$WORK_DIR/pending-after-scan.txt"
[ -f "$pending_now" ] || pending_now=$PENDING_FILE
[ "$MODE" = ingest ] || pending_now=/dev/null
context_part() { # <name> <builder> [args...]: writes $WORK_DIR/context-<name>.txt
  local name=$1
  shift
  if ! "$@" >"$WORK_DIR/context-$name.txt" 2>/dev/null; then
    log "context: $name not built"
    printf '(not available)\n' >"$WORK_DIR/context-$name.txt"
  fi
}
context_part tags tags_block "$VAULT_DIR/index.md"
context_part folders folders_block "$VAULT_DIR"
context_part corrections corrections_block "$VAULT_DIR/log.md"
context_part pending pending_block "$pending_now"
context_part backfill backfill_block "$VAULT_DIR/index.md"
context_count() { grep -cv '^(' "$WORK_DIR/context-$1.txt" || true; }
context_line="context: $(grep -c '^- #' "$WORK_DIR/context-tags.txt" || true) tags, $(context_count folders) folders, $(context_count corrections) correction pairs, $(context_count pending) pending"
[ "$MODE" != lint ] || context_line+=", $(context_count backfill) rows to complete"
log "$context_line"
# One pass (fill_placeholders): text a block inserts is never filled again.
PROMPT=$(printf '%s\n' "$PROMPT" | fill_placeholders "$WORK_DIR")
STEP='rulebook'
if ! take_rulebook_out; then
  fail "$STEP: could not move CLAUDE.md out"
fi
if ! build_system_prompt "${CONTEXT_MODES[@]}" >"$SYSTEM_FILE" 2>/dev/null; then
  fail "$STEP: system prompt not built"
fi
log "$STEP: $(wc -c <"$SYSTEM_FILE" | tr -d ' ') bytes for ${CONTEXT_MODES[*]}"
# R-SS-9, R-SS-10: index.md as the session starts, for the tag recount and
# the row check after it. Kept in the work dir, never logged.
rm -f "$INDEX_BEFORE"
[ ! -f "$VAULT_DIR/index.md" ] || cp "$VAULT_DIR/index.md" "$INDEX_BEFORE" ||
  fail "$STEP: index.md not kept"
# #978: the session starts with no filing sheet, so an old one is never
# carried out again.
rm -rf -- "${VAULT_DIR:?}/$SHEET_FILE" || fail "$STEP: old filing sheet not removed"
# Logged right before the agent starts: the next line is its stats, so the
# two timestamps bound the agent's own time (agent/bench/run-bench.sh).
STEP='agent run'
log "$STEP"
RUN_STARTED=1
# The prompt goes in on stdin (#967): `claude -p` with no prompt argument
# reads it there, so a large folder's context never meets Linux's 128 KB
# limit on one argument. Nothing else reads stdin. The file is in the work
# dir, outside the agent's folder.
printf '%s\n' "$PROMPT" >"$WORK_DIR/prompt.md"
set +e
(
  cd "$VAULT_DIR"
  timeout -k 30 "$AGENT_TIME_LIMIT" env -i "${claude_env[@]}" \
    claude -p --max-turns "$MAX_TURNS" --output-format stream-json --verbose \
      --model "$MODEL" --effort "$EFFORT" --append-system-prompt-file "$SYSTEM_FILE" \
      --allowedTools "$ALLOWED_TOOLS" --disallowedTools "$DISALLOWED_TOOLS" <"$WORK_DIR/prompt.md"
) >"$AGENT_STREAM" 2>"$AGENT_ERR"
agent_rc=$?
set -e
# R-SS-5: CLAUDE.md goes back before anything reads or copies the local copy.
if ! restore_rulebook; then
  fail "$STEP: CLAUDE.md not restored"
fi
# #978: the filing sheet leaves the local copy at once, so no copy up, the
# one after a failure included, ever takes it to Drive. Only a plain file
# is kept; anything else at its path is removed.
rm -f "$SHEET_TAKEN"
if [ -f "$VAULT_DIR/$SHEET_FILE" ] && [ ! -L "$VAULT_DIR/$SHEET_FILE" ]; then
  mv -- "$VAULT_DIR/$SHEET_FILE" "$SHEET_TAKEN" || fail "$STEP: filing sheet not taken"
fi
rm -rf -- "${VAULT_DIR:?}/$SHEET_FILE" || fail "$STEP: filing sheet not taken"
# The agent's closing lines (the report parsed below) are the final result
# event's text; with no result event (a crash, a timeout) AGENT_OUT is empty,
# as an empty text output was.
agent_result_text "$AGENT_STREAM" >"$AGENT_OUT" 2>>"$AGENT_ERR" || : >"$AGENT_OUT"
# The session's numbers (R-SS-2), logged for every session, failed or not.
# They are only numbers and tool names; a failure to read them is logged and
# never fails the run.
if agent_stats_line=$(agent_stats "$AGENT_STREAM" 2>>"$AGENT_ERR"); then
  log "agent stats: model=$MODEL effort=$EFFORT $agent_stats_line"
else
  log "agent stats: model=$MODEL effort=$EFFORT unreadable"
fi
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
check_folder "$STEP"
# R-RUNNER-4: saving, before the copy up.
report_phase saving
read_added
read_updated
read_meaning
# #978: the filing sheet is carried out in the local copy before the audit,
# so the move phase below finds each filed original by its content, moves
# it in Drive and writes its `Filed:` line, and the audit checks every file
# the sheet wrote. Its pending list is the one the agent was given.
if [ -f "$SHEET_TAKEN" ]; then
  sheet_pending="$WORK_DIR/pending-after-scan.txt"
  [ -f "$sheet_pending" ] || sheet_pending=$PENDING_FILE
  [ "$MODE" = ingest ] || sheet_pending=/dev/null
  if ! apply_filing_sheet "$VAULT_DIR" "$SHEET_TAKEN" "$sheet_pending" "$MANIFEST_BEFORE" \
    "$(date -u +%F)" "$CONVERTED_FILE" 2>>"$WORK_DIR/filing-sheet.err"; then
    # The message names vault paths: it stays in the work dir, which is
    # never uploaded, not in the logs.
    fail "$STEP: filing sheet failed"
  fi
  # Counts only, with the skipped lines per reason (#978 follow-up).
  # Notes booked without their original (#995) are not skipped lines.
  unlinked=''
  [ "$SHEET_UNLINKED_COUNT" -eq 0 ] ||
    unlinked="; $SHEET_UNLINKED_COUNT $([ "$SHEET_UNLINKED_COUNT" -eq 1 ] && echo 'note booked without its' || echo 'notes booked without their') original"
  log "filing sheet: $SHEET_FILED filed, $SHEET_NOTES notes booked, $SHEET_TAGS tags, $SHEET_SKIPPED lines skipped${SHEET_SKIP_REASONS:+ (skipped: $SHEET_SKIP_REASONS)}$unlinked"
  [ "$SHEET_SKIPPED" -eq 0 ] ||
    SHEET_WARNING="Warning: $SHEET_SKIPPED filing $([ "$SHEET_SKIPPED" -eq 1 ] && echo 'decision was' || echo 'decisions were') not usable and skipped; what they named stays where it was."
fi
if ! audit || ! record_saved_keys; then
  fail "$STEP: copy failed" drive_unavailable
fi
if ! find_moves; then
  fail "$STEP: move failed"
fi
# R-RUNNER-7: the documents' full text goes into their text copies now that
# the renames are known, then the names are audited.
if ! append_document_text || ! audit_note_names; then
  fail "$STEP: text copy failed"
fi
# R-SS-10: the index rows the session added or changed, checked against the
# v24 form (check_rows); a bad row is counted, never refused or rewritten,
# and the count is a warning in the summary. Before the bookkeeping phase,
# so a link the runner rewrites for a move is not counted as the agent's.
if [ "$TOO_MANY_CHANGES" -eq 0 ] && [ -f "$VAULT_DIR/index.md" ]; then
  rows_checked=$(check_rows "$INDEX_BEFORE" "$VAULT_DIR/index.md") || fail "$STEP: row check failed"
  bad_rows=${rows_checked% *}
  [ "${rows_checked#* }" -eq 0 ] || log "row check: $bad_rows of ${rows_checked#* } rows not in the expected form"
  [ "$bad_rows" -eq 0 ] ||
    ROWS_WARNING="Warning: $bad_rows index $([ "$bad_rows" -eq 1 ] && echo 'row is' || echo 'rows are') not in the expected form."
fi
# E-7 (#921): an unusable folder status list in a changed hub note is removed.
if ! check_hub_statuses; then
  fail "$STEP: status list check failed"
fi
if ! move_up; then
  fail "$STEP: move failed"
fi
# A failing tool's own message names vault paths: it goes to a private log.
if ! book_moves "$VAULT_DIR" "$BOOKED_OLD" "$BOOKED_NEW" "$(date -u '+%F %H:%M')" \
  2>>"$LOG_DIR/bookkeeping.err"; then
  fail "$STEP: bookkeeping failed"
fi
# R-RUNNER-9: the mechanical History lines, now that the moves are booked.
if ! write_history 2>>"$LOG_DIR/bookkeeping.err"; then
  fail "$STEP: bookkeeping failed"
fi
# R-SS-9, R-SS-13: the tag counts in index.md and a `Tag added:` line per
# new tag, after the moves are booked, so both files go up with the rest.
# None after a refused run: nothing of it is saved.
if [ "$TOO_MANY_CHANGES" -eq 0 ] &&
  ! book_tags "$VAULT_DIR" "$INDEX_BEFORE" "$(date -u '+%F %H:%M')" 2>>"$LOG_DIR/bookkeeping.err"; then
  fail "$STEP: bookkeeping failed"
fi
# Report v2 (#598): each processed item that moved carries where it went.
if [ "$MODE" = ingest ] && [ -n "$PROCESSED_JSON" ]; then
  PROCESSED_JSON=$(items_json "$MOVES_FILE")
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
  rclone deletefile "vault:$path" </dev/null >>"$RCLONE_LOG" 2>&1 || delete_rc=$?
  # 4 is rclone's "file not found": someone removed it from Drive during the
  # run, so it is already gone.
  if [ "$delete_rc" -ne 0 ] && [ "$delete_rc" -ne 4 ]; then
    fail "$STEP: delete failed" drive_unavailable
  fi
  # Gone from the inbox in Drive: not `left` (R-RUNNER-1).
  printf '%s\n' "$path" >>"$DELETED_FILE"
done 3<"$PENDING_FILE"
[ "$kept" -eq 0 ] || log "$kept originals kept in the inbox"

# --- report done ------------------------------------------------------------
STEP='report done'
log "$STEP"
if ! report_lists; then
  fail "$STEP: report lists not built"
fi
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
  SET_ASIDE_JSON=''
  ADDED=''
  DISAGREE_JSON=''
  NEXT_JSON=''
  write_outcome done 'Nothing was saved: the tidy-up changed too many files.'
else
  [ -z "$AUDIT_WARNING" ] || SUMMARY="${SUMMARY:+$SUMMARY$'
'}$AUDIT_WARNING"
  [ -z "$STATUSES_WARNING" ] || SUMMARY="${SUMMARY:+$SUMMARY$'
'}$STATUSES_WARNING"
  [ -z "$ROWS_WARNING" ] || SUMMARY="${SUMMARY:+$SUMMARY$'
'}$ROWS_WARNING"
  [ -z "$SHEET_WARNING" ] || SUMMARY="${SUMMARY:+$SUMMARY$'
'}$SHEET_WARNING"
  # A silent no-op (#967): the agent was given at least one file (not an
  # instruction or context note) after the pre-scan, left every one of them
  # where it was (not filed, not moved to Processed/; the quarantined ones
  # are not in the list), and said `Problems: none`. A warning with the
  # count, never a name.
  if [ "$MODE" = ingest ] && grep -qiE '^[[:space:]]*Problems:[[:space:]]*none\.?[[:space:]]*$' <<<"$SUMMARY"; then
    pending_now="$WORK_DIR/pending-after-scan.txt"
    [ -f "$pending_now" ] || pending_now=$PENDING_FILE
    given=0
    left=0
    while IFS= read -r path; do
      [ -n "$path" ] || continue
      [ "$(P="$path" awk -F '\t' '$1 == ENVIRON["P"] { print $2; exit }' "$KINDS_FILE")" = file ] || continue
      given=$((given + 1))
      [ ! -e "$VAULT_DIR/$path" ] || left=$((left + 1))
    done <"$pending_now"
    if [ "$given" -gt 0 ] && [ "$left" -eq "$given" ]; then
      log "silent run: $left files left where they were, no problem reported"
      SUMMARY="${SUMMARY:+$SUMMARY$'
'}Warning: $left $([ "$left" -eq 1 ] && echo 'file was' || echo 'files were') left where $([ "$left" -eq 1 ] && echo 'it was' || echo 'they were'), and no problem was reported."
    fi
  fi
  filed=$(count_lines "$WORK_DIR/pending-after-scan.txt")
  [ -f "$WORK_DIR/pending-after-scan.txt" ] || filed=$(count_lines "$PENDING_FILE")
  write_outcome done "Tidied up $filed $([ "$filed" -eq 1 ] && echo thing || echo things)."
fi
write_file_facts
write_paths
if ! report_final done; then
  REPORTED=1
  log "report done failed: API unreachable"
  exit 2
fi
REPORTED=1
log "done"
