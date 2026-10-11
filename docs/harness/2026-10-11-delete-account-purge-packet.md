# Packet: delete-account-purge (Delete my account and a new sign-in use the one forget path)

- **Entry:** `delete-account-purge`. Worktree `/private/tmp/bower-delete-account-purge`, branch `delete-account-purge`. Escalated (privacy, TL-P4-29): Codex red, Codex implementation, a read-only Codex pass, then a fresh Claude review. `ui: false`.
- **Defect and ruling:** DEFECT_LOG delete-account-purge-skipped (Important); TL-P4-53 addendum 12 (DECISIONS). It builds on addenda 9–11 (upload-sign-out-forget, closed 5d4262ca).
- **Owned files:** `src/data/live/index.ts`, `src/data/upload-sign-out.test.ts` and `src/data/live/live.test.ts`.

## Contract

1. "Delete my account" calls the one forget function that sign-out uses (last known identity; every account when none was ever known; the purge-failure sentence with both errors logged). Never a copy, and never a skipped purge when the account cannot be read.
2. `knownAccount` resets at the start of every sign-in. Until /me resolves, the identity is unknown, so a sign-out then purges everything.
3. Accepted, not a defect: the device counter refuses another account's in-flight add once; it retries.
4. Controls kept: addenda 8–11 (captured versions, the device-wide counter, retries purge the last known identity, nothing of the person in IndexedDB), the journal outbox at sign-out, and Delete my account still waiting for the Worker's agreement.

## Reds

- Delete my account while offline, or with an unreadable account, still purges.
- A new person signs in and signs out before /me resolves: everything is purged.

## Verify

`pnpm exec vitest run src/data/upload-sign-out.test.ts src/data/live/live.test.ts -t "delete-account-purge"`, then `pnpm check` and e2e app and settings on demo and fake.

## Commits

Reds, fix, notes (`docs/harness/2026-10-11-delete-account-purge-notes.md`, line 3 `implementer: codex`, one `tests changed:` line per file).
