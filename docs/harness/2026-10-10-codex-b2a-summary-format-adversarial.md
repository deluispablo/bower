b2a-summary-format — adversarial review
Verdict: BLOCK

1. **Blocking — legacy summaries change meaning.** `src/data/contracts/note-format.ts:64`: existing `summary: "a\u0041b"` → old reader: literal `a\u0041b`; new reader: `aAb`. An untouched parse→serialize also writes `summary: aAb`. Line 63 similarly changes `'Alex''s note.'` from `Alex''s note.` to `Alex's note.`. Packet point 2 requires unchanged legacy summaries; the legacy red at `src/data/vault/note-format.test.ts:82` omits recognized escapes and doubled apostrophes.

2. **Blocking — YAML 1.1 readers reinterpret plain summaries.** `src/data/contracts/note-format.ts:74`: text `yes`/`no`/`on`/`off` → unquoted scalars → booleans in the installed YAML reader’s 1.1 mode. Likewise `0b11` → number `3`, `1_000` → `1000`, and `12:30` → `750`. The control at `src/data/vault/note-format.test.ts:54` explicitly requires unsafe boolean spellings to remain plain.

3. **Blocking — accepted strings lose surrogate units.** `src/data/contracts/note-format.ts:87`: JavaScript input `a\uD800b` → serialized with a literal lone surrogate → `parseNote` returns `a\uFFFDb`. `validSummary` accepts this input. The generated red at `src/data/vault/note-format.test.ts:106` excludes lone surrogates, leaving packet point 3’s round-trip guarantee unenforced.

4. **Blocking — quoted Unicode separators retain their quotes.** `src/data/contracts/note-format.ts:61`: `summary: "a<U+2028>b"` → summary `"a<U+2028>b"` including surrounding quotes, instead of `a<U+2028>b`. U+2029 and single quotes fail identically because regex `.` excludes these characters. The installed YAML 1.2 reader decodes them correctly. The decoding reds cover escaped separators only.

Minor:

- `src/data/contracts/note-format.ts:254`: untouched `summary: true` → `summary: "true"`; byte preservation on existing-note edits remains outside this packet.
- Second YAML mechanism: no; the change extends the existing note-format home.
- Controls and multiline validation passed; the boundary counts untrimmed UTF-16 units: 100 emoji pass, 101 fail.
