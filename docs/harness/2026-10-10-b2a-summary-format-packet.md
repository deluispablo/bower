# Packet: B2a, the summary scalar format (escalated: note format; TL-P4-42 Q1, Q2)

- **Entry:** `b2a-summary-format`. Worktree `/private/tmp/bower-b2a-summary-format`, branch `b2a-summary-format` from `claude/p3` (after C05). Escalated (note-format contract): Codex red session, Codex implementation (may not change the red), Codex read-only pass, fresh Claude review. `ui: false`. Runs beside B1a; it owns only `src/data/contracts/note-format.ts` and its test (lead, 2026-10-10).
- **Rulings:** TL-P4-42 Q1 and Q2 (`docs/harness/2026-10-10-tl-p4-42-b23-contract.md`); prep `docs/harness/2026-10-10-b23-prep.md` (S1, S3, the B2a row).
- **Research first:** cite YAML 1.2.2 (flow scalars: plain-scalar restrictions, double-quoted escapes) for when a value must be quoted and how it is escaped and decoded.

## Contract (format only)

1. **Serialize.** `summary:` is written as one line. It stays a plain scalar when YAML reads it back unchanged. Otherwise it is double-quoted with YAML escapes, for example:
   - `: ` or ` #` inside the value;
   - a leading indicator (`-?:,[]{}#&*!|>'"%@` and the backtick);
   - leading or trailing spaces;
   - a value YAML would read as another type (`true`, `null`, `~`, `123`, `1e3`, `0x1f`, `.inf`, a date);
   - quotes and backslashes.
2. **Parse.** `parseNote` decodes a double-quoted or single-quoted `summary` to its exact text. Plain values parse as today. Notes written before this entry parse to the same `summary` as before; old fixtures are unchanged.
3. **Round trip.** For any one-line summary of at most 200 characters, `serializeNote` then `parseNote` gives back the same text. This includes Unicode, emoji, colons, hashes, quotes and backslashes.
4. **Validation (Q1).** A `validSummary` check passes only text that is one line, not empty after trimming, free of control characters, and at most 200 characters. Line breaks are refused, never folded. Callers (B2b) use it; this entry adds no callers.
5. **Out of scope:**
   - no new routes and no summary authoring (B2b), and no script first-sentence fallback (B2b);
   - no change to existing-note edits (B2c);
   - a person's note never gains a summary (Q2);
   - mechanism files keep their formats;
   - Rules keeps its generated count summary.
   Compatibility rows go in for the `src/data/contracts` commits.

## Reds (a separate Codex session, `src/data/vault/note-format.test.ts`)

Each point has a red with a positive control: the quoting table, row by row; quoted-scalar decoding; byte-identical parse of old fixtures; a property-style round trip over generated one-line strings (fast-check if the repo already uses it); and validSummary's accept and refuse cases. Made-up data only.

## Verify

The reds by exact name, then `pnpm check`.

## Commits

The red (tests only), then the fix, then the notes (`docs/harness/2026-10-10-b2a-summary-format-notes.md`, line 3 `implementer: codex`, `removed:` lines, compatibility rows).
