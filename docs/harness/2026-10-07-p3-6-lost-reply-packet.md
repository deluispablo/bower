# Packet: lost-reply-reconcile (P3-6)

Starting model: `bower-implementer` (Sonnet). Reason: an ambiguous-outcome fix in the Drive vault's writes ([TL-P3-11](2026-10-07-tl-p3-11-drive-suite-findings.md) F2, from `drive-real-behavior-suite` check 7).

- **Entry:** `lost-reply-reconcile` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-lost`, branch `claude/p3-lost`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `src/data/vault/drive-vault.ts` (`rename`, `move`, `toggleTask`, `stillAsSeen`, `keepSeen`), `src/data/drive/fake-drive.ts` (`loseNextReply`, `reply`, the fault hook), `src/data/drive/drive-http.ts` (how a network failure becomes `driveError('offline')`), `src/data/vault/drive-vault.test.ts`.
- **What real Drive did:** a rename and a move whose replies were dropped both landed exactly once. The app said "You're offline. Try again when you're back." and kept showing the old state until a reload.
- **Research, cite:** [Google Cloud retry strategy, idempotency](https://cloud.google.com/storage/docs/retry-strategy#idempotency) (an ambiguous outcome is read back, never assumed).
- **Acceptance contract:** when `rename`, `move` or `toggleTask` fails with an `offline` error from the write itself (not from a read before it), the vault re-reads that file (`files.get`, plus the text for a toggle) before telling the person:
  - **It shows the intended change:** the call completes as a success, the same as if the reply had come back. The index is updated, the journal records it once, and no error is shown. Named test: `a lost reply to a rename that landed counts as saved`.
  - **It shows the old state:** the usual offline `BowerError`, with nothing changed. Named test: `a lost reply to a move that did not land says offline`.
  - **It can't be read:** a `BowerError` with "Bower isn't sure that saved. Check again when you're back online." Named test: `a lost reply to a task toggle that cannot be read back says not sure`.
  - **Anything else** (changed by someone else meanwhile): the existing "changed somewhere else" path.
  - The fake Drive gets a lost-reply fault for `update` and `writeText` (the change lands, then the answer is lost), reusing `loseNextReply`/`reply` if that fits. The tests use it.
  - Out of scope: retrying the write; uploads (R4 owns them); Worker calls.
  - Files in scope: `src/data/vault/drive-vault.ts`, `src/data/drive/fake-drive.ts`, `src/data/vault/drive-vault.test.ts` (or a new test file next to it), plus `src/data/drive/fake-drive.test.ts` for the new fault.
- **Gates:** the verify (the three names, red first on an assertion), `pnpm check`, and `pnpm e2e:fake` for the note and move screens on a private port 5195–5198. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 15 lines:** commit SHA, red→green, gates, sources cited, anything left out.
