# d-v2-07 contract sign-off: CHANGES

Read at claude/p3 (9816dfe1): packet, spec block, impact block, DECISIONS TL-P4-21/22 (addenda 6-9, 14-17), Bower.tsx, presence.ts,
Rig.tsx, engine.ts, poses.css, bower.css, pose-reference.fixture.ts, Bower.test.tsx, engine.test.ts, e2e/bird-engine.spec.ts,
and the 16 PoseBower call sites. Second way (engine, registry, animation path): none stated, but see 2, 3 and 4.

1. Two sources own the same parts, and the packet does not say who wins. engine.ts:703-792 `perch()` rewrites head.t, tail.v, ix/iy, jaw,
   tuft, wing every frame (idle: head+tail at :721-724; wait: head, tuft, ix at :727-730; write: head, jaw at :739-743). The idle mind
   (head snap, tail flick, gaze ix/iy, preen) writes the same targets (:801-835). Contract 1 says "on top of its pose script". Name the
   rule: which parts the mind owns per pose, and what happens to the pose's own snaps in `idle` (:719), which are already a fixed head
   snap and tail flick every 6 s. Without it, "never in a fixed order" (4) and "Idle acts every 0.8 to 2 s" (4) are false on pose idle,
   or gaze is overwritten each frame on wait (ix set at :729). Also read's queued peck and proud's showOff make the engine `busy`.
2. Addenda 14-17 conflict. The pose-reference range test (engine.test.ts, the 2-degree bound, the fixture ranges) runs perched poses with
   seeded frames. Once the mind runs on top, gaze snaps (head clamp -32..30, :814), preen (38 deg) and sleep break the per-part range
   of read (head -10..14) and others, or the mind must be off in that test, leaving the real path untested. State the seam: an engine
   option, or the test supplies no input and the acts are excluded, and add a verify that the nine-pose test still runs against
   the engine with the mind on (idle acts paused) so addendum 14-17 stays enforced.
3. Layer birds. The idle mind is `idle()` (engine.ts:796) and also serves BowerLayer (Add.tsx:205, Replay.tsx:220, TidyScene.tsx:208) and the
   landing. Adding preen and sleep to it means a run scene's bird falls asleep after 60 s of watching a long tidy-up, and Add/Replay
   get preen. The contract says "perched bird" in 1 and "every screen" in the title. State: sleep, startle, preen and focus gaze are
   perched-only (an option), or apply to layers too and then name the e2e/qa tests of the layer that must stay green.
4. The run chip cannot "only blink". It is minor, so `turn` is false (presence.ts:30, 71), so `moves` is false (Bower.tsx:23-26) and no engine
   is mounted (Bower.tsx:64, `live = !perched || moves`). Contract 9 and the table row (53) need a blink-only mode: either a second
   engine running beside the turn bird (a second rAF loop, and its `setHandle` must stay null so activeHandle is not the chip's), or
   a CSS blink (forbidden by 11). Pick one and say how "Bower moves" off / reduced motion applies (useMoves takes `turn`, so the chip
   needs its own flag). It also conflicts with row 54 and e2e "only one bird changes transforms per screen" (the chip's eye
   transform changes) and with the AGENTS hard rule "one animated bird per screen"; say the e2e excludes minor birds and that
   presence.ts's header and ARCHITECTURE record "a minor bird may blink". Today the chip shows `posed read still`.
5. Sleep vs the `sleep` pose. Pose sleep exists (engine.ts:763-770, :940 eyes 0.08) and TidySheet.tsx:77 and Home.tsx:164 show it as the
   resting state. Contract 7 does not say whether idle-mind sleep reuses those targets, or what a bird whose pose is already sleep
   does on input (wake with a startle, then lie down again after 60 s? or stay asleep because the screen says so). Also whether sleep applies
   during read/write/carry scripts. And "the eyes stay closed" needs a new flag in apply() (:940 reads `this.pose === 'sleep'` only).
   `a sleeping bird does not blink` passes today if it targets pose sleep; say it is the 60 s sleep.
6. Missing engine API. Only `look(p)` exists (:303). Gaze from focusin and touch, recency of key input (no point), wake/startle and
   preen need named entry points (for example `look(p, source)`, `nudge()`), and the listener home. Today the hook has one
   `pointermove` listener on the document (Bower.tsx:134-145). Touch needs `pointerdown`/`touchstart` (a tap fires no pointermove),
   keys need `keydown`, focus needs `focusin` and the control's rect. Say these live in `useBirdEngine`'s look source, not in
   PoseBower. Also say whether pointermove from a mouse that never moves again lets the bird sleep (yes, by the 60 s rule).
7. Tap handler. The perched box is a plain div with no aria-hidden (Bower.tsx:191-197; only the svg is aria-hidden) and no handler.
   Say where the tap listens (the box, `pointerdown`, never preventDefault or stopPropagation), that the box gets `aria-hidden`, and
   that `poke()` returns early while `busy` (:631), which read (peck) and proud (showOff) make true for most of their loop, so
   tapped "one hop and a chirp" silently does nothing. State the rule (poke queues, or interrupts).
8. Reds and guards. `preen and snap never run while input is recent` passes vacuously today (there is no preen or random snap in a
   perched bird); add a positive control (with the same seed and no input, preen and snap do occur). `with reduced motion or moves off
   no transform changes over 5 s` and `Bower is aria-hidden and out of the tab order` pass today (Bower.test.tsx:32 and Rig svg
   aria-hidden), so label them guards, and make the tab-order test assert the box, not the svg. Three reds are named; also name which
   of the rest fail today.
9. Test seams. Red 2 needs a rect for the control and for the frame; jsdom returns zeros, so stub getBoundingClientRect; Red 1 needs
   `PointerEvent` (the hook does `ev instanceof PointerEvent`, Bower.tsx:139; jsdom may lack it). Name the stub. Say where the reds
   mount (PoseBower alone in Bower.test.tsx, not "the demo on Home"), since "with the demo on Home (fake frames)" cannot inject frames.
10. Values the implementer must guess: preen dip depth and the gaze of "down and back"; startle tuft angle (only "up" and 0.6 s); the
    sleep tuck targets; act weights (the old idle has 40/20/12/10/8 and a random `turn()` at :834, which the packet's five acts
    drop; keep or remove `turn()`); whether a startle is a spring kick or a script. Put numbers in the contract, or say "reuse
    the sleep pose targets" and "tuft.t = 18 as alarm".
11. Reduced motion subscription. The code is `prefersReducedMotion()` in `src/app/prefs.ts:62`, read in Bower.tsx:25 (the packet cites
    Bower.tsx:12-16, now :23-26; engine.ts:571,615 are now :828 and :873). The fix needs prefs.ts or a hook in src/bird, and it is outside
    "mainly src/bird/". Say the home (a `useSyncExternalStore` over matchMedia change in prefs.ts), the file is in scope, and add a
    test that flips the media query mid-render and the engine stops. Name the Bower.test.tsx test; none of the Verify list covers it.
12. Files in scope are not listed. The packet says "mainly src/bird/" (entry) with no list. Add: src/bird/engine.ts, Bower.tsx,
    presence.ts (if the chip changes), poses.css (sleep still frame untouched), src/app/prefs.ts, the two test files,
    pose-reference.fixture.ts, e2e/bird-engine.spec.ts or a new e2e file, and the notes. `c3-timer-gate`: say nothing waits on
    real time (fakeFrames already).
13. Hidden tab and the clock. Pause on hide exists (Bower.tsx:114); S.t does not advance while hidden and each frame's dt is capped at
    0.033 (engine.ts:652), so "60 s of engine time" is 60 s of frames, not wall time. Say so, and that a hidden tab does not count
    toward sleep (good) and resumes the clock without a startle. No test is named for "paused while hidden"; add one (the guard
    exists in Bower.test.tsx? no).
14. e2e. `only one bird changes transforms per screen` needs a measure (sample every `[data-bird]` descendant transform at 0 and 2 s;
    exempt minor), phone and desktop project names, and that it extends bird-engine.spec.ts or sits in a new file. It must not
    wait on a real 8 s as the existing poll does (timeout 8000 is a poll, acceptable in e2e only).

Minor
- Contract 5 "gaze down and back" for preen: say whether the iris moves.
- "Tapped (pointer or touch only)" reads as keyboard excluded; add that Enter/Space on a focused control never pokes.
- 17 addenda: 16/17 ruled the girth rule; contract has no clash. Preen/startle must not set B.girth (setPose resets it at :282).
- Packet's Verify says tests are in engine.test.ts and Bower.test.tsx; presence.test.ts exists and needs a case if the chip changes.
