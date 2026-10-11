**B5a contracts — adversarial review, pass 1**

**Verdict: PASS**

No Blocking normal-use defect or broken hard rule found. No second writer, question store, or ownership parser added.

Minor / v1 limits:

- `src/data/contracts/run-manifest.ts:709`: exact payload comparison uses report questions. A manifest storing a different valid payload in `questions.json` still admits; the persisted question is not cross-checked.
- `src/data/vault/layout.ts:117`: six stored open proposals validate. The admission/display bounds do not enforce the complete open-history cap or declined-payload suppression. The notes defer this lifecycle to B5b.
- `src/data/contracts/note-edit.ts:134`: any wikilink satisfies the profile citation guard, including one unrelated to the claims. Semantic grounding remains B5c’s responsibility.

Validation: 41 in-memory assertions passed for row ordering, seeds, bounds, columns, grouping, answers, and profile protection. Old-manifest and positive proposal-admission controls passed. No files edited, network used, or builds run.

Range: `6384ffe1...770438b6` (`claude/p3...HEAD`, scoped to `src runner`).
