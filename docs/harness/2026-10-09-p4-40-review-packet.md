# Packet: P4-40 review (stage 3: c3-reservation-upload)

Starting model: Opus, fresh and read-only. Never start a server or run e2e; unit, runner and api tests only. Never `git checkout` in the main repo, nor any subshell, `pushd` or `GIT_DIR` form. Run git with `-C /private/tmp/bower-c3-up`.

- **Diff:** `git diff 04177cc8..72419f53 -- src runner api` (red `ad081c3f`, fix `8bf4de75`, notes `72419f53`; not merged).
- **Contracts:**
  - packet `docs/harness/2026-10-09-c3-reservation-upload-packet.md`;
  - DECISIONS TL-P4-17 addenda 1, 3 and 6 (the rule targets the primitive);
  - TL-P4-14 addenda 11, 13 and 16.
- **The fixed question:** is there still, or newly, a second way to reserve and keep an id for an intended create? Your card must say "second way? no" or name it.
- **Look hardest at:**
  - the id is kept on the device before the first byte, so a reload never reserves another;
  - a storage refusal still demotes to memory with today's message;
  - lost bytes still ask to choose the file again;
  - resumable sessions and confirmed bytes are untouched;
  - the worker left a refused upload keeping its record fileId ("makeOnce release only local"): judge it against addendum 13 (a 4xx releases the id);
  - the `QueueItem.reserved` → `fileId` rename broke no reader (screens, drive-vault);
  - the allowlist shrank by one;
  - goldens are unchanged.
- **Real entry point (TL-P4-17):** the e2e:fake test "a file added again after a reload is not doubled". Read it and judge whether it covers the reserved-id path.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-40-review-notes.md`.
