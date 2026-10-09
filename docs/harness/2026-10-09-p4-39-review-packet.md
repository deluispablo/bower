# Packet: P4-39 review (stage 3: c3-reservation-home)

Starting model: Opus, fresh and read-only. Never start a server or run e2e; unit, runner and api tests only. Never `git checkout` in the main repo (use `git show`, `git diff` or a scratch worktree). Read only this packet, the rulings named here and the diff.

- **Diff:** `git diff e3eaee83..f162b5c7 -- src runner api` (red `476c90ee`, fix `f162b5c7`, branch `c3-reservation-home`, worktree `/private/tmp/bower-c3-res`; not merged). Worker notes: `docs/harness/2026-10-09-c3-reservation-home-notes.md` in that worktree.
- **Contracts:** packet `docs/harness/2026-10-09-c3-reservation-home-packet.md`; DECISIONS TL-P4-14 addenda 11, 13, 16, 19; TL-P4-17 addendum 1 (journal and drive-vault:1532 onto write-once `Intended`, with a port for where the id is kept; upload-queue stays allowlisted, the list may only shrink; batch sites as ruled).
- **The fixed question (TL-P4-15):** is there still, or newly, a second way to reserve and keep an id for an intended create? A yes blocks.
- **Look hardest at:**
  - a journal line kept on the device across a reload is sent under the same id, never a second file;
  - a 4xx releases the id, and a rate limit or quota keeps it;
  - a person's retry after a double failure is one line and one file;
  - the pile note stays keyed by pile id;
  - links and empty things send once;
  - sign-out still forgets what it must, and the outbox stays;
  - the rule test cannot be passed by renaming;
  - goldens C04 78 and 25-runs 88 are unchanged.
  - The worker allowlisted api/src/vault.ts (Worker template): judge whether that is a batch site as ruled or a gap.
- **Promised behaviour through the real entry point (TL-P4-17):** check the verify drives the journal through the app's change path, not only the helper.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-39-review-notes.md`.
