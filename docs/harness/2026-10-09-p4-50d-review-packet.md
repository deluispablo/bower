# Packet: P4-50d delta review (c4-app-fence round 4, TL-P4-24 addendum 8; the last round)

This review is read-only and fresh. Run unit tests only. Never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-fence`.

## What to review

- **Delta:** `git diff 8dec5faa..d735fa11`. Red a6c39106, fix a0d246ef, notes d735fa11, which include the site list.
- **Contract:** `docs/harness/2026-10-09-c4-app-fence-round4-packet.md`.
- **Finding it fixes:** the "Round 3 pass" section of `docs/harness/2026-10-09-codex-c4-app-fence-review.md`.
- **Escalation:** if a fifth round would be needed, the lead re-plans the entry, so name each finding precisely.

## Look hardest at

- **One landed definition in `spine/write-once.ts`** (`landing`/`landedAs`). The fence (`checkStillAsSeen`) and `updateByStamp`'s recovery (`:125`) both call it, and nothing else decides "landed" for an app write.
- **The site list in the notes.** Check it against `git grep -n -E 'holds|confirms|landedAs|stampOf'` across src, runner/src and api/src. Two sites are left to the lead's judgement:
  - `src/data/spine/engine.ts:425 stampSays` (run `reconcile`). It lands on the run's own stamp alone, citing TL-P4-05 addendum ("what the person changed since is kept"; a later operation of the same run may rename or move it). Is the reason sound, or is this a stamp-only decision that the ruling says gets a red?
  - `drive-vault.ts:1130 confirms`. The worker's card says a lost-create pile note moved elsewhere is written in its new place. Is that a lost write or a wrong-place write?
- **The property.** It covers three timings: before the first send, between send and recovery read, and between presses. It found the round-3 counterexample before the fix (seed 20261009). Check that it drives the real DriveVault and FakeDrive.
- **The minors:** the `seen-files.ts` sync tail calls the helper's tail; the untrash name-in-PATCH guard; pure-rand 8.4.2 age.
- **Housekeeping:** the goldens do not rise; `tests changed:` lines; no `.only`/`.skip`; no real timers.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
