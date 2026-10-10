## Pass on the addendum-7 range (de1183df..7213f5e2), 2026-10-10

1. **Important — [engine.ts:732](src/bird/engine.ts:732): Layer jumps at release.** With size 100 and home `(350, 280)`, the final blend draws `translate(300px,188px)`. Release clears that transform; the layer’s CSS places it at `(0,0)`. Reproduced through `BowerLayer` with injected frames. The property masks this by choosing home `(50,92)`. Violates TL-P4-26 addendum 7(3): no jump at release.

2. **Important — [engine.ts:1839](src/bird/engine.ts:1839): Size bypasses the frozen blend.** `apply()` writes width and height from mutable `this.size`, outside `Drawing`. Change a mounted `PoseBower` from size 100 to 200 halfway through settlement: its drawn dimensions jump on the next frame. Reproduced through the component. Violates TL-P4-26 addendum 7(1–2): every drawn value belongs to one snapshot blend; other output writers remain suspended.

3. **Important — [engine.ts:708](src/bird/engine.ts:708): Re-enabling moves strands a queued pose.** Disable moves on idle, queue alarm after 0.2 s, then enable moves before release. `beginReaction()` discards the blend without consuming `queuedPose`; only `endSettle()` consumes it. After four seconds, the component says alarm but draws idle’s tuft at 0°, rather than 18°. Violates TL-P4-26 addendum 7(2)’s deferred-pose requirement and packet item 6’s moves-on behavior.

findings: 3

## Pass round 2 on the fix round (986a01fb..ab1d16b4), 2026-10-10

The three earlier findings are not reported again (fixed).

1. **Important — [src/bird/engine.ts:1848](src/bird/engine.ts:1848): Resize redraws motion after release.** The layer’s resize handler calls `snapHome()`, which reaches `apply()` outside the motion gate. It draws live state or a retained unfinished blend instead of the released still frame.

   Reproduced through mounted `BowerLayer` with injected frames: run idle for 1 s, disable moves, finish the 0.6 s settle, then dispatch resize. The released rig changes from identity to scale `(1.008, 0.988)` while moves remain off. Also, play `hide`, disable moves, enable reduced motion halfway through settlement, then resize: the released wing jumps from 0° to −4.01° while reduced motion remains enabled.

   Violates packet item 6 and TL-P4-26 point 3’s held still frame and immediate reduced-motion behavior; the resize path bypasses addendum 7’s single output gate.

findings: 1

## Pass round 3 on round 3 (ab1d16b4..36d267df), 2026-10-10

The round-2 finding (resize outside the gate) and the three earlier ones are not reported again (fixed).

1. **Important — `src/bird/engine.ts:726`: Sparkles keep moving outside the settle gate.** `beginSettle()` suspends engine updates, but leaves `.bower-spark.go` running its independent 0.7 s CSS animation; `release()` also leaves it active. Reproduction: call `BowerLayer`’s `showOff()`, disable “Bower moves” immediately after the first sparkle, then complete the 0.6 s settle. The sparkle animation continues for approximately 0.1 s after release. Enabling reduced motion at the sparkle likewise fails to stop it immediately. Violates TL-P4-26 addendum 7(2)’s suspension of every other motion source and packet item 6’s still-frame and reduced-motion requirements.

findings: 1

## Pass round 4 (last blocking round) on 30f324ce..20925040, 2026-10-10

verdict: BLOCK
range: 30f324ce..20925040; settle: de1183df..20925040
worktree: /private/tmp/bower-d-v2-24a

**Blocking — src/bird/engine.ts:535:** Resizing during settlement causes a jump at release.
Scenario: mount idle PoseBower at 100 px, disable moves, change size to 200 px after 18 frames, then finish settlement.
Reproduced in memory: release clears the frozen 100 px dimensions; CSS immediately expands the drawing to 200 px.
Rule: TL-P4-26 addendum 7(1,3), whole-output settlement and no jump at release.

Sparkle is fixed and structurally covered. Other earlier regressions pass; no second mechanism found.
Fresh Vitest run unavailable: the sandbox refused the `/tmp` log write.

blocking: 1
