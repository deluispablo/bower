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
