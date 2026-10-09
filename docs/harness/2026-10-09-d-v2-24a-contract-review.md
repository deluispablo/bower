# d-v2-24a contract sign-off: CHANGES

Read at claude/p3 (d1477d72, d-v2-07 merged): packet, spec block d-v2-24, bower-map.md, impact block d-v2-24, TL-P4-25 contract and
addenda 1-3, engine.ts, Bower.tsx, presence.ts, pose-reference.fixture.ts, the 17 PoseBower/BowerLayer call sites.
Second way (queue, controller, animation path): not stated, but findings 2, 4 and 6 each lead to one if guessed.

Important
1. act() cannot play a reaction on most birds. engine.ts:422-423 `act` returns unless `minded()` (:406, idle, wait or a layer), and
   :1085 plays only in `idle()`. The birds on the screens are mostly working poses: Home alarm (Home.tsx:123), proud (:97), read/write/
   carry (:147, PHASE_POSE), sleep when not waiting (:165), Welcome carry/read/proud, TidyScene's PoseBower (:217). In those poses the pose
   script owns the act channel (addendum 1 (1)), so `nod`, `tilt`, `lean`, `wave`, `shake` do nothing. Contract 4 says "named acts
   through act(name)" without saying how they run over read/write/carry/alarm/proud. State, per pose, who wins (a reaction pauses the script
   for its length like `poseActed` at :956? plays on the gaze channel? is ignored), and add a red per pose class. As written, "each
   reaction kind queues its engine action" can be green on idle only.
2. "Startle, then a look at Undo" (bin, error) and "two nods and a chirp" (send) are sequences, but the engine has one act slot
   (`S.doing`, :430) and one tap slot. Contract 3 forbids a second queue. Say how a kind with several steps plays: one composite act
   (one makeAct with its own keyed timeline), not a chain through S.queue. And the startle is `S.startleT` (:390, :1090), not an act:
   say if it is reused as the first step, and whether a new reaction clears it (it is not cut by interrupt).
3. The settle cannot run today. With "Bower moves" off, `moves` is false (Bower.tsx:24-27), `live` is false for a perched bird (:67),
   the engine effect cleanup calls `release()` at once (:95-98) and `setHandle(null)` runs (:132-135), so `activeHandle()`
   (presence.ts:36) is null. Moves-on is the mirror: the handle does not exist until after mount and start. Contract 5 says the
   port does "moves-off's own settle and moves-on's wake and shake" but the owner of the engine's lifetime is useBirdEngine, so
   Bower.tsx must change and it is not in scope. Name the mechanism: useBirdEngine delays the teardown by the settle (engine time,
   fake frames in tests) and the handle stays until release(); on moves-on the engine is created, then wakes and shakes.
   Say where the settle ends (release() then the CSS `posed <pose> still` frame, Bower.tsx:226), and what "body easing to the perched still
   frame" means for read/write/carry/proud: poses.css gives the still frame per pose, the fixture has its phase. Also the layer bird
   (BowerLayer keeps its engine, :67) is different: say whether moves-off settles it too.
4. The port is `react(kind)` (contract 1) but three kinds need a target: "looks at Undo" (bin), "looks at 'Try again'" (error), "lean
   toward the pointer" (point-tidy), "carries a paper" to Your rules (rule), "tilts at that line" (duplicate). `look(p, source)`
   (:377) takes a Point in frame pixels, and the rig's frame is private to useBirdEngine. Decide the signature
   (`react(kind, at?: Element | Point)`, converted by the port through the same frame rect as Bower.tsx:142) or say the target is
   fixed (e.g. a fixed look direction). Without it 24b must guess, and a screen that passes a rect is "driving parts".
5. Sustained kinds have no end. `drag-over` ("leans forward, beak open") and `point-tidy` ("tuft up, lean in") last as long as the
   drag or hover, and `error` holds the alarm pose. The kinds are one-shot calls. Add the release (`react('drag-over-end')`, a
   `react` return handle, or a fixed length that decays) and the test (Add's dragleave / drop, TidyButton blur). Otherwise the
   bird stays leaning, or leans for a fixed length while the drag lasts 5 s.
6. The one slot. Contract 3 says a reaction during a flight is kept "in the same one slot as the latest tap", but the slot is
   `S.tap: boolean` (engine.ts:262, set :837, played :891-894 and :912-916). It cannot hold a kind. Say that the slot becomes
   `S.tap: 'tap' | ReactKind | null` (one field, latest wins, a reaction replaces a tap and a tap replaces a reaction) and what
   plays on landing. Also: act() on a layer bird in flight sets `S.doing` that nothing advances (think returns at :897 before idle),
   so the port must check `busy`/`B.carrying`, never call act() then. And "a flight or a carry is never cut" vs addendum 2 (4)
   "a perched bird's carry is a pose, so a tap cuts its cycle": say whether a reaction cuts a perched carry pose (kind `rule`,
   Welcome carry, TidyScene carry).
7. Values are not in the contract (the review of d-v2-07 asked the same, finding 10). Contract 4 leaves nod, tilt, lean, settle,
   shake, wave to "angles and seconds in the notes". An implementer writes them and the reviewer then judges his own numbers.
   Only startle (tuft 18, 0.6 s: STARTLE, :118), chirp (jaw 14) and the settle/wake lengths (0.6, 0.4) exist. Need: nod (head
   target and count, e.g. 16 deg, 2x in how many s), tilt (head angle, held how long), lean (pitch deg, tuft, beak/jaw open 14?),
   hop (hopKick 0.16 s, :846), shake (wing/tail/squash amplitude in 0.4 s), wave (wing angle, one stroke, seconds), show-off (reuse
   `showOff` with the proud options at :981 or the default 2.8 s?), tail fan, carry paper, eyes closing (eye scale, :1250 is 0.08 when
   asleep). Put them in a table in the packet, with the fixture's `ACT_REFERENCE` ranges plus 2 degrees.
8. ActName is also the mind's draw list. Adding nod/tilt/lean/settle/shake/wave to `ActName` (:105) forces `ACT_REFERENCE:
   Record<ActName, ActRef>` (fixture :190) and enrols them in the per-act idle/wait tests (Bower.test.tsx:223, engine.test.ts:138),
   whose `pose` field only allows 'idle' | 'wait'. Say: a second type (`ReactionName`) with its own reference, kept out of
   `WEIGHTS` (:122) and `draw()` (:1045) so reactions never fire on their own. Also act() is public API to the port (:422); say
   whether the port calls `act` or a new `play`, not both (that is a second way).
9. Reds that cannot fail. The red stub is a no-op `react()` (packet "Red"), so `with reduced motion react does nothing` and the
   "nothing" half of `with moves off only the settle and wake run` pass today and after any wrong build. Add a positive control in
   the same test (same engine, motion on, same kind: the action is queued) and a negative that fails when the guard is
   removed. Also `a sleeping bird ignores reactions` is named in contract 5 but has no test in Red; and `each reaction kind
   queues its engine action` needs the observable: engine.ts has no queue read (S is private; `busy` at :409 is a boolean). Name
   the seam (a test read of `doing`, or sampled part values via readRig as Bower.test.tsx:223 does), per kind, not only "queued".
10. Real entry point. No screen calls the port in 24a, and the Verify list has only bird-engine e2e, which never calls `react`
    (WORKER checklist: a promised behaviour through the entry that runs it). Name one: the port through `activeHandle()` with a mounted
    PoseBower in Bower.test.tsx (mount, `react('yes')`, sample head), and say where the designer's "test page" lives
    (BirdLab.tsx, currently untouched and out of scope list: add it or say fixtures only).
11. Sleep. Contract 5 follows addendum 1 (4) for the sleep POSE, but a bird the mind put to sleep (`asleep` at :1066) is not that
    pose. `act()` returns on `asleep` (:423) but `nudge()` and `look()` call heard() which wakes it (:401). Say whether react()
    wakes a mind-asleep bird (then react is an input and resets the 60 s clock, :399-400) or is ignored. The spec says "any input
    wakes it with a startle", the packet says reactions are ignored: the two disagree. Also reaction marks recency (heard) =>
    suppresses snaps and preen for 2.5 s; say yes or no.
12. Files in scope are not listed (same as d-v2-07 finding 12). Findings 3 and 6 need engine.ts, Bower.tsx (useBirdEngine),
    presence.ts (handle held through the settle), react.ts and its test, pose-reference.fixture.ts, Bower.test.tsx, engine.test.ts,
    BirdLab.tsx if used, e2e/bird-engine.spec.ts. List them, and say `ui/report.ts`, `ui/online.ts`, screens and prefs are NOT touched
    (24b). Also `c3-timer-gate`: settle and wake run on fake frames, never on a real 600 ms wait.

Minor
- Contract 2 names `done`, `hide`, `moves-*` but `error` is also the alarm pose (pose = a screen state, Home.tsx:123): say react('error')
  is the startle and look only, the pose stays the screen's.
- "A reaction starts within 0.1 s" test: say the bound is frames (6 at 60 fps, fakeFrames FPS) and that it is measured from react() to the
  first changed target, not to the end.
- The map rows "Home: fly back", "Add: catches the file", "Skip: lands at once" are flights with no kind; the packet says the table lists "only
  where the map names them": list the rows left to 24b so none is dropped.
- "tests changed:" lines are required if Bower.test.tsx:223 or engine.test.ts:138 loops change for finding 8.
- ARCHITECTURE has no mechanism-map row for bird reactions; add `src/bird/react.ts` as the one home in the notes.

Verdict: CHANGES (12 findings Important, 5 Minor). Second way: not yet; guessing 2, 4 or 6 would add one.
