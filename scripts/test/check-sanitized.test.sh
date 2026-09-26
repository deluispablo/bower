#!/usr/bin/env bash
# Hermetic test for scripts/check-sanitized.sh. Each case creates a
# throwaway git repo with the real script copied to scripts/check-sanitized.sh
# inside it (the script finds "its" repo root next to itself), commits one
# file, and checks the exit code and, where relevant, that the offending
# file is named in the output.
#
# Prints "ok <case>" per case and exits non-zero on the first failure.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT_SRC="$HERE/../check-sanitized.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

REPO="$WORK/repo"
RC=0
OUT=''

new_repo() {
  rm -rf "$REPO"
  mkdir -p "$REPO/scripts"
  cp "$SCRIPT_SRC" "$REPO/scripts/check-sanitized.sh"
  (
    cd "$REPO"
    git init -q
    git config user.email test@example.com
    git config user.name test
    git config core.autocrlf false
    git add scripts
    git commit -q -m init
  )
}

# Writes $2 to $1/$3, commits it, then runs the script and records $RC/$OUT.
commit_and_run() {
  local file="$1" content="$2"
  printf '%s\n' "$content" >"$REPO/$file"
  (cd "$REPO" && git add "$file" && git commit -q -m "add $file") 2>/dev/null
  RC=0
  OUT=$(cd "$REPO" && bash scripts/check-sanitized.sh 2>&1) || RC=$?
}

die() {
  echo "FAIL: $1" >&2
  [ -n "$OUT" ] && printf '%s\n' "$OUT" >&2
  exit 1
}

expect_eq() { [ "$1" = "$2" ] || die "$3: expected [$2], got [$1]"; }
expect_contains() {
  printf '%s' "$OUT" | grep -qF -- "$1" || die "output does not contain [$1]: $OUT"
}

# --- 1. a clean file: exit 0 -------------------------------------------

new_repo
commit_and_run clean.txt 'nothing interesting here'
expect_eq "$RC" 0 'exit code'
echo "ok clean file exits 0"

# --- 2. a gmail address: exit 1, names the file -------------------------
#
# Built from separate local-part and domain variables, not one literal
# email string in this file, so this fixture doesn't trip the sanitize
# gate when it scans this repo.

new_repo
gmail_local='someone'
gmail_domain='gmail.com'
commit_and_run leak.txt "contact ${gmail_local}@${gmail_domain} about the vault"
expect_eq "$RC" 1 'exit code'
expect_contains 'leak.txt'
expect_contains 'gmail'
echo "ok gmail address exits 1 and names the file"

# --- 3. a 33-char id: exit 1 ---------------------------------------------
#
# Built with printf (not a literal 33-char run in this file), same reason.

new_repo
id_stub=$(printf 'A%.0s' {1..33})
commit_and_run idfile.txt "folder id ${id_stub} end"
expect_eq "$RC" 1 'exit code'
expect_contains 'idfile.txt'
echo "ok 33-char id exits 1"

# --- 4. you@example.com plus a 40-char hex sha: exit 0 -------------------

new_repo
commit_and_run shafile.txt 'you@example.com fixed aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
expect_eq "$RC" 0 'exit code'
echo "ok allowlisted email plus a git sha exits 0"

echo DONE
