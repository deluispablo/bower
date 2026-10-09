# Packet: P4-58h delta review (d-v2-07 rounds 6–8: rates, arrival-based startle, settling; TL-P4-25 addenda 8 to 15)

This review is read-only and fresh. Run unit tests only: never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-d-v2-07b`.

## What to review

- **Delta:** `git diff f7e2c413..7aadf72c -- src/bird docs/harness/2026-10-09-d-v2-07-notes.md`. Every round since P4-58g passed is in it.
  - Round 6: red 273b58af, fix 5784747a.
  - Round 7: red 38262feb, fix c1aa1941.
  - Round 8 red and its amendments, all from red-owning Codex sessions under the lead's addenda 10–15: 15fd3964, fa474bd0, a7d6ed1a, 66a97045.
  - Round 8 fix: 69235c10.
  - Notes, with merges of claude/p3 between the rounds.
- **Contract:** DECISIONS.md TL-P4-25 addenda 8 to 15 (grep for them). They override the earlier packet sections where they differ. Also read the packet `2026-10-09-d-v2-07-round5-packet.md`, sections Round 6 and Round 7.
- **Codex passes:** `2026-10-09-codex-d-v2-07-review.md`, Round 5 to Round 8. The Round 8 finding is fixed by the addendum 15 clause.

## Look hardest at

- **One head path.**
  - The head motion profile caps rates in time: 360°/s, and 5400°/s² for returns and gaze. It integrates with dt.
  - A snap (the startle included) owns the head until it settles within 2° of its target and at rest. It stops hard on its target. Return caps apply only to moves that start after that.
  - The startle hands over only after settling. The tuft does not wait. The 0.6 s hold runs from landing.
  - nudge() fires only where it did before: never in sleep or in the non-minded working poses.
- **Reds and implementer.** Every red was changed only by red-owning sessions under a ruling; the implementer changed no test. Check each test commit against the addendum it cites. No bound was loosened, and the timeout and run counts are unchanged.
- **The look.** Name any timing shift the designer should check in the nine poses plus gaze: tuft peak 18°, head −10°, the landing frame and the hold.
- **Removed code.** It is really gone, and nothing is left dead.
- **Housekeeping:** `tests changed:` lines, and no `.only`, `.skip` or real timer.

Already run by the coordinator, at 7aadf72c: pnpm check is green. e2e (bird-engine, qa6, qa7, qa10, app and robustness) is green at 0496870d.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
