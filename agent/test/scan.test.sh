#!/usr/bin/env bash
# Hermetic test for agent/scan.sh: runs it over the twenty fixtures in
# fixtures/scan/ (ten that must be flagged, one per heuristic or a
# variant of one; ten that must not, including the exact near-misses the
# issue names: a recipe that says "ignore the previous step", a note
# about prompt engineering, a long URL, an emoji-heavy note) and diffs
# its output against the expected list. No network, no external
# interpreter beyond bash/grep/awk.
#
# Prints "ok scan fixtures" and exits 0 on success; on a mismatch, prints
# a diff and exits non-zero.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCAN_SH="$HERE/../scan.sh"
FIXTURES="$HERE/fixtures/scan"
EXPECTED="$FIXTURES/expected-flagged.txt"

cd "$FIXTURES"
set +e
actual=$(bash "$SCAN_SH" should-flag should-not-flag)
rc=$?
set -e

if [ "$rc" -ne 0 ]; then
  echo "FAIL: scan.sh exited $rc, expected 0" >&2
  exit 1
fi

expected=$(cat "$EXPECTED")
if [ "$actual" != "$expected" ]; then
  echo "FAIL: scan.sh output does not match fixtures/scan/expected-flagged.txt" >&2
  diff <(printf '%s\n' "$expected") <(printf '%s\n' "$actual") >&2 || true
  exit 1
fi

# Every flagged path must be under should-flag/: a benign fixture that
# got caught would show up here as a path under should-not-flag/.
if printf '%s\n' "$actual" | grep -qv '^should-flag/'; then
  echo "FAIL: a should-not-flag/ fixture was flagged" >&2
  printf '%s\n' "$actual" | grep -v '^should-flag/' >&2
  exit 1
fi

flagged_count=$(printf '%s\n' "$actual" | grep -c . || true)
[ "$flagged_count" -eq 10 ] || {
  echo "FAIL: expected 10 flagged fixtures, got $flagged_count" >&2
  exit 1
}

echo "ok scan fixtures"
