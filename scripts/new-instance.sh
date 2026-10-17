#!/usr/bin/env bash
# Creates or updates a person's private instance repository: the small GitHub
# repository whose Actions run Bower's tidy-ups (TL-P3-13). Adapted from the
# original app's scripts/new-instance.sh.
#
#   scripts/new-instance.sh [OWNER/NAME] [WORKER_ORIGIN]
#
# 1. Builds the runner (runner/dist/runner.mjs, one file with no dependencies).
# 2. Creates OWNER/NAME as a private repository when it does not exist yet
#    (`gh repo create --private`); otherwise updates it.
# 3. In one commit, and only when something changed: removes the original
#    app's workflows and agent files (.github/workflows/, agent/), and copies
#    the built runner to runner/dist/runner.mjs and runner/workflows/tidy.yml
#    to .github/workflows/tidy.yml. Then pushes.
# 4. Adds the Worker's origin to the repository variable BOWER_API_URL, a
#    comma-separated list (one repository may serve staging and production),
#    keeping every other entry; says so when it is already listed.
#
# It never asks for, reads, prints or sets a secret: the runner needs none (the
# Worker hands each run its own ticket in the dispatch), and the credential a
# model provider needs comes in P4. The Worker's GITHUB_TOKEN is set on the
# Worker, not here.
#
# Requires `gh` (logged in, with `gh auth setup-git` so git can push), `git`
# with a commit identity, and `pnpm`. Only the technical lead runs it against a
# real repository; workers never do.
#
# Plain bash on purpose (no associative arrays, no ${x,,}), so it runs under
# macOS's stock bash 3.2.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BUNDLE="$ROOT/runner/dist/runner.mjs"
WORKFLOW="$ROOT/runner/workflows/tidy.yml"

REPO=''
API_ORIGIN_VALUE=''
WORK_DIR=''
ANSWER=''

log() { printf '%s\n' "$*" >&2; }
die() {
  log "new-instance: $*"
  exit 1
}

usage() {
  printf 'usage: new-instance.sh [OWNER/NAME] [WORKER_ORIGIN]\n' >&2
  exit 2
}

cleanup() {
  if [ -n "$WORK_DIR" ]; then rm -rf "$WORK_DIR"; fi
}

# ask PROMPT: reads one line from the terminal into ANSWER.
ask() {
  printf '%s' "$1" >&2
  ANSWER=''
  IFS= read -r ANSWER || true
}

# OWNER/NAME, neither part starting with '-', so it can never be read as a flag
# by gh or git, whether typed at the prompt or given on the command line.
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

check_tools() {
  command -v git >/dev/null 2>&1 || die "git is required."
  command -v pnpm >/dev/null 2>&1 || die "pnpm is required to build the runner."
  command -v gh >/dev/null 2>&1 || die "The GitHub CLI (gh) is required: https://cli.github.com"
  gh auth status >/dev/null 2>&1 </dev/null || die "Not logged in to GitHub. Run: gh auth login"
}

resolve_repo() {
  if [ -z "$REPO" ]; then
    ask 'Your private instance repository, owner/name (for example OWNER/bower-home): '
    REPO=$ANSWER
  fi
  is_repo "$REPO" || die "Not an owner/name repository: $REPO"
}

resolve_api_origin() {
  if [ -z "$API_ORIGIN_VALUE" ]; then
    ask "The Worker's address (for example https://api.example.com): "
    API_ORIGIN_VALUE=$ANSWER
  fi
  API_ORIGIN_VALUE=${API_ORIGIN_VALUE%/}
  is_origin "$API_ORIGIN_VALUE" || die "Not an https origin: $API_ORIGIN_VALUE"
}

build_runner() {
  log "Building the runner..."
  pnpm --dir "$ROOT/runner" run build >/dev/null
  [ -s "$BUNDLE" ] || die "The runner did not build: $BUNDLE is missing."
  [ -s "$WORKFLOW" ] || die "The workflow is missing: $WORKFLOW"
}

check_private() {
  local visibility
  visibility=$(gh repo view "$REPO" --json visibility -q .visibility </dev/null 2>&1) || die "Could not check repository visibility."
  [ "$visibility" = "PRIVATE" ] || die "Instance repository must be private."
}

ensure_repo() {
  if gh repo view "$REPO" >/dev/null 2>&1 </dev/null; then
    log "Instance repository $REPO exists; updating it."
    check_private
  else
    log "Creating the private repository $REPO..."
    gh repo create "$REPO" --private </dev/null >/dev/null
  fi
}

# sync_files: clones the repository into a temporary folder, replaces the
# original's workflows and agent files with the runner and tidy.yml in one
# commit, and pushes, only when something changed.
sync_files() {
  local dir source_rev branch
  WORK_DIR=$(mktemp -d)
  dir="$WORK_DIR/instance"
  gh repo clone "$REPO" "$dir" -- -q </dev/null
  git -C "$dir" config core.autocrlf false
  if ! git -C "$dir" rev-parse -q --verify HEAD >/dev/null; then
    git -C "$dir" symbolic-ref HEAD refs/heads/main
  fi
  git -C "$dir" rm -r -q --ignore-unmatch .github/workflows agent >/dev/null
  rm -rf "$dir/.github/workflows" "$dir/agent"
  mkdir -p "$dir/.github/workflows" "$dir/runner/dist"
  cp "$WORKFLOW" "$dir/.github/workflows/tidy.yml"
  cp "$BUNDLE" "$dir/runner/dist/runner.mjs"
  git -C "$dir" add -A .github runner
  if git -C "$dir" diff --cached --quiet; then
    log "The runner and its workflow in $REPO are already up to date."
    return
  fi
  source_rev=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null) || source_rev='unknown'
  git -C "$dir" commit -q -m "Replace the workflows with Bower's tidy-up runner (bower-app $source_rev)"
  branch=$(git -C "$dir" symbolic-ref --short HEAD)
  git -C "$dir" push -q origin "HEAD:refs/heads/$branch"
  log "Pushed .github/workflows/tidy.yml and runner/dist/runner.mjs to $REPO."
}

set_api_url() {
  # The variable is a comma-separated list: one repository may serve staging and production.
  local current entries
  current=$(gh variable get BOWER_API_URL -R "$REPO" </dev/null 2>/dev/null) || current=''
  entries=$(printf '%s\n' "$current" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' || true)
  if printf '%s\n' "$entries" | grep -Fxq -- "$API_ORIGIN_VALUE"; then
    log "BOWER_API_URL in $REPO already lists $API_ORIGIN_VALUE."
    return
  fi
  entries=$(printf '%s\n%s\n' "$entries" "$API_ORIGIN_VALUE" | grep -v '^$' | paste -sd, -)
  gh variable set BOWER_API_URL -R "$REPO" --body "$entries" </dev/null >/dev/null
  log "BOWER_API_URL in $REPO is now $entries."
}

new_instance_main() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      -*) usage ;;
      *)
        if [ -z "$REPO" ]; then REPO=$arg
        elif [ -z "$API_ORIGIN_VALUE" ]; then API_ORIGIN_VALUE=$arg
        else usage
        fi
        ;;
    esac
  done
  trap cleanup EXIT
  check_tools
  resolve_repo
  resolve_api_origin
  build_runner
  ensure_repo
  sync_files
  set_api_url
}

new_instance_main "$@"
