Upload-sign-out-forget — adversarial pass 4, fix round 3
Verdict: PASS
Range: be1e602e..6bc7268a

No blocking defect found.

- `src/data/upload-queue.ts:329,448,466`: every store write passes the captured version.
- `src/data/vault/drive-vault.ts:452,1006,1227,1266`: Undo, add, retry and reselection propagate their initial capture through later awaits.
- `src/data/upload-store.ts:213`: marker comparison gates writes inside the same transaction; transaction retries retain the supplied version.
- `src/data/upload-store.ts:189,307`: account-specific markers and scoped deletion preserve other accounts; folder-only clears preserve sibling folders.
- `src/data/upload-queue.ts:979`: purge and cleanup failures still surface as a logged BowerError.
- `src/data/upload-sign-out.test.ts:443`: repaired purge-failure assertions retain the error, cause and cleanup-wait checks.
- No second upload-retention mechanism or stored-format change.

Minor / v1 limits:

- `src/data/upload-store.test.ts:91`: without IndexedDB, capture rejects before `add` runs. The repaired test preserves its error predicate but loses direct coverage of `add` rejecting.

The API repairs forward or pass versions without weakening assertion predicates. `cc32a1b5` separately replaces contradictory retention expectations with absence and stale-write rejection.

Read-only source review; tests were not rerun. Notes report 4,192/4,192 data tests passing.
