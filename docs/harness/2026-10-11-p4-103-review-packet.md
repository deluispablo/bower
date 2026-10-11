# Packet: P4-103 review (upload-sign-out-forget, addenda 9–11, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-upload-sign-out-forget`.

## What to review

- **Diff:** `git diff 1621f004..HEAD -- src`. This is the delta since the P4-102 PASS (`docs/harness/2026-10-11-p4-102-review.md`). Reds: 9cae726c, 3b40b7ad, eac33b26, 00167580. Fixes: fcf01409, then the two after it. Notes: "Addendum 9 reds" through "Addendum 11".
- **Contract:** TL-P4-53 addenda 9, 10 and 11 (DECISIONS):
  - every sign-out attempt purges with the session's last known identity; every account only when none was ever known;
  - a purge failure shows "Signing out did not finish", with both errors logged and neither masking the other;
  - one device-wide forget counter carries no identity, and nothing derived from the person stays in IndexedDB after sign-out;
  - auth expiry behaves the same way.
- **Prior passes:** Codex 5 (BLOCK), 6 (BLOCK) and 7 (PASS), in `docs/harness/2026-10-11-codex-upload-sign-out-forget-adversarial-{5,6,7}.md`.
- **Gates (coordinator):** pnpm check green (511/527); e2e app passes on demo (31) and fake (33).

## Look hardest at

- Addendum 8 still holds: no versionless write, no recapture after an await, and the refusal is inside the transaction.
- Another account's uploads survive an offline retry. Uploads added after a failed sign-out are purged on the retry.
- No key or value in IndexedDB contains, or derives from, the account after a successful purge. This includes the old `forgotten:<account>` keys, which E2 never shipped.
- The journal outbox stays. No second store and no new sentence.
- You may run `pnpm exec vitest run src/data/upload-sign-out.test.ts src/data/upload-store.test.ts --maxWorkers=2`, with output to the OS temp folder.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters.
