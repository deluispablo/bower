**upload-resume-after-reload — adversarial review, pass 3 (scoped)**

Verdict: **BLOCK**  
Range: `5e6bbaf9..b8e82bde`

Blocking findings:

- **src/data/upload-queue.ts:302:** Reload a second tab while the first sends a two-member pile.
  The observer hydrates the later sibling with `fileId: null`. The owner reserves its ID and completes it,
  then removes its record. Reconciliation skips that sibling forever.
  It remains “uploading” at 0%; refreshing lists both the arrived file and its pending row.
  When the owner closes and the observer takes ownership, the queue treats its absent bytes as lost
  (**:435–443**). `piles()` then returns `chooseAgain: true` and `setAside: 'not-arrived'`,
  although both files arrived. Confirmed through public queue/vault calls with deterministic barriers,
  real queue, FakeDrive and fake IndexedDB.
  Missing regression: cross-tab completion of a staged sibling whose reserved ID the observer never learned.

Minor / v1 limits:

- The five fix-round cases pass in read-only, in-memory probes; assertions and numeric bounds are unchanged.
- Pending read-back survives halt; discard and account forgetting prevent late reconciliation from resurrecting it.
- No second queue, store, protocol or state machine added.
- Full check/e2e were not run. No files edited; no network used.
