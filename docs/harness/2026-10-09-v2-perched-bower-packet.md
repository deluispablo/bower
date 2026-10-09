# Packet: v2-perched-bower (stage 4, preparatory refactor for d-v2-07, d-v2-24 and d-v2-06)

- **Entry:** `v2-perched-bower` (`ui: true`, escalated, `src/bird/` only). Worktree `/private/tmp/bower-v2-perched`, branch `v2-perched-bower` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-21, ruling 2 (`v2-perched-bower`, Opus) and order 2;
  - impact note, findings 5–6 and the section "PoseBower as a perched engine use" ([impact](impact/2026-10-09-v2.md));
  - TL-P4-20 trial: the reviewer signs off the acceptance contract before implementation;
  - TL-P4-22 (2): the designer signs off "What the person sees";
  - AGENTS: one animated bird per screen (`bird/presence.ts`), with "Bower moves" and reduced motion respected.
- **Starting model:** `bower-escalated`.

## Contract (TL-P4-22 addenda 6 and 7, main 3e37376d; replaces the first draft after the contract review)

1. **`minor` prop.** PoseBower gains an optional `minor` prop; this is additive. The only minor bird is `RunChip.tsx:22`, the 34 px one. TidySheet:77 and TidyScene:217, including the stopped bird, are the sheet's Bower and keep the turn. Home's card birds, Welcome's two and the note's two stay page birds. Until d-v2-07, the chip bird shows its still frame.
2. **Presence ignores minor entries** (`presence.ts:18-24` activeId, `:47` topPriority). A minor bird never takes the turn and never outranks another bird. Under an overlay that has its own Bower, a minor bird steps out of sight the same way page birds do: one presence rule, with no exception.
3. **CSS stays off the engine's bird.** The engine-owned bird carries no `posed <pose>` classes, because CSS transforms beat the engine's SVG attributes (`poses.css:4-9`, `engine.ts:663-681`). When a bird loses the turn, the engine stops, clears its attributes and restores `posed <pose> still`.
4. **Loops through the engine.** The engine's named poses reproduce today's idle acts and the read, write, carry and proud loops with its existing actions: peck at :338, holding at :423, showOff at :430, and the head and jaw springs. `poses.css` is the motion reference. The idle acts are the two head snaps, the tail flick and the blink of the 6 s loop. Then delete the CSS animations, so there is one animation home; the still frames stay. No new motion design.
5. **One listener home.** The hook takes a `look` source argument: `document` for the perched bird, the parent for the layer. d-v2-07 uses it.
6. **One home for what Bower holds: `holding()`.**
   - The SVG `b-carry` is always rendered, hidden, and `RigPart` gains `'carry'`.
   - `holding(true)` shows it, and so does a `.posed.carry .b-carry` still-frame rule.
   - The engine's HTML `carry` (`engine.ts:33`) is documented as the label chip. d-v2-06 changes its content and never adds a third carry.
7. **Injected sources.** The engine takes an injected frame scheduler and random source. They default to `requestAnimationFrame` (:137, :503) and `Math.random` (:68, :572, :615), so tests run on fake frames with a seed.
8. **Inner wrapper.** The engine owns an inner wrapper. The caller's `className` and `style` stay on the outer div. List any caller transform in the notes.
9. **Turn and handle API.** `useBirdTurn(priority, { minor })` returns `{ turn, setHandle }`, and its callers in src/bird are updated. Presence exports `activeHandle()` for d-v2-24's `react()`.
10. **The engine hook.** `useBirdEngine(parts, home, size, moves, look)` is extracted from `BowerLayer` (`Bower.tsx:85-153`). BowerLayer keeps its behaviour. PoseBower uses it with a fixed home, `{x: size/2, y: 0.92*size}`. Only the bird holding the turn mounts the engine.
11. **All nine poses through the engine (TL-P4-22 addendum 8, main 7f07fe39).** The engine plays each pose under addendum 7's criteria:
    - read, write, carry, proud, idle;
    - wait: look plus tuft;
    - sleep: eyes closed plus the breathe loop, and no blink;
    - alarm: the startle;
    - land: its landing loop.
12. **Blink.** The perched bird uses the engine's random blink (TL-P4-21 addendum 1), and d-v2-07 owns its bounds. Blink is left out of the period check. In sleep, the eyes stay closed through the blink spring, in the one apply (engine.ts:~679).
12a. **Pose scripts (TL-P4-22 addendum 9, main bd16cf97).**
   - Each pose runs a fixed script. A perched bird never calls the random `idle()`, `look()` or `turn()`; gaze arrives with d-v2-07.
   - The existing actions take options: `peck` gets depth and angles, and `showOff` gets no turn, no chirp and no sparkle. No new loop action is added.
   - `land` plays its whole loop (it starts off the perch at translate(-120,-150), poses.css:65). It is exempt from the perch bounds, but its rest frame stays within 1 px.
12b. **When the engine mounts.** It mounts only while both the turn and "Bower moves" hold, and reduced motion is off. Otherwise the bird shows its still frame.
13. **Deferred to d-v2-07:** preen, gaze, and the blink bounds.
14. **Second-way risk:** no second animation system.

## What the person sees (TL-P4-22; signed off by the designer with addendum 7's answers)

| Screen and state | After |
| --- | --- |
| Any screen with one page Bower (Home, a note, Settings, Add, a pile) | Same poses, sizes and places as today. A perched Bower with the turn shows today's idle acts (two head snaps, the tail flick, the 6 s blink) and each pose's own motion (read bobs, write pecks, carry, proud), played by the engine with today's keyframe values. It never looks less alive than today, and it never flies off its perch. |
| A screen with the run chip showing | The page's Bower keeps the turn. The chip's 34 px bird shows its still frame. |
| TidySheet and TidyScene, the stopped bird included | That is the sheet's Bower, and it keeps the turn while the sheet is open. Page and minor birds step out of sight under it, as today. |
| "Bower moves" off, or reduced motion | Still frames, with no engine motion. |
| Boot screen (`index.html`) | Unchanged. |

## Red

- `a minor bird never takes the turn from the page's Bower`: with the page Bower and the run chip mounted, the chip bird has the `still` class and the page bird has the turn.
- `with Bower moves off or reduced motion, the bird with the turn shows its still frame and mounts no engine` (in `src/bird/Bower.test.tsx`).
- Guard (passes today, presence.ts:50-59; it must keep passing): `a minor bird steps out of sight under an overlay bird`.
- `a perched Bower with the turn idles through the engine and stays on its perch`: after N fake frames from the injected scheduler (seeded), the transform is not empty and translates to (x−Z/2, y−0.92Z) within the hop and bob. **This red must fail today.**

## Verify (exact names and numbers)

- The reds and the guard.
- New unit tests:
  - presence: `minor entries are ignored`, `the handle is set for the active bird, null for a still bird, and cleared on unmount`;
  - Rig: `the carry group exists, is hidden and reaches onPart`;
  - engine: `each pose loop matches its CSS reference`, for each of the nine poses.
    - The reference is a test-only constants fixture, `src/bird/pose-reference.ts`, copied from `poses.css` before the animations are deleted: for each pose, the period, then each part's peak angle or offset and its rest values.
    - Checks:
      - the period is within ±10%, with blink left out;
      - each peak is within ±20%, or 2 px for offsets. For scale parts (proud, breathe, wing, legs, eye), the peak is the scale factor's excursion from 1, and the tolerance is ±20% of that excursion;
      - the rest frame is within 1 px, or 0.02 for scale;
      - no pose borrows another's act.
    - A peak is the largest excursion of a part's angle, offset or scale from rest over one period.
    - land is exempt from the perch bounds only.
    - Exact easing is not required.
- Test files:
  - the reds and the motion guard in `src/bird/Bower.test.tsx`;
  - presence in `src/bird/presence.test.ts`;
  - Rig in `src/bird/Rig.test.tsx`;
  - engine in `src/bird/engine.test.ts`;
  - the e2e in `e2e/bird-engine.spec.ts`.
- Tests inject the frame scheduler and the random source through an optional `engineOptions` prop on PoseBower and BowerLayer. It is test-only, and it defaults to requestAnimationFrame and Math.random. Fake frames come from the injected scheduler.
- `minor entries are ignored` asserts both activeId and topPriority.
- e2e: `no CSS animation runs on a bird part while the engine runs` (getAnimations is empty), on phone and desktop. jsdom runs no CSS, so this cannot be a unit test.
- e2e qa6 and qa27 keep passing, on phone and desktop, with axe.
- `pnpm check` must be green.
- At the design check, the designer records 12 s per pose at 375, old against new.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-v2-perched-bower-notes.md`), with `tests changed:` lines. The card carries `worktree:`.

Reviewers are read-only. They never move the main checkout in any form.

## Contract sign-off trial (TL-P4-20)

The contract took 3 passes: 7, 6 and 7 changes, ruled in TL-P4-22 addenda 6–9. The lead dispatched it without a 4th pass.
