#!/usr/bin/env bash
# Deploys the Bower API Worker. `scripts/deploy.sh` runs this and more
# (the instance repo, the app on Cloudflare Pages); use this one when only
# the Worker changed.
#
#   scripts/deploy-api.sh [deploy|secrets] [--rotate]
#
# or via pnpm, equivalent, from anywhere in the repo:
#
#   pnpm -C api deploy
#   pnpm -C api secrets
#
# Your real domains, repo and KV id never go into the tracked
# api/wrangler.toml. They live in api/wrangler.local.toml, a git-ignored
# copy of it that every wrangler call here reads (`-c wrangler.local.toml`).
# When that file does not exist yet, this script creates it from
# api/wrangler.toml by asking for your API and app domains, your instance
# repo and a contact email; it also adds the Worker's custom domain
# (`routes`, `workers_dev = false`).
#
# `deploy` (the default): checks that you are logged in to Cloudflare,
# reads or creates api/wrangler.local.toml, refuses if its [vars] still
# hold placeholder values, finds or creates the BOWER_KV namespace (and
# writes its id into api/wrangler.local.toml), then runs `wrangler deploy`.
#
# `secrets`: sets every secret the Worker needs (see api/src/env.ts).
# Secrets already set are skipped unless you pass --rotate. Generates
# SESSION_SECRET, TOKEN_ENC_KEY, ADMIN_KEY and the VAPID
# pair itself and pipes them straight into `wrangler secret put`; asks
# (input hidden) for the Google client id and secret and the GitHub token,
# refusing an empty answer. ADMIN_KEY is written to api/.prod.secrets
# (git-ignored, mode 600). No secret goes to the instance repo but the Claude
# credential (scripts/new-instance.sh). No secret value is ever printed.
#
# Requires `wrangler` on PATH. `pnpm -C api deploy`/`secrets` already put
# api/node_modules/.bin there (same as `pnpm -C api dev`); running the
# script directly needs a global wrangler install. Also needs `node` (to
# read wrangler's JSON output), and for `secrets`: `openssl`, `pnpm`, `gh`.
#
# `scripts/deploy.sh` and `scripts/new-instance.sh` source this file for its
# functions; `main` only runs when it is executed directly.
#
# Plain POSIX-ish bash on purpose (no associative arrays), so it also runs
# under macOS's stock bash 3.2.

set -euo pipefail

DEPLOY_API_HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$DEPLOY_API_HERE/.." && pwd)
API_DIR="$ROOT/api"
TEMPLATE_TOML="$API_DIR/wrangler.toml"
LOCAL_CONFIG_NAME='wrangler.local.toml'
LOCAL_TOML="$API_DIR/$LOCAL_CONFIG_NAME"
PROD_SECRETS="$API_DIR/.prod.secrets"
PLACEHOLDER_KV_ID='KV_NAMESPACE_ID'
VARS_TO_CHECK='APP_ORIGIN API_ORIGIN GITHUB_REPO VAPID_SUBJECT'
SECRETS='GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SESSION_SECRET TOKEN_ENC_KEY GITHUB_TOKEN ADMIN_KEY VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY'
ROTATE=no
ANSWER=''

# --- helpers -------------------------------------------------------------

log() { printf '%s\n' "$*"; }

die() {
  log "$*"
  exit 1
}

# wrangler_api <args...>: runs wrangler from api/ against the local config.
# Every Worker, KV and secret call goes through here, so none of them can
# read the tracked api/wrangler.toml by accident.
wrangler_api() {
  (cd "$API_DIR" && wrangler "$@" -c "$LOCAL_CONFIG_NAME")
}

# toml_get <key> [file]: the quoted value of a top-level `key = "value"`
# line, empty when absent.
toml_get() {
  local file=${2:-$LOCAL_TOML}
  grep -m1 "^$1 = \"" "$file" 2>/dev/null | sed -E "s/^$1 = \"(.*)\"\$/\1/" || true
}

# ask <prompt> [secret]: reads one non-empty line from stdin into ANSWER,
# trimmed. With `secret`, input is not echoed. Asks up to three times, then
# gives up: an empty answer is never accepted (for a secret, `wrangler
# secret put` would store it as an empty secret).
ask() {
  local prompt=$1 mode=${2:-plain} tries=0 value
  ANSWER=''
  while [ "$tries" -lt 3 ]; do
    tries=$((tries + 1))
    printf '%s' "$prompt" >&2
    value=''
    if [ "$mode" = secret ]; then
      IFS= read -r -s value || true
      printf '\n' >&2
    else
      IFS= read -r value || true
    fi
    value=$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    if [ -n "$value" ]; then
      ANSWER=$value
      return 0
    fi
    log "This cannot be empty."
  done
  die "No answer given. Nothing was set for this step; run the script again when you have it."
}

# normalize_host <input>: lower-cased host name, without scheme or path.
normalize_host() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E -e 's#^[a-z]+://##' -e 's#/.*$##'
}

is_host() { printf '%s' "$1" | grep -qE '^[a-z0-9-]+(\.[a-z0-9-]+)+$'; }
is_repo() { printf '%s' "$1" | grep -qE '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'; }

# json_field <field> [match_field value...]: reads a JSON array from stdin
# (anything around it, like a wrangler banner, is ignored) and prints
# <field> of each element, one per line; with a match field and values,
# only of the elements whose match field is one of those values.
json_field() {
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const a = s.indexOf("["), b = s.lastIndexOf("]");
      if (a < 0 || b < a) return;
      let list;
      try { list = JSON.parse(s.slice(a, b + 1)); } catch { return; }
      if (!Array.isArray(list)) return;
      const [field, matchField, ...values] = process.argv.slice(1);
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        if (matchField && !values.includes(String(item[matchField]))) continue;
        if (item[field] !== undefined) process.stdout.write(String(item[field]) + "\n");
      }
    });
  ' "$@"
}

has_line() { printf '%s\n' "$1" | grep -qx -- "$2"; }

# --- login ---------------------------------------------------------------

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

# --- local config ----------------------------------------------------------

# ensure_local_config: uses api/wrangler.local.toml when it exists;
# otherwise asks for the four values and writes it from api/wrangler.toml.
ensure_local_config() {
  if [ -f "$LOCAL_TOML" ]; then
    log "Using api/$LOCAL_CONFIG_NAME."
    # A config written before #292 has no cron trigger, so the weekly health
    # check would silently stop: add the block from api/wrangler.toml.
    if ! grep -q '^crons = ' "$LOCAL_TOML"; then
      printf '
# The weekly health check (added by scripts/deploy-api.sh, #292).
[triggers]
crons = ["17 6 * * 0"]
' >>"$LOCAL_TOML"
      log "Added the weekly cron trigger to api/$LOCAL_CONFIG_NAME."
    fi
    return
  fi
  log "api/$LOCAL_CONFIG_NAME not found: creating it from api/wrangler.toml."
  log "It holds your real domains and ids, is git-ignored, and every later run reads it."
  log ""
  local api_host app_host repo email tmp
  ask 'API domain, where the Worker will answer (for example api.example.com): '
  api_host=$(normalize_host "$ANSWER")
  is_host "$api_host" || die "Not a domain name: $ANSWER"
  ask 'App domain, sharing the same registrable domain (for example app.example.com): '
  app_host=$(normalize_host "$ANSWER")
  is_host "$app_host" || die "Not a domain name: $ANSWER"
  if [ "${api_host#*.}" != "${app_host#*.}" ]; then
    log "Warning: $api_host and $app_host do not look like they share a domain; sign-in needs that (docs/security.md)."
  fi
  ask 'Your private instance repo, owner/name (for example OWNER/bower-home): '
  repo=$ANSWER
  is_repo "$repo" || die "Not an owner/name repo: $repo"
  ask 'Contact email for push notifications (for example you@example.com): '
  email=$ANSWER
  printf '%s' "$email" | grep -qE '^[^[:space:]"\\@]+@[^[:space:]"\\@]+\.[^[:space:]"\\@]+$' ||
    die "Not an email address: $email"

  tmp=$(mktemp)
  awk -v api_host="$api_host" -v app_host="$app_host" -v repo="$repo" -v email="$email" '
    BEGIN {
      print "# Deploy config for this instance, written by scripts/deploy-api.sh from"
      print "# api/wrangler.toml. Git-ignored: never commit it. Edit it to change a value."
      inserted = 0
    }
    /^\[/ && !inserted {
      print "workers_dev = false"
      print "routes = [{ pattern = \"" api_host "\", custom_domain = true }]"
      print ""
      inserted = 1
    }
    /^APP_ORIGIN = / { print "APP_ORIGIN = \"https://" app_host "\""; next }
    /^API_ORIGIN = / { print "API_ORIGIN = \"https://" api_host "\""; next }
    /^GITHUB_REPO = / { print "GITHUB_REPO = \"" repo "\""; next }
    /^VAPID_SUBJECT = / { print "VAPID_SUBJECT = \"mailto:" email "\""; next }
    { print }
  ' "$TEMPLATE_TOML" >"$tmp"
  mv "$tmp" "$LOCAL_TOML"
  log "Wrote api/$LOCAL_CONFIG_NAME."
}

check_vars() {
  local bad='' key value
  for key in $VARS_TO_CHECK; do
    value=$(toml_get "$key")
    case "$value" in
      '' | *example.com* | *OWNER*) bad="$bad $key" ;;
    esac
  done
  if [ -n "$bad" ]; then
    log "api/$LOCAL_CONFIG_NAME still has placeholder values in [vars]:$bad"
    log "Edit it with your real values (or delete it to be asked again), then run this again."
    exit 1
  fi
}

# --- KV ------------------------------------------------------------------

ensure_kv_namespace() {
  local current_id worker_name list_output new_id tmp
  current_id=$(grep -m1 '^id = "' "$LOCAL_TOML" | sed -E 's/^id = "(.*)"$/\1/' || true)
  if [ -n "$current_id" ] && [ "$current_id" != "$PLACEHOLDER_KV_ID" ]; then
    log "KV namespace already configured (id $current_id)."
    return
  fi
  worker_name=$(toml_get name)
  list_output=$(wrangler_api kv namespace list </dev/null) || die "Could not list your KV namespaces (see wrangler's message above)."
  new_id=$(printf '%s' "$list_output" | json_field id title BOWER_KV "$worker_name-BOWER_KV" | sed -n 1p)
  if [ -n "$new_id" ]; then
    log "Found the existing BOWER_KV namespace (id $new_id)."
  else
    log "Creating the BOWER_KV namespace..."
    local create_output
    create_output=$(wrangler_api kv namespace create BOWER_KV </dev/null)
    printf '%s\n' "$create_output"
    new_id=$(printf '%s\n' "$create_output" | grep -m1 -oE '"?id"?[[:space:]]*[=:][[:space:]]*"[^"]+"' | sed -E 's/.*"([^"]+)"$/\1/' || true)
    [ -n "$new_id" ] || die "Could not find the new namespace's id in wrangler's output above."
  fi
  tmp=$(mktemp)
  sed -E "s/^id = \"[^\"]*\"\$/id = \"$new_id\"/" "$LOCAL_TOML" >"$tmp"
  mv "$tmp" "$LOCAL_TOML"
  log "api/$LOCAL_CONFIG_NAME updated: BOWER_KV id is now $new_id."
}

# --- deploy ------------------------------------------------------------

worker_deploy() {
  log "Deploying the Worker..."
  wrangler_api deploy </dev/null
  log ""
  log "Worker deployed: $(toml_get API_ORIGIN)"
  if ! grep -q 'custom_domain = true' "$LOCAL_TOML"; then
    log "Warning: api/$LOCAL_CONFIG_NAME has no custom domain route; the app needs the Worker on a domain it shares (docs/security.md)."
  fi
}

cmd_deploy() {
  check_login
  ensure_local_config
  check_vars
  ensure_kv_namespace
  worker_deploy
}

# --- secrets -------------------------------------------------------------

secret_explanation() {
  case "$1" in
    GOOGLE_CLIENT_ID) echo "Google Cloud Console -> APIs & Services -> Credentials, the OAuth client (Web application). Its authorized redirect URI must be $(toml_get API_ORIGIN)/auth/callback." ;;
    GOOGLE_CLIENT_SECRET) echo 'The secret of that same OAuth client.' ;;
    SESSION_SECRET) echo 'Signs the session cookie. Generated.' ;;
    TOKEN_ENC_KEY) echo 'Encrypts stored Google refresh tokens. Generated.' ;;
    GITHUB_TOKEN) echo "GitHub -> Settings -> Developer settings -> Fine-grained token with contents: write on $(toml_get GITHUB_REPO) only." ;;
    ADMIN_KEY) echo "Key for the admin endpoints. Generated and saved to api/.prod.secrets." ;;
    VAPID_PUBLIC_KEY | VAPID_PRIVATE_KEY) echo 'Web push key pair. Generated with pnpm -C api gen-vapid.' ;;
  esac
}

# rotation_warning <name>: what changes for people when a secret changes.
rotation_warning() {
  case "$1" in
    SESSION_SECRET) log "Rotating SESSION_SECRET signs everyone out." ;;
    TOKEN_ENC_KEY) log "Rotating TOKEN_ENC_KEY means everyone has to sign in with Google again." ;;
    VAPID_PUBLIC_KEY) log "Rotating the VAPID pair means every device has to allow notifications again." ;;
  esac
}

# put_secret <name> <value>: pipes the value into wrangler; never prints it.
put_secret() {
  printf '%s' "$2" | wrangler_api secret put "$1"
}

generate_secret() {
  local value
  value=$(openssl rand -base64 32)
  [ -n "$value" ] || die "openssl did not generate a value."
  printf '%s' "$value"
}

# save_admin_key <value>: keeps ADMIN_KEY in api/.prod.secrets, readable only
# by you, replacing an older value.
save_admin_key() {
  (
    umask 077
    local tmp="$PROD_SECRETS.tmp"
    if [ -f "$PROD_SECRETS" ]; then
      grep -v '^ADMIN_KEY=' "$PROD_SECRETS" >"$tmp" || true
    else
      printf '# Bower production secrets, written by scripts/deploy-api.sh. Git-ignored; keep it private.\n' >"$tmp"
    fi
    printf 'ADMIN_KEY=%s\n' "$1" >>"$tmp"
    mv "$tmp" "$PROD_SECRETS"
  )
  chmod 600 "$PROD_SECRETS"
}

setup_secrets() {
  local worker_list worker_secrets name value public private vapid
  worker_list=$(wrangler_api secret list --format json </dev/null) ||
    die "Could not list the Worker's secrets. Deploy it first: scripts/deploy-api.sh deploy"
  worker_secrets=$(printf '%s' "$worker_list" | json_field name)

  for name in $SECRETS; do
    case "$name" in
      VAPID_PRIVATE_KEY) continue ;; # set together with VAPID_PUBLIC_KEY
      VAPID_PUBLIC_KEY)
        if [ "$ROTATE" != yes ] && has_line "$worker_secrets" VAPID_PUBLIC_KEY && has_line "$worker_secrets" VAPID_PRIVATE_KEY; then
          log "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY already set; skipped."
          continue
        fi
        ;;
      *)
        if [ "$ROTATE" != yes ] && has_line "$worker_secrets" "$name"; then
          log "$name already set; skipped."
          continue
        fi
        ;;
    esac

    log ""
    log "== $name =="
    log "$(secret_explanation "$name")"
    if has_line "$worker_secrets" "$name"; then rotation_warning "$name"; fi
    case "$name" in
      GOOGLE_CLIENT_ID | GOOGLE_CLIENT_SECRET | GITHUB_TOKEN)
        ask "Paste $name (input hidden): " secret
        put_secret "$name" "$ANSWER"
        ANSWER=''
        ;;
      ADMIN_KEY)
        value=$(generate_secret)
        put_secret "$name" "$value"
        save_admin_key "$value"
        value=''
        log "$name set (generated) and saved to api/.prod.secrets."
        ;;
      VAPID_PUBLIC_KEY)
        vapid=$(pnpm -s -C "$API_DIR" run gen-vapid </dev/null)
        public=$(printf '%s\n' "$vapid" | sed -n 's/^VAPID_PUBLIC_KEY=//p')
        private=$(printf '%s\n' "$vapid" | sed -n 's/^VAPID_PRIVATE_KEY=//p')
        vapid=''
        [ -n "$public" ] && [ -n "$private" ] || die "pnpm -C api gen-vapid did not print a key pair."
        put_secret VAPID_PUBLIC_KEY "$public"
        put_secret VAPID_PRIVATE_KEY "$private"
        public=''
        private=''
        log "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY set (generated)."
        ;;
      *)
        value=$(generate_secret)
        put_secret "$name" "$value"
        value=''
        log "$name set (generated)."
        ;;
    esac
  done
}

cmd_secrets() {
  check_login
  [ -f "$LOCAL_TOML" ] || die "api/$LOCAL_CONFIG_NAME not found. Run scripts/deploy-api.sh deploy first."
  check_vars
  setup_secrets
}

usage() {
  printf 'usage: deploy-api.sh [deploy|secrets] [--rotate]\n' >&2
  exit 2
}

main() {
  local sub=deploy arg
  for arg in "$@"; do
    case "$arg" in
      deploy | secrets) sub=$arg ;;
      --rotate) ROTATE=yes ;;
      *) usage ;;
    esac
  done
  case "$sub" in
    deploy) cmd_deploy ;;
    secrets) cmd_secrets ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
