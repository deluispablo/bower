**upload-resume-after-reload — adversarial review, pass 1**

Verdict: **BLOCK**  
Range: `claude/p3...dfa2f8de`

Blocking findings:

- **src/data/vault/drive-vault.ts:827:** Reload a saved folder pile while its upload remains pending. If the upload finishes while the declaration read is outstanding, accounting uses the earlier file snapshot, but `queuedItems()` excludes the now-completed member. The first full read returns `chooseAgain: true` and `setAside: 'not-arrived'` for the file that just arrived. Confirmed through public `addPile()` / `piles()`, the real queue, fake Drive and fake IndexedDB, with deterministic barriers and no filesystem writes. Missing regression: completion during the first folder-declaration read. This violates the no-picker contract.

Minor / v1 limits:

- No second queue, store, write-once or session-fencing mechanism added; protocol, limits, fallback and sign-out implementation remain unchanged.
- Red repairs preserve assertions and numeric bounds. Repair 2 exercises late read-back after halt rather than the original post-halt arrival schedule.
- TL-P4-53 addendum 3 is absent from this checkout’s `DECISIONS.md`; its authorization could only be checked against the supplied assignment and notes.
- Full check/e2e remain unverified here; the delivery notes report interrupted or blocked gates, and their referenced logs are absent.
