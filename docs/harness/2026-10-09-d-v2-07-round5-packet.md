# Packet: d-v2-07 round 5, one head motion profile (TL-P4-25 addendum 7)

- **Entry:** `d-v2-07`, escalated, `ui: true`. It runs on a fresh Opus session.
  - Worktree: `/private/tmp/bower-d-v2-07b`, branch `d-v2-07`.
  - Start by merging `claude/p3` into it. Check for conflict markers first.
- **Ruling sweep:**
  - TL-P4-25 addenda 4–7, in DECISIONS.md (grep for them);
  - TL-P4-22 addenda 21 and 22;
  - the round-4 packet `2026-10-09-d-v2-07-round4-packet.md`: its Contract, its Addendum 5 section and its Follow-up;
  - the follow-up round's notes, in `2026-10-09-d-v2-07-notes.md` (last section).
- **Kept:** the previous worker's commits 233e8da0..9b8c91f2. That covers the gaze-return fix, the meta-test over every `ENGINE_MEMBERS` key and the addendum 6 property. Build on them.
- **Scope:** `src/bird` only. Every other d-v2-07 row is verified, so its look must not change beyond what the profile's timing implies.

## Contract (addendum 7: the mechanism changes, not the bound)

1. **One motion profile for the head.** This is the standard robotics trapezoid or S-curve profile; cite your source in the notes.
   - It sits ahead of the head and is the only thing that moves the head angle.
   - Its input is the summed head target: the pose script or act, plus the gaze offset.
   - Its state is the angle and its velocity.
   - Each frame, the velocity moves toward the target under a speed cap and an acceleration cap.
2. **A target change only changes the target.** It never touches the state, so a step in speed cannot happen by construction.
3. **One parameter set per move class** (addendum 5):

   | Move class | Speed cap | Acceleration cap | Landing |
   | --- | --- | --- | --- |
   | Returns and gaze | 6°/frame | 1.5°/frame² | — |
   | Snaps and the startle | 6°/frame | none | within 2° |

4. **The head spring is replaced by this profile for the head channel.** Every other part keeps its spring. Add no second head path. Delete the code the profile replaces, and list it as `removed:` on the card.

## Red (unchanged, TL-P4-22 addendum 22)

The reds are:
- the addendum 6 property (seed 2610 fails today);
- the meta-test;
- `pose-reference.fixture.ts`;
- the startle red;
- the gaze-return red.

You may not change their numbers, seeds or run counts. If one cannot pass as written, stop and report it as blocked.

Also run the 200-run sweep the last worker ran. It had 129 failures; report the new count in the notes.

## Verify

- The reds and the full `engine.test.ts`.
- `each pose loop matches its CSS reference`.
- e2e: bird-engine, qa6, qa7, qa10, app and robustness, on phone and desktop.
- `pnpm check` through `bash harness/with-lock.sh`.

## Commits

1. The fix.
2. A notes section, "Round 5 (addendum 7)", with `tests changed:` lines. If no test changed, write "none".
   - If you add a red for the profile itself (a target step mid-move keeps the speed continuous), it goes first, as its own commit.

After this round: a Claude delta review, a Codex pass, and the designer's re-check of all nine poses plus gaze.

## Round 6 (TL-P4-25 addendum 8, main 9986f0ce): the caps are rates; gaze is a return

Why: the Codex round-5 pass found 2 Important after P4-58g PASS (`2026-10-09-codex-d-v2-07-review.md`, "Round 5 pass"). First, both caps scale with frame duration: a snap moves 7° in one 33 ms frame, and gaze at 30 fps changes speed by 5.8°. Second, the property treated gaze as a snap and ran only at 60 fps.

1. **"Per frame" means per 16.7 ms of time, so the caps are rates.** The engine integrates the motion profile with `dt`.

   | Move class | Speed cap | Acceleration cap | Landing |
   | --- | --- | --- | --- |
   | Returns and gaze | 360°/s | 5400°/s² | — |
   | Snaps and the startle | 360°/s | none | no overshoot past 2° |

   A 7° snap in 33 ms is within the cap.
2. **Gaze is a return, never a snap.** The lead tightened the red, under the lead's authority (TL-P4-22 addendum 22).
   - In the property, `snap = rising || gazing` becomes rising only.
   - The property runs at 30, 60 and 120 fps, plus jittered frames, and measures in time units (°/s and °/s²).
   - Its seed and numRuns stay the same. Any other red number changes only as this section states.
3. **Red first:** the tightened property commits on its own, and must fail at f7e2c413 (Codex's two scenarios). Then the fix, then a notes section "Round 6 (addendum 8)" with a `tests changed:` line for the property.

After this round: a Codex delta pass, the merge, and the designer's re-check of the nine poses plus gaze.
