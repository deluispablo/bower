# v2-perched-bower notes

- Commits: red `26b4b60d` (tests only), fix `e2038262`, compatibility row `49c2c357`, these notes.
- Worktree `/private/tmp/bower-v2-perched`, branch `v2-perched-bower` from `claude/p3` 52dac43e.

## Red (on 52dac43e)

- `a minor bird never takes the turn from the page's Bower`: `expect(chip).toHaveClass('still')` failed (newest bird won).
- `a perched Bower with the turn idles through the engine and stays on its perch`:
  `expect(bird).not.toHaveClass('posed')` failed (CSS-posed bird, no engine, no inner wrapper).
- `with Bower moves off or reduced motion, ...`: failed with `activeHandle is not a function` (no presence handle).
- Guard `a minor bird steps out of sight under an overlay bird` passed on 52dac43e and passes now.
- presence, Rig and the nine engine tests failed (`minor` ignored, no carry group, no `setPose`).

## Contract, point by point

1. `minor` prop on PoseBower; only `RunChip.tsx:22` uses it. TidySheet, TidyScene and every page bird unchanged.
2. `presence.ts`: `activeId` and `topPriority` skip minor entries; `useOutranked` is the one rule that hides them.
3. The bird with the engine renders `bird` without `posed <pose>`; without the turn (or moves off, or reduced motion)
   it renders `posed <pose> still`. When it loses the turn the hook calls `engine.release()`: stop, every transform
   attribute removed, the wrapper's inline transform/size/opacity cleared, the glyph hidden.
4. `engine.ts` `perch()`: fixed scripts per pose on the springs; read queues `peck(undefined, {...})` once per loop,
   proud queues `showOff({ turn: false, chirp: false, sparkle: false, ... })`, carry uses `holding(true)` (queued by
   `setPose`). All CSS keyframes and `animation` rules are gone from `poses.css`; the still frames stay.
   index.html keeps its own boot copy (unchanged).
5. `useBirdEngine(els, home, size, moves, look, use)`: `look` is `'document'` (perched) or `'parent'` (layer).
6. Rig always renders `b-carry` with `display="none"`; `RigPart` has `'carry'`; `.posed.carry .b-carry` shows it in
   the still frame; the engine shows it from `holding()` only when there is no HTML chip (`RigParts.carry`, documented
   as the label chip), so BowerLayer looks as before.
7. `EngineOptions { frame, cancelFrame, random }`, defaulting to requestAnimationFrame, cancelAnimationFrame and
   Math.random; every former `Math.random`/`rand` call goes through `this.random`.
8. Inner wrapper `.bird-perch` owned by the engine; the caller's `className` and `style` stay on the outer div.
   Caller transforms: none on a PoseBower box. Caller sizes: `signin.module.css` `.bird` resizes the box to 130 px
   on phones with `!important`, so PoseBower measures its box (`offsetWidth`, on mount and resize) and the engine
   draws to that size and home. `TidyScene` `.still` translates the wrapping div, not the bird.
9. `useBirdTurn(priority, { minor })` returns `{ turn, setHandle }`; PoseBower and BowerLayer updated.
   `activeHandle()` exported and tagged `@public` (d-v2-24 calls it; knip would report it otherwise).
10. BowerLayer uses the hook (same start/stop, visibility, snapHome on resize, pointer on the parent, poke, carry).
    PoseBower's home is `{x: Z/2, y: 0.92·Z}`; only the bird holding the turn mounts an engine.
11. All nine poses play in the engine and pass `each pose loop matches its CSS reference: <pose>`.
12. Blink: the engine's random blink on the injected random source; sleep keeps the eyes at 0.08 in `apply()`.
12a. No `idle()`, `look()` use or `turn()` while perched (`think()` returns after `perch()`). The pointer listener
    still records the pointer (`look()` stores it) for d-v2-07; the perched script never reads it. land plays its
    whole loop from (-120, -150) with its fade-in (wrapper opacity) and rests within 1 unit.
12b. The engine mounts only while turn, "Bower moves" and no reduced motion all hold.

## Choices to review

- The rig's breathing (`1 + 0.014·sin`) is the flier's only; a perched pose breathes only in sleep's script, so
  no pose borrows another's act.
- showOff gained `rise` (seconds to grow into the display) besides the named options: without it the tail and tuft
  springs overshoot proud's peaks by 30%. peck gained `kick` (the bite's bob; 0 for read) the same way.
- Wing beats in carry and land set the wing angle directly per frame, as the flight already does (`step()`), because a
  spring cannot follow a 0.1 s beat; the wing's scale is set by the script (the flier's relax toward 1 is skipped
  while perched).
- proud's rig scale is checked on its vertical factor (1.03); the engine derives the horizontal one from it
  (`1 + (1 − sy)·0.7`), so the chest-out width of the CSS (1.05) is not reproduced. Left for the design check.
- Rest within 1 is read as 1 degree for angles, 1 unit for offsets, 0.02 for scales; peak tolerance for still
  parts (peak = rest) is the rest tolerance.

## Gates

- Unit (fake frames, seeded random; no real timer): `src/bird/Bower.test.tsx` (4), `src/bird/presence.test.ts` (2),
  `src/bird/Rig.test.tsx` (1), `src/bird/engine.test.ts` (9): 16 pass. Log `/tmp/claude-501/vpb-unit.log`.
- e2e fake, phone and desktop, with axe: `e2e/bird-engine.spec.ts`, `e2e/qa6.spec.ts`, `e2e/qa27.spec.ts`:
  39 passed. Log `/tmp/claude-501/vpb-e2e.log`.
- `pnpm check`: see the card. Under machine load (load average 14) two unrelated tests timed out in full runs
  (`src/data/fake/fake-worker.test.ts` "note edits past the size cap wait for the next run", 30 s; a runner
  "every validation refusal is retried once with its reason", 5 s); each passes alone.
- `harness/unused-production-baseline.json`: one row added, `files src/bird/pose-reference.ts`. The packet names
  this test-only fixture; knip --production reports every test-support file (the c3 notes call that expected), and
  the baseline is shrink-only, so the lead should confirm the row.

## Sources

- requestAnimationFrame: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- Vitest fake timers fake requestAnimationFrame (`toFake`, `advanceTimersToNextFrame`):
  https://vitest.dev/api/vi.html#vi-usefaketimers. The engine takes the scheduler as an injected dependency instead,
  as the packet asks, so tests drive frames directly with no timer at all.
- Document.getAnimations (the e2e check): https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations
- knip JSDoc tags (`@public`): https://knip.dev/reference/jsdoc-tsdoc-tags

## tests changed

- none (all bird tests are new; no existing test was modified or deleted).

## Left out

- Gaze, preen and the blink bounds (d-v2-07); `react()` (d-v2-24); the carry chip's content (d-v2-06).

## Addendum 12: pose reference is a test fixture (TL-P4-22)

tests changed: src/bird/Bower.test.tsx: import moved to pose-reference.fixture.ts
tests changed: src/bird/engine.test.ts: import moved to pose-reference.fixture.ts
tests changed: src/bird/presence.test.ts: import moved to pose-reference.fixture.ts

Baseline rows removed from harness/unused-production-baseline.json:
- files src/bird/pose-reference.ts src/bird/pose-reference.ts
- exports src/data/fake/ordered-reports.fixture.ts SEQUENCES
- files src/testing/dependency-gate.ts src/testing/dependency-gate.ts
- files src/testing/loading-sources.ts src/testing/loading-sources.ts
- files src/testing/tidy-up.ts src/testing/tidy-up.ts
- files src/testing/upload-hook.ts src/testing/upload-hook.ts

## Round 2: the proud pose (TL-P4-22 addenda 14 and 15)

Red c58dc1c9 (tests and fixture only), fix 619b8640.

- **Fixture.** Each part gains `range` (its lowest and highest keyframe value over a loop, poses.css at 21648ecc)
  and, where the keyframes hold the peak, `hold`. The rig's scale is now read on both axes: `squash` (tall,
  `rig[6]`) and the new `stretch` (wide, `rig[5]`), with carry 1.08, proud 1.05, sleep 1.035 and land 1.12.
  Proud holds squash, stretch, pitch, tail and tuft through 0.2–0.5.
- **Checks.** Each axis's peak sits within ±20% of its excursion from 1 (the existing peak check, now per axis);
  a held peak stays within that tolerance through `hold`; no part goes more than 2° or 2 grid units past its
  range. For a scale part the allowance is 0.02 (2 units on the 100-unit body), the existing rest tolerance.
- **Red on proud (before):** stretch peak 0.022 (want 0.05), stretch down to 0.978, stretch 0.072 off its held
  peak, tail to +6.55 (range −22..0), tuft to −4.68 (range 0..16).
- **Fix.** `showOff` gains `wide` (the body's width at the swell) and `fall` (seconds of smoothstep return
  after `seconds`, inside the same action). One `girth` rule sets the rig's width from its height,
  `sx = 1 + (sy − 1) · girth`, in `apply` and `beak`; it defaults to −0.7 (today's volume-keeping rule, so
  every other pose's width is unchanged) and showOff sets it for its run, reset at its end and in `setPose`.
  Proud: `wide: 1.05, fall: 1.4` (rise 0.6 s, held to 1.5 s, back by 2.9 s of the 3 s loop).
- **Proud after:** stretch 1.000..1.052, squash 1.000..1.031, pitch −4.03..0.01, tail −22.79..0.10,
  tuft −0.10..16.70; every hold and rest check passes.
- **Other poses still red (not changed: contract 3 keeps their motion; a ruling is needed):**
  - idle: tail goes to +6.98 (range −14..4), the spring past the +4 flick;
  - carry: tail goes to −18.33 (range −16..0);
  - land: tail goes to +8.56 (range −18..5);
  - sleep: stretch peak 0.021, reference 0.035 ± 0.007 (the −0.7 girth gives 1.021 wide at 0.97 tall).
  - Seen but not tested (outside the packet's rig-scale holds): carry's legs stray 0.156 from the 0.55 tuck
    held at 22–48%.
- **Gates.** Verify units: the four poses above fail, the rest pass. e2e bird-engine, qa6, qa27 on phone and
  desktop, demo and fake: 37 and 39 passed. `pnpm check`: fails only on those four unit tests (0 lint errors).
- **Sources.** CSS `animation-timing-function` default `ease` per keyframe interval
  (https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timing-function); smoothstep
  (https://en.wikipedia.org/wiki/Smoothstep).

tests changed: src/bird/engine.test.ts: reads the rig's width as `stretch`; adds the range bound and the hold check
tests changed: src/bird/pose-reference.fixture.ts: adds `stretch`, `range` and `hold` per part

## Round 2, addendum 17: the other four poses (main 63566a5a)

Red 8f75c915 (fixture: carry's legs `hold: [0.22, 0.48]`; it failed with legs 0.156 off the 0.55 tuck), fix b1606f7d.
The bound and every tolerance are unchanged.

- **Tails (idle, carry, land).** Eased targets on the tail spring made it worse (idle +8.27, carry −19.62,
  land −20.59/+10.33): the spring (k 420, c 14) is underdamped and the flicks last 0.1–0.2 s. So the tail
  plays its keyframes straight on the part, eased in and out of each key, with no velocity: the way the carry
  wing already plays its beat in `perch`. `keyed()` gains an `eased` mode (smoothstep per interval) instead
  of a second helper.
- **Carry legs.** The same: the tuck is played on the part, eased, so it sits at 0.55 from 22% to 48%.
- **Sleep.** `girth` −7/6 in the sleep script, so 0.97 tall is 1.035 wide (breathe: scale(1.035, .97)).
- **Gates.** `pnpm check` green (3936 unit tests). e2e bird-engine, qa6 and qa27, phone and desktop, demo and
  fake: 37 and 39 passed.

tests changed: src/bird/pose-reference.fixture.ts: carry legs gain the 22–48% hold (addendum 17)
