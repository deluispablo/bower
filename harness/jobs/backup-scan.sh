#!/usr/bin/env bash
# Scan the history newly reachable from main (since the backup SHA) for secrets and personal data.
# usage: backup-scan.sh <old backup sha>
set -uo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)" # the main checkout this script lives in
old="$1"
echo "commits: $(git -C "$repo" rev-list --count "$old"..main)"
echo "== secret-like files added"
git -C "$repo" diff --name-only --diff-filter=A "$old" main | grep -E -i '(^|/)\.env|\.pem$|\.key$|credential|secret|\.p12$|id_rsa' || echo none
echo "== secret-like strings in added lines"
git -C "$repo" diff "$old" main | grep -E '^\+' | grep -E -n '(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_-]{20,}|xox[bap]-[0-9A-Za-z-]{10,}|refresh_token"?\s*[:=]\s*"[^"]{20,})' | head -5 || true
echo "== addresses other than made-up ones"
git -C "$repo" diff "$old" main | grep -E '^\+' | grep -E -o '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | grep -v -E '@(example\.(com|org|net)|users\.noreply\.github\.com|anthropic\.com)$' | sort -u | head -10
echo "== staging origin"
git -C "$repo" diff "$old" main | grep -E '^\+' | grep -c 'bower-staging' || true
echo scan-done
