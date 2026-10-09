# Packet: P4-50c delta review (c4-app-fence round 3, TL-P4-24 addendum 7)

This review is read-only and fresh. Run unit tests only; never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-fence`.

## What to review

- **Delta:** `git diff babe395b..344ad493`. Red 0edf5b3f (adds the fast-check 4.10.2 devDependency), fix f0409898, notes 344ad493.
- **Contract:** `docs/harness/2026-10-09-c4-app-fence-round3-packet.md`.
- **The findings it fixes:** the "Delta pass" section of `docs/harness/2026-10-09-codex-c4-app-fence-review.md`.

## Look hardest at

- **"Landed" is one definition, in the helper.** It is the stamp and checksum plus `notAsSeen(expectedAfter, now) === null`, with modifiedTime ignored. `expectedAfter` is built once from the intent:
  - rename or move: the target name and place;
  - Bin: trashed true;
  - Unbin: trashed false;
  - text: the name and place read, with trashed false.
  - No call site may state its own `expectedAfter`.
- **No cached state decides a step is done.** Check restore's `gone.back` (it may keep the name, never the state) and any other memo across presses.
- **One async signature.** `checkStillAsSeen` keeps a single async signature, with no sync/async overload. The card says `SeenFiles.assert` stays sync in FakeDrive's one step, using `notAsSeen` with no landed case. Is that one home, or a second fence?
- **The fast-check property** (seed 20261009). It must cover every app write intent and every interleaving of a lost answer with an outside move, rename or Bin. It asserts success only in the intended final state, and never a write over a changed file.
  - Is it bounded, deterministic and fast?
  - Does it model the real code path, or a copy of it?
- **The dependency.** fast-check 4.10.2 is a devDependency, exact-pinned, at least two weeks old, with the lockfile updated.
- **The touched transport files** (`drive-api`, `drive-http`, `fake-drive`) and `runner/test/drive-v3-real.ts`: why each changed. The runner goldens (C04 78, 25-runs 88) must not rise.
- **Housekeeping:** the `tests changed:` lines, no `.only` or `.skip`, no real timers.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters.
