**upload-sign-out-forget — adversarial review, pass 1**

Verdict: **BLOCK**

1. **Blocking — src/data/upload-queue.ts:913, :295:** The forget fence belongs to one queue instance. While tab B stages a file, sign out in tab A; B’s later write sees no changed fence and restores the account’s metadata and bytes. Reproduced through `LiveSources.session.signOut()` with two real queues sharing fake IndexedDB: zero records at sign-out, then one record and 15 bytes restored. Missing test: cross-tab staging during sign-out/auth expiry.

2. **Blocking — src/data/upload-queue.ts:300, :831, :916:** Forgetting returns before outstanding staging and its cleanup finish. If the late cleanup’s `store.remove()` fails, its error is logged and swallowed by `add`; sign-out has already reported success while bytes remain. Reproduced through live sign-out with a delayed Blob read and injected removal failure: one record and 15 bytes retained; the add reports “Bower stopped…” instead of sign-out reporting the required purge failure. Missing test: late cleanup failure after successful clear.

Contract items: 1 FAIL; 2 FAIL; 3 PASS; 4 PASS by inspection.
Second store/mechanism: **No**; existing queue/store homes are reused.
Existing test changes follow Q1 and preserve unrelated assertions.

**Minor / v1 limits**

- `pendingCount()` has no direct behavioral test.
- Notes report full check and demo/fake e2e blocked by socket restrictions; those gates remain unverified.

No files edited; no network used.
