**B1a-contract adversarial review — pass 2**

Verdict: **BLOCK** — `254e728f..baf0432d`

**Blocking**

- `runner/src/index.ts:65`, `:101`: Feed reconciliation admits binned files into the maintenance snapshot. Edit an indexed note, then move it to the Bin after the planner’s cached listing and before the feed read. Through production `main`, maintenance attempts to read the binned note, ends `failed`, and leaves retrieval unchanged. The concurrent-edit red lacks this ordinary edit-then-Bin scenario.

The five scoped red bodies fail before the fix and pass at HEAD in an in-memory harness. Red repair 5 loosened no assertions; subsequent commits preserve those tests. Measured call goldens remain **88/99**. Hub recognition, hidden-path filtering, and manifest satisfaction reuse their existing mechanisms; no second mechanism found.

**Minor / v1 limits**

- `runner/src/index.ts:84`: Unresolved account-feed entries, including unrelated Drive changes, keep the cursor pinned indefinitely.
- `runner/src/index.ts:103`: Full-note reads still record coverage as a 4,096-byte prefix.

Read-only, offline verification; no files edited.
