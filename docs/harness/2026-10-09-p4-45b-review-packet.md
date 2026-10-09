# Packet: P4-45b review (c3-planner-split, part 2 of 3)

Read-only and fresh. Unit, runner and contract tests only; never start a server or run e2e. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-plan2`.

- **Diff:** `git diff a1bf5b9a..7e5ad41d -- src runner api scripts` (red `a189e639`; fix `09d0127d`, `7f569779`, `895bfe15`, `167297dc`; chore `5e5a8f19`; notes `7e5ad41d`). Not merged. Part 2 stopped at an approved staged point: +120/-546, so net -426 for the part and -272 for the entry so far.
- **Contracts:**
  - packet `docs/harness/2026-10-09-c3-planner-split-packet.md`;
  - the part 1 review `/private/tmp/p4-45-review-notes.md` (its minors were taken into part 2);
  - TL-P4-14 addenda 23 and 24;
  - TL-P4-17 addendum 2.
- **Part 2 claims:**
  - `grounded()` checks structure only;
  - a set-aside row names its op, through `requires`;
  - the New mark follows the row's op, not its text;
  - one distinct-path count;
  - `rules.held` folded into the one `needs` map.
- **Left for part 3:** the capture/decide/build split and the recursion.
- **The fixed question:** second way? Your card must say "second way? no" or name it.
- **Look hardest at:**
  - did removing 455 lines from `grounded()` drop any safety check that a structural check does not replace (a row naming a missing op, an op with no row, a row for the wrong person's file);
  - does the New mark still find each line by its words from the end of the Timeline, and can two equal lines mislead it (the worker says an exact tie needs a wire field);
  - the goldens hold: C04 78, 25-runs 88;
  - the compatibility rows for `src/features` commits.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK for part 2), lines under 120 characters. Details in `/private/tmp/p4-45b-review-notes.md`.
