# Packet: P4-62 review (c4-lockf, written by Codex; TL-P4-22 addenda 23 and 24)

This review is read-only and fresh. Run unit tests only: never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-lockf`.

## What to review

- **Diff:** `git diff a97d1ae7..c4-lockf`.
  - red 5ae6061c;
  - fixes c8cc4389, fb9ff3ed (helper moved to src/testing for knip) and 106b7d20 (path /tmp/bower-heavy.lockf);
  - notes 8df5b9f9;
  - c3-timer-gate re-proved at c899a167 for its renamed verify.
- **Packet:** `docs/harness/2026-10-09-c4-lockf-packet.md`.
- **Diagnosis:** `docs/harness/defects/2026-10-09-check-lock-order-flaky.md`. It lists the 6 class sites.
- **Rulings:** TL-P4-22 addenda 23 and 24, in DECISIONS.md (grep for them).
- **Fixed questions (TL-P4-20):** check the contract first, then any second way. Give every finding a severity.

## Look hardest at

- **Mutual exclusion rests only on the kernel lock** (`/usr/bin/lockf -k`). The holder file is a message only. No takeover, no pid check and no trap remain.
- **Exit status.** The fd-3 status channel keeps a command's own exit 75 apart from lockf's EX_TEMPFAIL. A failed command never runs twice, and output stays on the original stdout and stderr.
- **Re-entry.** `HARNESS_LOCK_HELD` must equal the lock path, the same rule in with-lock.sh and e2e-both.sh. Every lock test clears the inherited flag through one helper. Check all 6 class sites from the diagnosis.
- **Transition (addendum 24).** The new default path never collides with the old mkdir lock at /tmp/bower-heavy.lock. Do done.sh and integrate.sh still reach the lock only through with-lock.sh?
- **Tests.** The six-caller stress test and the killed-holder test: are they deterministic, or could they pass by luck?
- **Tests changed.** Every changed or renamed test has its `tests changed:` line, and no assertion was weakened. "a lock whose holder is gone" was renamed; judge it.
- **Housekeeping:** no `.only` or `.skip`.

Already run by the coordinator: pnpm check (green, inside done.sh at c899a167), harness tests 45/45, and e2e qa7 through the new lock.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
