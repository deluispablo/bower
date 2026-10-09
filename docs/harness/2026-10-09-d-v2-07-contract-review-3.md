# d-v2-07 contract sign-off, pass 3: CHANGES

Read at claude/p3 (6087798f): packet, TL-P4-25 + addenda 1-2, pass-2 review, engine.ts, Bower.tsx, prefs.ts, ui/media.ts,
pose-reference.fixture.ts, engine.test.ts, Bower.test.tsx, test-setup.ts, e2e/bird-engine.spec.ts.

Pass-2 status (1-13): resolved 1, 2, 5, 6, 7, 9 (one cite stale, Minor 9), 10, 11, 12, 13 (re-sign-off still pending, Minor 10).
Partly open: 3 (see 2, 3 below), 4 (see 4), 8a (Minor 7).

Second way (mechanism map): YES, one. See Important 1.

## Important

1. Second matchMedia hook. packet:76-78 has prefs.ts "get a useSyncExternalStore over the matchMedia change event", and
   packet:95 says "no second reduced-motion reader". But src/ui/media.ts:7-15 `useMedia(query)` is already exactly that (a
   useSyncExternalStore over matchMedia 'change'). Adding another is a second way (TL-P4-15). Fix: Bower.tsx useMoves (Bower.tsx:25)
   calls `useMedia('(prefers-reduced-motion: reduce)')`; delete `prefersReducedMotion()` (prefs.ts:62, only user Bower.tsx:13/25).
   prefs.ts then needs no new code; drop it from scope or say "delete only". The flip test must use a matchMedia stub that fires 'change'
   (test-setup.ts:6-8 stub listeners are no-ops): say the stub lives in Bower.test.tsx.
2. idle/wait ownership is not buildable as written. Today a perched pose never reaches idle(): think() returns into perch() (engine.ts:~676),
   and idle()/wait cases there own head, tail, tuft 8 and the iris loop (engine.ts:722-731). The packet says the mind owns the act
   channel in idle/wait (packet:27) but not that the idle/wait cases of perch() lose their head/tail loops (or that perch() hands to the mind).
   Open: (a) which acts wait gets (the fixture has only head, tuft 8, iris for wait, pose-reference.fixture.ts:102-109; the "no pose borrows
   another's act" check, engine.test.ts:128-131, fails tail/jaw/wing in wait); (b) wait's tuft 8 and its iris -2.2..1 loop versus "the mind
   always owns the iris" (packet:19); (c) the fixture needs entries with numbers for chirp (jaw 14), wing (-10), preen (38/42), and the
   packet lists the fixture only as "in scope"; (d) `each pose loop matches its CSS reference ... (G)` (packet:143) cannot be a guard for idle
   and wait: the period/peak checks (engine.test.ts:100-150) change, so it is a modified test needing a `tests changed:` line. Fix: one
   paragraph naming the acts per pose, the fixture entries, what happens to wait's iris/tuft, and which part of the test is the guard.
3. The tap and range reds fail by a missing method, not an assertion (WORKER:8). `act(name)` does not exist today (the private
   `act(a: Action)` at engine.ts:316 takes an Action), so "each idle act stays within its range" (packet:135) and "a tap starts within
   0.1 s and cuts the running act" (packet:134) throw before any assertion; "Today the head snap reaches -26°" cannot be observed through
   `act`. Also the new public `act(name)` collides with the private `act(a: Action)` (9 callers); say the private one is renamed (in scope,
   engine.ts). Fix: say the red commit adds a stub `act()` that does nothing, or accepts a TypeError and names it in the notes.
4. Tap queue and abort are still under-specified. (a) `interrupt({ now: true })` extends `interrupt()` (engine.ts:321-324), which sets
   `B.carrying = false`; a tap on a perched carry pose (packet:71) would drop the carried thing (glyph display, engine.ts:~950). Say that now:true
   keeps B.carrying and whether the cut action's `end()` runs (peck/showOff end() reset tail/wing/squash, e.g. engine.ts:610-620).
   (b) "Only its latest tap is queued, plays on landing" (packet:72): the only queue is `S.queue` (FIFO of actions), so a tap pushed there
   plays after the whole script, not on landing; and `poke()` returns when busy (engine.ts:631). Say where the pending tap lives (one slot
   played when the current action ends, or at the end of the queue) and that setPose/interrupt() clear it. The test needs the choice.

## Minor

5. Layer birds: today idle() runs all acts for them between flights. The packet gives them "gaze, preen and startle" (packet:31, :110)
   but not snap/flick/chirp/wing. Say they keep the same table (assumed), minus sleep.
6. `a hidden tab pauses the clock and resumes with no startle` (packet:145) passes today (no sleep exists); add a positive control (hidden
   59 s then shown, 61 s total visible sleeps) so it can fail, or label it a guard.
7. Gaze numbers: head offset "small" has no formula (packet:23); precedence of a held focus gaze versus a later pointermove (packet:64);
   `look(rect, 'focus')` versus `look(p: Point)` (engine.ts:303) needs "center of the rect"; keydown with focus on body; whether a pointer gaze
   lapses to neutral after 2.5 s (packet:102 says so only for touch).
8. Act timing gaps: flick's gap between -14 and +4 (CSS: 0.18 s), whether preen's 0.9 s includes the lift from rest, and that chirp's jaw
   amplitude changes from 18 (engine.ts:~852) to 14, which also changes poke() and layer chirps.
9. Stale cite: packet:73 "Bower.tsx:323" onClick is now Bower.tsx:316. e2e (packet:154-157): say "transform attribute and style".
10. Process gate: the table at packet:118 still needs the designer's re-sign-off before dispatch (TL-P4-25 addendum 2 (6)).

## Each red can fail today
Reds 1, 2, 3 yes (no follow, no focus gaze, no sleep; mount idle so wait's ix write, engine.ts:729, is not in play). Reds 4, 5: only by
missing method (Important 3). Guards named and true: reduced motion over 5 s, chip still frame, tab-order/aria-hidden is a red (the box has no
aria-hidden today).

## Verdict: CHANGES (4 Important, 6 Minor). Not signed: Important 1-4 need packet text only.
