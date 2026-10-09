# d-v2-07 contract sign-off, pass 2: CHANGES

Read at claude/p3 (9f2e154a): packet, TL-P4-25 contract, addendum 1 (DECISIONS.md:240), pass-1 review, engine.ts, Bower.tsx,
presence.ts, prefs.ts, engine.test.ts, Bower.test.tsx, pose-reference.fixture.ts, test-setup.ts, e2e/bird-engine.spec.ts, the 16 call sites.
Second way (ARCHITECTURE mechanism map): none, as written. One idle mind (engine.ts:796), one pose script (:703), one apply (:909),
one reduced-motion home, one poke(). Minor 12 notes the one place it could slip.

Pass-1 status (14): resolved 1, 2, 3, 9 (partly, see 7), 11 (test unnamed, see 2), 12 (partly, see 7), 13 (test unnamed, see 2).
Still open or reopened: 4 (see 1), 5 (see 6), 6 (see 5), 7 (see 4), 8 (see 2, 11), 10 (see 8), 14 (see 10).

## Important

1. The run chip is specified two ways. Addendum 1(3) and packet:62 say still frame, no blink. But the table row (packet:80) says
   "Only blinks... does not blink either with moves off", and Verify (:105) keeps the test name "the run chip bird only blinks, and
   not at all with moves off or reduced motion". The designer's sign-off (:85) covers the stale row. An implementer cannot tell if the chip
   gets a blink mode (a second engine; pass-1 #4). Fix: change row 80 to "still frame, no blink, ever". Rename the test to
   "the run chip bird keeps its still frame". Say it is a guard: Bower.test.tsx:17 already passes today.
2. Verify (:100-110, "exact names") omits tests that the rulings require, so "no copy promises what is not built" (WORKER:21) is
   unmet. Missing names: (a) ruling 11, the test that flips the media query mid-render and the engine stops; (b) ruling 13, paused while
   hidden and resumed with no startle; (c) ruling 2, the nine-pose test with the mind on and `acts:false`, and the timing test (act every
   0.8-2 s, blink 1.6-5.2 s); (d) ruling 8, the positive control for preen and snap; (e) a tap: one hop and a chirp, the queued tap, a
   sleeping bird ignores a tap, within 0.1 s (addendum 1(5)); (f) a layer bird never sleeps (ruling 3); (g) a pose-sleep bird gets no gaze or
   startle (addendum 1(4)); (h) the behind-the-pointer turn after 0.5 s (packet:48, Verify has none). Also the packet's own list does not
   label which entries are guards (ruling 8 defers that to the notes). `with reduced motion or moves off no transform changes over 5 s`,
   `Bower is aria-hidden and out of the tab order`, `a sleeping bird does not blink` all pass today (Bower.test.tsx:30; Rig svg aria-hidden;
   engine.ts:940 pose sleep). Say in the packet which are guards and that "a sleeping bird does not blink" is the 60 s sleep.
3. The per-act range check (ruling 2) has no reference to check against and no seam to trigger an act. The idle fixture
   (pose-reference.fixture.ts:97-100) has only head -12..7 and tail -14..4. wait (:102-109) has head, tuft 8, iris. Chirp (jaw), wing
   shuffle and preen (38-42 deg) have no CSS range, and the "no pose borrows another's act" check (engine.test.ts:128-131) would fail them
   (tail or wing or jaw in wait). `acts:false` only pauses scheduling; "each act's peak" needs a way to fire one named act (a private
   method, a forced random, an `act(name)` seam), and none is named. Fix: say which acts exist in wait; add fixture entries with numbers
   (preen 38/42, wing shuffle, jaw 18); name the seam. "At the CSS angles" (addendum 1(1)) is also silent about the old head snap
   `rand(-26,22)` (engine.ts:830). It must become the CSS pair (-12, 7) for the range test to hold.
4. Tap semantics are contradictory or unbuildable. Addendum 1(5): a tap "cuts an idle act or a pose-loop cycle at the next frame" within
   0.1 s, yet "during a flight or carry only the latest tap is kept". `carry` is both a pose-loop (perch :745) and a layer state
   (holding). Which rule applies to the carry pose is unstated. Cutting is also not buildable today: `poke()` returns early when `busy`
   (engine.ts:631), and `interrupt()` lets the running action finish (:320). Reading's peck lasts 1.28 s (:736) and proud's showOff 1.5 s
   (:760). So "starts within 0.1 s" needs a new abort-the-current-action capability that the packet does not name. State it (and that
   "the loop resumes" means poseCycle/poseActed restart or continue). Also BowerLayer keeps `onClick => poke()` (Bower.tsx:323) while the perched
   box gets pointerdown. Say whether the queue-latest rule changes the layer's tap too.
5. Input API does not cover keydown or pointerdown/touch. Ruling 6 gives `look(p, source)` (needs a point) and `nudge()` (wake with
   startle), yet lists keydown and pointerdown listeners. Unstated: what a keydown calls (no point), whether `nudge()` also sets the 2.5 s
   recency and resets the 60 s clock, whether an awake bird's keydown/pointerdown just marks recency, and whether the 60 s count is from mount
   (S.ptrT starts at -10, engine.ts:~207) or from the last input. Red 3 ("after 60 s with no input") depends on that. Also "follows the
   focused control" (packet:45): the gaze lapses after 2.5 s via `looking` (engine.ts:800) while focus stays. Say whether that is intended.
6. The packet's own text overstates scope against ruling 1/5. Contract 4 and 7 and table rows 73-77 say every Bower does idle acts and sleeps
   after 60 s. Ruling 1 gives working poses (read, write, carry, proud, land, alarm) the script plus gaze plus blink only, and ruling 5
   says the mind sleeps only from idle or wait. The pose sleep (Home.tsx:164, TidySheet.tsx:77) stays asleep (addendum 1(4)). So Home's proud
   and alarm birds, Welcome's, and Tell Bower's never idle-act or sleep. The header (:16) says "the ruling wins", but the designer's signed table
   contradicts it. Add a pose-scope column or one sentence to the table. Also say that the layer's "carry" (B.carrying while at home, no
   action) blocks gaze/preen (addendum 1(2)).
7. Files in scope miss `src/test-setup.ts`. Ruling 9 puts the PointerEvent polyfill "in the test setup" (the only setup file is
   src/test-setup.ts:1-20; the hook does `ev instanceof PointerEvent`, Bower.tsx:139), but ruling 12's list (contract:38-45) does not
   include it. Add it, or say the polyfill lives in Bower.test.tsx. Also name the stubbed rect for the frame and the "Tidy up" control, and that
   Red 2 mounts PoseBower alone plus a plain button (the packet's red text still says "the demo on Home (fake frames)", :96, which
   cannot inject frames; ruling 9 corrects it but the packet text stays).
8. Numbers still left to guess. (a) The gaze head offset: "small, clamped" (ruling 1) has no number (the old code is clamp -32..30,
   engine.ts:814, which breaks read's -10..14). (b) Wing shuffle "-10 deg for 0.22 s" (packet:53) versus the engine's `wing.vel += 260` impulse
   (:833). Which wins? (c) Pause weight 10 (addendum 1(6)) is no act, so "an act every 0.8-2 s" (packet:50) and the timing test are
   false for one in ten intervals. State that the timer, not the act, is every 0.8-2 s. (d) Sleep sets `B.girth = -7/6` (engine.ts:765)
   and the mind's sleep must restore it on wake, and `setPose` must clear `asleep` when the screen changes pose (Home.tsx:164 flips
   idle/sleep). Neither is said.

## Minor

9. Stale citations: packet:61 "Bower.tsx:12-16" is now :23-26; packet:51 "engine.ts:571,615" is now :828, :873 (pass-1 #11 not fixed).
10. e2e (contract:14, ruling 14): "sample at 0 s and 2 s" is a fixed 2 s wait while the ruling says "polls, never a fixed wait". It
    also passes today (only the engine bird changes), so label it a guard. Two samples can coincide in a held pose. Say the sample is the max
    over a few polled reads, or a different measure.
11. Layer scenes: ruling 3 says the "e2e and qa tests of the layer scenes must stay green" but names none (pass-1 #3 asked). Name the qa
    specs for Add, Replay, TidyScene.
12. Taps have two homes of listener (layer `onClick`, perched `pointerdown`) but one `poke()`, so no second way. Keep one `poke()` and do
    not add a second queue for the layer. After the hook change, delete `prefersReducedMotion()` (prefs.ts:62) or knip flags it.
13. packet:85 "Signed off ... with the three rows above" is stale: the table has nine rows, and row 80 conflicts with addendum 1(3) (finding 1).
    The sign-off should be re-asked after the table is fixed.

## Verdict: CHANGES (13 findings: 8 Important, 5 Minor)

Each red can fail today: Red 1 (idle pose; wait pose overwrites ix, engine.ts:729, so the red must mount idle), Red 2, Red 3 yes.
Pose for Red 1 and Red 2 should be named (idle). Not signed: Important 1-8 need packet text, not code.
