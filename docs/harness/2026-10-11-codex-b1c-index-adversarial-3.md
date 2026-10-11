**B1c index — adversarial review, pass 3 (scoped)**

**Verdict: BLOCK** — `5943ad89..a79d292a`

Blocking finding:

- **runner/src/index.ts:137 — Warm runs still gain calls during maintenance.** With both projections present, change an ordinary personal note that the provider does not read. Offline `main` probes in both `instructions` and `all` reached `done`: pre-addendum-9 made one media request; HEAD makes a metadata precheck plus a prefix-media request. That is **one extra Drive call per changed note on a warm run**, violating warm-call preservation and the cold-only count ruling.

Verified:

- Owner/type use the existing bounded prefix and versioned cache; no `mocChecked` discovery pass.
- Cold Bower MOC probe migrates with two media requests. Personal MOC remains byte-identical; damaged framing refuses without mutation.
- Test repairs stay within addenda 10/11; cold pins match the authorized values.
- No second ownership parser, cache, writer, or maintenance lifecycle.

Minor / v1 limits:

- **runner/test/b1-index.test.ts:905:** Warm controls capture calls before maintenance and leave indexed notes unchanged, so they miss the blocker.
- **src/data/contracts/note-format.ts:171:** Front matter extending beyond 4,096 bytes remains the accepted discovery limit.

Review and probes were offline and in memory. No files were edited.
