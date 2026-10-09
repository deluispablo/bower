# Packet: d-v2-07 fix round (P4-58 BLOCK and the Codex pass; contract gaps)

- **Entry:** `d-v2-07`, escalated, `ui: true`. It runs on a fresh Opus session. Worktree `/private/tmp/bower-d-v2-07`, branch `d-v2-07` (at 4b43b268). Merge `claude/p3` first.
- **Ruling sweep:**
  - the round-1 packet, which is the signed contract;
  - TL-P4-25 and its addenda 1–3;
  - the P4-58 card;
  - `docs/harness/2026-10-09-codex-d-v2-07-review.md` (5 Important).
- **Why there is no new ruling:** each finding is a contract point that was not built. The packet names the addendum for each one.

## Contract (each item is already ruled)

1. **Every input event marks recency** (addendum 2 (5); P4-58 and Codex 3). A keydown with focus on body (for example, arrow keys scrolling the page) calls `engine.nudge()` or marks recency, so it postpones sleep and wakes a dozing bird. It looks at the frame, not at a stale rect.
2. **Focus gaze holds only while focus stays** (addendum 2 (5); Codex 5). Add a focusout listener (or focus leaving to body) that clears the saved focus point, so the `'focus'` source expires. Recapture the control's rect on scroll and layout changes, or read it per frame (the P4-58 minor).
3. **A layer tap plays when the current action ends, not after the whole script** (addendum 3 (4); Codex 1). The one tap slot is checked at every action end, including a landing followed by `wait(10)`, and while carrying.
4. **`interrupt({ now: true })` cuts the running pose cycle** (addendum 2 (4); Codex 2). The carry and write branches of `perch()` read `poseActed` (or its equivalent) and stop writing their targets during the tap. The loop resumes after the poke. `B.carrying` is kept.
5. **Input cuts a running snap or preen** (contract: none while input is recent; Codex 4). An input event during a snap or preen ends it through the same `interrupt({ now: true })` path. Gaze then follows.

## Red

One red per item, unit, on fake frames, with PoseBower or the engine alone as the round-1 reds do:
- `a keydown with nothing focused wakes a dozing bird and postpones sleep`
- `the focus gaze ends when focus leaves the control`
- `a layer tap during a flight plays when the flight lands, before the next wait`
- `a tap during carry or write cuts the pose cycle and the loop resumes`
- `input during a preen or snap ends it`

## Verify

- The reds, plus every round-1 verify.
- e2e bird-engine, qa6, qa7, qa10, app and robustness on phone and desktop.
- `pnpm check` through `bash harness/with-lock.sh`.

## Commits

1. The red.
2. The fix.
3. A notes addendum ("Fix round (P4-58)") with `tests changed:` lines.

Then a Claude delta re-review, a Codex pass on the delta, and the designer's check.
