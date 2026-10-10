**upload-sign-out-forget — adversarial review, pass 2**

Verdict: **BLOCK**

1. **Blocking — `src/data/upload-queue.ts:733, :951`; `src/data/upload-store.ts:246–260`: Cross-tab staging can still resurrect uploads.** Tab B starts adding a file and awaits `storage.estimate()`. B pauses; tab A signs out or encounters auth expiry. Forgetting awaits only A’s staging. When B’s estimate resolves, its store captures the already-incremented forget version and accepts the late write. B’s generation check rejects the add afterward, leaving its metadata and bytes behind.

   Reproduced through both production entry points with real queues and shared fake IndexedDB: **zero records when sign-out/auth expiry finishes, then one record and 15 bytes restored**, despite B reporting “Bower stopped…”.

   Missing regression: cross-tab forgetting while storage estimation or reselection hashing precedes `store.add()`.

**Minor / v1 limits**

- Prior blocker 2 is repaired: live sign-out awaits same-queue staging and cleanup; removal failure surfaces as the required purge BowerError.
- Account/folder isolation, journal retention and ordinary disposal are unchanged by this scoped diff.
- No new object store or second upload-retention home.
- `8e09460c` changes only barrier timing; assertions and bounds remain intact.
- Full gates were not rerun. Reproductions ran entirely in memory; no files edited or network used.
