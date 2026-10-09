# Packet: P4-58c delta review (d-v2-07 round 3)

Read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Use git with `-C /private/tmp/bower-d-v2-07`.

## What to review

- **Delta:** `git diff 504e6cbd..691dfc43`. Red 1371da20, fix 5c2529ea, notes 691dfc43. The range also includes a claude/p3 merge, so focus on src/bird and the notes.
- **Contract:** `docs/harness/2026-10-09-d-v2-07-round3-packet.md`, on top of rounds 1 and 2.
- **What it answers:** the "Fix-round pass" section of `docs/harness/2026-10-09-codex-d-v2-07-review.md` (2 Important), plus the P4-58b minor about the body keydown.

## Look hardest at

- **`interrupt({ now: true })`:**
  - it cuts only the running act or cycle, never `S.queue`;
  - input during a preen between flights keeps the queued flight and its callback;
  - the round-2 cuts (carry, write, snap, preen) still hold.
- **Lost focus gaze in a working pose:** the iris goes back to the pose's own target or rest, with nothing stale.
- **Body keydown:** it marks recency without dropping a live pointer gaze.
- **Second way:** none — no second queue and no second interrupt.
- **Tests:**
  - 42/42 in src/bird;
  - each red failed before the fix;
  - the `tests changed:` lines are present;
  - no `.only`/`.skip`, no real timers.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters.
