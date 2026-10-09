# Packet: P4-45d review (c3-planner-split, part 3 of 3, then the whole entry)

Read-only and fresh. Unit, runner and contract tests only; never start a server or run e2e. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-plan3`.

- **Diff:** part 3 is `git diff a7c2ee04..88657661 -- src runner api scripts` (red `44135607`, `f68c6d49`; fix `33c7c0eb`, `bced533f`, `0549a761`; compatibility `71c96fd2`; notes `88657661`). The whole entry is `12b9d054..88657661`, with entry net +762/-902 = -140.
- **Contracts:**
  - packet `docs/harness/2026-10-09-c3-planner-split-packet.md`;
  - TL-P4-14 addenda 23 and 24 (a live rule keeps the person's words, tidied);
  - TL-P4-19 addendum 3: `RunReport.updated` gets an optional op id; rows tie by id, never by words; additive, so old reports still read; app and runner deploy together.
- **The worker went beyond the ruling:** it added a `line` field beside the op id, saying an op id alone cannot locate a line. Judge it: is it needed, is it additive, does an old report still read, and is the same thing now said twice? The lead will rule on it.
- **The fixed question:** second way? Your card must say "second way? no" or name it, for the whole entry. Look for planner steps, row ties, name or text matches, and fixtures on the live path.
- **Look hardest at:**
  - capture → decide → build, and each place recursion was kept, with its reason;
  - tolerant reading of old reports and checkpoints (`run-checkpoint.ts` changed);
  - the New mark follows the op id;
  - the goldens hold: C04 78, 25-runs 88;
  - the compatibility rows.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK for the entry), lines under 120 characters. Details in `/private/tmp/p4-45d-review-notes.md`.
