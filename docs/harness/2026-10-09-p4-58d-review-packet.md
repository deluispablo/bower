# Packet: P4-58d delta review (d-v2-07 startle round, TL-P4-22 addendum 20, TL-P4-26 addendum 1)

This review is read-only and fresh. Run unit tests only; never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-d-v2-07b`.

## What to review

- **Delta:** `git diff e49ff311..296b8021`.
  - Red 390dd03b, fix 2b8581b2.
  - Head red 449ffddd and head fix fabd2aaa, from the correction to one startle step.
  - Notes 296b8021.
- **Contract:** `docs/harness/2026-10-09-d-v2-07-round4-packet.md`, corrected to one startle step: tuft 18° plus head −10°, held 0.6 s.
- **Defect:** `wake-startle-overshoot`.

## Look hardest at

- **The one startle step.**
  - Tuft 18 ±2 and head −10 ±2 at the peak, held 0.6 s.
  - The return is eased with no overshoot or undershoot beyond 2°. It uses proud's easing (`keyed(…, true)`, showOff `fall`), with no second easing path.
  - There is one startle; d-v2-24a will reuse it.
- **The meta-test** `every engine act has a reference row`:
  - Does it really enumerate every exposed act or action name?
  - The card says layer script steps (flyTo, peck, showOff, poke and others) are marked `script` with no rows yet, and the lead decides.
  - Is a `script` exemption a loophole that would let a new act escape the test?
- **Nothing else in d-v2-07 changed.** The other rows are verified by the designer.
- **Housekeeping:** the `tests changed:` lines; no `.only`, `.skip` or real timers.

## Reply

Give the review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters.
