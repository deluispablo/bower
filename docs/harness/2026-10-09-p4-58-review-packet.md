# Packet: P4-58 review (d-v2-07, escalated, ui: true)

The review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-d-v2-07`.

## What to review

- **Diff:** `git diff 4a75046f63e49fce810336b05042ea0241a1a27a..d-v2-07`. Red e3fbbfc8, fix 08f344c1, notes ce58bf56 and 4b43b268.
- **Packet:** `docs/harness/2026-10-09-d-v2-07-packet.md`. The contract is signed after 3 passes, and governed by TL-P4-25 and its addenda 1–3. The designer has re-signed the table.
- **Fixed questions (TL-P4-20):** contract first, then second ways (a second idle loop, a second presence registry, a second poke queue, a second reduced-motion reader). Give every finding a severity.

## Look hardest at

- **One mind, one pose script.** `perch()` hands idle and wait to the mind and keeps only their rest frames. Wait holds its tuft at 8°.
- **Two channels.**
  - Gaze is the mind's. In working poses it moves the iris only. In idle and wait it adds a head offset clamped to the pose's CSS range.
  - Acts belong to the script in working poses and to the mind in idle and wait.
- **The act table.** Check the values, the weights (40/20/12/10/8 plus a pause of 10) and the timer (0.8–2 s). `act(name)` is public, and the private one is renamed. The fixture has entries for jaw 14, wing −10, preen 38/42 and look.
- **`interrupt({ now: true })`.** It cuts at the next frame, keeps `B.carrying`, and runs only that act's own cleanup. A layer bird's latest tap goes in one slot (not `S.queue`), plays when the current action ends, and is cleared by setPose or interrupt. BowerLayer's tap follows the same rule.
- **Input.**
  - `look(p, source)`, `nudge()` and recency.
  - keydown and focusin look at the focused control's rect. The card says "keydown with focus on body is not counted as input". Check that against addendum 2 (5): every input event marks recency.
  - 60 s sleep runs on the engine clock, measured from the last input or from mount. The hidden-tab clock pauses.
- **Sleep.** One `asleep` flag. Waking restores girth, and setPose clears `asleep`. A bird in the sleep pose ignores input and taps.
- **Reduced motion.** The home is `src/ui/media.ts` `useMedia`, and `prefersReducedMotion()` is deleted. The card says the PointerEvent polyfill was not needed (jsdom 30 has PointerEvent): check that.
- **The chip** keeps its still frame. presence.ts is untouched.
- **Tests.**
  - Every named Verify test exists. Guards are labelled. Each red failed today, and the notes list which.
  - The e2e polls and has no fixed wait.
  - The `tests changed:` lines are present. No `.only`/`.skip`, no real timers.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK), every line under 120 characters.
