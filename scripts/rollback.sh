#!/usr/bin/env bash
# Returns the production Worker bower-api to an earlier version, the one scripts/cutover.sh printed, and checks the
# site. docs/runbook.md ("Deploys") is the procedure.
#
#   scripts/rollback.sh [--dry-run] <version id> <production origin>
#
# <version id> is a Cloudflare Worker version id (a UUID) and <production origin> a plain https origin: anything else
# is refused first, before anything runs. It needs no clean tree and no particular checkout state, so it can be run
# in a hurry from any checkout of this repository (with `pnpm install` done, so the pinned wrangler is in api/).
# --dry-run prints the 3 steps below and stops; without it the script makes those 3 calls in that order:
#   1. npx --prefix api wrangler rollback <id> --name bower-api --message "<one sentence>", with no stdin: wrangler's
#      prompts for the message and the confirmation fall back to their defaults when stdin is no terminal.
#   2. npx --prefix api wrangler deployments status --name bower-api: it must list exactly <id> at 100%, the
#      authority on what serves; otherwise the script stops here, before looking at the site.
#   3. <origin>/ answers 200 (a check that holds for the original app too, whose /health may differ); rerun once.
#
# Every refusal is one sentence on stderr and a non-zero exit. No secret is asked for, read, printed or set.
# Only the technical lead runs it, never an agent.
#
# Plain bash on purpose, so it runs under macOS's stock bash 3.2.

set -euo pipefail

# shellcheck source=deploy-lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/deploy-lib.sh"
VERSION=''
DRY=0
MESSAGE='Rolled back with scripts/rollback.sh.'

usage() {
  printf 'usage: rollback.sh [--dry-run] <version id> <production origin>\n' >&2
  exit 2
}

read_args() {
  local arg
  if [ "${1:-}" = --dry-run ]; then
    DRY=1
    shift
  fi
  [ "$#" -eq 2 ] || usage
  for arg in "$@"; do
    case "$arg" in -*) usage ;; esac
  done
  printf '%s' "$1" | grep -Eq "^$UUID_RE\$" || die "Not a Cloudflare version id: $1."
  VERSION=$(printf '%s' "$1" | tr 'A-F' 'a-f')
  ORIGIN=${2%/}
  check_origin
}

print_steps() {
  say "Dry run: nothing below was run."
  say "1. ${WRANGLER[*]} rollback $VERSION --name $PRODUCTION_NAME --message \"$MESSAGE\""
  say "2. ${WRANGLER[*]} deployments status --name $PRODUCTION_NAME  (must list $VERSION at 100%)"
  say "3. $ORIGIN/ answers 200  (rerun once)"
}

# 3. The site answers; the first check right after a rollback can still see the version it replaced.
check_site() {
  get /
  if [ "$CODE" != 200 ]; then
    sleep "$WAIT_SECONDS"
    get /
    [ "$CODE" = 200 ] || die "$ORIGIN/ answers $CODE after a rerun, not 200: check the site."
  fi
  say "$ORIGIN/ answers 200."
}

rollback_main() {
  read_args "$@"
  cd "$ROOT"
  check_tools npx curl
  if [ "$DRY" -eq 1 ]; then
    print_steps
    return
  fi
  wrangler_run rollback "$VERSION" --name "$PRODUCTION_NAME" --message "$MESSAGE"
  wrangler_run deployments status --name "$PRODUCTION_NAME"
  read_live "$OUT"
  [ "$LIVE_ONE" = "$VERSION" ] \
    || die "The deployments do not show $VERSION at 100% (live now: ${LIVE_LIST:-no version found}), so the rollback did not take."
  check_site
  say "Rolled $PRODUCTION_NAME back to $VERSION."
}

rollback_main "$@"
