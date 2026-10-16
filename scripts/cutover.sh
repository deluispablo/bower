#!/usr/bin/env bash
# The production cutover: deploys one clean local `main` SHA to the Worker bower-api, app and Worker on one origin,
# and says how to go back. docs/runbook.md ("Deploys") is the procedure; scripts/deploy-staging.sh does the same for
# staging and keeps refusing bower-api (TL-P3-08), so production has this script and scripts/rollback.sh.
#
#   scripts/cutover.sh [--dry-run] <sha> <production origin> <production config>
#
# <production config> is a file in api/ other than wrangler.jsonc (the staging one), for example
# api/wrangler.production.jsonc, passed to wrangler with --config so its `main` and `assets` resolve beside it.
#
# Guards, the same with or without --dry-run (nothing here calls the network):
#   - a clean tree with no env file Vite would read, HEAD is <sha> and <sha> is local main's tip;
#   - the config names bower-api, keeps the single-page fallback, binds BOWER_KV to a namespace that is not the staging
#     one, and binds AUTH_RATE_LIMIT, DRIVE_RATE_LIMIT and VAULT_RATE_LIMIT. It is read as wrangler reads it: JSON
#     with // and /* */ comments and trailing commas, in any property order and layout.
# --dry-run then prints the 8 steps below and stops. Without it, the script makes steps 1, 2, 3, 5, 6 and 7 in that
# order, with the same commands, and ends by printing step 8:
#   1. npx --prefix api wrangler deployments status --name bower-api: the version live now, to return to. Exactly one
#      version must serve 100%: with none, or a split, nothing is deployed.
#   2. pnpm install --frozen-lockfile
#   3. env -u VITE_API_URL pnpm build
#   4. the scan of dist/ (no call): no address but you@example.com, nothing shaped like a secret.
#   5. npx --prefix api wrangler deploy --config <config> --var APP_ORIGIN, API_ORIGIN, APP_VERSION (the short SHA)
#      and GITHUB_REPO (BOWER_GITHUB_REPO, default deluispablo/bower-home). Its upload line must name bower-api.
#   6. /health must name the short SHA; a check that disagrees is rerun once.
#   7. /status without a cookie answers 401 JSON, at most 15 checks, 5 minutes in the worst case (version skew).
#   8. scripts/rollback.sh <version from step 1> <origin>, if anything is wrong.
# After step 1, any failure prints step 8 on stderr, so the way back is on screen even when the deploy's reply was lost.
#
# Every refusal is one sentence on stderr and a non-zero exit. It never asks for, reads, prints or sets a secret:
# those are set once with `wrangler secret put`, by hand. Only the technical lead runs it, never an agent.
#
# Plain bash on purpose, so it runs under macOS's stock bash 3.2 (node reads the config).

set -euo pipefail

# shellcheck source=deploy-lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/deploy-lib.sh"
CONFIG=''
DRY=0
LIVE=''

usage() {
  printf 'usage: cutover.sh [--dry-run] <sha> <production origin> <production config>\n' >&2
  exit 2
}

read_args() {
  local arg
  if [ "${1:-}" = --dry-run ]; then
    DRY=1
    shift
  fi
  [ "$#" -eq 3 ] || usage
  for arg in "$@"; do
    case "$arg" in -*) usage ;; esac
  done
  SHA=$1
  ORIGIN=${2%/}
  CONFIG=$3
  check_sha
  check_origin
  check_repo
}

# The config as wrangler reads it (JSONC: comments and trailing commas), as five lines, then "end" (so an empty last
# line is not lost): the Worker's name, the single-page fallback, the id of the BOWER_KV binding, "staging-kv" when the
# staging namespace id appears anywhere outside a comment, and the names of the rate limits, comma-separated.
read_config() {
  node -e '
const text = require("fs").readFileSync(process.argv[1], "utf8");
let out = "";
let inString = false;
for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (inString) {
    out += c;
    if (c === "\\") out += text[++i];
    else if (c === "\"") inString = false;
  } else if (c === "\"") {
    inString = true;
    out += c;
  } else if (c === "/" && text[i + 1] === "/") {
    while (i < text.length && text[i] !== "\n") i++;
  } else if (c === "/" && text[i + 1] === "*") {
    const end = text.indexOf("*/", i + 2);
    i = end < 0 ? text.length : end + 1;
  } else if (c === "}" || c === "]") {
    out = out.replace(/,\s*$/, "") + c;
  } else {
    out += c;
  }
}
const config = JSON.parse(out);
const kv = (config.kv_namespaces || []).find((k) => k && k.binding === "BOWER_KV");
console.log([
  config.name,
  config.assets && config.assets.not_found_handling,
  kv && kv.id,
  out.includes(process.argv[2]) ? "staging-kv" : "",
  (config.ratelimits || []).map((r) => r && r.name).join(","),
].join("\n") + "\nend");
' "$CONFIG" "$STAGING_KV"
}

# The Worker config targets production only (the staging one is refused by name and by KV namespace).
check_config() {
  local facts name fallback kv staging limits limit
  case "$CONFIG" in
    api/wrangler.jsonc | api/*/* | api/.*) die "Refusing: the production config must be a file in api/ other than api/wrangler.jsonc." ;;
    api/?*) ;;
    *) die "Refusing: the production config must be a file in api/ other than api/wrangler.jsonc." ;;
  esac
  [ -f "$CONFIG" ] || die "Refusing: $CONFIG is missing."
  facts=$(read_config 2>/dev/null) || die "Refusing: $CONFIG is not a readable config (JSON, comments and trailing commas allowed)."
  { read -r name; read -r fallback; read -r kv; read -r staging; read -r limits; } <<<"$facts"
  [ "$name" = "$PRODUCTION_NAME" ] || die "Refusing: $CONFIG must name the Worker $PRODUCTION_NAME."
  [ "$fallback" = single-page-application ] || die "Refusing: $CONFIG must keep the single-page fallback."
  [ -z "$staging" ] || die "Refusing: $CONFIG uses the staging KV namespace."
  [ -n "$kv" ] || die "Refusing: $CONFIG must bind BOWER_KV to a KV namespace of its own."
  for limit in AUTH_RATE_LIMIT DRIVE_RATE_LIMIT VAULT_RATE_LIMIT; do
    case ",$limits," in
      *",$limit,"*) ;;
      *) die "Refusing: $CONFIG must bind $limit, a per-minute limit." ;;
    esac
  done
}

rollback_command() { printf 'scripts/rollback.sh %s %s' "$LIVE" "$ORIGIN"; }

# After step 1 every failure leaves the way back on screen.
on_exit() {
  if [ "$?" -ne 0 ]; then printf 'To go back to the version that was live before: %s\n' "$(rollback_command)" >&2; fi
}

print_steps() {
  say "Dry run for $SHORT: the guards passed and nothing below was run."
  say "1. ${WRANGLER[*]} deployments status --name $PRODUCTION_NAME  (the version live now, to return to)"
  say "2. pnpm install --frozen-lockfile"
  say "3. env -u VITE_API_URL pnpm build"
  say "4. Scan dist/: no address but $ALLOWED_ADDRESS, nothing shaped like a secret"
  say "5. ${WRANGLER[*]} deploy --config $CONFIG --var APP_ORIGIN:$ORIGIN --var API_ORIGIN:$ORIGIN --var APP_VERSION:$SHORT --var GITHUB_REPO:$REPO  (its upload line must name $PRODUCTION_NAME)"
  say "6. $ORIGIN/health names $SHORT  (rerun once)"
  say "7. $ORIGIN/status without a cookie answers 401 JSON  (at most 15 checks)"
  say "8. scripts/rollback.sh <version from step 1> $ORIGIN  (if anything is wrong)"
}

# 1. The version live now, the one to return to: exactly one at 100%, so there is one place to go back to.
read_live_version() {
  wrangler_run deployments status --name "$PRODUCTION_NAME"
  read_live "$OUT"
  [ -n "$LIVE_LIST" ] || die "Refusing: wrangler shows no live version of $PRODUCTION_NAME to return to, so nothing was deployed."
  [ -n "$LIVE_ONE" ] || die "Refusing: $PRODUCTION_NAME does not serve one version at 100% ($LIVE_LIST); finish or undo that rollout first."
  LIVE=$LIVE_ONE
}

# 5. The deploy, from the checkout root. Wrangler's output must name the production Worker.
deploy() {
  say "Deploying $SHORT to $PRODUCTION_NAME..."
  wrangler_run deploy --config "$CONFIG" --var "APP_ORIGIN:$ORIGIN" --var "API_ORIGIN:$ORIGIN" --var "APP_VERSION:$SHORT" --var "GITHUB_REPO:$REPO"
  check_upload_line "$OUT" "$PRODUCTION_NAME" "$STAGING_NAME" staging
}

cutover_main() {
  read_args "$@"
  cd "$ROOT"
  check_tools git pnpm npx curl node
  check_checkout
  check_config
  if [ "$DRY" -eq 1 ]; then
    print_steps
    return
  fi
  read_live_version
  trap on_exit EXIT
  build_app
  scan 'dist/' dist
  deploy
  check_health
  wait_for_status
  say "Deployed $SHORT to $ORIGIN. If anything is wrong, go back with: $(rollback_command)"
}

cutover_main "$@"
