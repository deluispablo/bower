# c4-lockf implementation notes

implementer: codex

## Tests changed

tests changed: src/harness.test.ts: two checks started together run one after the other: use the shared clean environment; replace deleted-directory expectation with persistent lock-file and released-kernel-lock assertions; retain ordering and timestamp assertions.
tests changed: src/harness.test.ts: a second check waits and prints who holds the lock: wait for published advisory metadata at lock.holder, rather than directory creation; retain the holder-message assertion and use the shared clean environment.
tests changed: src/harness.test.ts: a second heavy run waits for the first: both spawned entry points use the shared clean environment instead of separate inherited-flag handling; all assertions remain.
tests changed: src/harness.test.ts: a nested heavy call inside a run that holds the lock passes through: use the shared clean environment for the outer caller; require the retained file and an available kernel lock after exit; retain both nested-output and no-wait assertions.
tests changed: src/harness.test.ts: a lock whose holder is gone is taken over with a printed line: replace the obsolete stale-directory takeover scenario with a lock file and stale advisory metadata; rename to a lock whose holder is gone is released by the kernel; require successful execution without stale takeover and retention of the lock file, because kernel locking removes takeover entirely.
tests changed: src/harness-git.test.ts: integrate.sh aborts a merge whose tree fails the check: its fixture launcher now clears HARNESS_LOCK_HELD through the shared lockTestEnv helper; every assertion is unchanged.
tests changed: src/harness-git.test.ts: integrate.sh commits a merge whose tree passes the check: its fixture launcher now clears HARNESS_LOCK_HELD through the shared lockTestEnv helper; every assertion is unchanged.
tests changed: src/harness-git.test.ts: integrate.sh refuses to start on a dirty tree: its fixture launcher now clears HARNESS_LOCK_HELD through the shared lockTestEnv helper; every assertion is unchanged.
tests changed: src/harness-git.test.ts: a branch that changes an existing test without a tests-changed line fails integration: its fixture launcher now clears HARNESS_LOCK_HELD through the shared lockTestEnv helper; every assertion is unchanged.
tests changed: src/harness-git.test.ts: a tests-changed line for each changed test lets the branch pass: its fixture launcher now clears HARNESS_LOCK_HELD through the shared lockTestEnv helper; every assertion is unchanged.
tests changed: src/harness-git.test.ts: a deleted test needs its own tests-changed line: its fixture launcher now clears HARNESS_LOCK_HELD through the shared lockTestEnv helper; every assertion is unchanged.
tests changed: src/harness-git.test.ts: integrate removes a merged branch and its clean worktree: its fixture launcher now clears HARNESS_LOCK_HELD through the shared lockTestEnv helper; every assertion is unchanged.
tests changed: src/harness-git.test.ts: a dirty worktree is kept with its branch and a printed line: its fixture launcher now clears HARNESS_LOCK_HELD through the shared lockTestEnv helper; every assertion is unchanged.
tests changed: src/harness-git.test.ts: a merged claude/design worktree survives integrate: its fixture launcher now clears HARNESS_LOCK_HELD through the shared lockTestEnv helper; every assertion is unchanged.
tests changed: src/harness-git.test.ts: a worktree with a running process survives integrate: its fixture launcher now clears HARNESS_LOCK_HELD through the shared lockTestEnv helper; every assertion is unchanged.

## What changed

with-lock.sh uses /usr/bin/lockf -k -t 0 for the first attempt. On EX_TEMPFAIL it reads lock.holder for the advisory Waiting line, then blocks with /usr/bin/lockf -k. The locked child publishes its PID, start time and command only after acquisition. Missing, empty, partial and outdated metadata never decides admission. The lock file and advisory file remain after exit; mkdir, PID liveness checks, stale/ownerless takeovers and traps are removed.

HARNESS_LOCK remains the path override. The locked child exports HARNESS_LOCK_HELD as that exact path. Both with-lock.sh and e2e-both.sh compare the inherited value to the selected path. Every lock fixture in both test files clears the inherited flag through src/testing/harness-lock-env.ts.

Command output stays on its original stdout and stderr. A private descriptor carries the command exit status separately from lockf acquisition status: a command returning 75 must not be mistaken for a busy lock and executed again. The extra regression test verifies exits 1 and 75, output forwarding and exactly one execution per command.

## Research citation

Read the installed manual before editing: `man lockf`, LOCKF(1), macOS 26.6, manual dated November 25, 2023; DESCRIPTION, OPTIONS, EXIT STATUS and EXAMPLES. It documents exclusive BSD flock(2) locking, recommends -k for concurrent callers and guaranteed ordering, specifies -t 0 as immediate acquisition only, and says the default wait is indefinite. The descriptor example is also the basis of the test holder, which owns the sole descriptor and can be killed without a surviving child holding it. EX_TEMPFAIL is the busy-lock status; successful acquisition otherwise returns the command status.

## Evidence and remaining gates

Fix: helper moved to src/testing/ for the unused-code gate (knip --production).

Tests were written before scripts. /private/tmp/c4-lockf-red.log records an AssertionError for e2e-both uses the same re-entry rule as with-lock against the old script. The same focused red run also records a timeout for the six-caller case because the old mkdir mechanism cannot acquire a planted lock file; this timeout is not claimed as assertion evidence.

Green: pnpm vitest run src/harness.test.ts: 45/45 passed, including all four exact packet names and the exit-status regression. Log: /private/tmp/c4-lockf-green.log.
Green: pnpm exec tsc -p tsconfig.app.json. Log: /private/tmp/c4-lockf-tsc.log.
Green: pnpm exec eslint src/harness.test.ts src/harness-git.test.ts src/testing/harness-lock-env.ts. Log: /private/tmp/c4-lockf-eslint.log.
Green: bash -n harness/with-lock.sh scripts/e2e-both.sh; git diff --check.

Left out by owner instruction: pnpm check, all e2e, commits, staging, pushes and changes in any other worktree. harness-git.test.ts was typechecked and linted but not executed, since its fixtures write git state. The coordinator owns the three commits: test files and helper, scripts, then this notes file.
