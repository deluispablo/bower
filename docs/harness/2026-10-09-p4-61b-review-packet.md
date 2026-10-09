# Packet: P4-61b delta review (c4-create-landed fix round 1; TL-P4-24 addenda 15 and 16)

This review is read-only and fresh. Run unit tests only: never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-create`.

## What to review

- **Delta:** `git diff 666c5a82..865f060e`: the red ce4ddfc8, the fix 3022e9df, the notes 65844336, and the c2-create-by-id verify retitle plus its re-proof (8f…/865f060e).
- **Packet:** `docs/harness/2026-10-09-c4-create-landed-packet.md`, section "Fix round 1".
- **What it answers:** the Codex finding in `docs/harness/2026-10-09-codex-c4-create-landed-review.md`. The fix-round Codex pass found 0 findings.

## Look hardest at

- **The intent stored with the id.** A reserved id and its first-sent intent (name, place, content hash) are stored together in the keeper when the id is reserved, in all four keepers.
  - Retries resend that stored intent and never recompute the name: `drive-vault.ts:368` picks a free name only for a first send.
  - `landed` is judged against the stored intent, in write-once.ts only.
- **Old keeper entries** without an intent keep today's behaviour, with a fixture test. The field is additive.
- **The red.** Answer and recovery read both lost, then refresh() and a retry, give one file. It failed before the fix, and was not loosened.
- **Files outside the packet:** `api/src/vault.ts` and `src/data/upload-queue.ts` changed. Why, and is that a second way?
- **The retitle.** It matches what the test asserts, and has its `tests changed:` line.
- **Housekeeping:** compatibility rows, `tests changed:` lines, and no `.only`, `.skip` or real timers.

Already run: pnpm check green (inside done.sh at 865f060e); e2e qa9, qa10, capabilities and capabilities-b on fake, phone and desktop (worker).

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
