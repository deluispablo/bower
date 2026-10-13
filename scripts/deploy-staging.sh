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
# Plain bash on purpose, so it runs under macOS's stock bash 3.2.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CONFIG="api/wrangler.jsonc"
STAGING_NAME='bower-staging'
PRODUCTION_NAME='bower-api'
STAGING_KV='6969d46bffdb4b1e90d068f84235fbec'
PRODUCTION_KV='dedd167004be415cbd90c4b154b1f4e2'
ALLOWED_ADDRESS='you@example.com'
ALLOWED_UNPDF_LITERAL='jm@kbswfq.pkbgltMlwbaof'  # obfuscated literal inside unpdf
ADDRESS_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'
# Each wait is 10 seconds and each check at most 10 more (curl --max-time): one rerun of /health, and up to
# 15 checks of /status, 15*10 + 14*10 = 290 seconds in the worst case, under 5 minutes.
WAIT_SECONDS=10
STATUS_TRIES=15

SHA=''
ORIGIN=''
SHORT=''
REPO=${BOWER_GITHUB_REPO:-deluispablo/bower-home}

say() { printf '%s\n' "$*"; }
die() {
  printf '%s\n' "$*" >&2
  exit 1
}

usage() {
  printf 'usage: deploy-staging.sh <sha> <staging origin>\n' >&2
  exit 2
}

# OWNER/NAME, neither part starting with '-' (as scripts/new-instance.sh).
is_repo() {
  case "$1" in
    */*/* | /* | */ | *' '* | -* | */-*) return 1 ;;
    ?*/?*) return 0 ;;
    *) return 1 ;;
  esac
}

# An https origin with a plain host name: no path, no port, no user.
is_origin() {
  printf '%s' "$1" | grep -Eq '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'
}

read_args() {
  [ "$#" -eq 2 ] || usage
  case "$1$2" in -*) usage ;; esac
  case "$2" in -*) usage ;; esac
  SHA=$1
  ORIGIN=${2%/}
  printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{7,40}$' || die "Not a commit SHA: $SHA."
  is_origin "$ORIGIN" || die "Not a plain https origin: $ORIGIN."
  is_repo "$REPO" || die "BOWER_GITHUB_REPO is not an owner/name repository."
}

check_tools() {
  local tool
  for tool in git pnpm npx curl; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool is required."
  done
}

# 1. A clean tree whose HEAD is the SHA asked for, which is local main's tip.
check_checkout() {
  local full head main
  [ -z "$(git status --porcelain --untracked-files=all)" ] \
    || die "Refusing: the checkout has uncommitted or untracked changes."
  full=$(git rev-parse -q --verify "$SHA^{commit}" 2>/dev/null) || die "Refusing: $SHA is not a commit in this checkout."
  head=$(git rev-parse HEAD)
  [ "$head" = "$full" ] || die "Refusing: HEAD is not $SHA; check it out first."
  main=$(git rev-parse -q --verify refs/heads/main 2>/dev/null) || die "Refusing: this checkout has no local main."
  [ "$main" = "$full" ] || die "Refusing: $SHA is not the tip of local main."
  SHORT=$(git rev-parse --short "$full")
  check_env_files
}

# Vite loads these for a production build and they beat the shell's env after `env -u`; wrangler reads api/.dev.vars.
# https://vite.dev/guide/env-and-mode: .env, .env.local, .env.production, .env.production.local.
check_env_files() {
  local dir name file
  for dir in . api; do
    for name in .env .env.local .env.production .env.production.local; do
      file="$dir/$name"
      [ "$dir" != . ] || file=$name
      [ ! -e "$file" ] || die "Refusing: $file exists, so the build could read another API address; move it away first."
    done
  done
  [ ! -e api/.dev.vars ] || die "Refusing: api/.dev.vars exists; move it away first."
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

# 3. The app, built with no API address (one origin).
build_app() {
  say "Installing and building $SHORT..."
  pnpm install --frozen-lockfile </dev/null || die "pnpm install failed."
  env -u VITE_API_URL pnpm build </dev/null || die "The build failed."
  [ -d dist ] || die "The build left no dist/ folder."
}

# 4. scan LABEL PATH...: no address but you@example.com, nothing shaped like a
# secret. Names the files, never what matched.
scan() {
  local label=$1 file hits=''
  shift
  # NUL-separated, so a name with a space stays one name.
  while IFS= read -r -d '' file; do
    if grep -oaE "$ADDRESS_RE" "$file" \
       | grep -vxF "$ALLOWED_ADDRESS" \
       | grep -vxqF "$ALLOWED_UNPDF_LITERAL"; then
      hits="$hits ${file#"$ROOT"/}"
    fi
  done < <(grep -rlaE --null "$ADDRESS_RE" "$@" 2>/dev/null || true)
  [ -z "$hits" ] || die "Refusing: $label holds an address other than $ALLOWED_ADDRESS (in$hits)."
  hits=$(
    {
      grep -rlaF -e 'ghp_' -e 'github_pat_' -e 'sk-ant' -e 'AIza' -e 'ya29.' "$@" 2>/dev/null || true
      grep -rlaE -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' "$@" 2>/dev/null || true
    } | sort -u | paste -sd, - | sed 's/,/, /g'
  )
  [ -z "$hits" ] || die "Refusing: $label holds something shaped like a secret (in $hits)."
}

# 5. The deploy, from api/. Wrangler's output must name the staging Worker.
deploy() {
  local out upload_line
  say "Deploying $SHORT to $STAGING_NAME..."
  out=$(cd api && npx wrangler deploy --var "APP_ORIGIN:$ORIGIN" --var "API_ORIGIN:$ORIGIN" --var "APP_VERSION:$SHORT" --var "GITHUB_REPO:$REPO" </dev/null 2>&1) || {
    say "$out"
    die "wrangler deploy failed."
  }
  say "$out"
  # Extract the upload line to check the Worker name, ignoring URLs that may contain the production name.
  # Match only "Uploaded <name> (" to avoid matching asset progress lines like "Uploaded 6 of 10 assets".
  upload_line=$(printf '%s\n' "$out" | grep -E "^Uploaded [^ ]+ \(" | head -n 1)
  if [ -z "$upload_line" ]; then
    die "Wrangler's output has no upload line for $STAGING_NAME: check what was deployed."
  fi
  if ! printf '%s' "$upload_line" | grep -Eq "^Uploaded $STAGING_NAME( |\$)"; then
    # Check if the production Worker was deployed, which is a critical error.
    if printf '%s' "$upload_line" | grep -Eq "^Uploaded $PRODUCTION_NAME( |\$)"; then
      die "Wrangler uploaded $PRODUCTION_NAME (the production Worker); only $STAGING_NAME is allowed here."
    fi
    die "Wrangler's output has no upload line for $STAGING_NAME: check what was deployed."
  fi
}

# get PATH: sets BODY, CODE and TYPE from one GET without a cookie; CODE is 000 when nothing answered.
BODY=''
CODE=''
TYPE=''
get() {
  local out last
  out=$(curl -sS --max-time 10 -w '\n%{http_code} %{content_type}' "$ORIGIN$1" 2>/dev/null) || out=$'\n000 '
  last=${out##*$'\n'}
  BODY=${out%$'\n'*}
  CODE=${last%% *}
  TYPE=${last#* }
}

# 6. /health names the SHA; the first check after a deploy can still see the previous version.
check_health() {
  get /health
  if ! printf '%s' "$BODY" | grep -qF "\"version\":\"$SHORT\""; then
    sleep "$WAIT_SECONDS"
    get /health
    printf '%s' "$BODY" | grep -qF "\"version\":\"$SHORT\"" \
      || die "/health does not name $SHORT after a rerun: the new version is not serving."
  fi
  say "/health names $SHORT."
}

# 7. Version skew: /status without a cookie answers 401 JSON once the person objects run the new code.
wait_for_status() {
  local try=1
  while :; do
    get /status
    case "$CODE $TYPE" in
      '401 application/json'*) break ;;
    esac
    [ "$try" -lt "$STATUS_TRIES" ] \
      || die "/status still does not answer 401 JSON after $try checks (up to 5 minutes): redeploy the same version to restart the person objects."
    try=$((try + 1))
    sleep "$WAIT_SECONDS"
  done
  say "/status answers 401 JSON without a cookie."
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
  check_tools
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
