# B1c index — adversarial review, pass 1

**Verdict: BLOCK**

Blocking findings:

- **runner/src/index.ts:283 — Maintenance rejects the run’s own earlier MOC edit.** After a settled link rewrite changes a MOC, maintenance computes from the new text but sends the original `beforeContent` and version. The ordinary guard rejects it; maintenance throws before committing retrieval or reporting. An in-memory probe reproduced this. Missing test: link rewrite followed by MOC maintenance in the same run.

- **runner/src/index.ts:185 — Existing B1a state prevents MOC discovery.** B1a retrieval entries have no `moc` metadata. For an unchanged MOC, maintenance skips its content read and therefore declares no MOC target. Changing another note leaves that existing MOC unmigrated and its folder unfolded. An in-memory probe produced only index/retrieval targets. Missing test: upgrade from B1a retrieval state containing an unchanged legacy MOC.

- **src/data/contracts/note-edit.ts:1116 — Descendant leaves inflate the direct count.** With `Garden/Seed.md` and `Garden/Deep/Leaf.md`, without a child MOC, figures say “2 direct notes” although only Seed is directly in Garden. The probe reproduced this; 40 direct notes plus descendant leaves likewise exceeds the stated direct count. Missing test: nested notes without a child map.

- **runner/src/main.ts:386 — Missing projections are rebuilt after planning.** The provider completes before `withMaintenance` runs, and rebuilding occurs during effect application. On bootstrap or a missing-index run, planning therefore cannot see the required rebuilt index/state. This remains the packet’s unmet before-planning contract.

Minor / v1 limits:

- **src/data/contracts/ownership-format.ts:203:** A legacy MOC with `## Sources` between Overview and Notes is not migrated despite having both required headings.
- **src/data/contracts/note-edit.ts:914:** Legacy Notes ending without a newline admits a snapshot but produces an invalid concatenated closing marker; maintenance throws.
- **src/data/contracts/ownership-format.ts:264:** An indented malformed ownership control outside complete frames is accepted as `v2`; the probe confirms refusal was loosened beyond ordinary outside prose.
- **runner/src/index.ts:170:** Bootstrap reads and MOC updates have no enforced 300-call ceiling; the seeded budget test does not cover that limit.

No second ownership parser, writer, or runner-side report builder was added. Drive-call goldens are unchanged; reviewed assertion repairs otherwise match the rulings. Review and probes were offline and read-only; no files were edited.
