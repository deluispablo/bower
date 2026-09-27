#!/usr/bin/env bash
# agent/scan.sh: best-effort pre-scan for prompt-injection patterns.
#
#   scan.sh <dir> [<dir> ...]
#
# Walks each <dir> for text files (.md .txt .html .htm .csv .json .eml, any
# letter case), skipping anything under a Processed/ or Quarantine/
# directory, and prints the path of every one that reads like an
# instruction aimed at an assistant, one per line, sorted, relative to
# however <dir> was given. agent/run.sh passes 0-Inbox and Clippings from
# inside the vault directory, so the printed paths come out vault-relative.
#
# Heuristics, case-insensitive (see docs/security.md):
#   - an imperative aimed at an assistant: "ignore (all|any|the)
#     (previous|prior|above) instructions", "you are now", "system
#     prompt", "as an ai"
#   - a role marker: "<|im_start|>" anywhere, or a line starting with
#     "### instruction" or "assistant:"
#   - an HTML comment, or an element hidden with display:none or the
#     boolean "hidden" attribute, whose own line also carries one of the
#     imperatives above
#   - a zero-width or bidi control character: U+200B-200F (zero-width
#     space/joiners, LRM, RLM), U+202A-202E (bidi embedding/override
#     marks), U+2060 (word joiner), U+FEFF (zero-width no-break
#     space / BOM)
#   - a run of more than 200 base64-alphabet characters
#
# Detection is best-effort: a false positive costs one manual move back
# out of Quarantine/, so the heuristics stay narrow rather than clever.
# Pure bash, grep and awk; no network, no other interpreter. Always exits
# 0 (a file this can't read is not a run failure).

set -euo pipefail
export LC_ALL=C

if [ "$#" -lt 1 ]; then
  printf 'usage: scan.sh <dir> [<dir> ...]\n' >&2
  exit 0
fi

# An imperative aimed at an assistant.
readonly IMPERATIVE_RE='ignore (all|any|the) (previous|prior|above) instructions|you are now|system prompt|as an ai'

# Role markers. "<|im_start|>" anywhere; "### instruction" and
# "assistant:" only at the very start of a line (grep's ^ anchors per
# line, so this does not need a multiline flag).
readonly ROLE_RE='<\|im_start\|>|^### instruction|^assistant:'

# A line that looks like an HTML comment, or an element hidden with
# display:none or the boolean "hidden" attribute.
readonly HIDDEN_CONTEXT_RE='<!--|display:[[:space:]]*none|<[^>]*[[:space:]]hidden([[:space:]=>]|$)'

# Zero-width and bidi control characters, matched as their literal UTF-8
# byte sequences (LC_ALL=C above makes grep compare raw bytes), so a
# plain ERE grep finds them with no -P/PCRE dependency:
#   U+200B-200F  zero-width space/joiners, LRM, RLM   (e2 80 8b-8f)
#   U+202A-202E  bidi embedding/override marks        (e2 80 aa-ae)
#   U+2060       word joiner                          (e2 81 a0)
#   U+FEFF       zero-width no-break space / BOM      (ef bb bf)
readonly ZW_BIDI_RE=$'\xe2\x80[\x8b-\x8f]|\xe2\x80[\xaa-\xae]|\xe2\x81\xa0|\xef\xbb\xbf'

# More than 200 characters of the base64 alphabet in a row.
readonly BASE64_RE='[A-Za-z0-9+/]{201,}'

is_flagged() {
  local f=$1
  grep -qisE -- "$IMPERATIVE_RE" "$f" && return 0
  grep -qisE -- "$ROLE_RE" "$f" && return 0
  grep -isE -- "$HIDDEN_CONTEXT_RE" "$f" 2>/dev/null | grep -qisE -- "$IMPERATIVE_RE" && return 0
  grep -qsE -- "$ZW_BIDI_RE" "$f" && return 0
  grep -qsE -- "$BASE64_RE" "$f" && return 0
  return 1
}

flagged=()
for root in "$@"; do
  [ -d "$root" ] || continue
  while IFS= read -r -d '' path; do
    if is_flagged "$path"; then
      flagged+=("$path")
    fi
  done < <(find "$root" -type f \
    \( -iname '*.md' -o -iname '*.txt' -o -iname '*.html' -o -iname '*.htm' \
       -o -iname '*.csv' -o -iname '*.json' -o -iname '*.eml' \) \
    ! -path '*/Processed/*' ! -path '*/Quarantine/*' -print0)
done

if [ "${#flagged[@]}" -gt 0 ]; then
  printf '%s\n' "${flagged[@]}" | LC_ALL=C sort
fi

exit 0
