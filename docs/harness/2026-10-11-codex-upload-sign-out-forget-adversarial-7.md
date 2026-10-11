**Adversarial review, pass 7 — upload-sign-out-forget**

**Verdict: PASS**

No Blocking findings in the scoped diff `fcf01409..5aa5f44f`.

- `src/data/live/index.ts:373`: offline sign-out retries retain the last known identity, preserving other accounts’ uploads.
- `src/data/live/index.ts:378`: every attempt purges again, including uploads accepted after a failed sign-out.
- `src/data/live/index.ts:364`: every-account purging applies only when no identity was ever known.
- `src/data/live/index.ts:367`: purge failure retains the required sentence; remote and purge errors are logged.
- `src/data/live/index.ts:384`: auth expiry uses the same identity and purge path.
- `src/data/upload-store.ts:189`: cleanup retains one device-wide counter, removes the purged person’s records and bytes, and fences older writes.

No second mechanism added.

**Minor / v1 limits**

- `src/data/upload-store.ts:205`: legacy `forgotten:<account>` cleanup still lacks a regression seeded with old keys.

Read-only inspection; tests were not executed. No network used.
