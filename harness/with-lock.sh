#!/usr/bin/env bash
# The one lock for heavy runs (pnpm check, e2e suites): done.sh and integrate.sh both call this.
# mkdir is atomic and macOS has no flock. A second caller waits and says who holds the lock
# (pid, command, start time); a lock whose holder is gone is taken over, with a line saying so.
# usage: bash harness/with-lock.sh <command> [args...]      HARNESS_LOCK overrides the lock directory.
set -uo pipefail
[ $# -eq 0 ] && { echo "usage: with-lock.sh <command> [args...]"; exit 2; }
lock=${HARNESS_LOCK:-/tmp/bower-heavy.lock}
told=""; ownerless=0
until mkdir "$lock" 2>/dev/null; do
  if [ -f "$lock/holder" ]; then
    ownerless=0
    { read -r pid; read -r started; read -r cmd; } < "$lock/holder"
    if ! kill -0 "$pid" 2>/dev/null; then
      # Whoever moves the stale lock aside first takes it over; the others try again.
      if mv "$lock" "$lock.stale.$$" 2>/dev/null; then
        echo "Stale lock: its holder (pid $pid, $cmd) is gone, taking it over."
        rm -rf "$lock.stale.$$"
      fi
      continue
    fi
    if [ "$told" != "$pid" ]; then
      echo "Waiting: another heavy run holds the lock (pid $pid, $cmd, started $started)"
      told=$pid
    fi
  else
    # Just created and not yet written, or its holder died in between.
    ownerless=$((ownerless + 1))
    if [ "$ownerless" -gt 25 ] && mv "$lock" "$lock.stale.$$" 2>/dev/null; then
      echo "Stale lock: it never named a holder, taking it over."
      rm -rf "$lock.stale.$$"; ownerless=0
    fi
  fi
  sleep 0.2
done
printf '%s\n%s\n%s\n' "$$" "$(date '+%F %T')" "$*" > "$lock/holder"
trap 'rm -rf "$lock"' EXIT
trap 'exit 130' INT TERM HUP
"$@"
