# Packet: d-v2-07 startle fix round (TL-P4-22 addendum 20, main e388358f)

- **Entry:** `d-v2-07`, escalated, `ui: true`. It runs on a fresh Opus session. Worktree `/private/tmp/bower-d-v2-07b`, branch `d-v2-07` from `claude/p3`; d-v2-07 itself is merged at 7860f261.
- **Ruling sweep:**
  - TL-P4-22 addenda 14, 15, 17 and 20 (the proud precedent);
  - DEFECT_LOG `wake-startle-overshoot`;
  - the designer's check at 7860f261 (evidence: designer scratchpad, walk/mind*.cjs);
  - TL-P4-25 addendum 1 (6) (startle: tuft 18° for 0.6 s).
- **Scope:** `src/bird` only. The other d-v2-07 rows are verified, so keep them unchanged.

## Contract

1. **The one startle step (TL-P4-26 addendum 1, main 2f1ae3bb): tuft 18° plus head −10°, held 0.6 s.** Both ease with no overshoot, then return eased, never more than 2° past their range (the tuft never undershoots below −2°). d-v2-24a reuses this step for its error and offline wakes.
   - Use the same easing as proud (`showOff`'s `fall`, `smooth`).
   - Add no second easing path.
2. **Meta-test (the class, seen twice now):** every act or action name the engine exposes (`act(name)` names, the named actions such as `nudge`'s startle, and the pose loops) must have a row in `pose-reference.fixture.ts`. A new name without a row fails the test.
   - This meta-test is the class red.
   - 24a will add rows for its 17 kinds against it.

## Red

- `the wake startle stays within its reference range`: a new fixture row for the startle (tuft 18 ± 2° and head −10 ± 2° at the peak, hold 0.6 s, tuft range −2..20 on the return). Today it overshoots to +30.9° and undershoots to −5.5°.
- `every engine act has a reference row`: the meta-test. It fails today for any exposed name that has no row; list them in the notes.

## Verify

- The reds.
- d-v2-07's verify set: src/bird, plus e2e bird-engine, qa6, qa7, qa10, app and robustness on phone and desktop.
- `each pose loop matches its CSS reference` as a guard.
- `pnpm check` through `bash harness/with-lock.sh`.

## Commits

1. The red.
2. The fix.
3. A notes addendum ("Startle round (addendum 20)") with `tests changed:` lines.

Then a Claude delta review, a Codex pass on the delta, and the designer's re-check of the startle.

## Addendum 21 (main 39519641): the script-step exemption is a closed list

- **The allowlist.** The meta-test keeps an explicit allowlist of the exact layer choreography names: flyTo, peck, showOff, poke, and the rest. Each entry has a one-line reason ("pre-V2, no reference").
  - A `script` or `control` label on a member is not an exemption.
  - Any new engine name that is neither referenced nor on the list fails.
- **Steps that poses or reactions play.** If a pose or a reaction plays a step, that step has a row through the pose or reaction. 24a's composite steps use exempt steps only through rows carrying the designer's values.
- **The list only shrinks,** like the baselines. A check fails if it grows.
- **Red:** `a new engine name tagged script but not on the allowlist fails the meta-test`.

## TL-P4-25 addendum 4 (main 757bd9fe): a step owns the head

- While a reaction or startle step plays, the step owns the head, and gaze moves only the iris (as in working poses). When the step ends, the head offset eases back, with no jump. 24a's composite acts follow the same rule.
- Red: `a wake startle with a focus gaze holds the head at −10 ±2`. An idle bird sleeps 61 s, then wakes through `look({x:200,y:-100}, 'focus')`; a second cell uses (200,250). Today the head holds at −22°.

## TL-P4-22 addendum 22 (main 4e077f05)

1. **Own-property lookup.** The allowlist is a `Set` of exact names (or uses `Object.hasOwn`), so an inherited name such as `toString` never counts as listed. The growth check counts the same Set.
   - Red: `an inherited name like toString is not on the allowlist`.
2. **The jump bound** (`engine.test.ts:285`) waits for the designer's answer, sent through the lead. The lead's lean: a smoothness rule (speed never jumps between frames) with a 6° ceiling. Until the number arrives, leave the test as it is; the number will be added to this round.
3. **Method:** a worker may not loosen its own red. A red's numbers are contract, and a `tests changed:` line does not cover changing them. This is now on the WORKER checklist, and reviewers check it.

## TL-P4-25 addendum 5 (main 8a6a8d56): the jump bound, from the designer

This replaces both 3 and 6. In `engine.test.ts:285`, test by move class:
- **Returns** (a step's head easing back, the gaze settling after a step) are ease-in-out. Speed starts and ends near 0, changes by at most 1.5°/frame between frames, and never goes over 6°/frame.
- **Snaps and the startle rise** are exempt from the ramp. They stay at or below 6°/frame and land with no overshoot past 2°.

## Follow-up (the Codex "Own-property and bound pass": 2 Important; gaps against addenda 5 and 21, no new ruling)

1. **Gaze return when focus disappears** (`engine.ts:1139`). If the focus target becomes null during the return, the return keeps easing toward the target it captured, then hands back to the spring with a speed jump from 0 to 3°/frame. The return must re-target, or ease out from where it is, so the addendum 5 bounds hold: speed changes ≤1.5°/frame and stays ≤6°/frame.
   - Red: `a gaze return keeps its speed bounds when focus disappears mid-return`. Use the Codex scenario: wake at (200,−100), then set `target = null` after 80 frames.
2. **The meta-test** (`pose-reference.fixture.ts:333`). A new member tagged `acts` without a row passes, because `unreferencedMembers` checks the existing `ACT_NAMES`, not each `ENGINE_MEMBERS` key.
   - The check runs over every key of `ENGINE_MEMBERS`. Each one needs a reference row (act, pose, reaction) or an entry on the closed allowlist.
   - Red: `a new member tagged acts without a row fails the meta-test`.
3. **Property (TL-P4-25 addendum 6, main 81b4f469).** A fast-check property drives random focus, pointer, touch, step and wake events at random frames, with a fixed seed and bounded runs. It asserts addendum 5 on every frame for both classes, and addendum 21 over every `ENGINE_MEMBERS` key. If this round still has findings, the lead re-plans: every head target goes through one slew-limited smoother ahead of the one spring, and a target change never touches the spring's state.
