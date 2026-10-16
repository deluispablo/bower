# shellcheck shell=bash
# The parts that scripts/deploy-staging.sh, scripts/cutover.sh and scripts/rollback.sh share: the checkout and env-file
# guards, the origin check, the build, the scan, the /health and /status checks, and how the live version is read.
# Sourced, never run; each script keeps its own guards (Worker name, KV, limits) and steps. Plain bash 3.2.

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
STAGING_NAME='bower-staging'
PRODUCTION_NAME='bower-api'
STAGING_KV='6969d46bffdb4b1e90d068f84235fbec'
ALLOWED_ADDRESS='you@example.com'
ALLOWED_UNPDF_LITERAL='jm@kbswfq.pkbgltMlwbaof'  # obfuscated literal inside unpdf
ADDRESS_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'
UUID_RE='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
# Each wait is 10 seconds and each check at most 10 more (curl --max-time): one rerun of /health, and up to
# 15 checks of /status, 15*10 + 14*10 = 290 seconds in the worst case, under 5 minutes.
WAIT_SECONDS=10
STATUS_TRIES=15
# The wrangler pinned in api/, run from the checkout root so a --config path stays relative to it. Plain
# `npx wrangler` there would fetch whichever wrangler is newest (npm exec --prefix: "forces non-global commands to
# run in the specified folder").
WRANGLER=(npx --prefix api wrangler)

SHA=''
ORIGIN=''
SHORT=''
REPO=${BOWER_GITHUB_REPO:-deluispablo/bower-home}

say() { printf '%s\n' "$*"; }
die() {
  printf '%s\n' "$*" >&2
  exit 1
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

check_sha() { printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{7,40}$' || die "Not a commit SHA: $SHA."; }
check_origin() { is_origin "$ORIGIN" || die "Not a plain https origin: $ORIGIN."; }
check_repo() { is_repo "$REPO" || die "BOWER_GITHUB_REPO is not an owner/name repository."; }

# check_tools NAME...: each one is on PATH (looked up, never called).
check_tools() {
  local tool
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool is required."
  done
}

# A clean tree whose HEAD is the SHA asked for, which is local main's tip.
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

# The app, built with no API address (one origin).
build_app() {
  say "Installing and building $SHORT..."
  pnpm install --frozen-lockfile </dev/null || die "pnpm install failed."
  env -u VITE_API_URL pnpm build </dev/null || die "The build failed."
  [ -d dist ] || die "The build left no dist/ folder."
}

# scan LABEL PATH...: no address but you@example.com, nothing shaped like a
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

# check_upload_line OUTPUT WORKER OTHER OTHER_KIND: wrangler's upload line names WORKER. Extract it to ignore URLs
# that may hold another Worker's name, and match only "Uploaded <name> (" to skip lines like "Uploaded 6 of 10 assets".
check_upload_line() {
  local upload_line
  upload_line=$(printf '%s\n' "$1" | grep -E "^Uploaded [^ ]+ \(" | head -n 1 || true)
  if [ -z "$upload_line" ]; then
    die "Wrangler's output has no upload line for $2: check what was deployed."
  fi
  if ! printf '%s' "$upload_line" | grep -Eq "^Uploaded $2( |\$)"; then
    # The other Worker was deployed, which is a critical error.
    if printf '%s' "$upload_line" | grep -Eq "^Uploaded $3( |\$)"; then
      die "Wrangler uploaded $3 (the $4 Worker); only $2 is allowed here."
    fi
    die "Wrangler's output has no upload line for $2: check what was deployed."
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

# /health names the SHA; the first check after a deploy can still see the previous version.
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

# Version skew: /status without a cookie answers 401 JSON once the person objects run the new code.
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

# wrangler_run ARGS...: the pinned wrangler with no stdin, so it can never wait at a prompt (its prompts fall back to
# their defaults when stdin or stdout is no terminal). Prints its output, which is left in OUT; dies when it fails.
OUT=''
wrangler_run() {
  OUT=$("${WRANGLER[@]}" "$@" </dev/null 2>&1) || {
    say "$OUT"
    die "wrangler $1 failed."
  }
  say "$OUT"
}

# read_live OUTPUT: reads the versions `wrangler deployments status` lists after its "Version(s):" label, one
# "(NN%) <version id>" each (the deployment's own message comes before the label and can hold anything, even an id).
# Sets LIVE_LIST ("<id> NN%, ...") and LIVE_ONE, the id when exactly one version serves 100% and else empty.
LIVE_LIST=''
LIVE_ONE=''
read_live() {
  local pct id count=0 esc
  esc=$(printf '\033')
  LIVE_LIST=''
  LIVE_ONE=''
  while read -r pct id; do
    count=$((count + 1))
    LIVE_LIST="${LIVE_LIST:+$LIVE_LIST, }$id $pct%"
    if [ "$pct" = 100 ]; then LIVE_ONE=$id; fi
  done < <(
    printf '%s\n' "$1" | sed -E "s/$esc\\[[0-9;]*m//g" | sed -n '/^[[:space:]]*Version(s):/,$p' \
      | grep -E "^[[:space:]]*(Version\\(s\\):[[:space:]]*)?\\([0-9]+(\\.[0-9]+)?%\\)[[:space:]]+$UUID_RE" \
      | sed -E 's/^.*\(([0-9.]+)%\)[[:space:]]+([0-9a-fA-F-]+).*$/\1 \2/' | tr 'A-F' 'a-f' || true
  )
  if [ "$count" -ne 1 ]; then LIVE_ONE=''; fi
}
