**delete-account-purge — adversarial review**

Verdict: **PASS**  
Range: `42470e24...b5ae5ec1`

No blocking defect found.

- `src/data/live/index.ts:397`: Accepted deletion calls the same `forgetPerson` as sign-out. An unreadable account cannot skip cleanup; unknown identity purges all accounts.
- `src/data/live/index.ts:372`: Every sign-in clears `knownAccount` synchronously. Sign-out before `/me` resolves therefore purges everything; stale replies are fenced.
- `src/data/live/index.ts:378`: Every sign-out retry captures the last known identity. Purge failures surface the required sentence; remote and purge errors are logged.
- `src/data/upload-store.ts:189`: Cleanup advances the identity-free device counter and removes account metadata, bytes, and legacy identity markers. Captured-version checks remain intact.
- `src/data/device.ts:28`: Person cleanup preserves the folder-keyed journal outbox.
- `src/data/live/session.ts:101`: Deletion awaits Worker agreement before cleanup. The reviewed diff adds no Drive hard delete.
- Second cleanup mechanism: **No**; the duplicate deletion path is removed.

Minor / v1 limits:

- `docs/harness/2026-10-11-delete-account-purge-notes.md:69`: Required `pnpm check` and app/settings e2e evidence remains outstanding.
- `src/data/upload-sign-out.test.ts:1170`: Deletion lacks a direct purge-failure regression case; existing sign-out tests cover the shared helper’s failure behavior.

Read-only inspection; tests were not rerun. Existing logs confirm five packet cases and 4,234 data tests passed.
