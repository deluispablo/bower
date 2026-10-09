# Packet: P4-46b check (c3-pair-ask fix round)

Read-only and fresh. Unit, runner and contract tests only; never start a server, run e2e or call the claude CLI. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-pair`.

- **Diff:** `git diff dad2b4e3..3b537783` (red `09f64090`, fix `dfac85e6`, compatibility `9b37c565`, notes `3b537783`). The merge `dad2b4e3` brought in claude/p3. The whole entry is `c904970e..3b537783`.
- **Findings:** `/private/tmp/p4-46-review-notes.md` (P4-46 PASS with minors). DEFECT_LOG `words-pile-held-forever` and `pair-yes-waits-forever`.
- **Ruling (TL-P4-19 addendum 8):**
  - a words-only pile with all its lines already present settles through `duplicates.ts`, with the existing `alreadySaved {name, as}` row and no new row type;
  - the subject home settles a gone subject for every kind (q-state, q-ask, q-pair) in one path;
  - a liveness class test.
- **Copy (addendum 9, from the designer):**
  - "Your lines were already in <note display name>." / "Your lines were already in your notes."
  - "Not merged: <other note display name> was already in the Bin." / "Not merged: the other note was already in the Bin."
- **The fixed question:** second way? Your card must say "second way? no" or name it. Check settling a gone subject, the already-saved rows, and duplicates.
- **Look hardest at:**
  - The worker added an optional `alreadySaved.notes` field (the lead will confirm). Is it additive, does an old report still read, and is it a new row type in disguise?
  - The app reader passes no NotesSeen: what does the person see then?
  - Every sentence matches the designer's copy exactly, each backed by a test.
  - The liveness test runs the planner twice on the same input.
  - The goldens hold: C04 78, 25-runs 88.
  - The compatibility rows.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK for the entry), lines under 120 characters. Details in `/private/tmp/p4-46b-review-notes.md`.
