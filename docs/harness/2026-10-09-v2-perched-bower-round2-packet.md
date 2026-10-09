# Packet: v2-perched-bower fix round (TL-P4-22 addenda 14 and 15)

- **Entry:** `v2-perched-bower` (`ui: true`, escalated). A fix round after the designer's check at 21c97eba. Worktree `/private/tmp/bower-perched2`, branch `v2-perched-bower` from `claude/p3`.
- **Ruling sweep:** TL-P4-22 addenda 14 and 15 (main ec5dc0c6); DEFECT_LOG `perched-proud-shape`; the first packet's "What the person sees" table and its addenda 6–9 contract, which still hold.
- **Starting model:** `bower-escalated` (fresh Opus). There is no diagnoser, because the cause is local and measured. The review is not skipped (the entry is escalated). Then the designer checks proud again.
- **Research first:** the CSS reference is `poses.css` as it was at 21648ecc. The reference fixture is `src/bird/pose-reference.fixture.ts`.

## What was found (designer, 12 s per pose at 375, old 21648ecc against new 21c97eba)

- **Proud no longer puffs the chest.** The CSS scale is 1.05 wide by 1.03 tall. The engine's `showOff` (`src/bird/engine.ts:742`, `swell: 1.03`) gives 0.978–1.007 wide by 1.03 tall, so Bower gets thinner and taller (about 5 px at 110 px).
- **Tail and tuft spring past their range:** +6.6° and −4.7°, over 20% of their peaks. The fan hold is shorter (median tail −3° against −18°).
- The other eight poses pass.

## Contract

1. **Proud's peak scale is 1.05 wide by 1.03 tall.** It is held through 20–50% of the 3 s loop and followed by an eased return.
2. **The bound (addendum 15):** no part goes more than 2° beyond the CSS reference's own range for that part, in all nine poses.
   - The bound is not "past rest". Several references cross rest by design: idle's tail flicks to +4°, land's tail to +5°, and read's head goes to −10° after +14°.
   - Proud's tail and tuft ranges are one-sided (0 to −22°, 0 to 16°), so the 2° allowance still catches the overshoot.
3. **src/bird only.** The other eight poses keep their verified motion. No second engine path, and no CSS animation comes back.

## Red

The class gap: the reference fixture let proud pass because it had no scale peaks and no range bound. The fixture gains:
- the scale peaks (wide and tall separately) and the hold window of every pose that has them;
- each part's reference range (min and max), for all nine poses.

`each pose loop matches its CSS reference` (`src/bird/engine.test.ts`) gains these checks:
- each scale axis's peak is within ±20% of the reference excursion from 1;
- a held peak stays within tolerance through the reference's hold window;
- no part goes more than 2° (or 2 px) beyond the reference range.

**The red must fail today on proud,** on its width scale and on the tail and tuft overshoot. If another pose also fails the new bound, say so on the card. Do not widen a bound to make it pass: ask the coordinator.

## Verify

- The red, plus every verify of the first round (the entry's `verify` in features.json).
- e2e `no CSS animation runs on a bird part while the engine runs`, plus qa6 and qa27, on phone and desktop, with axe.
- `pnpm check` is green.
- Run heavy commands through `bash harness/with-lock.sh`.

## Commits

1. The red (tests and fixture only).
2. The fix.
3. A notes addendum in its own commit (`docs/harness/2026-10-09-v2-perched-bower-notes.md`), with `tests changed:` lines.

The card carries `worktree:`. Reviewers are read-only. They never move the main checkout in any form.
