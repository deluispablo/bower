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
