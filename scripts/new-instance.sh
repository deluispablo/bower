#!/usr/bin/env bash
# Creates or updates the operator's private instance repo: the small
# GitHub repo whose Actions run the agent over each vault.
#
#   scripts/new-instance.sh [OWNER/NAME] [--rotate]
#
# `scripts/deploy.sh` runs this for you. On its own:
#
# 1. Creates OWNER/NAME as a private repo (`gh repo create --private`) when
#    it does not exist yet; otherwise updates it.
# 2. Copies what the runner needs into it and pushes, only when something
#    changed: agent/workflows/*.yml into .github/workflows/, agent/run.sh,
#    agent/claude-settings.json (the permission policy for every run)
#    and agent/prompts/*.md into agent/.
# 3. Asks (input hidden) for the Claude credential the runner uses, a
#    Claude subscription token (`claude setup-token`) or an Anthropic API
#    key, and pipes it into `gh secret set`. Skipped when one is already
#    set, unless --rotate.
# 4. Sets the variable BOWER_API_URL to the Worker's origin.
#
# BOWER_API_KEY is not set here: scripts/deploy.sh (or `deploy-api.sh
# secrets`) generates it and sets it in the Worker and in this repo at once.
# Only lint.yml's `dispatch` job uses it, to ask the Worker to start the
# weekly health checks. The jobs that run the agent (ingest.yml, lint.yml's
# `lint` job) need no secret but the Claude credential: the Worker hands
# each run its own ticket in the repository_dispatch (issue #259). An
# instance repo set up before that still has the old workflows, which send
# BOWER_API_KEY from every run: run this script again after updating Bower
# (docs/runbook.md, "Upgrading to run tickets").
#
# OWNER/NAME and the Worker's origin come from api/wrangler.local.toml when
# it exists (GITHUB_REPO, API_ORIGIN); otherwise they are asked for.
#
# Requires `gh` (logged in, with `gh auth setup-git` so git can push) and
# `git` with a commit identity. No secret value is ever printed.
#
# Plain POSIX-ish bash on purpose (no associative arrays), so it also runs
# under macOS's stock bash 3.2.

set -euo pipefail

NEW_INSTANCE_HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# Shared helpers (log, die, ask, toml_get, ...) and paths (ROOT, LOCAL_TOML).
# shellcheck source=deploy-api.sh
. "$NEW_INSTANCE_HERE/deploy-api.sh"

REPO=''
WORK_DIR=''

usage() {
  printf 'usage: new-instance.sh [OWNER/NAME] [--rotate]\n' >&2
  exit 2
}

cleanup() {
  if [ -n "$WORK_DIR" ]; then rm -rf "$WORK_DIR"; fi
}

check_tools() {
  command -v git >/dev/null 2>&1 || die "git is required."
  command -v gh >/dev/null 2>&1 || die "The GitHub CLI (gh) is required: https://cli.github.com"
  gh auth status >/dev/null 2>&1 </dev/null || die "Not logged in to GitHub. Run: gh auth login"
}

# resolve_repo: from the argument, api/wrangler.local.toml, or a prompt.
resolve_repo() {
  if [ -z "$REPO" ] && [ -f "$LOCAL_TOML" ]; then
    REPO=$(toml_get GITHUB_REPO)
  fi
  if [ -z "$REPO" ]; then
    ask 'Your private instance repo, owner/name (for example OWNER/bower-home): '
    REPO=$ANSWER
  fi
  is_repo "$REPO" || die "Not an owner/name repo: $REPO"
  case "$REPO" in OWNER/*) die "GITHUB_REPO is still the placeholder $REPO; set your real owner/name." ;; esac
}

# resolve_api_origin: sets API_ORIGIN_VALUE to the Worker's origin,
# https://<host>.
resolve_api_origin() {
  local host
  API_ORIGIN_VALUE=''
  if [ -f "$LOCAL_TOML" ]; then
    API_ORIGIN_VALUE=$(toml_get API_ORIGIN)
  fi
  case "$API_ORIGIN_VALUE" in
    '' | *example.com*)
      ask "The Worker's address (for example https://api.example.com): "
      host=$(normalize_host "$ANSWER")
      is_host "$host" || die "Not a domain name: $ANSWER"
      API_ORIGIN_VALUE="https://$host"
      ;;
  esac
}

ensure_repo() {
  if gh repo view "$REPO" >/dev/null 2>&1 </dev/null; then
    log "Instance repo $REPO exists; updating it."
  else
    log "Creating the private repo $REPO..."
    gh repo create "$REPO" --private </dev/null
  fi
}

# sync_files: clones the repo into a temporary folder, copies the runner's
# files over and pushes them, only when something changed.
sync_files() {
  local dir source_rev branch
  WORK_DIR=$(mktemp -d)
  dir="$WORK_DIR/instance"
  gh repo clone "$REPO" "$dir" -- -q </dev/null
  # The copied files are LF already (.gitattributes); keep them that way.
  git -C "$dir" config core.autocrlf false
  if ! git -C "$dir" rev-parse -q --verify HEAD >/dev/null; then
    git -C "$dir" symbolic-ref HEAD refs/heads/main
  fi
  mkdir -p "$dir/.github/workflows" "$dir/agent/prompts"
  cp "$ROOT"/agent/workflows/*.yml "$dir/.github/workflows/"
  cp "$ROOT/agent/run.sh" "$ROOT/agent/claude-settings.json" "$dir/agent/"
  cp "$ROOT"/agent/prompts/*.md "$dir/agent/prompts/"
  git -C "$dir" add .github/workflows agent
  if git -C "$dir" diff --cached --quiet; then
    log "Workflows and agent files in $REPO are already up to date."
    return
  fi
  source_rev=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null) || source_rev='unknown'
  git -C "$dir" commit -q -m "Update Bower workflows and agent (bower $source_rev)"
  branch=$(git -C "$dir" symbolic-ref --short HEAD)
  git -C "$dir" push -q origin "HEAD:refs/heads/$branch"
  log "Pushed .github/workflows/ and agent/ to $REPO."
}

set_claude_secret() {
  local names choice name
  names=$(gh secret list -R "$REPO" --json name -q '.[].name' </dev/null)
  if [ "$ROTATE" != yes ] && { has_line "$names" CLAUDE_CODE_OAUTH_TOKEN || has_line "$names" ANTHROPIC_API_KEY; }; then
    log "Claude credential already set in $REPO; skipped."
    return
  fi
  log ""
  log "== Claude credential for the runner =="
  log "1 = a Claude subscription token: run 'claude setup-token' and copy what it prints."
  log "2 = an Anthropic API key from the Claude Console."
  printf 'Which one? [1]: ' >&2
  choice=''
  IFS= read -r choice || true
  case "$(printf '%s' "$choice" | tr -d '[:space:]')" in
    '' | 1) name=CLAUDE_CODE_OAUTH_TOKEN ;;
    2) name=ANTHROPIC_API_KEY ;;
    *) die "Answer 1 or 2." ;;
  esac
  ask "Paste $name (input hidden): " secret
  printf '%s' "$ANSWER" | gh secret set "$name" -R "$REPO"
  ANSWER=''
  log "$name set in $REPO."
}

new_instance_main() {
  local arg names
  for arg in "$@"; do
    case "$arg" in
      --rotate) ROTATE=yes ;;
      -*) usage ;;
      *) REPO=$arg ;;
    esac
  done
  trap cleanup EXIT
  check_tools
  resolve_repo
  resolve_api_origin
  ensure_repo
  sync_files
  set_claude_secret
  gh variable set BOWER_API_URL -R "$REPO" --body "$API_ORIGIN_VALUE" </dev/null
  log "BOWER_API_URL set to $API_ORIGIN_VALUE in $REPO."
  names=$(gh secret list -R "$REPO" --json name -q '.[].name' </dev/null)
  if ! has_line "$names" BOWER_API_KEY; then
    log "BOWER_API_KEY is not set in $REPO yet: scripts/deploy.sh sets it in the Worker and here at once."
    log "(Only the weekly health check's dispatch job uses it; the runs themselves get a ticket per run.)"
  fi
}

new_instance_main "$@"
