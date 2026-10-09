#!/usr/bin/env bash
# The one lock for heavy runs (pnpm check, e2e suites): done.sh and integrate.sh both call this.
# macOS lockf holds the kernel lock; -k keeps its inode for every caller, even after a holder dies.
# The holder file is advisory only: it never decides whether a caller may run.
# usage: bash harness/with-lock.sh <command> [args...]      HARNESS_LOCK overrides the lock file.
set -uo pipefail
[ $# -eq 0 ] && { echo "usage: with-lock.sh <command> [args...]"; exit 2; }
lock=${HARNESS_LOCK:-/tmp/bower-heavy.lock}
# Only a child of the holder inherits this lock's path and passes through.
[ "${HARNESS_LOCK_HELD:-}" = "$lock" ] && exec "$@"

# Keep command output on the original stdout. The separate status channel distinguishes a command's
# exit 75 from lockf's EX_TEMPFAIL, so a failed command is never run a second time.
exec 4>&1
holding='
  lock=$1; shift
  export HARNESS_LOCK_HELD="$lock"
  printf "%s\n%s\n%s\n" "$$" "$(date "+%F %T")" "$*" > "$lock.holder" || exit 74
  "$@" 3>&- 4>&-
  result=$?
  printf "%s\n" "$result" >&3
'
result=$(/usr/bin/lockf -k -t 0 "$lock" bash -c "$holding" holder "$lock" "$@" 3>&1 1>&4)
acquired=$?
if [ "$acquired" -eq 75 ]; then
  pid=unknown; started=unknown; cmd=unknown
  # Missing, empty or partially written metadata cannot affect the kernel lock.
  if [ -f "$lock.holder" ]; then
    { read -r pid; read -r started; read -r cmd; } < "$lock.holder"
  fi
  echo "Waiting: another heavy run holds the lock (pid $pid, $cmd, started $started)"
  result=$(/usr/bin/lockf -k "$lock" bash -c "$holding" holder "$lock" "$@" 3>&1 1>&4)
  acquired=$?
fi
[ "$acquired" -ne 0 ] && exit "$acquired"
exit "$result"
