**Adversarial review, pass 5 — upload-sign-out-forget**

**Verdict: BLOCK**

- **Blocking — `src/data/live/index.ts:364`: offline sign-out retry deletes another account’s uploads.** With account A known and account B’s pending uploads stored, fail A’s remote sign-out, then retry while offline. The first attempt clears `knownAccount`; the second passes `undefined` to `forgetAccount`, purging B too. This loses pending data during an ordinary retry and violates addendum 9’s last-known-identity rule. An in-memory reproduction using the actual live sources, queue and IndexedDB store confirmed B’s count **1 → 0**, with its bytes deleted.

**Minor / v1 limits**

- `src/data/upload-store.ts:205`: legacy fence cleanup lacks a regression seeded with old `forgotten:<account>` keys; the new raw-storage tests seed current-format uploads.

The reviewed write paths preserve addendum 8’s captured versions. Transactional generation checks and dual-error logging hold. The journal outbox remains untouched. No second mechanism was added.
