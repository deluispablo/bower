#!/usr/bin/env bash
# Greps every tracked file for personal data and secret-shaped strings
# before it can land in the public repo.
#
#   scripts/check-sanitized.sh
#
# or via pnpm from anywhere in the repo:
#
#   pnpm check:sanitized
#
# Scans `git ls-files`, skipping pnpm-lock.yaml (regenerated, never hand
# read), binary files, app/public/icons/ and docs/assets/. Checks each
# remaining tracked file for:
#   - @gmail.com / @googlemail.com addresses (case-insensitive)
#   - token-shaped strings: github_pat_, sk-ant-, ya29., AIza prefixes
#   - Drive folder ids: exactly 33 chars of [A-Za-z0-9_-] with a
#     non-id-char (or line start/end) on both sides, so a 40-char git SHA
#     or a 64-char sha256 never matches
#
# Prints "file:line: <pattern>" for every hit and exits 1. Token-shaped
# hits are masked to their first 6 characters; email and id hits show the
# full line, which is safe to read but must never be committed. Exits 0
# silently when the tree is clean.
#
# Plain POSIX-ish bash on purpose (no associative arrays), so it also
# runs under macOS's stock bash 3.2.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
cd "$ROOT"

found=0

# --- allowlist -----------------------------------------------------------
# Fixed strings that would otherwise match a pattern below but are
# documented placeholders, not real personal data or secrets. Exact
# strings only, each with a one-line reason. Extend sparingly.

is_allowlisted() {
  local value_lc
  value_lc=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  case "$value_lc" in
    you@example.com) return 0 ;; # CLAUDE.md's documented placeholder email
    *@example.com) return 0 ;; # any address at the documented placeholder domain
    *@users.noreply.github.com) return 0 ;; # GitHub's own noreply format, used for git identity
    sk-ant-test-key) return 0 ;; # api/test/settings.test.ts fixture: an obviously fake key, never a real one
    sk-ant-test) return 0 ;; # app/test/api.test.ts fixture: an obviously fake key, never a real one
    github_pat_replace) return 0 ;; # docs/runbook.md's documented placeholder "github_pat_replace-me" for GITHUB_TOKEN (pattern stops before the hyphen)
    sk-ant-replace-me) return 0 ;; # docs/runbook.md's documented placeholder value for ANTHROPIC_API_KEY
    *) return 1 ;;
  esac
}

# --- scanning --------------------------------------------------------------

# Prints one "file:line: name: ..." per hit for $regex (extended regex) in
# $file. $ci: "yes" to match case-insensitively. $mask: "yes" to print only
# the match's first 6 characters instead of the full line.
scan_pattern() {
  local file="$1" name="$2" regex="$3" ci="$4" mask="$5"
  local grep_opts='-noE'
  [ "$ci" = yes ] && grep_opts='-noEi'
  local out
  out=$(grep "$grep_opts" "$regex" "$file" 2>/dev/null || true)
  [ -z "$out" ] && return 0
  local entry lineno match line
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    lineno="${entry%%:*}"
    match="${entry#*:}"
    is_allowlisted "$match" && continue
    if [ "$mask" = yes ]; then
      printf '%s:%s: %s (redacted, starts "%s...")\n' "$file" "$lineno" "$name" "${match:0:6}"
    else
      line=$(sed -n "${lineno}p" "$file")
      printf '%s:%s: %s: %s\n' "$file" "$lineno" "$name" "$line"
    fi
    found=1
  done <<EOF
$out
EOF
}

check_file() {
  local file="$1"
  scan_pattern "$file" 'gmail/googlemail email' \
    '[A-Za-z0-9._%+-]+@(gmail|googlemail)\.com' yes no
  scan_pattern "$file" 'github_pat_ token' \
    'github_pat_[A-Za-z0-9_]+' no yes
  scan_pattern "$file" 'sk-ant- token' \
    'sk-ant-[A-Za-z0-9_-]+' no yes
  scan_pattern "$file" 'ya29. token' \
    'ya29\.[A-Za-z0-9_-]+' no yes
  scan_pattern "$file" 'AIza token' \
    'AIza[A-Za-z0-9_-]+' no yes
  scan_pattern "$file" 'Drive folder id' \
    '(^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{33}([^A-Za-z0-9_-]|$)' no no
}

while IFS= read -r file; do
  [ -z "$file" ] && continue
  case "$file" in
    pnpm-lock.yaml) continue ;;
    app/public/icons/*) continue ;;
    docs/assets/*) continue ;;
  esac
  [ -f "$file" ] || continue
  # -I: skip binary files instead of reading them as text.
  grep -Iq . "$file" 2>/dev/null || continue
  check_file "$file"
done < <(git ls-files)

exit "$found"
