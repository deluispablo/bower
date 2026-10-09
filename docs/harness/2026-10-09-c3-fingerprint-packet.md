# Packet: c3-fingerprint (stage 3)

- **Entry:** `c3-fingerprint`. Ruling: TL-P4-14 stage 3 row ("the input fingerprint hashes a normalized object, not regex-edited JSON"). Worktree `/private/tmp/bower-c3-fp`, branch `c3-fingerprint` from `claude/p3`.
- **Starting model:** `bower-mechanical` (one file, a clear failing test).
- **Today:** `runner/src/model-input.ts` `normalizeModelInput(text)` runs six regex replaces on the JSON text (runId, admission, pileId, fileId, id, at). Its callers are `runner/src/claude.ts:194` and `:1020`. A note body or line holding `"id":"x"` as text is rewritten too.

## Contract

- Normalize the parsed object: walk it and set those keys to fixed values at any depth, then serialize it with stable key order and hash it. The model input itself is unchanged; only the fingerprint changes how it is made.
- Same fingerprint for the same case with other ids (today's tests stay green). Text values are never edited.
- Timing line format unchanged (`input=` field). `removed: <lines>` on the card.

## Red

"a value that looks like an id inside text is kept". It fails today.

## Verify (exact, from features.json)

`pnpm -C runner exec vitest run test/model-input-fingerprint.test.ts -t` with:
- "the same case with other ids has the same fingerprint" (rename the existing equivalent test to this name if needed; say so on the card)
- "a value that looks like an id inside text is kept"

Then `pnpm check` must be green.

## Checklist

- Commits: red, then fix, then notes in their own commit.
- Research first: cite RFC 8785 (JSON canonicalization) for stable key order.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
