**upload-sign-out-forget — adversarial review, pass 3 (scoped)**

Verdict: **BLOCK**

**Blocking — `src/data/vault/drive-vault.ts:487, :1724`; `src/data/upload-queue.ts:847`; `src/data/upload-store.ts:264`: Undo can resurrect forgotten uploads.**

Tab B removes a pile containing a pending upload, then begins Undo. Pause its successful `untrash` response. Tab A completes sign-out; the account’s device store is empty. Release B: restore re-enqueues the retained Blob, capturing the **new** forget version. The transaction accepts it.

Reproduced entirely in memory through two real live sources, real queues and shared fake IndexedDB:

- Before removal: one pending record.
- After sign-out finishes: zero records and no bytes.
- After Undo settles: **one record and 15 original bytes restored**.
- Capture instrumentation confirms Undo’s admission occurs after forgetting finishes.

Missing regression: cross-tab sign-out/auth expiry while Undo awaits, before re-enqueuing pending bytes. This remains pass 2’s late-capture class and needs the lead’s ruling.

**Minor / v1 limits**

- Direct add/reselection captures precede estimation and hashing; four in-memory barrier checks passed.
- Transactional fencing, retry/resume/reload and other-account/folder controls passed those checks.
- No new object store or second retention home; `82bd64a7` loosens no existing assertion.
- Full gates were not rerun. No files edited or network used.
