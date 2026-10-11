# Packet: P4-102 review (upload-sign-out-forget, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server, or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-upload-sign-out-forget`.

## What to review

- **Diff:** `git diff claude/p3...upload-sign-out-forget -- src`. It holds the reds, fix rounds 1–3 and their red repairs. Read it with the notes `docs/harness/2026-10-10-upload-sign-out-forget-notes.md`.
- **Contract:**
  - the packet `docs/harness/2026-10-10-upload-sign-out-forget-packet.md`;
  - TL-P4-53 Q-rows for E2, addendum 1 (the sign-out sheet is E4's, not here) and addendum 8 (DECISIONS);
  - the AGENTS hard rule: sign-out forgets what this device kept about the person; the journal outbox stays.
- **Prior passes:** Codex adversarial 1–4 (`docs/harness/*-codex-upload-sign-out-forget-adversarial*.md`); pass 4 is PASS. The lead ended the loop.
- **Gates (coordinator, after merging claude/p3):** pnpm check green (511/527); e2e app passes on demo (31) and fake (33).

## Look hardest at

- Sign-out removes this account's kept uploads (records and bytes) on this device. It waits for staging and its cleanup. A purge remove failure surfaces as a BowerError, one sentence, details to console.error.
- Addendum 8: every store write path captures the forget version at its own start. That covers add, Undo's re-enqueue, retry, resume after reload and reselection. No write path goes without a version, and nothing recaptures after an await. The refusal sits inside the store's transaction.
- Other accounts and folders are untouched. The journal outbox stays. No second store and no stored-format change.
- The red repairs only forward or pass the version, or turn retention into absence per addendum 8. No other assertion was loosened.
- You may run `pnpm exec vitest run src/data/upload-sign-out.test.ts src/data/upload-store.test.ts src/data/upload-queue.test.ts --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters.
