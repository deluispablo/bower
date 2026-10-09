# Packet: v2-perched-bower (stage 4, preparatory refactor for d-v2-07, d-v2-24 and d-v2-06)

- **Entry:** `v2-perched-bower` (`ui: true`, escalated, `src/bird/` only). Worktree `/private/tmp/bower-v2-perched`, branch `v2-perched-bower` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-21, ruling 2 (`v2-perched-bower`, Opus) and order 2;
  - impact note, findings 5–6 and the section "PoseBower as a perched engine use" ([impact](impact/2026-10-09-v2.md));
  - TL-P4-20 trial: the reviewer signs off the acceptance contract before implementation;
  - TL-P4-22 (2): the designer signs off "What the person sees";
  - AGENTS: one animated bird per screen (`bird/presence.ts`), with "Bower moves" and reduced motion respected.
- **Starting model:** `bower-escalated`.

## Contract

1. **One engine hook.** `useBirdEngine(parts, home, size, moves)` is extracted from `BowerLayer` (`bird/Bower.tsx:85-153`).
   - `BowerLayer` uses it with its behaviour unchanged.
   - `PoseBower` uses it with a fixed home in its own box: `{x: size/2, y: 0.92*size}`.
   - Only the bird whose `useBirdTurn` is true mounts the engine. Every other bird renders today's CSS still frame.
   - The 16 call sites keep their props: `pose`, `size`, `priority`, `className`, `style`.
2. **Engine additions in `engine.ts`:**
   - `setPose(name)`, which springs to targets taken from the rest values of the keyframes in `poses.css`;
   - a perched flag, so `think()` never flies home (`:529-532`).
   - Everything runs on engine time (`S.t`, rAF), with no real timers. Preen, sleep, startle, gaze and the blink ranges belong to d-v2-07, not here.
3. **Presence, in `presence.ts`.**
   - Entries gain a `minor` flag, and a minor entry never takes the turn. The run chip's 34 px bird and the stopped-sheet bird use it.
   - The active entry holds a handle to its engine; d-v2-24's `react()` will use it.
4. **`Rig.tsx`** always renders the `b-carry` group, hidden, and exposes it as a part.
5. **`poses.css`** is kept for still frames and birds without the turn. The `land` pose stays for `index.html`'s boot copy.
6. **Second-way risk:** no second animation system. A posed bird with the turn animates through the engine, never through new CSS keyframes.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

| Screen and state | Before | After |
| --- | --- | --- |
| Any screen with one Bower (Home, a note, Settings, Add, a pile) | The page's Bower idles as today. | The same: same poses, sizes and places. A perched Bower with the turn idles through the engine (breath and blink as today), never flying away from its perch. |
| A screen with the run chip showing | The chip's 34 px bird can take the turn from the page's Bower (finding 6). | The page's Bower keeps the turn. The chip's bird shows its still frame. |
| The stopped-tidy-up sheet's bird | It can take the turn. | It shows its still frame and never takes the turn. |
| "Bower moves" off, or reduced motion | Still frames. | The same: still frames, with no engine motion. |
| Boot screen (`index.html`) | The `land` pose. | Unchanged. |

There are no strings and no new poses. Preen, sleep, startle and gaze come later, with d-v2-07.

## Red

- `a minor bird never takes the turn from the page's Bower`: with the page's Bower and the run chip both mounted, the page's Bower is the one that moves. Today the chip's bird wins.
- `a perched Bower with the turn idles through the engine and stays on its perch`: with fake rAF, it shows engine motion, and its position stays at its home.

## Verify (exact names)

- The two reds.
- The existing `src/bird/` tests stay green: engine, presence and Bower.
- e2e: today's bird and presence e2e, on phone and desktop, with axe.
- `pnpm check` must be green.
- Goldens are unaffected.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-v2-perched-bower-notes.md`), with `tests changed:` lines. The card carries `worktree:`.

Reviewers are read-only. They never move the main checkout in any form.
