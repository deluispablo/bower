# Codex review of d-v2-07 (TL-P4-23 ruling 6)

Range 4a75046f..4b43b268 (worktree /private/tmp/bower-d-v2-07), read-only, medium effort.

1. **Important — `src/bird/engine.ts:874`** — A layer tap waits for the whole script, rather than the current action. Queue a flight followed by `wait(10)`, then tap during flight: landing returns without consuming `S.tap`, and the wait starts next frame. Carrying also prevents consumption at line 889. **Mechanism home violated:** engine’s single tap slot; TL-P4-25 addendum 3(4) requires playback when the current action ends.

2. **Important — `src/bird/engine.ts:498`** — Immediate interruption does not cut directly rendered working-pose cycles. Tap midway through `carry` or `write`: `poseActed` becomes true, but those branches never consult it, so `perch()` continues writing their head, wing, tail and body targets during the tap. **Mechanism home violated:** `interrupt({ now: true })` and `perch()`; addendum 2(4) requires cutting the running pose cycle.

3. **Important — `src/bird/Bower.tsx:153`** — Keyboard input is discarded when body has focus. With idle Bower visible, repeatedly press ArrowDown to scroll without focusing a control: these events neither postpone sleep nor wake Bower after it sleeps. **Mechanism home violated:** `useBirdEngine`’s look source and engine input clock; addendum 2(5) requires every input event to mark recency.

4. **Important — `src/bird/engine.ts:1056`** — Input suppresses future snap/preen draws but leaves an existing snap/preen running. Move the pointer just after preen starts: its remaining head dips continue while gaze follows the pointer. **Mechanism home violated:** `engine.idle()`’s act scheduling and input recency; the contract prohibits snap and preen while input is recent.

5. **Important — `src/bird/engine.ts:1079`** — Focus gaze persists after focus leaves the control. Focus a button, then blur or remove it without pointer input: no focus-loss listener clears the saved point, and `'focus'` bypasses expiry indefinitely. **Mechanism home violated:** `useBirdEngine`’s look source and engine gaze channel; addendum 2(5) holds gaze only while focus stays on the control.

findings: 5
