#!/usr/bin/env bash
# The four batch suites on the main checkout (claude/p3); logs to /tmp/suites-*.
set -uo pipefail
# Clear browsers left by an interrupted gate before starting another.
pkill -f ms-playwright || true
pkill -f "headless.*[Cc]hrome|[Cc]hrome.*headless" || true
repo="$(cd "$(dirname "$0")/../.." && pwd)" # the main checkout this script lives in
echo "sha $(git -C "$repo" rev-parse --short HEAD)"
pnpm -C "$repo" check > /tmp/suites-check.log 2>&1; echo "check=$?"
pnpm -C "$repo" e2e --reporter=line > /tmp/suites-e2e.log 2>&1; echo "e2e=$?"
pnpm -C "$repo" e2e:fake --reporter=line > /tmp/suites-e2e-fake.log 2>&1; echo "e2e-fake=$?"
pnpm -C "$repo" e2e:pwa --reporter=line > /tmp/suites-e2e-pwa.log 2>&1; echo "e2e-pwa=$?"
tail -3 /tmp/suites-e2e.log /tmp/suites-e2e-fake.log /tmp/suites-e2e-pwa.log
grep -E 'FAIL|harness ok|Tests ' /tmp/suites-check.log | head -8
git -C "$repo" status --porcelain
