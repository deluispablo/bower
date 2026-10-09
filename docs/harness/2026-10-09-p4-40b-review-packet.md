# Packet: P4-40b check (c3-reservation-upload fix round)

Starting model: Opus, fresh and read-only. Never start a server or run e2e; unit, runner and api tests only. No checkout of the main repo in any form (subshell, `pushd` and `GIT_DIR` included). Run git with `-C /private/tmp/bower-c3-up`.

- **Diff:** `git diff aa31fcef..db3868d7` (red `f515f213`, fix `80548be1`, notes `db3868d7`). The merge `aa31fcef` brought in claude/p3 (the c3-test-time ESLint rule). The whole entry is `04177cc8..db3868d7` against claude/p3.
- **Ruling (TL-P4-17 addendum 7):**
  - a permanent 4xx releases the id;
  - the release reaches the device upload record through the write-once keeper port, because the record is the keeper, not a per-try holder;
  - there is one release rule for every keeper, with no per-keeper exception;
  - retrying a refused upload reserves a new id.
- **The fixed question:** second way? Your card must say "second way? no" or name it.
- **Also check:**
  - upload-queue left the ESLint allowlist, and the count went from 9 to 8 with shrinking enforced;
  - retry, wait, quota and 409 still keep the id (addenda 13, 16);
  - the merge resolution kept the ESLint rule on the primitive;
  - goldens are unchanged.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-40b-review-notes.md`.
