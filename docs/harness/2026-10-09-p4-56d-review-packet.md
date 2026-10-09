# Packet: P4-56d delta review (c4-undo-withdraw, round 3 addenda 13 and 14)

This review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-undo`.

## What to review

- **Delta:** `git diff 2681f7b7..70a2b0da`, which includes a claude/p3 merge.
  - Addendum 13: red 065c7cdf, fix 814fc4ec.
  - Addendum 14: red 1ff91711, fix 7e4c7476.
  - Notes: 70a2b0da.
- **Contract:** the "Addendum 13" and "Addendum 14" sections of `docs/harness/2026-10-09-c4-undo-withdraw-round3-packet.md`.
- **What it answers:** the "Round 3 pass" in `docs/harness/2026-10-09-codex-c4-undo-withdraw-review.md` (2 Important).

## Look hardest at

- **No line under the lock.** Undo decides on a fresh listing taken under that lock, never the memo.
  - A found file is binned through the fence.
  - A failed listing is refused.
  - Only a confirmed absence counts as success.
- **One exit.** Every line drop goes through withdraw's let-go.
  - A confirmed line is let go only on a 404, on a file in the Bin, or on a file in the archive folder that carries a run's stamp.
  - If the person moved the file elsewhere, the line stays confirmed, and Undo refuses with CHANGED_ELSEWHERE with nothing binned.
- **The worker's note.** The drop-on-listing from addendum 12 is gone, so lines stay confirmed until a run archives them, at one byId per list.
  - Is that consistent with addenda 12 and 14?
  - Can confirmed lines now pile up without bound, for example when a person keeps a file in the changes folder and no run ever archives it?
  - Does this cost Drive calls a golden counts?
- **`outboxWaiting`** counts waiting lines only.
- **Housekeeping:** the `tests changed:` lines, compatibility rows, no `.only` or `.skip`, and no real timers.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
