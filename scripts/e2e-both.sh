#!/usr/bin/env bash
# The merge gate: Playwright on the pretend Drive (phone and desktop), then on the demo.
# usage: e2e-both.sh gate|full [playwright args]
#   gate: demo on desktop only (its data path does not depend on the viewport).
#   full: demo on phone and desktop too (before a backup or deployment).
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${1:?usage: e2e-both.sh gate|full [playwright args]}
shift
case "$mode" in gate) demo=(--project=desktop) ;; full) demo=() ;; *) echo "mode: gate or full" >&2; exit 2 ;; esac
# One heavy run at a time (testing/with-lock.sh); a call inside a held lock passes through.
lock=${HARNESS_LOCK:-/tmp/bower-heavy.lockf}
[ "${HARNESS_LOCK_HELD:-}" = "$lock" ] || exec bash testing/with-lock.sh bash "$0" "$mode" "$@"
# set -e stops at the first failing suite.
E2E_SOURCE=fake pnpm exec playwright test "$@"
pnpm exec playwright test ${demo[@]+"${demo[@]}"} "$@"
