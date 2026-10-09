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
11. **Deferred to d-v2-07:** preen, sleep, startle, gaze and the blink bounds (TL-P4-21).
12. **Second-way risk:** no second animation system.

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
- `a minor bird steps out of sight under an overlay bird`: with an overlay Bower mounted, the minor bird is hidden, the same as a page bird.
- `a perched Bower with the turn idles through the engine and stays on its perch`: after N fake frames (seeded), the transform is not empty and translates to (x−Z/2, y−0.92Z) within the hop and bob.

## Verify (exact names and numbers)

- The three reds.
- New unit tests:
  - presence: `minor entries are ignored`, `the handle is set for the active bird, null for a still bird, and cleared on unmount`;
  - Rig: `the carry group exists, is hidden and reaches onPart`;
  - engine: `each pose loop matches its CSS reference`. For each of read, write, carry, proud and idle, the period is within ±10% of the CSS loop, the peaks within ±20% (or 2 px), and the rest frame within 1 px. No pose borrows another's act. Exact easing is not required.
  - `no CSS animation runs on a bird part while the engine runs`: getAnimations is empty.
- e2e qa6 and qa27 keep passing, on phone and desktop, with axe.
- `pnpm check` must be green.
- At the design check, the designer records 12 s per pose at 375, old against new.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-v2-perched-bower-notes.md`), with `tests changed:` lines. The card carries `worktree:`.

Reviewers are read-only. They never move the main checkout in any form.
