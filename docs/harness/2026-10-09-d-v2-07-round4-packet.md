# Packet: d-v2-07 startle fix round (TL-P4-22 addendum 20, main e388358f)

- **Entry:** `d-v2-07`, escalated, `ui: true`. It runs on a fresh Opus session. Worktree `/private/tmp/bower-d-v2-07b`, branch `d-v2-07` from `claude/p3`; d-v2-07 itself is merged at 7860f261.
- **Ruling sweep:**
  - TL-P4-22 addenda 14, 15, 17 and 20 (the proud precedent);
  - DEFECT_LOG `wake-startle-overshoot`;
  - the designer's check at 7860f261 (evidence: designer scratchpad, walk/mind*.cjs);
  - TL-P4-25 addendum 1 (6) (startle: tuft 18° for 0.6 s).
- **Scope:** `src/bird` only. The other d-v2-07 rows are verified, so keep them unchanged.

## Contract

1. **The startle's tuft** eases from −26 to 18° with no overshoot, holds for 0.6 s, then returns eased, never more than 2° past its range in either direction (no undershoot below −2°).
   - Use the same easing as proud (`showOff`'s `fall`, `smooth`).
   - Add no second easing path.
2. **Meta-test (the class, seen twice now):** every act or action name the engine exposes (`act(name)` names, the named actions such as `nudge`'s startle, and the pose loops) must have a row in `pose-reference.fixture.ts`. A new name without a row fails the test.
   - This meta-test is the class red.
   - 24a will add rows for its 17 kinds against it.

## Red

- `the wake startle stays within its reference range`: a new fixture row for the startle (tuft 18 ± 2° peak, hold 0.6 s, range −2..20 for the return). Today it overshoots to +30.9° and undershoots to −5.5°.
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
