# v2-perched-bower contract sign-off: CHANGES

Read at claude/p3: packet, Bower.tsx, presence.ts, Rig.tsx, engine.ts, poses.css, bower.css, RunChip.tsx, TidySheet.tsx, TidyScene.tsx, impact note section.

1. How a bird becomes minor is not in the contract. PoseBower props are `pose,size,priority,className,style` (Bower.tsx:18-25, :28)
   and the contract says the 16 call sites keep them. RunChip.tsx:22 and the stopped bird (TidyScene.tsx:217 / TidySheet.tsx:77, both
   priority=1) need a new `minor` prop, so those files change, outside "src/bird/ only". Name the prop and the call sites it touches.
   Also say which is "the stopped-sheet bird": TidySheet.tsx:77 is the Tidy-up sheet's bird, not clearly the stopped one.
2. Minor and outranking. useOutranked (presence.ts:50-59, topPriority :47) counts every entry. A minor priority-1 entry would hide
   the page's Bower (priority 0) while the page's engine takes the turn invisibly and the sheet bird stands still. State whether
   minor entries count in topPriority; add it to Red 1 or a third test.
3. Engine-mounted bird must drop the CSS pose animation. poses.css puts `transform-origin` and `animation` on `.posed .b-*`
   (:6-9, :11 blink, :14-16 idle) plus static transforms (`.posed.wait .b-tuft`, `.posed.sleep .b-head`). Engine writes SVG
   `transform` attributes (engine.ts:663-681); CSS transform wins over the attribute and transform-origin shifts the pivot. The
   contract must say the turn-holding bird does not carry `posed <pose>` (or the animation/transform rules), and that losing the
   turn removes engine transforms and restores the still frame. Add a verify: no `.b-eye` blink animation while the engine runs.
4. "Same poses" (What the person sees) contradicts setPose "rest values". read, write, carry, proud loop in CSS today
   (poses.css :24-45, :46-52, :53-60, :65-69: peck, nod, hop, fan). Rest values drop those loops for a bird with the turn.
   Either list which poses animate through the engine now, or change the table: those poses show their rest frame plus breath/blink.
   The designer sign-off depends on this. Also the engine's `eye` blink (engine.ts:612-623) uses Math.random, so tests need a seed or range.
5. Missing from the impact note (1, last bullet): pointer and focus listeners move to `document` for the perched bird (Bower.tsx:155-165
   are on the layer's parent). Gaze is d-v2-07, but the listener home is a hook input; put it in the hook (a `look` source argument) or
   d-v2-07 adds a second path.
6. b-carry. Rig.tsx:57-62 renders it only when `carrying`. "Always render hidden and expose as a part" needs: RigPart gains 'carry'
   (Rig.tsx:2); who shows it for the `carry` still frame (a `.posed.carry .b-carry` rule); and how it differs from the engine's
   HTML `carry` part (RigParts.carry, engine.ts:33-34, the label chip). Name both so d-v2-06 does not make a second carry.
   No test or verify covers contract points 4 or 3b (engine handle); add: Rig test (group exists, hidden, reaches onPart) and a
   presence test (active entry exposes the engine handle; null for a still bird; cleared on unmount).
7. Verify names tests that do not exist. There are no unit tests under src/bird/ (BirdEngine, presence, Bower) at claude/p3. Only
   OpenElsewhere.test.tsx and e2e/qa6.spec.ts, e2e/qa27.spec.ts mention the bird. Say that and name the e2e files, and say where
   the two reds live. Also name the mechanism for fake rAF.
8. Red 2 "stays on its perch" has no concrete assertion. State it: after N fake frames, bird transform translate is (0,0)
   (home {size/2, 0.92*size} gives x-Z/2 and y-0.92Z, engine.ts:660), allowing hopY/bob, and the transform exists (not empty).
   Today's reason for failing: PoseBower has no engine, so the transform is empty (Bower.tsx:28-42). Fine.
   Red 1 fails today for the stated reason (chip mounts after the page, equal priority, newer wins, presence.ts:21), but only
   once the red passes `minor`; assert on the `still` class of each (Bower.tsx:34).
9. Engine-owned bird element: PoseBower's div takes callers' `style`/`className` (SignIn s.bird, Home s.inboxBird, margin:'0 auto').
   Engine overwrites width, height and transform on the element (engine.ts:656-660). Say which element the engine owns (an inner
   wrapper), or the callers' transform styles break. Check callers for transform.
10. Presence handle API: how the engine registers with its entry (useBirdTurn returns a boolean only, presence.ts:26) is not
    specified. d-v2-24's `react()` depends on it; name the function (e.g. setHandle(id, handle)) in the contract.

Deferrals (preen, sleep, startle, gaze, blink bounds to d-v2-07) differ from the impact note's P3 list (preen/sleep/startle/blink
in the engine). Acceptable if the lead confirms; flag only.
Perched flag: engine.ts:529-532 is the right place (the `!B.home` branch), and B.home starts true (:96). OK.
# v2-perched-bower contract sign-off, second pass: CHANGES

First review points: 1 (minor prop, call sites, stopped bird) answered by #1. 2 (topPriority) answered by #2. 3 (CSS off engine bird) #3.
4 (loops) #4, but see C1-C3. 5 (listener home) #5. 6 (carry) #6 and the Rig test. 7 (test names) partly: see C5. 8 red 3 asserted. 9 inner wrapper #8. 10 handle API #9.

Required changes
- C1 Red 2 passes today. useOutranked (presence.ts:50-59) counts every entry; a 'minor' prop is ignored, so a priority-0 chip bird
  under a priority-1 overlay is already hidden (top 1 > 0). Not a red. Either make it a guard (say "passes today, regression guard")
  or add a red that fails today: a minor bird registered at the same priority as an overlay-less page must not hide the page bird
  (topPriority ignoring minor, e.g. minor with priority 1 does not hide the page's Bower).
- C2 Poses wait, sleep, alarm, land are not covered. Point 4 lists read/write/carry/proud/idle; point 11 defers sleep. But birds with the turn
  use them: TidySheet.tsx:77 'sleep' (priority 1, always has the turn), NoteScreen.tsx:45 and NotFound/OpenElsewhere 'wait',
  Home.tsx:122 and TidyScene.tsx:217 'alarm' (PHASE_POSE failed, run-words.ts:39). "Only the turn bird mounts the engine"
  (point 10) plus "no posed class on the engine bird" (point 3) drops poses.css:16-20 (wait), :42-47 (sleep: shut eye, head down),
  :48-51 (alarm). Say whether those poses (a) keep CSS (no engine, posed class kept) or (b) are engine poses with named rest values and
  a test. Table row "same poses" is false for sleep otherwise.
- C3 Idle blink and idle acts. Packet says "the blink of the 6 s loop"; the CSS blink is 5.2 s on every pose (poses.css:9), the
  6 s loop is snaps and flick (:12-13). Engine blink interval is random 1.6 + 3.6*rand (engine.ts:615), and idle() adds random
  head, tail, chirp, wing, turn (engine.ts:569-578). A period test "within +-10% of the CSS loop" cannot pass for blink without changing
  those bounds, which point 11 defers to d-v2-07. State: the perched bird replaces idle() with a fixed script (and whether turn() and
  wing flutter are off), and blink uses a fixed 5.2 s in perched mode. Also state that look() is not called by PoseBower (gaze deferred),
  or the perched bird would watch the pointer (engine.ts:553-568) and differ from today.
- C4 "each pose loop matches its CSS reference" has no reference once the CSS animations are deleted (point 4), and jsdom does not run CSS
  animations. Say the reference is a constants fixture in the test (keyframe times and peaks copied from poses.css:9-69 at claude/p3),
  and what "peak" and "rest frame within 1 px" measure (SVG rotation in degrees vs px; name the part attribute read).
- C5 `no CSS animation runs ... getAnimations is empty`: Element.getAnimations is not in jsdom (only e2e uses it: e2e/v2-field.spec.ts:63),
  and vitest does not apply poses.css animations. Move it to an e2e (name the file, e.g. qa6/qa27 or a new one) or test that the
  engine bird has no `posed` class. As written it passes vacuously today.
- C6 Verify says unit tests "presence", "Rig", "engine" with no files. There are no tests in src/bird/ today (only OpenElsewhere.test.tsx,
  e2e/qa6.spec.ts, e2e/qa27.spec.ts). Name the files (src/bird/presence.test.ts, Rig.test.tsx, engine.test.ts, Bower.test.tsx for the
  three reds) and that fake frames come from the injected scheduler (point 7).

Checked OK against code
- Point 1 call sites: RunChip.tsx:22 (34), TidyScene.tsx:217, TidySheet.tsx:77 (priority=1) exist as cited.
- Point 6: Rig.tsx:57-62 renders b-carry only when carrying; RigPart at Rig.tsx:2; engine HTML carry at engine.ts:33-34.
- Point 7: rAF at engine.ts:137 and :503; Math.random at :68, :572, :615 (and :616 in step).
- Point 10: Bower.tsx:85-153 is the engine setup; listeners at :155-165.
- Red 1 fails today: chip mounts after the page at equal priority, newest wins (presence.ts:21), so the page bird has `still` (Bower.tsx:34).
- Red 3 fails today: PoseBower has no engine, the transform is empty (Bower.tsx:33-40). At home {Z/2, 0.92Z}, apply() gives translate(0,0)
  (engine.ts:660) before hop/bob.
- Point 5 `look` source: pointer listener uses layer.parentElement (Bower.tsx:157); fine as an argument.
