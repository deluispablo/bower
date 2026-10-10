# Packet: c4-create-resume (defect create-property-time-dependent; TL-P4-24 addendum 17; escalated, data safety)

- **Entry:** `c4-create-resume`. Worktree `/private/tmp/bower-c4-create-resume`, branch `c4-create-resume` from `claude/p3`.
- **Ruling:** TL-P4-24 addendum 17 (main), option (a), plus fixed clocks and a midnight case. It is queued first in the next batch; stage 4 may close with it open.
- **Diagnosis:** `docs/harness/defects/2026-10-10-create-property-time-dependent.md`.
- **Starting model:** Codex, in three sessions: the red, the implementation, a read-only adversarial pass. Then a fresh Claude review.

## Contract

1. **A pending pile-folder create resumes through its stored intent.** After a lost answer, a lost recovery read and a refresh, `updatePile` (`drive-vault.ts:1099-1107`) first resumes a pending pile-folder create through the existing `Intended` holder in `spine/write-once.ts`, before any folder-edit branch.
   - It never recomputes the name or renames the half-made folder.
   - It completes the original loose-file conversion.
   - write-once.ts stays the one home for reservation and landing.
2. **Fixed clocks.** The tests that seed with the real `Date.now()` move to a fixed clock (`vi.setSystemTime`). The list is in the diagnosis: drive-vault.test.ts :34, :1387, :1462, :1612, :1714, :2433, :2457, :2705, :3778, :4038; fake-runner.test.ts:48; fake-worker.test.ts:45; write-it.test.ts:36; hashes.test.ts:15; home-cache.test.ts:47; fake.contract.test.ts:11.
   - Each moved test gets a `tests changed:` line.
   - No assertion changes.

## Red

- `a pile-folder create resumed after a refresh across UTC midnight keeps its first name`. The clock is fixed at 2026-10-10T00:02:00Z, with the fixture 20 minutes older. Answer and recovery read are lost, then refresh() and a retry. Expect one folder, under its first name, with the loose file inside.
- The existing property at `drive-vault.test.ts:4029` gets its date pinned to the same midnight case, through the fixed clock. Its assertions are unchanged.

## Verify

- The reds, plus the drive-vault, journal and write-once suites.
- `pnpm check` under the lock. The runner goldens stay exactly 78 and 88.

## Commits

1. The red.
2. The fix.
3. The notes (`docs/harness/2026-10-10-c4-create-resume-notes.md`), with compatibility rows and `tests changed:` lines.
