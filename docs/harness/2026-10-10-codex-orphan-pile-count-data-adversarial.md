Orphan pile count data — adversarial review, pass 1

Verdict: **BLOCK**
Range: `63f3a22e..e27373b4`

Blocking finding:

- **src/data/vault/drive-vault.ts:752**, via **src/data/pile-readiness.ts:312**:
  After a context-only Add commits its declaration but folder creation fails, a cold reload calls
  `journalValues(ix.journalFiles(true))`. This reads every active and archived JSON change before
  returning the summary. Unrelated history therefore increases Drive reads during ordinary failed-Add
  recovery, violating the history-flat requirement. Addendum 5’s declaration-read exception does not
  authorize this archive scan.
  Missing regression: cold `piles()`/`orphanSummary()` after this failure, comparing small and large
  unrelated archived-change histories.

Minor / v1 limits:

- **src/data/vault/drive-vault.ts:763**: Two such candidates sharing one rejected journal-read promise
  log the same failure twice; completeness correctly remains false.
- Damaged or foreign disposition stamps retire declarations under the authorized addendum 5 limit.
- Test repairs stay within addendum 5; other Home goldens remain unchanged.
- Second mechanism: **no**. Existing query, parsing, accounting and caches are reused; no new stored format.
- Validation was source review only; no tests ran and no files were edited.
