# Packet: P4-56b delta review (c4-undo-withdraw round 2, TL-P4-24 addendum 11, plus the retry-fence merge)

This review is read-only and fresh. Run unit tests only; never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-undo`.

## What to review

- **Delta:** `git diff 66f295ba..6f7c7310`.
  - Red 983f937b, fix 189b3cb0, notes 8686d099.
  - Merge ddea5a02 brings in claude/p3 with c4-retry-fence. Git merged `journal.ts` cleanly, and the worker checked the order by hand.
  - Notes 6f7c7310.
- **Contract:** `docs/harness/2026-10-09-c4-undo-withdraw-round2-packet.md`.
- **Findings it answers:** `docs/harness/2026-10-09-codex-c4-undo-withdraw-review.md` (2 Important), plus the P4-56 minors.

## Look hardest at

- **The rule:** a withdraw decides only on the holder's state, read while it holds that holder's exclusion.
  1. Undo takes the outbox lock, then reads the line. An id reserved since the press is withdrawn. A confirmed create's file is binned by id from the record. Unknown means refuse.
  2. Send and withdraw are mutually exclusive per holder. A withdraw waits for an in-flight create to settle, bounded by its transport timeout. Landed: bin. Refused or unsent: let go. Unknown: refuse.
- **Intended.** The card says it has no in-flight test and shares the per-holder lock through `makeOnce`. Is that enough?
- **The new `bower:sent-lines` key** (`src/data/device.ts`):
  - does sign-out forget it, or keep it like the outbox?
  - is it keyed by folder, never sent to another folder?
  - does it have a compatibility row?
- **The merge.**
  - In `journal.ts` `removeNow`, the withdraw under the lock comes first, then `continue`, then retry-fence's `check()` and fence on the Undo Bin trash.
  - Both entries' tests pass: journal.test.ts and the drive-vault 429 group.
- **Open for the lead:** write-once `withdraw`'s own trash passes no fence, so a 429 there fails as retry-kind. Is that the same gap c4-retry-fence's contract point 4 closed for journal.ts:509? Give it a severity.
- **The byId 403/401 cells** now classify as `unreached`. The upload-record cells are guards.
- **Housekeeping:** the `tests changed:` lines, compatibility rows, no `.only` or `.skip`, and no real timers.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
