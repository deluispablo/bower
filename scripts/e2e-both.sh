#!/usr/bin/env bash
# Runs Playwright on the demo and then on the pretend Drive, with the same arguments.
set -euo pipefail
cd "$(dirname "$0")/.."
# One heavy run at a time (harness/with-lock.sh); a call inside a held lock passes through.
lock=${HARNESS_LOCK:-/tmp/bower-heavy.lock}
[ "${HARNESS_LOCK_HELD:-}" = "$lock" ] || exec bash harness/with-lock.sh bash "$0" "$@"
pnpm exec playwright test "$@"
E2E_SOURCE=fake pnpm exec playwright test "$@"
