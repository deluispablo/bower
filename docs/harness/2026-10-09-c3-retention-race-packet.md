# Packet: c3-retention-race (stage 3)

- **Entry:** `c3-retention-race`.
  - Ruling: the stage 3 carry-over ([file](2026-10-09-stage3-carryover.md)), the P4-38e minor, and the lead (2026-10-09: it touches data, so it is not polish).
  - Worktree: `/private/tmp/bower-c3-ret`, branch `c3-retention-race` from `claude/p3`.
- **Starting model:** `bower-escalated` (it bins).
- **Live evidence:** P4-38e. `runner/src/spine/retention.ts` `keepFinishedAtEnd` runs `clean()`, which lists the children of all ≤3 picks first and only then bins them.
  - A person can move an unmarked item into pick 3 while picks 1 and 2 are being binned, a window of about 3 calls.
  - Drive has no conditional trash.

## Contract

- **Each pick is listed just before its own Bin.** The same calls, in a different order, so the 25-run golden stays at 88. The window shrinks to one call.
- **Unchanged:**
  - only folders with the Bower mark are binned;
  - a folder holding an unmarked child is kept, with today's log line;
  - at most 3 Bins per run;
  - the 24 h rule;
  - a failure is logged and never fails the run.
- **Goldens:** C04 78 and 25-runs 88 never rise. `removed: <lines>` goes on the card.

## Red

"a picked folder that gains an unmarked child before its turn is kept". The fake Drive adds an unmarked child to pick 2 after pick 1's Bin. It fails today, because pick 2 was listed before pick 1's Bin.

## Verify (exact, from features.json)

- "each run folder is listed just before its own Bin"
- "a picked folder that gains an unmarked child before its turn is kept"
- Real entry point (TL-P4-17): drive it through the runner's run end (`keepFinishedAtEnd` as the runner calls it at done), not `clean()` alone.

Then `pnpm check` must be green.

## Checklist

- Every Bin passes what it read.
- Match by id.
- Research first: cite Drive `files.update` (trashed) and the lack of a conditional trash.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
