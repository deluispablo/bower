# Packet: P4-45c check (c3-planner-split part 2 fix round)

Read-only and fresh. Unit, runner and contract tests only; never start a server or run e2e. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-plan2`.

- **Diff:** `git diff 2a77dcaf..ae018a71` (red `91e7663f`, fix `7037f139`, notes `ae018a71`). The merge `2a77dcaf` brought in claude/p3. Part 2 as a whole is `a1bf5b9a..ae018a71`.
- **Findings:** `/private/tmp/p4-45b-review-notes.md` (P4-45b BLOCK, three Importants on `grounded()`).
- **The fixed question:** second way? Your card must say "second way? no" or name it.
- **Check:**
  - `grounded()` refuses each of these: a missing Timeline-line row, a missing generated-note set-aside row, a duplicated filed row, a row whose path, `to` or `note` disagrees with its op;
  - nothing it refused before part 2 is accepted now: list any case still missing;
  - the dead "several moves" branch is gone;
  - the compatibility rows exist;
  - the goldens hold: C04 78, 25-runs 88.
  - The New-mark tie by words stays, with an op-id wire field ruled for part 3 (TL-P4-19 addendum 3).
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK for part 2), lines under 120 characters. Details in `/private/tmp/p4-45c-review-notes.md`.
