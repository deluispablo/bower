# Packet: P4-53 review (v2-perched-bower proud round; TL-P4-22 addenda 14, 15 and 17)

This review is read-only and fresh. Run unit tests only; never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-perched2`.

## What to review

- **Diff:** `git diff f2ddcf8c..v2-perched-bower -- src/bird docs/harness/2026-10-09-v2-perched-bower-notes.md`. The commits:
  - red c58dc1c9, fix 619b8640, notes 5bfc9832;
  - merge f343e601;
  - addendum 17: red 8f75c915, fix b1606f7d, notes 56512ff1.
- **Packet:** `docs/harness/2026-10-09-v2-perched-bower-round2-packet.md`, including its "Addendum 17" section.
- **Fixed questions (TL-P4-20):** contract first, then a second way (a second easing path, a second scale rule, or a second animation system). Give every finding a severity.

## Look hardest at

- **The fixture** (`pose-reference.fixture.ts`): each part's `range` and `hold`, and the rig's scale on both axes (`squash` and `stretch`). Check them against `poses.css` at 21648ecc for all nine poses, including carry legs 0.55 held at 22–48% and sleep at 1.035 by 0.97.
- **The bound is not widened:** at most 2° (or 2 units, or 0.02 for scale) beyond each part's reference range. Hold windows are checked within the peak tolerance.
- **The fix in `engine.ts`:**
  - `showOff` gains `wide` and `fall`;
  - one `girth` rule sets width from height, in `apply` and `beak`, defaulting to the old volume-keeping −0.7, reset at the end and in `setPose`.
  - Is `girth` one rule, or does it leak between poses?
  - How the idle, carry and land tails lose their overshoot; and the sleep stretch.
- **No real timers.** The injected scheduler and random source stay test-only.
- **Housekeeping:** the `tests changed:` lines, no `.only` or `.skip`, and the compatibility rows.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters.
