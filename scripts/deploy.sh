#!/usr/bin/env bash
# Takes an operator from a clone of this repo to a running Bower instance,
# asking only for what it cannot work out itself.
#
#   scripts/deploy.sh [--rotate]
#
# In order:
#
# 1. Prerequisites: node 22+, pnpm, git, openssl, gh; `pnpm install`;
#    `wrangler whoami` (Cloudflare) and `gh auth status` (GitHub) must both
#    be logged in.
# 2. Reads api/wrangler.local.toml, or creates it from api/wrangler.toml by
#    asking for your API and app domains, instance repo and contact email.
#    It is git-ignored, so your real domains never reach this repo.
# 3. Creates or updates the private instance repo (scripts/new-instance.sh):
#    workflows, agent files, the Claude credential, BOWER_API_URL.
# 4. Finds or creates the BOWER_KV namespace and deploys the Worker on its
#    custom domain (scripts/deploy-api.sh).
# 5. Sets the Worker's secrets: generates what can be generated, asks for
#    the Google client id and secret and the GitHub token. BOWER_API_KEY
#    goes to the Worker and the instance repo at once; ADMIN_KEY is saved
#    to api/.prod.secrets (git-ignored, mode 600).
# 6. Builds the app with VITE_API_URL set to the Worker's origin, optionally
#    VITE_GOOGLE_API_KEY for the onboarding folder picker, and deploys it to
#    Cloudflare Pages, creating the project the first time.
# 7. Prints what is left to do by hand: the Pages custom domain, the Google
#    redirect URI, and the privacy and terms of service URLs.
#
# Idempotent: a rerun updates what exists (repo, KV, Worker, Pages) and
# skips secrets that are already set. --rotate sets every secret again,
# which signs everyone out and resets push notifications (docs/runbook.md).
#
# The Pages project is called `bower-app` unless PAGES_PROJECT says
# otherwise. No secret value is ever printed.
#
# Plain POSIX-ish bash on purpose (no associative arrays), so it also runs
# under macOS's stock bash 3.2.

set -euo pipefail

DEPLOY_HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# Worker, KV and secrets steps, plus shared helpers (log, die, toml_get).
# shellcheck source=deploy-api.sh
. "$DEPLOY_HERE/deploy-api.sh"

PAGES_PROJECT=${PAGES_PROJECT:-bower-app}

usage() {
  printf 'usage: deploy.sh [--rotate]\n' >&2
  exit 2
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required. $2"
}

check_prerequisites() {
  local node_major
  require_tool node 'Install Node 22 or later: https://nodejs.org'
  node_major=$(node -p 'process.versions.node.split(".")[0]')
  [ "$node_major" -ge 22 ] || die "Node 22 or later is required (found $(node --version))."
  require_tool pnpm 'Run: corepack enable (or npm install -g pnpm@9).'
  require_tool git 'Install git: https://git-scm.com'
  require_tool openssl 'Install OpenSSL (it ships with git on Windows and with macOS).'
  require_tool gh 'Install the GitHub CLI: https://cli.github.com'

  log "Installing dependencies (pnpm install)..."
  (cd "$ROOT" && pnpm install --frozen-lockfile </dev/null)
  if [ -d "$API_DIR/node_modules/.bin" ]; then
    PATH="$API_DIR/node_modules/.bin:$PATH"
  fi
  require_tool wrangler 'It comes with pnpm install; check that it finished without errors.'

  check_login
  gh auth status >/dev/null 2>&1 </dev/null || die "Not logged in to GitHub. Run: gh auth login"
  log "Prerequisites OK."
}

deploy_app() {
  local api_origin list google_api_key
  api_origin=$(toml_get API_ORIGIN)
  printf '%s' "$PAGES_PROJECT" | grep -qE '^[a-z0-9][a-z0-9-]*$' ||
    die "PAGES_PROJECT must be lower-case letters, digits and dashes: $PAGES_PROJECT"

  log ""
  log "Optional: the Google Picker lets users choose their folder visually"
  log "on onboarding (docs/runbook.md, \"Google OAuth client\"). Leave blank to skip."
  printf 'Google Picker API key (optional): ' >&2
  IFS= read -r google_api_key || true
  google_api_key=$(printf '%s' "$google_api_key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

  log ""
  log "Building the app for $api_origin..."
  if [ -n "$google_api_key" ]; then
    (cd "$ROOT" && VITE_API_URL="$api_origin" VITE_GOOGLE_API_KEY="$google_api_key" pnpm -C app exec vite build </dev/null)
  else
    (cd "$ROOT" && VITE_API_URL="$api_origin" pnpm -C app exec vite build </dev/null)
  fi
  [ -f "$ROOT/app/dist/index.html" ] || die "The app build did not produce app/dist/index.html."

  # Pages commands run from the repo root without -c: Pages does not take a
  # custom config path, and there is no wrangler config at the root.
  list=$(cd "$ROOT" && wrangler pages project list </dev/null) ||
    die "Could not list your Pages projects (see wrangler's message above)."
  if printf '%s\n' "$list" | grep -qE "(^|[^A-Za-z0-9-])$PAGES_PROJECT([^A-Za-z0-9-]|\$)"; then
    log "Pages project $PAGES_PROJECT already exists."
  else
    log "Creating the Pages project $PAGES_PROJECT..."
    # --force keeps wrangler on classic Pages instead of a Workers-based
    # flow that fails on some machines; only this first call needs it.
    (cd "$ROOT" && wrangler pages project create "$PAGES_PROJECT" --production-branch main --force </dev/null)
  fi
  log "Deploying the app to Pages..."
  (cd "$ROOT" && wrangler pages deploy app/dist --project-name "$PAGES_PROJECT" --branch main --commit-dirty=true </dev/null)
}

print_next_steps() {
  local api_origin app_origin app_host
  api_origin=$(toml_get API_ORIGIN)
  app_origin=$(toml_get APP_ORIGIN)
  app_host=${app_origin#https://}
  log ""
  log "Deployed."
  log "  API: $api_origin (check: $api_origin/health)"
  log "  App: $app_origin"
  log ""
  log "Left to do by hand (once):"
  log "  1. App domain. Wrangler cannot set it: in dash.cloudflare.com go to Workers & Pages -> $PAGES_PROJECT"
  log "     -> Custom domains -> Set up a custom domain, and add $app_host."
  log "  2. Google OAuth client. Authorized redirect URI: $api_origin/auth/callback"
  log "     Privacy policy URL on the OAuth consent screen: $app_origin/privacy"
  log "     Terms of service URL on the OAuth consent screen: $app_origin/terms"
  if [ -f "$PROD_SECRETS" ]; then
    log "  3. Invite the first user (docs/runbook.md, \"Invite someone\"). The admin key is in api/.prod.secrets."
  else
    log "  3. Invite the first user (docs/runbook.md, \"Invite someone\")."
  fi
}

deploy_main() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --rotate) ROTATE=yes ;;
      *) usage ;;
    esac
  done

  check_prerequisites
  ensure_local_config
  check_vars

  log ""
  if [ "$ROTATE" = yes ]; then
    bash "$DEPLOY_HERE/new-instance.sh" --rotate
  else
    bash "$DEPLOY_HERE/new-instance.sh"
  fi

  log ""
  ensure_kv_namespace
  worker_deploy
  setup_secrets
  deploy_app
  print_next_steps
}

deploy_main "$@"
