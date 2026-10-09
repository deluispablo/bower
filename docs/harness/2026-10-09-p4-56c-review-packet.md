# Packet: P4-56c delta review (c4-undo-withdraw round 3, TL-P4-24 addendum 12; the mechanism is re-planned)

This review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-undo`.

## What to review

- **Delta:** `git diff bbd57496..2681f7b7`. Red 56bf4bb7, fix e23ddcde, notes 2681f7b7.
- **Contract:** `docs/harness/2026-10-09-c4-undo-withdraw-round3-packet.md`.
- **What it answers:** the "Round 2 pass" in `docs/harness/2026-10-09-codex-c4-undo-withdraw-review.md` (3 Important, all caused by `bower:sent-lines`).
- **If round 3 still finds holes, the lead re-plans the entry.** Name each finding precisely.

## Look hardest at

- **`bower:sent-lines` is gone:** its `PERSON_LOCAL` entry, its fixture, and its compatibility row.
- **Outbox line states:** waiting → `confirmed { fileId }` → dropped.
  - A confirmed line stays under its folder's key and lock and is never sent.
  - It drops only when the listing shows its file.
  - Check for eviction, a swallowed write, or a cross-folder overwrite.
- **A failed confirm** keeps the line waiting with its reserved id, logged with `console.error`. Is anything swallowed?
- **Undo under the lock:**
  - waiting: withdraw by id;
  - confirmed: bin by `fileId` through the fence;
  - gone: the listing path;
  - unknown: refuse.
- **Old lines:** `isWaiting` reads them leniently, and there is a fixture test for it.
- **`withdraw`'s trash** passes its fence, so a 429 resends after the fence.
- **Beyond the packet, for the lead:** a confirmed line also drops when a byId read says the folder of changes no longer holds its file (404, in the Bin, or moved out by a tidy-up archive). Is that sound, or a second decision path? Can it drop a line whose file a person could still undo?
- **Housekeeping:** the `tests changed:` lines (7 test files), compatibility rows, no `.only`/`.skip`, no real timers.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters.
