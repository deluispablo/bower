**B1c index — adversarial review, pass 2 (scoped)**

**Verdict: BLOCK** — range `f7e210f7..5943ad89`.

Blocking findings:

- **runner/src/index.ts:136 — B1a MOC discovery remains incomplete.** An unchanged legacy MOC with valid `by: bower` frontmatter but no Drive `appProperties.by` is still skipped. Changing a sibling leaves it unmigrated and unfolded. An in-memory probe produced only index/retrieval targets; adding the Drive property discovered the same bytes. The regression fixture automatically supplies that property.
- **runner/src/main.ts:387 — Warm scoped runs gain unrelated reads.** `planningIndex` lists before the provider aims the reader at the admitted scope. The default `all` scope eagerly reads Inbox pile notes and declarations, even when both projections exist. A warm `instructions` probe changed from one listing to one listing plus an unrelated pile-note read. Warm-call preservation therefore fails in normal scoped use.

Verified:

- Same-run MOC maintenance uses settled text and version through the existing edit guard.
- Direct figures exclude descendant leaves; recursive membership remains intact.
- Cold planning receives the in-memory index; projection persistence remains in the final maintain effect.
- Pinned cold goldens gain exactly two reads; other phase counts remain unchanged.
- Both model-input goldens differ byte-for-byte only by the bootstrap `index` field.
- No second ownership parser, writer, projection builder, or maintenance lifecycle was added.

Minor / v1 limits:

- **runner/test/b1-index.test.ts:716:** Manifest-first tests pre-create record folders; they verify content ordering, not the first mutation in a fresh namespace.
- **src/data/contracts/ownership-format.ts:203:** Legacy Sources between Overview and Notes remains unsupported.
- **src/data/contracts/note-edit.ts:914:** Legacy Notes without a final newline still fails migration.
- **runner/src/index.ts:129:** Bootstrap reads and many MOC writes still lack an enforced 300-call ceiling.

Recorded runner evidence reports 624/624 passing. Review probes were offline and in memory; no files were edited.
