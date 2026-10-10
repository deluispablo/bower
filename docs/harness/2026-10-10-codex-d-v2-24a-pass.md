# Codex pass: d-v2-24a (round 1)

Read-only, medium effort, scope `git diff claude/p3...d-v2-24a` at 4e9fae6c. Tokens: input 1254936 (cached 1166080), output 6765.

1. **Important — src/bird/engine.ts:637:** Gaze can trigger a turn and hop during `moves-off`. Focus a control behind Bower, then disable “Bower moves.” At the 0.6 s completion callback, a 60 fps probe still shows an 8.3 px hop and horizontal scale 0.611; releasing the engine visibly jumps to the still frame. **Contract:** TL-P4-26 §3 requires settlement before release; packet §3 permits gaze to move only the iris during reactions.

2. **Important — src/bird/engine.ts:734:** Offline, and error on the sleep pose, return to neutral before abruptly restoring alarm. Call `react('offline')` on idle and leave the message showing: the startle’s fall brings head and tuft to 0, then the alarm branch pins the tuft from 0° to 18° in one frame. Sleep-pose error repeats this at line 727. **Contract:** TL-P4-26 addendum 1(B)/(E) and the signed table require startle followed by alarm while the message shows, with every value easing in.

findings: 2
