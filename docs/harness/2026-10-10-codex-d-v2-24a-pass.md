# Codex pass: d-v2-24a (round 1)

Read-only, medium effort, scope `git diff claude/p3...d-v2-24a` at 4e9fae6c. Tokens: input 1254936 (cached 1166080), output 6765.

1. **Important — src/bird/engine.ts:637:** Gaze can trigger a turn and hop during `moves-off`. Focus a control behind Bower, then disable “Bower moves.” At the 0.6 s completion callback, a 60 fps probe still shows an 8.3 px hop and horizontal scale 0.611; releasing the engine visibly jumps to the still frame. **Contract:** TL-P4-26 §3 requires settlement before release; packet §3 permits gaze to move only the iris during reactions.

2. **Important — src/bird/engine.ts:734:** Offline, and error on the sleep pose, return to neutral before abruptly restoring alarm. Call `react('offline')` on idle and leave the message showing: the startle’s fall brings head and tuft to 0, then the alarm branch pins the tuft from 0° to 18° in one frame. Sleep-pose error repeats this at line 727. **Contract:** TL-P4-26 addendum 1(B)/(E) and the signed table require startle followed by alarm while the message shows, with every value easing in.

findings: 2

## Round 2 pass

Read-only, medium effort. Tokens: input 639658 (cached 563072), output 3162.

1. **Important — `src/bird/engine.ts:784`**: Moves-off releases before the facing scale settles. Reproduce by focusing behind an idle Bower for 1.5 s, letting it turn left, then disabling “Bower moves.” At the 0.6 s completion callback, the drawn x-scale is **0.611**, rather than **1.000**; release visibly snaps it to the CSS still frame. `step()` at line 1533 overwrites the settle’s face target with the existing `B.face = -1`. Round 2 prevents new turns during settlement but leaves this earlier-turn case unfixed. Contract: **TL-P4-26 §3**, packet §6 and “What the person sees”: reach the still frame before release.

findings: 1

## Round 3 pass (re-plan, TL-P4-26 addenda 3 and 4)

Read-only, high effort. Tokens: input 936551 (cached 833920), output 8348. Per addendum 3, it goes to Claude bower-escalated.

1. **Important — [src/bird/engine.ts:824](/private/tmp/bower-d-v2-24a/src/bird/engine.ts:824): releases before a changed pose settles.** Disable moves on a mounted sleep pose, then change it to idle 0.55 s into settlement. At the 0.6 s completion callback, the head remains **11.12°**, moving at **−266.4°/s**. Release snaps it to idle’s 0° still frame. `setPose()` changes the destination without restarting settlement, while completion checks only elapsed time. **Contract:** TL-P4-26 §3; packet §6 and the signed moves-off row require reaching the still frame before release.

2. **Important — [src/bird/engine.ts:969](/private/tmp/bower-d-v2-24a/src/bird/engine.ts:969): `chirp()` bypasses ownership for the tuft.** Play `done`, advance 1 s into its display, then call the existing `chirp(0.3)` method. The unguarded velocity write pulls the reaction-owned tuft from **16.01° to 12.36°**, disturbing the display despite the jaw correctly remaining protected. **Contract:** TL-P4-26 addendum 3 requires every mind write to respect the one ownership check; the signed display specifies tuft 16° ±2°.

The round-3 tap change at **engine.ts:1709–1710 only accommodates the regex**. It substitutes the identical numeric transform through a [CSS variable fallback](https://drafts.csswg.org/css-variables/#using-variables); it changes neither tap wiring nor visible hop behavior. It is not a product fix.

The earlier reported scenarios now settle correctly. No second motion path, allowlist growth, or missing reaction-dispatch row was found. Findings above were reproduced with read-only, in-memory engine probes; the sandbox prevented the unit-test log write.

findings: 2

## Escalated round pass

Read-only, high effort. Tokens: input 1137664 (cached 1037440), output 5868.

1. **Important — [src/bird/engine.ts:838](/private/tmp/bower-d-v2-24a/src/bird/engine.ts:838): moves-off releases before opacity reaches the still frame.** Disable moves 0.05 s into the `land` pose. Its opacity remains **0.21** throughout settlement and at release, then jumps to **1** when `release()` clears the style. The settle never updates opacity; completion checks only the head. **Contract:** TL-P4-26 §3 and packet §6 require reaching the pose’s still frame before release.

2. **Important — [src/bird/engine.ts:983](/private/tmp/bower-d-v2-24a/src/bird/engine.ts:983): chirp ownership remains unprotected before the first reaction frame.** On idle, call `react('done')`, then `activeHandle().chirp(0.3)` before advancing a frame. `beginReaction()` has installed the action but has not claimed its channels, so `mayWrite()` permits the tuft impulse. At 60 fps, the displayed tuft dips to **−3.12°**, outside the allowed **−2°** lower bound. The escalated regression checks chirp only after one second. **Contract:** TL-P4-26 addendum 3’s ownership rule and packet §11’s eased values with no overshoot past 2°.

findings: 2
