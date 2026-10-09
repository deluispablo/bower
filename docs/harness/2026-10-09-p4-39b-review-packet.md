# Packet: P4-39b check (c3-reservation-home fix round)

Starting model: Opus, fresh and read-only. Never start a server or run e2e; unit, runner and api tests only. Never `git checkout` in the main repo; run git with `-C /private/tmp/bower-c3-res`.

- **Diff:** `git diff f162b5c7..1ad773e5` (red `89bd9cfb`, fix `21789886`, notes `1ad773e5`). The whole entry is `e3eaee83..1ad773e5`.
- **Findings to check:** `/private/tmp/p4-39-review-notes.md` (P4-39 BLOCK). The worker's notes are `docs/harness/2026-10-09-c3-reservation-home-notes.md` in the worktree.
- **Ruling (TL-P4-17 addendum 3, main 35989307):** the rule test must fail on what the code does, not on a name. It either asserts that `generateIds` is reached only through write-once (import graph or a syntax rule), or asserts behaviour (one reservation per intent across a retry). api/src/vault.ts stays allowlisted (it becomes c3-reservation-worker). The allowlist may only shrink, and growing it must fail.
- **The fixed question:** second way? Your card must say "second way? no" or name it. A yes blocks.
- **Also:**
  - is the 409 explanation (notes #5) sound;
  - do the link-4xx and app-reload tests drive the real path;
  - are goldens C04 78 and 25-runs 88 unchanged.
- **Reply:** the review card from `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-39b-review-notes.md`.
