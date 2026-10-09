# Packet: c4-lockf (TL-P4-22 addendum 23, main 28ff2f23; ahead of other heavy work)

- **Entry:** `c4-lockf`. Worktree `/private/tmp/bower-c4-lockf`, branch `c4-lockf` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-22 addenda 11, 13 and 23;
  - DEFECT_LOG `check-lock-order-flaky` and its diagnosis, `docs/harness/defects/2026-10-09-check-lock-order-flaky.md` (cause, 6 class sites, regression test).
- **Model:** Codex (non-escalated harness script; TL-P4-23). A fresh Claude reviewer follows.

## Contract

1. **`harness/with-lock.sh` takes the lock with macOS `lockf(1)` (`/usr/bin/lockf -k <file> <cmd>`).**
   - The kernel releases the lock when its holder dies, so there is no pid guessing, no stale takeover and no 5 s rule.
   - Keep `-k`: deleting the file on exit causes an unlinked-inode race.
   - Cite the man page in the notes.
2. **Order.**
   - Try `lockf -k -t 0` first.
   - If that fails, print the holder file: the "Waiting: another heavy run holds the lock (pid, command, started)" line. This is information only, never a decision.
   - Then wait with a blocking `lockf -k`.
   - The holder writes the advisory file after it gets the lock.
3. **Re-entry.** `HARNESS_LOCK_HELD` (set to the lock path) stays. All 6 class sites from the diagnosis move to it.
   - `scripts/e2e-both.sh:6` uses the same rule as with-lock.sh, comparing against the lock path, not `-n`.
   - The tests that spawn lock runs clear `HARNESS_LOCK_HELD` through one shared helper.
4. **Delete** the mkdir lock, its stale and ownerless takeover code (:13-39), and the EXIT trap. The lock becomes a file.
   - `HARNESS_LOCK` still overrides the path.
   - Update the comment at :3; macOS has `lockf(1)`.
5. **One home.** with-lock.sh stays the one entry. done.sh, integrate.sh, `pnpm check` and every e2e script are unchanged apart from e2e-both.sh:6.

## Red (from the diagnosis's regression test)

- `an empty holder file and a second caller: the second waits`. Today it takes over.
- `a held lockf blocks the caller and a killed holder frees it`.
- `six callers started together alternate strictly, and no exit removes another's lock`.
- `e2e-both uses the same re-entry rule as with-lock`: a source check.

## Verify

The reds, plus the existing harness tests, adjusted from a lock directory to a lock file with `tests changed:` lines (`harness.test.ts:379/:391/:428`). Then `pnpm check` and one e2e script through the new lock.

## Commits

The coordinator commits for Codex:
1. the red;
2. the fix;
3. the notes (`docs/harness/2026-10-09-c4-lockf-notes.md`).

A worker may not loosen its own red.
