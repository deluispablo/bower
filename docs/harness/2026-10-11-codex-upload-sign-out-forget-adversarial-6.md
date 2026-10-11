**Adversarial review, pass 6 — upload-sign-out-forget**

**Verdict: BLOCK**

- **Blocking — `src/data/live/index.ts:383`: uploads accepted after failed sign-out survive a successful retry.** Fail the remote sign-out, continue using the still-active app, add a file, then retry sign-out successfully. `signingOut` remains true, so the retry leaves the new account metadata and bytes in IndexedDB. An in-memory reproduction through live sources, the place guard, `addPile`, the real queue and fake IndexedDB confirmed **1 → 1** pending records with original bytes retained. This is a privacy breach during normal use. The remote-only retry ruling requires preventing fresh admissions or distinguishing a resumed session.

Pass 5’s original offline retry now preserves account B. First-purge identity fallback, purge-failure copy, dual-error logging, the device-wide counter and auth-expiry cleanup remain intact by inspection. No second mechanism was added.

**Minor / v1 limits**

- `src/data/upload-store.ts:205`: legacy `forgotten:<account>` cleanup still lacks a seeded regression.
- `src/data/upload-sign-out.test.ts:372`: the never-known retry test checks an already-empty store; it does not prove the purge runs only once.

No files changed; no network used.
