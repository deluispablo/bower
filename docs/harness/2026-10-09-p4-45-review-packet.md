# Packet: P4-45 review (stage 3: c3-planner-split, part 1 of 2)

Starting model: Opus, fresh and read-only. Unit, runner and contract tests only; never start a server or run e2e. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-plan`.

- **Diff:** `git diff 12b9d054..0945a5be -- src runner api scripts .dependency-cruiser.cjs` (red `f9b658c6`, `c1de99be`; fix `053e710c`, `f13e9b70`, `9c6068c4`; merge of claude/p3 `177f8a93`; notes `0945a5be`). Not merged. This is part 1 of a staged entry, stopped at about 540 production lines (the stop is approved).
- **Contracts:**
  - packet `docs/harness/2026-10-09-c3-planner-split-packet.md` and map `docs/harness/2026-10-09-c3-planner-split-map.md`;
  - TL-P4-14 addendum 23 (the model path never reads fixtures, with no demo gate or flag; the scripted provider owns the fixtures and returns the reply shape; the planner core reads a reply; a dependency-cruiser rule that the claude path cannot reach fixtures);
  - TL-P4-17 addendum 2 (report rows keyed by op id).
- **Part 1 claims:**
  - report rows keyed by op id, one row per Timeline line;
  - the live path and the claude provider reach no fixture (dependency-cruiser rule);
  - one map from records to the operations they need;
  - answers reach the model path.
- **Left for part 2:** the capture/decide/build split, the `grounded()` shrink and the `NoteScreen` text tie.
- **The fixed question:** second way? Your card must say "second way? no" or name it. Check that part 1 left no old filter or name tie running beside its replacement.
- **Also check:**
  - `live-uses-fixtures`: the worker's reading of "not done" for `wordRule` (tidied words, not a waiting line). State the exact behaviour change;
  - the goldens hold: C04 78, 25-runs 88;
  - the compatibility row for `053e710c`;
  - `src/data/demo/script.ts` is reached only from the scripted provider and the demo.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK for part 1), lines under 120 characters. Details in `/private/tmp/p4-45-review-notes.md`.
