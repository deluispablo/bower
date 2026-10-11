**upload-resume-after-reload — adversarial review, pass 2**

Verdict: **BLOCK**  
Range: `dfa2f8de..53de9271`

Blocking findings:

- **src/data/vault/drive-vault.ts:718:** The completion window remains in a non-owning tab. While its first folder-declaration read waits, another tab finishes the retained upload and broadcasts completion. Queue reconciliation marks the member `done` before awaiting `getUploaded()` (**src/data/upload-queue.ts:296–305**). Release the declaration answer while that read-back remains pending: `queuedItems()` excludes the member, and the new guard ignores it because `file` is absent. `piles()` returns `chooseAgain: true` and `setAside: 'not-arrived'`. Confirmed through public entry points, the real queue, fake Drive and fake IndexedDB with deterministic barriers and no filesystem writes. Missing regression: another tab’s completion during the first declaration read, with read-back outstanding.

Minor / v1 limits:

- Pending-member control and same-tab completion during declaration read pass read-only probes; reserved identity, bytes and single-file arrival hold.
- The red adds two tests; existing assertions and numeric bounds are unchanged.
- No second queue, store, protocol, picker or duplicate-upload mechanism added.
- Full check/e2e were not run in this scoped read-only review.
