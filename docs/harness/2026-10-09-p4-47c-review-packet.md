# Packet: P4-47c review (c3-state-mark round 4: addenda 16, 17, 20, 21, 22)

Read-only and fresh. Run unit, runner, api and contract tests only: never start a server, run e2e or call the claude CLI. Never check out the main repo, in any form. Run git with `-C /private/tmp/bower-c3-state4`.

- **Diff:** `git diff ba4e9be1..70f22d7d`. The branch has no merges, and its base is claude/p3 ba4e9be1, which holds the entry as merged at a8ad75f4.
  - Round 4: d4d2de42 red16, d5c9042d fix16, a7f7c938 red17, f3db5b5b fix17, 38a9c08b notes.
  - Round 4b: 98787392 red20, d305b537 fix20, plus the fixture commits up to 4477133e.
  - Round 4c: a802a1a2 red, 54291695 fix, 8c2dd398 compatibility, 70f22d7d notes.
- **Packet:** docs/harness/2026-10-09-c3-state-mark-round4-packet.md (all sections). The notes are in the branch's notes file, Round 4, 4b and 4c.
- **Rulings (TL-P4-19):**
  - 16: answersStayed only on a clash, and person.ts no longer resets tries.
  - 17: the q-state card shows "Bower's update" plus every shown line, built from existing parts only. A yes applies only shown text.
  - 20: entryOk refuses an uncited news line, and the zod refinement calls the same predicate. The fixture uses seed keys, never names.
  - 21: the engine is untouched. A non-clash refusal keeps the answer and starts no run. One `when: 'rejected'` row per answer, with the copy "<failure sentence> Bower will try again in the next tidy-up.". The next tidy-up tries once, under stamp+checksum.
  - 22: the stored-manifest guard uses note-edit's read mode, and the uncited refusal applies to writes and plans only.
- **Fixed questions (TL-P4-20):** contract first, then second way: a second refusal rule, a second row path, a second read mode. Give every finding a severity.
- **Look hardest at liveness (the addendum 12 and 16 class):**
  - Can any path still start runs without a person's press?
  - Does a kept answer retry at most once per press?
  - Does the class test prove both of these?
- **Also check:**
  - Every fixture that gained a source was not weakened.
  - The `tests changed:` lines, with no `.only` or `.skip`, plus the compatibility rows.
  - The goldens: C04 78 and 25-runs 88.
- **Reply:** the review card from `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details go in `/private/tmp/p4-47c-review-notes.md`.
