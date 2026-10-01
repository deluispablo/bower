#!/usr/bin/env bash
# Benchmark for one tidy-up session (R-SS-1, spec 2026-10-01-session-speed).
#
#   bash agent/bench/run-bench.sh <label> [case number ...]
#
# Runs agent/run.sh once per case (all five by default, one at a time) over
# a copy of the synthetic vault in agent/bench/vault/ with that case's files
# in 0-Inbox/, on the local disk: no Drive, no GitHub, no real data. The real
# `claude` CLI on PATH runs the agent with your own Claude Code login. See
# README.md for what it needs and what the columns mean.
#
# Appends one TSV line per case to results/<YYYY-MM-DD>-<label>.tsv and keeps
# each case's resulting vault in results/<label>/<case>/ (with run.log, the
# runner's own log). results/ is git-ignored.
#
# What is stubbed, and how, without changing run.sh:
# - the Worker: callback-stub.py on 127.0.0.1 answers the vault info with
#   fixed fake values and every status report with 200;
# - Drive's metadata calls (the folder check, the instruction-origin listing):
#   a `curl` wrapper first on PATH sends Drive's URL to the same stub;
# - Drive itself: an `rclone` wrapper first on PATH drops the Drive remote
#   run.sh builds in RCLONE_CONFIG_VAULT_* and points `vault:` at the case's
#   folder on disk (an alias of a local path);
# - the model credential: run.sh needs CLAUDE_CODE_OAUTH_TOKEN or
#   ANTHROPIC_API_KEY. When neither is set, a placeholder token is set and a
#   `claude` wrapper removes it again, so the real CLI uses your login. The
#   wrapper also puts back the few Windows variables `env -i` drops.
# - jq: the real one when installed, otherwise agent/test/jq-stand-in.js.

set -euo pipefail

usage() {
  echo 'usage: run-bench.sh <label> [case number ...]' >&2
  exit 2
}
[ "$#" -ge 1 ] || usage
LABEL=$1
shift
case "$LABEL" in
  '' | *[!A-Za-z0-9._-]*) echo 'the label takes letters, digits, ".", "_" and "-" only' >&2; exit 2 ;;
esac

BENCH=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
AGENT=$(cd "$BENCH/.." && pwd)
REPO=$(cd "$AGENT/.." && pwd)
RESULTS="$BENCH/results"
TSV="$RESULTS/$(date +%F)-$LABEL.tsv"

# --- tools -------------------------------------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || { echo "run-bench: $1 is not on PATH" >&2; exit 2; }; }
need rclone
need curl
need claude
need timeout
PY=''
for p in python3 python; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import sys' >/dev/null 2>&1; then
    PY=$(command -v "$p")
    break
  fi
done
[ -n "$PY" ] || { echo 'run-bench: python 3 is not on PATH' >&2; exit 2; }
command -v pdftotext >/dev/null 2>&1 || echo 'run-bench: warning: no pdftotext, PDFs get no text copy' >&2
# A path as a native program sees it (Git Bash on Windows: C:/...).
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# --- cases -------------------------------------------------------------------
cases=()
if [ "$#" -eq 0 ]; then
  for d in "$BENCH"/cases/*/; do cases+=("$(basename "$d")"); done
else
  for n in "$@"; do
    match=("$BENCH"/cases/"$n"-*/)
    [ -d "${match[0]}" ] || { echo "run-bench: no case $n" >&2; exit 2; }
    cases+=("$(basename "${match[0]}")")
  done
fi

TMP=$(mktemp -d)
STUB_PID=''
cleanup() {
  [ -z "$STUB_PID" ] || kill "$STUB_PID" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

# --- wrappers, first on PATH ------------------------------------------------
BIN="$TMP/bin"
mkdir -p "$BIN"
REAL_CURL=$(command -v curl)
REAL_RCLONE=$(command -v rclone)
REAL_CLAUDE=$(command -v claude)

# curl: Drive's API goes to the stub (its port is read at each call).
cat >"$BIN/curl" <<EOF
#!/usr/bin/env bash
port=\$(cat '$TMP/port')
args=()
for a in "\$@"; do
  args+=("\${a/#https:\/\/www.googleapis.com\/drive\//http://127.0.0.1:\$port/drive/}")
done
exec '$REAL_CURL' "\${args[@]}"
EOF

# rclone: vault: is the case's folder on disk, never Drive.
cat >"$BIN/rclone" <<EOF
#!/usr/bin/env bash
for v in \$(env | sed -n 's/^\(RCLONE_CONFIG_VAULT_[A-Z_]*\)=.*/\1/p'); do unset "\$v"; done
export RCLONE_CONFIG='$(native "$TMP/rclone.conf")'
exec '$REAL_RCLONE' "\$@"
EOF

# claude: the real CLI with your own login.
CREDENTIAL_PLACEHOLDER=''
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  CREDENTIAL_PLACEHOLDER='bench-use-own-login'
fi
{
  echo '#!/usr/bin/env bash'
  echo "[ \"\${CLAUDE_CODE_OAUTH_TOKEN:-}\" != '$CREDENTIAL_PLACEHOLDER' ] || unset CLAUDE_CODE_OAUTH_TOKEN"
  # Windows programs need these, and env -i drops them; elsewhere they are unset.
  for v in USERPROFILE APPDATA LOCALAPPDATA SYSTEMROOT SystemRoot WINDIR TEMP TMP HOMEDRIVE HOMEPATH PATHEXT COMSPEC; do
    [ -z "${!v:-}" ] || printf 'export %s=%q\n' "$v" "${!v}"
  done
  printf 'exec %q "$@"\n' "$REAL_CLAUDE"
} >"$BIN/claude"

if ! command -v jq >/dev/null 2>&1; then
  cp "$AGENT/test/jq-stand-in.js" "$BIN/jq.js"
  cat >"$BIN/jq" <<EOF
#!/usr/bin/env bash
exec node -e "\$(cat '$BIN/jq.js')" -- "\$@"
EOF
fi
chmod +x "$BIN"/*

# --- one case ----------------------------------------------------------------
epoch() { date -u -d "$1" +%s; }

# Lines "<crc> <size> ./<path>" for every file under $1 but .bower/ and .claude/.
fingerprint() {
  (cd "$1" && find . -type f ! -path './.bower/*' ! -path './.claude/*' -exec cksum {} + | LC_ALL=C sort)
}

run_case() {
  local name=$1 dir="$TMP/$1"
  local remote="$dir/remote" temp="$dir/runner-temp" log="$dir/run.log"
  mkdir -p "$remote" "$temp"
  cp -R "$BENCH/vault/." "$remote/"
  cp "$REPO/vault-template/CLAUDE.md" "$remote/CLAUDE.md"
  cp -R "$BENCH/cases/$name/." "$remote/0-Inbox/"
  fingerprint "$remote" >"$dir/before.txt"
  printf '[vault]\ntype = alias\nremote = %s\n' "$(native "$remote")" >"$TMP/rclone.conf"

  rm -f "$TMP/port"
  "$PY" "$BENCH/callback-stub.py" "$(native "$remote/0-Inbox")" "$(native "$TMP/port")" &
  STUB_PID=$!
  for _ in $(seq 1 50); do [ -s "$TMP/port" ] && break; sleep 0.1; done
  [ -s "$TMP/port" ] || { echo "run-bench: the callback stub did not start" >&2; exit 1; }

  # As the instance workflow does: the settings in $RUNNER_TEMP/bower-secrets.
  printf '%s\n' "BOWER_API_URL=http://127.0.0.1:$(cat "$TMP/port")" \
    'BOWER_RUN_TICKET=bench-ticket' 'BOWER_REPORT_BACKOFF=0' >"$temp/bower-secrets"

  echo "case $name: running"
  local rc=0
  env PATH="$BIN:$PATH" RUNNER_TEMP="$temp" \
    ${CREDENTIAL_PLACEHOLDER:+CLAUDE_CODE_OAUTH_TOKEN=$CREDENTIAL_PLACEHOLDER} \
    bash "$AGENT/run.sh" bench-vault ingest >"$log" 2>&1 || rc=$?
  kill "$STUB_PID" 2>/dev/null || true
  wait "$STUB_PID" 2>/dev/null || true
  STUB_PID=''

  # The agent step's wall time: from "agent run" to the next step's line.
  local start end seconds='-'
  start=$(sed -n 's/^\([^ ]*\) agent run$/\1/p' "$log" | head -n 1)
  end=$(awk -v s="$start" 'f { print $1; exit } $1 == s && / agent run$/ { f = 1 }' "$log")
  if [ -n "$start" ] && [ -n "$end" ]; then
    seconds=$(($(epoch "$end") - $(epoch "$start")))
  fi
  local stats
  stats=$(sed -n 's/^[^ ]* agent stats: //p' "$log" | tail -n 1)
  field_of() { local v; v=$(tr ' ' '\n' <<<"$stats" | sed -n "s/^$1=//p"); printf '%s' "${v:--}"; }

  fingerprint "$remote" >"$dir/after.txt"
  local changed
  changed=$(LC_ALL=C comm -3 "$dir/before.txt" "$dir/after.txt" |
    sed 's/^\t//; s/^[0-9]* [0-9]* //' | LC_ALL=C sort -u | grep -c . || true)

  local keep="$RESULTS/$LABEL/$name"
  rm -rf "$keep"
  mkdir -p "$keep"
  cp -R "$remote/." "$keep/"
  cp "$log" "$RESULTS/$LABEL/$name.log"
  [ -s "$TSV" ] || printf 'case\tagent_seconds\tturns\tapi_ms\tin\tout\tcache_read\tcache_write\ttools\tfiles_changed\n' >"$TSV"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$name" "$seconds" "$(field_of turns)" "$(field_of api_ms)" \
    "$(field_of in)" "$(field_of out)" "$(field_of cache_read)" "$(field_of cache_write)" "$(field_of tools)" "$changed" >>"$TSV"
  echo "case $name: run.sh exit $rc, agent ${seconds} s, $changed files changed"
}

mkdir -p "$RESULTS"
for c in "${cases[@]}"; do
  run_case "$c"
done
echo "results: $TSV"
