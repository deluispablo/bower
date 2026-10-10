**Orphan pile count data — adversarial pass 2, scoped**

Verdict: **BLOCK**  
Range: `1decc027..a8dc02d7`

Blocking finding:

- **src/data/vault/drive-vault.ts:621**, via **:938**: An anchored pile with missing context still calls `journalValues(ix.journalFiles(true))`, reading every archived change. Normal reproduction: a context-only Add creates its folder, then loses connectivity during the context write and cleanup Bin attempt (**:1074**, **:1078**). Cold `piles()` reads the surviving folder and scans the archive; `orphanSummary()` also reaches this path (**:731**). Unrelated history therefore increases reads, violating the scoped history-flat rule.
  Missing regression: compare 2 versus 200 archived changes after context-write and cleanup failure, asserting zero archived reads.

The original unanchored failed-Add finding is fixed at **:755** and pinned by **src/data/orphan-pile-count.test.ts:155**. Its shared journal failure now logs once. Existing reds retain their assertions; Home’s only test change corrects the rooted path regex, with golden counts unchanged. Second mechanism: **no**.

Minor / v1 limits:

- Validation was source review only; no tests ran, no network was used, and no files were edited.
