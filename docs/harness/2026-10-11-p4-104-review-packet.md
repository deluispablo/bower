# Packet: P4-104 review (delete-account-purge, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-delete-account-purge`.

## What to review

- **Diff:** `git diff claude/p3...delete-account-purge -- src`. Red: dab972d3. Fix: b5ae5ec1. Notes: `docs/harness/2026-10-11-delete-account-purge-notes.md`.
- **Contract:** the packet `docs/harness/2026-10-11-delete-account-purge-packet.md` and TL-P4-53 addenda 9–12 (DECISIONS). The AGENTS hard rule also applies: sign-out forgets what this device kept, and the journal outbox stays.
- **Prior pass:** Codex adversarial, PASS (`docs/harness/2026-10-11-codex-delete-account-purge-adversarial.md`).
- **Gates (coordinator):** pnpm check green (512/528); e2e app passes on demo (31) and fake (33).

## Look hardest at

- "Delete my account" calls the one forget function sign-out uses. It never skips the purge when the account cannot be read, and it still waits for the Worker.
- knownAccount resets at every sign-in start, so a sign-out before /me resolves purges everything. Stale /me replies cannot restore an old identity.
- Addenda 8–11 hold. No second cleanup path, and no Drive hard delete.
- You may run `pnpm exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters.
