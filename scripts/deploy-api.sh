#!/usr/bin/env bash
# Deploys the Bower API Worker.
#
#   scripts/deploy-api.sh [deploy|secrets]
#
# or via pnpm, equivalent, from anywhere in the repo:
#
#   pnpm -C api deploy
#   pnpm -C api secrets
#
# `deploy` (the default): checks that you are logged in to Cloudflare,
# creates the BOWER_KV namespace the first time (wrangler.toml still has
# the placeholder id) and writes its real id back into wrangler.toml,
# refuses if [vars] still holds placeholder values, then runs
# `wrangler deploy` and prints the Worker's URL.
#
# `secrets`: walks through every `wrangler secret put` the Worker needs
# (see api/src/env.ts), with a one-line explanation for each. Offers to
# generate SESSION_SECRET, TOKEN_ENC_KEY, BOWER_API_KEY and ADMIN_KEY with
# `openssl rand -base64 32` when you press Enter without typing a value;
# otherwise wrangler prompts for the value itself, as usual. Never prints
# a secret value.
#
# Requires `wrangler` on PATH. `pnpm -C api deploy`/`secrets` already put
# api/node_modules/.bin there (same as `pnpm -C api dev`); running the
# script directly needs a global wrangler install. `secrets` also needs
# `openssl`.
#
# Plain POSIX-ish bash on purpose (no associative arrays), so it also runs
# under macOS's stock bash 3.2.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
API_DIR="$ROOT/api"
WRANGLER_TOML="$API_DIR/wrangler.toml"

readonly PLACEHOLDER_KV_ID='KV_NAMESPACE_ID'
readonly VARS_TO_CHECK='APP_ORIGIN API_ORIGIN GITHUB_REPO VAPID_SUBJECT'
readonly SECRETS='GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SESSION_SECRET TOKEN_ENC_KEY BOWER_API_KEY GITHUB_TOKEN ADMIN_KEY VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY'

log() { printf '%s\n' "$*"; }

usage() {
  printf 'usage: deploy-api.sh [deploy|secrets]\n' >&2
  exit 2
}

# --- deploy ------------------------------------------------------------

check_login() {
  local output rc=0
  output=$(wrangler whoami 2>&1) || rc=$?
  if [ "$rc" -ne 0 ] || printf '%s' "$output" | grep -qi 'not authenticated\|not logged in'; then
    log "Not logged in to Cloudflare."
    log ""
    log "$output"
    log ""
    log "Run: wrangler login"
    exit 1
  fi
}

ensure_kv_namespace() {
  local current_id
  current_id=$(grep -m1 '^id = "' "$WRANGLER_TOML" | sed -E 's/^id = "(.*)"$/\1/')
  if [ "$current_id" != "$PLACEHOLDER_KV_ID" ]; then
    log "KV namespace already configured (id $current_id)."
    return
  fi
  log "Creating the BOWER_KV namespace..."
  local create_output new_id tmp
  create_output=$(wrangler kv namespace create BOWER_KV)
  echo "$create_output"
  new_id=$(printf '%s\n' "$create_output" | grep -m1 -oE 'id = "[^"]+"' | sed -E 's/id = "([^"]+)"/\1/')
  if [ -z "$new_id" ]; then
    log "Could not find the new namespace's id in wrangler's output above."
    exit 1
  fi
  tmp=$(mktemp)
  sed -E "s/^id = \"$PLACEHOLDER_KV_ID\"\$/id = \"$new_id\"/" "$WRANGLER_TOML" >"$tmp"
  mv "$tmp" "$WRANGLER_TOML"
  log "wrangler.toml updated: BOWER_KV id is now $new_id."
}

check_vars() {
  local bad='' key value
  for key in $VARS_TO_CHECK; do
    value=$(grep -m1 "^$key = \"" "$WRANGLER_TOML" | sed -E "s/^$key = \"(.*)\"\$/\1/")
    case "$value" in
      *example.com* | *OWNER*) bad="$bad $key" ;;
    esac
  done
  if [ -n "$bad" ]; then
    log "wrangler.toml still has placeholder values in [vars]:$bad"
    log "Edit api/wrangler.toml with your real values, then run this again."
    exit 1
  fi
}

cmd_deploy() {
  check_login
  ensure_kv_namespace
  check_vars
  log "Deploying..."
  local deploy_output url
  deploy_output=$(wrangler deploy)
  echo "$deploy_output"
  url=$(printf '%s\n' "$deploy_output" | grep -m1 -oE 'https://[A-Za-z0-9.-]+\.workers\.dev[^[:space:]]*')
  log ""
  if [ -n "$url" ]; then
    log "Worker URL: $url"
  else
    log "Deployed, but the Worker URL was not found in wrangler's output above."
  fi
  log "Remember: the app needs this Worker on a custom domain sharing a registrable domain with the app, not the *.workers.dev address above (see docs/security.md)."
}

# --- secrets -------------------------------------------------------------

secret_explanation() {
  case "$1" in
    GOOGLE_CLIENT_ID) echo 'Google Cloud Console -> APIs & Services -> Credentials, the OAuth client (Web application).' ;;
    GOOGLE_CLIENT_SECRET) echo 'The secret of that same OAuth client.' ;;
    SESSION_SECRET) echo 'Signs the session cookie.' ;;
    TOKEN_ENC_KEY) echo 'Encrypts stored Google refresh tokens; must decode to exactly 32 bytes.' ;;
    BOWER_API_KEY) echo 'Shared bearer key between the Worker and the runner; set the same value in the instance repo.' ;;
    GITHUB_TOKEN) echo 'GitHub fine-grained token, contents: write on the instance repo only.' ;;
    ADMIN_KEY) echo 'Bearer key for the admin endpoints (invite/remove someone).' ;;
    VAPID_PUBLIC_KEY) echo 'Web push key pair: run "pnpm -C api gen-vapid" first, then paste the printed value here.' ;;
    VAPID_PRIVATE_KEY) echo 'The private half of that same gen-vapid run.' ;;
  esac
}

secret_is_generatable() {
  case "$1" in
    SESSION_SECRET | TOKEN_ENC_KEY | BOWER_API_KEY | ADMIN_KEY) return 0 ;;
    *) return 1 ;;
  esac
}

cmd_secrets() {
  local name reply
  for name in $SECRETS; do
    log ""
    log "== $name =="
    log "$(secret_explanation "$name")"
    if secret_is_generatable "$name"; then
      read -r -p "Press Enter to generate one (openssl rand -base64 32), or type anything else to enter your own: " reply
      if [ -z "$reply" ]; then
        openssl rand -base64 32 | wrangler secret put "$name"
        log "$name set (generated)."
        continue
      fi
    fi
    wrangler secret put "$name"
  done
}

main() {
  cd "$API_DIR"
  local sub=${1:-deploy}
  case "$sub" in
    deploy) cmd_deploy ;;
    secrets) cmd_secrets ;;
    *) usage ;;
  esac
}

main "$@"
