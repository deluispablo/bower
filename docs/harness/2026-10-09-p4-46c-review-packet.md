# Packet: P4-46c check (c3-pair-ask fix round 2, answered row)

Read-only and fresh. Unit, runner and contract tests only: never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c3-pair2`.

- **Diff:** `git diff d5591b2b..e589f457` (red `c29a2862`, fix `26ff7d54`, compatibility `3f1657a8`, notes `e589f457`). Base: claude/p3 d5591b2b.
- **Finding:** the designer did not verify the change at bdc08775 (DEFECT_LOG `not-merged-never-shown`).
- **Ruling (TL-P4-19 addendum 10):**
  - one optional `answered: [{questionId, kind, outcome, why, note?}]` report field in the subject home, written by the single "subject gone" path for q-pair, q-ask and q-state;
  - not setAside, and not counted as set aside;
  - rows show under the Home result, and the pair row also on the note that stays;
  - a question whose subject is gone is not listed (the app reader passes NotesSeen);
  - the wire is additive, and an old report still reads.
- **Copy (designer):**
  - pair: "Not merged: <other> was already in the Bin." / "Not merged: the other note was already in the Bin."
  - q-ask: "Not done: <thing> had moved or gone to the Bin before Bower got to it." / "Not done: what the question was about had moved or gone to the Bin."
  - q-state: "Not written: <note> had moved or gone to the Bin before Bower got to it." / "Not written: the note had moved or gone to the Bin."
- **Fixed questions (TL-P4-20):**
  - Contract first: is each ruling point met, with a test?
  - Then second way? Is there a second gone path, or a second report shape next to setAside and alreadySaved?
  - Give every finding a severity.
- **Look hardest at:**
  - Is the refused merge really gone from setAside, and does runDetail's set-aside count no longer include it?
  - Every reader of the report kinds: manifest, checkpoint, layout RUNNER_WRITES, barrier, grounded and report.ts.
  - The `tests changed:` lines in the notes cover every modified or deleted test file (`git diff --diff-filter=DM d5591b2b..e589f457`).
  - There is no `.only` or `.skip`.
  - The worker left out: "a pair asked by id shows the fallback name", and "the answered list is unlabeled". Say whether either is a contract gap.
  - The goldens: C04 78 and 25-runs 88.
- **Reply:** the review card from `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details go in `/private/tmp/p4-46c-review-notes.md`.
