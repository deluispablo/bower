## Pass on the addendum-7 range (de1183df..7213f5e2), 2026-10-10

1. **Important — [engine.ts:732](src/bird/engine.ts:732): Layer jumps at release.** With size 100 and home `(350, 280)`, the final blend draws `translate(300px,188px)`. Release clears that transform; the layer’s CSS places it at `(0,0)`. Reproduced through `BowerLayer` with injected frames. The property masks this by choosing home `(50,92)`. Violates TL-P4-26 addendum 7(3): no jump at release.

2. **Important — [engine.ts:1839](src/bird/engine.ts:1839): Size bypasses the frozen blend.** `apply()` writes width and height from mutable `this.size`, outside `Drawing`. Change a mounted `PoseBower` from size 100 to 200 halfway through settlement: its drawn dimensions jump on the next frame. Reproduced through the component. Violates TL-P4-26 addendum 7(1–2): every drawn value belongs to one snapshot blend; other output writers remain suspended.

3. **Important — [engine.ts:708](src/bird/engine.ts:708): Re-enabling moves strands a queued pose.** Disable moves on idle, queue alarm after 0.2 s, then enable moves before release. `beginReaction()` discards the blend without consuming `queuedPose`; only `endSettle()` consumes it. After four seconds, the component says alarm but draws idle’s tuft at 0°, rather than 18°. Violates TL-P4-26 addendum 7(2)’s deferred-pose requirement and packet item 6’s moves-on behavior.

findings: 3
