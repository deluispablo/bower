#!/usr/bin/env bash
# Runs Playwright on the demo and then on the pretend Drive, with the same arguments.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm exec playwright test "$@"
E2E_SOURCE=fake pnpm exec playwright test "$@"
