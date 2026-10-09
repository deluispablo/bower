# Packet: P4-58b delta review (d-v2-07 fix round)

The review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-d-v2-07`.

## Scope

- **Delta:** `git diff d00dba83..504e6cbd`. Red edeb7e2f, fix fbd1c431, notes 504e6cbd.
- **Contract:** `docs/harness/2026-10-09-d-v2-07-round2-packet.md`, on top of the signed round-1 packet.
- **What it answers:** the P4-58 BLOCK and `docs/harness/2026-10-09-codex-d-v2-07-review.md` (5 Important). The lead agreed all five are contract gaps.

## Look hardest at

1. **Body keydown.** A keydown with focus on body now marks recency, postpones sleep and wakes a dozing bird. The card says it wakes through `look(null)`, not `nudge()`, so a key pressed while the bird is awake gives no startle.
   - Does a sleeping bird still get its startle on wake (addendum 1)? Check the wake path.
2. **Focus gaze.** It is read per frame and ends when focus leaves the control. There must be no stale rect and no listener leak.
3. **Layer tap.** It plays at the current action's end: after a landing that is followed by `wait`, and while carrying. It uses one slot, never `S.queue`.
4. **Pose cut.** `interrupt({ now: true })` cuts the carry and write pose cycles. `B.carrying` is kept, and the loop resumes after the poke.
5. **Snap and preen.** Input cuts a running one through the same `now` path, with no second interrupt.
6. **Tests and hygiene.**
   - Each red failed before the fix.
   - The round-1 tests are still green. The notes say src/bird has 39 of 39.
   - There is no second loop or queue.
   - The `tests changed:` lines are present, with no `.only`, `.skip` or real timers.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
