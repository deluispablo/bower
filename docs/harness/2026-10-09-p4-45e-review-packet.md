# Packet: P4-45e check (c3-planner-split part 3, fix round 2)

Read-only and fresh. Unit, runner and contract tests only; never start a server or run e2e. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-plan3`.

- **Diff:** `git diff 63caa95b..20540996` (red `0ae7cd5f`, fix `4ad40aff`, notes `20540996`). The merge `63caa95b` brought in claude/p3. The whole entry is `12b9d054..20540996`, with entry net -109.
- **Findings:** `/private/tmp/p4-45d-review-notes.md` (P4-45d PASS; the fix taken was the line ordinal and the one-home `updatedRow` check).
- **Rulings (TL-P4-19 addenda 4 and 5):**
  - `line` is the 0-based ordinal among the op's own lines;
  - the New mark shows only while the file's bowerOp stamp is the op's and the md5 matches the row; the op's lines are its last k;
  - after a person's edit the mark drops, never moves, and the row stays;
  - reuse write-once's stamp-plus-checksum comparison, with no new helper.
- **The fixed question:** second way? The worker says the comparison is "STAMP+md5, not holds()". Check whether it reuses write-once's comparison (`STAMP`, `confirms`, `holds`) or writes a second one. A second comparison blocks. Your card must say "second way? no" or name it.
- **Also check:**
  - the row's stamp is the stamp of the note's last write (the worker chose the move's stamp): is that right when an op both edits and moves;
  - old reports still read;
  - `updatedRow` is checked in one home;
  - the goldens hold: C04 78, 25-runs 88;
  - the compatibility rows.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK for the entry), lines under 120 characters. Details in `/private/tmp/p4-45e-review-notes.md`.
