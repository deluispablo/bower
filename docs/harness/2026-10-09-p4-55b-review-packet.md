# Packet: P4-55b delta review (c4-retry-fence fix round)

The review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-retry`.

## What to review

- **Delta:** `git diff 37f1c696..a4430287`. Red de8a7c82, fix 6fafcc84, notes a4430287.
- **Contract:** `docs/harness/2026-10-09-c4-retry-fence-round2-packet.md`.
- **What it answers:** the P4-55 BLOCK and `docs/harness/2026-10-09-codex-c4-retry-fence-review.md`, which name the same gap at `journal.ts:509`.

## Look hardest at

- **The fence on Undo's Bin.** `journal.ts:509` passes its existing `checkStillAsSeen` as the `fence` on `trash`, through `WriteOptions`. There is no second check and no second retry path. A 429, a 403 rate limit or a 401 refresh runs the fence, then resends.
- **The three reds.** They fail before the fix: outside move means no resend; unchanged file means the resend lands; and a restore whose journal PATCH gets a 429 still finishes.
- **The notes.** The barrier.ts:193 row is corrected. Check the sweep of other callers against the code.
- **Overlap.** c4-undo-withdraw also edits `journal.ts` (`removeNow`). Note anything that will conflict.
- **Housekeeping:** the goldens (C04 78, 25-runs 88), the `tests changed:` lines, no `.only`/`.skip`, and no real timers.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK), every line under 120 characters.
