# Packet: P4-58f delta review (d-v2-07: allowlist own-property, TL-P4-22 addendum 22; jump bound, TL-P4-25 addendum 5)

This review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-d-v2-07b`.

## What to review

- **Delta:** `git diff 167b093d..66bf6930`. Commits 34f10c8f, f11ee014, 897e5d5b, 47c3fd5c, 172989da and 66bf6930, with merges of claude/p3 between them.
- **Contract:** the sections "TL-P4-22 addendum 22" and "TL-P4-25 addendum 5" in `docs/harness/2026-10-09-d-v2-07-round4-packet.md`.
- **What it answers:** the "Allowlist and head pass" in `docs/harness/2026-10-09-codex-d-v2-07-review.md` (2 Important).

## Look hardest at

- **The allowlist** is a `Set` (or uses `Object.hasOwn`). An inherited name such as `toString` is not listed, and the growth check counts the same `Set`.
- **The jump bound, checked per move class.**
  - Returns are ease-in-out: speed starts and ends near 0, changes by at most 1.5°/frame between frames, and never goes over 6°/frame.
  - Snaps and the startle rise stay at or below 6°/frame and land with no overshoot past 2°.
  - The worker read "ends near 0" as ≤ 1.5°/frame. Is that honest?
- **The red's numbers.** A worker may not loosen its own red (TL-P4-22 addendum 22). Compare each red commit with its fix: no threshold or number may change between them.
- **No other d-v2-07 behaviour changed,** and the engine's return actually eases (it is not a test-only change).
- **Housekeeping:** the `tests changed:` lines, no `.only`/`.skip`, no real timers.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
