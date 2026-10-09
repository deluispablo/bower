# Packet: P4-58e delta review (d-v2-07: closed allowlist, TL-P4-22 addendum 21; the step owns the head, TL-P4-25 addendum 4)

The review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-d-v2-07b`.

## Scope

- **Delta:** `git diff 296b8021..167b093d`.
  - Allowlist: red 49b43383, fix 16401342.
  - Head: red 8e32fcc0, fix 1fc6b9b6.
  - Notes: 167b093d.
- **Contract:** the "Addendum 21" and "TL-P4-25 addendum 4" sections of `docs/harness/2026-10-09-d-v2-07-round4-packet.md`.
- **What it answers:** the "Startle round pass" section of `docs/harness/2026-10-09-codex-d-v2-07-review.md` (2 Important).

## Look hardest at

- **The allowlist.**
  - It is closed: exact names, each with a one-line reason.
  - A name tagged `script` that is not on the list fails.
  - The list may only shrink, and a check enforces that.
  - There is no open label left.
- **The step owns the head.** While a reaction or startle step plays, gaze moves the iris only. When the step ends, the head offset eases back with no jump.
- **Possible test tampering.** The card says: "changed in fix: gaze red's jump limit 3 -> under 6 deg per frame (gaze spring ~5/frame)".
  - Was a red's threshold loosened in the fix commit?
  - Is 6°/frame honest for "no jump", or does it hide one?
  - Compare 8e32fcc0 with 1fc6b9b6 for that test, and say whether it needed a lead ruling.
- **Housekeeping:** the `tests changed:` lines, no `.only`/`.skip`, no real timers, and no other d-v2-07 change.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters.
