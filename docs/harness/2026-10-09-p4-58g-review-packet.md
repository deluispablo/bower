# Packet: P4-58g delta review (d-v2-07: follow-up round and round 5, the head motion profile; TL-P4-25 addenda 5–7)

This review is read-only and fresh. Run unit tests only: never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-d-v2-07b`.

## What to review

- **Delta:** `git diff 66bf6930..f7e2c413 -- src/bird docs/harness/2026-10-09-d-v2-07-notes.md`. It holds two rounds, with merges of claude/p3 in between.
  - **Follow-up round:** the reds 233e8da0, 4e50361e and ceea06eb; the fixes 7eec60c4 and 21e96006; the notes 9b8c91f2.
  - **Round 5:** the fix 2a008c4f and the notes f7e2c413. The branch then merged claude/p3 (7777aa6f).
- **Contract:**
  - `docs/harness/2026-10-09-d-v2-07-round5-packet.md`;
  - the round-4 packet's "Follow-up" section;
  - TL-P4-25 addenda 5–7 and TL-P4-22 addenda 21–22 in DECISIONS.md (grep for them).
- **What it answers:**
  - the Codex "Own-property and bound pass" (2 Important), in `docs/harness/2026-10-09-codex-d-v2-07-review.md`;
  - the addendum 6 property, which was red at seed 2610.

## Look hardest at

- **One motion profile drives the head.** Its state is the angle and velocity, with a speed cap and an acceleration cap per move class.
  - A target change touches only the target, never the state.
  - No second head path remains. The removed list: head and gaze springs, the startle-keyed head, easeGaze, settleT/From/To, gazeWant, preen's pin(C.head).
  - Every other part keeps its spring.
- **The caps per class.** Returns and gaze: 6°/frame and 1.5°/frame². Snaps and the startle: 6°/frame with no acceleration cap, landing within 2°.
  - The worker says both caps run 0.02 under the bound, because angles are drawn to 2 decimals. Is that honest, or a loosened bound?
- **The reds are unchanged** (TL-P4-22 addendum 22). Compare each red commit with HEAD: the property's seed, numRuns and bounds, the meta-test, the fixture rows, the startle red and the gaze-return red.
- **The meta-test** runs over every `ENGINE_MEMBERS` key, with the closed allowlist.
- **Gaze return.** When focus disappears mid-return, the return eases on from where it is.
- **Behaviour elsewhere.** The other verified d-v2-07 rows keep their look. Name any timing shift the designer should check in the nine poses plus gaze.
- **Housekeeping:** the `tests changed:` lines, no `.only` or `.skip`, and no real timers.

Already run by the worker: pnpm check (before and after the merge), and e2e bird-engine, qa6, qa7, qa10, app and robustness. The 200-run sweep failed 0 of 200 (it was 129).

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
