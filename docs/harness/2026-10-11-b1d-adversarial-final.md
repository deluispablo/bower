# B1d adversarial pass (Codex, read-only) on ba586898

- **Important — runner/src/claude.ts:1404:** For source words “Remote developer offer,” `Garden.md` is absent from its script candidates but remains indexed. Selecting its id succeeds and exposes its full text to execution. With 31 matches, a new parent omitted by the 30-candidate cap also passes the visibility check at line 1418.

- **Important — runner/src/claude.ts:1422:** Select five evidence notes, excluding the destination hub. Validation accepts five, then adds the hub to `allowedTargets`. Execution reads all six full notes. Reproduced with one words-only source.

- **Important — runner/src/claude.ts:1507:** Admit a valid yes answer for merging A/B; selection returns `{"items":[],"asks":[]}`. Execution supplies `keep:[{kept:"Projects/Offers/A.md",other:"Projects/Offers/B.md"}]`. The provider produces a manifest editing A and binning B despite empty selection authority.

- **Important — runner/src/claude.ts:1341:** Admit 201 valid stored answer records for one shown-state question, with no piles. The no-model branch returns a **203-operation manifest**, bypassing `requireOperations`. Those records can be consumed instead of remaining untouched on ledger exhaustion.

- **Important — runner/src/model-input.ts:34:** In a cut context with id-only candidate rows, change a matching note’s link from `[[Garden]]` to `[[Garden2]]`. Script candidates change accordingly, but normalization collapses both ids to `ID`; the fingerprints are identical. Reproduced through provider input generation.

- **Important — runner/src/claude.ts:1420:** With existing sibling `Developer offers`, propose `Developer  offers` under a visible parent. The comparison preserves internal whitespace, accepts this near-duplicate and starts execution.

- **Important — src/data/vault/vault-index.ts:136:** A folder contains matching `Offer.md` and `Contents.md` with parsed `type: moc` and summary “Contents of this folder.” Neighbourhood construction ignores the parsed type and returns only the matching note, omitting its folder’s MOC.

No second planner, cache, ledger, writer or pending store found.

verdict: BLOCK
