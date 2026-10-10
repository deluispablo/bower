b2a-summary-format — adversarial review, pass 2
Verdict: BLOCK

**Blocking — finding 1 remains incomplete.** `src/data/contracts/note-format.ts:277`: byte preservation depends on object identity. With no field changed, `serializeNote({...parseNote('Personal.md', raw)})` rewrites:

- `summary: "a\u0041b"` → `summary: aAb`
- `summary: 'Alex''s note.'` → `summary: "Alex's note."`

Both inputs omit `by: bower`. The ruling forbids rewriting a person’s note bytes. `src/data/vault/note-format.test.ts:145` pins only the original object; an untouched-copy regression test is missing.

Findings 2–4 are fixed and pinned. Focused checks passed for both YAML schemas, literal separators, and all 2,048 lone-surrogate units. Red changes loosen no assertions beyond the ruling.

Minor:

- `src/data/vault/note-format.test.ts:182`: surrogate tests pin rejection, but omit the original direct serializer round trip; that behavior passed independently.
- Second YAML mechanism: no; the repair reuses the existing parser and serializer.
