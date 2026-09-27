#!/usr/bin/env bash
# Builds and deploys the public demo: the same app, built with VITE_DEMO=1
# (a scripted, in-memory fixture vault, no backend calls), to its own
# Cloudflare Pages project.
#
#   scripts/deploy-demo.sh [--project NAME]
#
# In order:
#
# 1. Prerequisites: node 22+, pnpm, wrangler; `wrangler whoami` (Cloudflare)
#    must be logged in.
# 2. Builds the app with `pnpm -C app build:demo`. `VITE_ABOUT_URL`, if set
#    in the environment, is passed through so "Run your own Bower" (#193)
#    can link to the "what is Bower" site page; no other build-time value
#    is needed (the demo makes no network calls, and never uses the
#    Google Picker key).
# 3. Finds or creates the Pages project (`bower-demo` unless --project or
#    PAGES_PROJECT says otherwise, same as scripts/deploy.sh does for
#    `bower-app`) and deploys app/dist to it.
#
# Never touches the Worker, KV or any secret: the demo has no backend of
# its own.
#
# Idempotent: a rerun just rebuilds and redeploys.
#
# Plain POSIX-ish bash on purpose (no associative arrays), so it also runs
# under macOS's stock bash 3.2.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)

PAGES_PROJECT=${PAGES_PROJECT:-bower-demo}

log() { printf '%s\n' "$*"; }

die() {
  log "$*"
  exit 1
}

usage() {
  printf 'usage: deploy-demo.sh [--project NAME]\n' >&2
  exit 2
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required. $2"
}

check_login() {
  local output rc=0
  output=$(wrangler whoami 2>&1 </dev/null) || rc=$?
  if [ "$rc" -ne 0 ] || printf '%s' "$output" | grep -qi 'not authenticated\|not logged in'; then
    log "Not logged in to Cloudflare."
    log ""
    log "$output"
    log ""
    log "Run: wrangler login"
    exit 1
  fi
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --project)
        [ $# -ge 2 ] || usage
        PAGES_PROJECT=$2
        shift 2
        ;;
      *) usage ;;
    esac
  done
  printf '%s' "$PAGES_PROJECT" | grep -qE '^[a-z0-9][a-z0-9-]*$' ||
    die "PAGES_PROJECT must be lower-case letters, digits and dashes: $PAGES_PROJECT"
}

check_prerequisites() {
  require_tool node 'Install Node 22 or later: https://nodejs.org'
  require_tool pnpm 'Run: corepack enable (or npm install -g pnpm@9).'
  if [ -d "$ROOT/api/node_modules/.bin" ]; then
    PATH="$ROOT/api/node_modules/.bin:$PATH"
  fi
  require_tool wrangler 'It comes with pnpm install (api/node_modules/.bin); check that it finished without errors.'
  check_login
}

build_demo() {
  log "Building the demo (pnpm -C app build:demo)..."
  if [ -n "${VITE_ABOUT_URL:-}" ]; then
    (cd "$ROOT" && VITE_ABOUT_URL="$VITE_ABOUT_URL" pnpm -C app build:demo </dev/null)
  else
    (cd "$ROOT" && pnpm -C app build:demo </dev/null)
  fi
  [ -f "$ROOT/app/dist/index.html" ] || die "The demo build did not produce app/dist/index.html."
}

deploy_pages() {
  local list
  # Pages commands run from the repo root without -c: Pages does not take
  # a custom config path, and there is no wrangler config at the root
  # (same as scripts/deploy.sh's deploy_app).
  list=$(cd "$ROOT" && wrangler pages project list </dev/null) ||
    die "Could not list your Pages projects (see wrangler's message above)."
  if printf '%s\n' "$list" | grep -qE "(^|[^A-Za-z0-9-])$PAGES_PROJECT([^A-Za-z0-9-]|\$)"; then
    log "Pages project $PAGES_PROJECT already exists."
  else
    log "Creating the Pages project $PAGES_PROJECT..."
    (cd "$ROOT" && wrangler pages project create "$PAGES_PROJECT" --production-branch main --force </dev/null)
  fi
  log "Deploying the demo to Pages..."
  (cd "$ROOT" && wrangler pages deploy app/dist --project-name "$PAGES_PROJECT" --branch main --commit-dirty=true </dev/null)
}

deploy_demo_main() {
  parse_args "$@"
  check_prerequisites
  build_demo
  deploy_pages
  log ""
  log "Deployed."
  log "  Demo: https://$PAGES_PROJECT.pages.dev"
  log "  Holds no data: a scripted, in-memory fixture vault, reset on every visit."
}

deploy_demo_main "$@"
