#!/usr/bin/env bash
# Deploys one clean local `main` SHA to the staging Worker, app and Worker on
# one origin (TL-P3-06, TL-P3-24). docs/runbook.md ("Deploys") is the procedure;
# this script is that procedure with its guards.
#
#   scripts/deploy-staging.sh <sha> <staging origin>
#
# 1. Refuses unless the tree is clean (and holds no env file Vite would read,
#    ignored or not; https://vite.dev/guide/env-and-mode), HEAD is <sha> and <sha> is local main's tip.
# 2. Refuses unless api/wrangler.jsonc names bower-staging, keeps the
#    single-page fallback and uses the staging KV namespace. It always refuses
#    bower-api, the original app's production Worker (TL-P3-08).
# 3. pnpm install --frozen-lockfile, then env -u VITE_API_URL pnpm build.
# 4. Scans dist/: no address but you@example.com, nothing shaped like a secret.
# 5. From api/: npx wrangler deploy --var APP_ORIGIN, API_ORIGIN, APP_VERSION
#    (the short SHA) and GITHUB_REPO (BOWER_GITHUB_REPO, default
#    deluispablo/bower-home). Wrangler's upload line must name bower-staging.
# 6. /health must name the short SHA; a check that disagrees is rerun once.
# 7. Version skew (TL-P3-20): waits until /status without a cookie answers 401
#    JSON, at most 15 checks, 5 minutes in the worst case.
# 8. Builds and scans the runner bundle and says where it is for
#    scripts/new-instance.sh, which it does not run.
#
# Every refusal is one sentence on stderr and a non-zero exit. It never asks
# for, reads, prints or sets a secret: those are set once with
# `wrangler secret put`, by hand (TL-P3-06). Only the technical lead runs it.
#
# Plain bash on purpose, so it runs under macOS's stock bash 3.2. The parts it shares with scripts/cutover.sh and
# scripts/rollback.sh are in scripts/deploy-lib.sh.

set -euo pipefail

# shellcheck source=deploy-lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/deploy-lib.sh"
CONFIG="api/wrangler.jsonc"
PRODUCTION_KV='dedd167004be415cbd90c4b154b1f4e2'

usage() {
  printf 'usage: deploy-staging.sh <sha> <staging origin>\n' >&2
  exit 2
}

read_args() {
  [ "$#" -eq 2 ] || usage
  case "$1$2" in -*) usage ;; esac
  case "$2" in -*) usage ;; esac
  SHA=$1
  ORIGIN=${2%/}
  check_sha
  check_origin
  check_repo
}

# 2. The Worker config targets staging only (TL-P3-08; the sensor in src/docs.test.ts).
check_config() {
  local first_name stripped
  [ -f "$CONFIG" ] || die "Refusing: $CONFIG is missing."
  [ ! -e api/wrangler.json ] && [ ! -e api/wrangler.toml ] \
    || die "Refusing: api/ holds another wrangler config, which wrangler could read instead of $CONFIG."
  # Strip comments before checking config content (matching api/test/routing.test.ts).
  stripped=$(sed -E 's|//.*$||' "$CONFIG" | tr '\n' ' ')
  if printf '%s' "$stripped" | grep -q "$PRODUCTION_NAME"; then
    die "Refusing: $CONFIG names $PRODUCTION_NAME, the original app's production Worker."
  fi
  first_name=$(printf '%s' "$stripped" | grep -Eo '"name":[[:space:]]*"[^"]*"' | head -n 1 | sed -E 's/.*"([^"]*)"$/\1/')
  [ "$first_name" = "$STAGING_NAME" ] || die "Refusing: $CONFIG must name the Worker $STAGING_NAME."
  printf '%s' "$stripped" | grep -Eq '"not_found_handling":[[:space:]]*"single-page-application"' \
    || die "Refusing: $CONFIG must keep the single-page fallback."
  if printf '%s' "$stripped" | grep -q "$PRODUCTION_KV"; then
    die "Refusing: $CONFIG uses the production KV namespace."
  fi
  printf '%s' "$stripped" | grep -Eq "\"binding\":[[:space:]]*\"BOWER_KV\",[[:space:]]*\"id\":[[:space:]]*\"$STAGING_KV\"" \
    || die "Refusing: $CONFIG must bind BOWER_KV to the staging KV namespace."
}

# 5. The deploy, from api/. Wrangler's output must name the staging Worker.
deploy() {
  local out
  say "Deploying $SHORT to $STAGING_NAME..."
  out=$(cd api && npx wrangler deploy --var "APP_ORIGIN:$ORIGIN" --var "API_ORIGIN:$ORIGIN" --var "APP_VERSION:$SHORT" --var "GITHUB_REPO:$REPO" </dev/null 2>&1) || {
    say "$out"
    die "wrangler deploy failed."
  }
  say "$out"
  check_upload_line "$out" "$STAGING_NAME" "$PRODUCTION_NAME" production
}

# 8. The runner bundle for scripts/new-instance.sh, built and scanned; never sent anywhere here.
build_runner() {
  local bundle="$ROOT/runner/dist/runner.mjs"
  pnpm -C runner build </dev/null || die "The runner build failed."
  [ -s "$bundle" ] || die "The runner did not build: runner/dist/runner.mjs is missing."
  scan 'the runner bundle' "$bundle"
  say "Deployed $SHORT to $ORIGIN."
  say "Runner bundle, scanned: $bundle"
  say "When runner/ changed, run from this checkout: scripts/new-instance.sh $REPO $ORIGIN"
}

deploy_staging_main() {
  read_args "$@"
  cd "$ROOT"
  check_tools git pnpm npx curl
  check_checkout
  check_config
  build_app
  scan 'dist/' dist
  deploy
  check_health
  wait_for_status
  build_runner
}

deploy_staging_main "$@"
