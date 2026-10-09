# Codex review of d-v2-07 (TL-P4-23 ruling 6)

Range 4a75046f..4b43b268 (worktree /private/tmp/bower-d-v2-07), read-only, medium effort.

1. **Important — `src/bird/engine.ts:874`** — A layer tap waits for the whole script, rather than the current action. Queue a flight followed by `wait(10)`, then tap during flight: landing returns without consuming `S.tap`, and the wait starts next frame. Carrying also prevents consumption at line 889. **Mechanism home violated:** engine’s single tap slot; TL-P4-25 addendum 3(4) requires playback when the current action ends.

2. **Important — `src/bird/engine.ts:498`** — Immediate interruption does not cut directly rendered working-pose cycles. Tap midway through `carry` or `write`: `poseActed` becomes true, but those branches never consult it, so `perch()` continues writing their head, wing, tail and body targets during the tap. **Mechanism home violated:** `interrupt({ now: true })` and `perch()`; addendum 2(4) requires cutting the running pose cycle.

3. **Important — `src/bird/Bower.tsx:153`** — Keyboard input is discarded when body has focus. With idle Bower visible, repeatedly press ArrowDown to scroll without focusing a control: these events neither postpone sleep nor wake Bower after it sleeps. **Mechanism home violated:** `useBirdEngine`’s look source and engine input clock; addendum 2(5) requires every input event to mark recency.

4. **Important — `src/bird/engine.ts:1056`** — Input suppresses future snap/preen draws but leaves an existing snap/preen running. Move the pointer just after preen starts: its remaining head dips continue while gaze follows the pointer. **Mechanism home violated:** `engine.idle()`’s act scheduling and input recency; the contract prohibits snap and preen while input is recent.

5. **Important — `src/bird/engine.ts:1079`** — Focus gaze persists after focus leaves the control. Focus a button, then blur or remove it without pointer input: no focus-loss listener clears the saved point, and `'focus'` bypasses expiry indefinitely. **Mechanism home violated:** `useBirdEngine`’s look source and engine gaze channel; addendum 2(5) holds gaze only while focus stays on the control.

findings: 5

## Fix-round pass (d00dba83..504e6cbd)

1. **Important — `src/bird/engine.ts:399`** — Input can erase a pending layer script. While preen or snap runs between flights, queue `flyTo(...).then(callback)` and move the pointer or tap before the next frame. `heard()` calls `interrupt({ now: true })`, which clears `S.queue`; the flight and callback never run. Reproduced with injected frames. **Mechanism home violated:** engine act ownership and the single tap slot; layer taps must preserve the script and play after its current action.

2. **Important — `src/bird/engine.ts:1103`** — Prior finding 5 remains unfixed in working poses. Focus a control beside a write-pose Bower, then blur or remove it. The getter correctly returns null, but `gaze()` returns without resetting the iris targets; working poses never call `rest()`. Reproduced: iris stayed at `translate(1.15 1.06)` five engine seconds after blur. **Mechanism home violated:** `useBirdEngine`’s look source and engine gaze channel; addendum 2(5) permits focus gaze only while focus stays on the control.

findings: 2

## Round 3 pass (504e6cbd..691dfc43)

verdict: PASS
range: 504e6cbd..691dfc43
prior findings: Both fix-round findings and all five original findings are fixed by code inspection.
second way: No new loop, timer, input listener system or tap queue.
validation: Read-only inspection; tests not run.
findings: 0

## Startle round pass (e49ff311..296b8021)

- **Important — `src/bird/engine.ts:1111`: Wake startle’s visible head exceeds the ±2° bound.** The startle pins the head to −10°, but `gaze()` still runs and `apply()` adds its angle. Concrete reproduction: idle Bower at home `(50,92)`, size 100, sleeps for 61 seconds; wake with `look({x:200,y:-100}, 'focus')`. Injected frames show the head held at **−22°**, while the tuft holds 18°. A focus point `(200,250)` produces **−3°**. The new test exercises only `nudge()` without gaze, so misses both failures. Mechanism home violated: the one startle step in `BirdEngine`’s mind, with the packet’s bounded head movement.

- **Important — `src/bird/engine.test.ts:238`: The meta-test permits exposed actions without reference rows.** It ignores members classified as `script` or `control`; `EngineMember` explicitly permits both. Concrete scenario: add a public motion method `stretch()` and classify it as `stretch: 'script'` in `ENGINE_MEMBERS`. Compilation and the meta-test pass without any reference row. Existing script actions are likewise exempt. Mechanism home violated: `pose-reference.fixture.ts` and its meta-test, which the packet requires to cover every exposed act or action name.

findings: 2

## Allowlist and head pass (296b8021..167b093d)

1. **Important — `src/bird/pose-reference.fixture.ts:329`: inherited properties bypass the closed allowlist.** Add a public `toString()` action and label it `script`: `exempt['toString']` resolves to `Object.prototype.toString`, so the meta-test passes without a reference row or allowlist entry. The growth check uses `Object.keys`, which also misses inherited names. **Violated home:** the reference meta-test’s exact-name allowlist, packet addendum 21.

2. **Important — `src/bird/engine.test.ts:285`: the fix weakens its red threshold from ≤3° to <6° per frame.** Replaying the test’s injected frames gives a 4.98° wake-rise jump; the upward focus gaze also returns with a 3.35° jump. Both fail the original assertion and pass the replacement. **Violated home:** the startle/gaze regression test and WORKER’s rule against weakening tests to reach green.

findings: 2

## Own-property and bound pass (167b093d..66bf6930)

1. **Important — `src/bird/engine.ts:1139`: gaze return breaks the 1.5°/frame speed-change bound when focus disappears.** Sleep idle Bower for 61 s, wake using `look(() => target, 'focus')` at `(200,-100)`, then set `target = null` after 80 injected frames. The return continues toward the captured −12° target before handing back to the spring. At 1.583 s, head speed jumps from 0 to 3°/frame. **Violated home:** BirdEngine’s gaze return, packet TL-P4-25 addendum 5.

2. **Important — `src/bird/pose-reference.fixture.ts:333`: a new public action can bypass reference coverage by being tagged `acts`.** Add `stretch()` and register `stretch: 'acts'` in `ENGINE_MEMBERS`, without a reference row. `unreferencedMembers` returns `[]`: it checks existing `ACT_NAMES`, ignoring the new member’s name, and the allowlist growth check also passes. **Violated home:** the reference meta-test’s requirement that every exposed act or action have a row.

findings: 2

## Round 5 pass (motion profile, TL-P4-25 addendum 7; scope 66bf6930..f7e2c413 -- src/bird)

Read-only, medium effort, after P4-58g PASS. Tokens: input 417809 (cached 361344), output 3203.

1. **Important — `src/bird/engine.ts:98–100`: both caps grow with frame duration.** After 30 idle frames, call `act('snap')` with random returning 0.5, then deliver a 33.33 ms animation frame. The head moves from 0° to 7° in that frame, exceeding 6°/frame. Separately, `look({x:200,y:-100}, 'focus')` followed by 30 fps frames produces head speeds −5.80, −6.00, −0.20°/frame: the first speed change is 5.80°, exceeding 1.5°. Reproduced through the engine’s frame callback. This breaks contract item 3 and addendum 7. The 0.02 rounding margin is conservative at 60 fps, but does not protect these bounds when `dt` increases.

2. **Important — `src/bird/engine.test.ts:374`: the property exempts gaze from its acceleration assertion.** `snap = rising || gazing` means ordinary focus, pointer and touch gaze frames never reach the ≤1.5°/frame speed-change check at line 378. Concrete scenario: focus at `(200,−100)` after 30 idle frames; a faulty gaze implementation could move 0→−5.98° on the next frame and pass this property’s checks. Its speed is below 6°, its angle is inside the permitted range, and its acceleration assertion is skipped. Contract item 3 and addendum 7 explicitly classify gaze as acceleration-capped. The property also uses only fixed 60 fps callbacks, leaving finding 1 undetected.

findings: 2

## Round 6 pass (rates, TL-P4-25 addendum 8; scope f7e2c413..54ede22a -- src/bird)

Read-only, medium effort. Tokens: input 364182 (cached 320128), output 3434.

1. **Important — src/bird/engine.ts:1244:** Gaze inherits the snap’s unlimited acceleration. At 60 fps, hold focus at `(200, −100)` for 180 frames, call `act('snap')` with random returning `0.5`, then run five frames. The head rests at −5°. Change the focus callback’s point to `(200, 250)`: the next frame moves to 0.98°, changing velocity from 0 to 358.8°/s—**21,528°/s²**. Breaks round 6 item 2: gaze is always a return, capped at 5400°/s².

2. **Important — src/bird/engine.ts:1243–1244:** The startle switches to the return profile before landing, retaining velocity that carries it past the 2° bound. At 60 fps, run `act('preen')` for 36 frames until the head reaches 42°, then call `nudge()`. Startle frames 9–12 draw −10.34°, −13.36°, −14.90° and −14.96°. The overshoot reaches **4.96°** past −10°. Breaks round 6 item 1: startle landing must not overshoot by more than 2°.

findings: 2

## Round 7 pass (scope 54ede22a..aa95b666 -- src/bird)

Read-only, medium effort. Tokens: input 364616 (cached 322048), output 3763. Stop rule (TL-P4-25 addendum 9): no round 8; the lead re-plans.

1. **Important — `src/bird/engine.ts:1242–1249`: Startle still hands over before landing within 2°.** At 60 fps, run `act('preen')` for 36 frames, reaching 42°, then call `nudge()`. Startle frame 8 draws −4.615°. On frame 9, `rising` becomes false and the return profile takes over; that frame draws −7.89°, still **2.11° from the −10° target**. This breaks the required landing within 2° before any hand-over. The new red checks overshoot and the angle after 45 frames, so it passes despite this premature transition.

findings: 1

## Round 8 pass (scope aa95b666..0496870d -- src/bird)

Read-only, medium effort. Tokens: input 265959 (cached 221824), output 1871.

1. **Important — `src/bird/engine.test.ts:625–626`** — The property can indefinitely skip the return acceleration bound when a snap misses its expected target. Concrete scenario: `snapGaze` sets the expected target to −5°. A faulty snap lands at 0°; subsequent gaze jumps from 0° to 7° at 60 fps, then stays there. These frames satisfy the property’s speed and range checks, but the jump exceeds 5400°/s². Because the head never settles near −5°, `snapTarget` never clears and acceleration remains exempt. No assertion requires that settlement to happen. This breaks addendum 14(3)’s move classification and the requirement that the red actually test return bounds.

findings: 1
