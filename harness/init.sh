#!/usr/bin/env bash
# Installs, runs every gate and says where phase work stands.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm check
tail -n 5 harness/progress.md
node scripts/harness-status.mjs
