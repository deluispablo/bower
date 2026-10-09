# Packet: c4-app-fence round 4 (TL-P4-24 addendum 8, main 756d6e60)

- **Entry:** `c4-app-fence`, escalated. It runs on a fresh Opus session. Worktree `/private/tmp/bower-c4-fence`, branch `c4-app-fence` (at 344ad493). Merge `claude/p3` first.
- **Ruling sweep:**
  - TL-P4-24 addenda 4, 6, 7 and 8;
  - the "Round 3 pass" section of `docs/harness/2026-10-09-codex-c4-app-fence-review.md` (1 Important);
  - the P4-50c minors;
  - the round-3 packet.
- **This is the last round.** If a fifth round is needed, the lead re-plans the entry.
- **Why:** round 3 put one landed definition in `checkStillAsSeen`. `updateByStamp`'s same-call recovery (`spine/write-once.ts:85`, recovery at `:98`) still accepts a lost answer on `holds` alone. A file renamed, moved or binned by another device before the recovery read is then reported as landed. "Landed" is decided in several places, so the class widens.

## Contract

1. **One landed definition, in `spine/write-once.ts`:** the stamp and checksum, plus `notAsSeen(expectedAfter, now) === null`, with modifiedTime ignored. `expectedAfter` is built from the intent, as in addendum 7. Both `checkStillAsSeen` (contracts/still-as-seen.ts) and `updateByStamp`'s recovery (`:85`, `:98`) call it. No other code decides "landed".
2. **The site list.** In the notes, list every site that `git grep -n -E 'holds|confirms|landedAs|stampOf'` shows in src, runner/src and api/src. Each one either calls the definition, or has a one-line reason it is not a landed decision.
   - A runner site that decides "landed" on the stamp alone gets a red and a fix in this round.
   - Name it on the card.
3. **The property covers three timings.** It changes the file (move, rename or Bin by another device):
   - before the first send;
   - between the send and the recovery read (the new one);
   - between presses.
   - It keeps asserting success only in the intended final state, and never a write over a changed file.
4. **Minors:**
   - `seen-files.ts:62`: the sync tail calls the helper's log-and-throw tail, not a copy.
   - Add a test that `untrash(id, props, name)` puts `name` in the PATCH body (`src/data/drive/drive-http.test.ts`).
   - Check the publish age of transitive `pure-rand` 8.4.2 (at least two weeks). If it is younger, add an exact pnpm override to the newest version that is at least two weeks old.

## Red

- `a lost answer whose file changed before the recovery read is not reported as landed`: one red covering the restore rename case and the emptied-note move case (Codex round 3).
- The property's new timing must find a counterexample before the fix. Keep the seed in the test.
- A red for each runner site found by point 2, if any.
- `untrash puts the name in the patch body`. This is a guard if it passes today; say so.

## Verify

The reds, the property, every verify from rounds 1 to 3, e2e qa9, qa10 and capabilities (fake, phone and desktop), `pnpm check` through `bash harness/with-lock.sh`, and the runner goldens (C04 78, 25-runs 88) not rising.

## Commits

1. The red.
2. The fix.
3. The notes addendum ("Fix round 4 (addendum 8)", with the site list), compatibility rows and `tests changed:` lines.

Then a Claude delta re-review and a Codex pass on the delta.
