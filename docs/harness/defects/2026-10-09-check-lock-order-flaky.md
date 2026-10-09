# check-lock-order-flaky: two locked runs overlapped once

Diagnosis (bower-diagnoser, read-only, claude/p3 @ f1e23738), 2026-10-09. Log line: DEFECT_LOG.md, last line.

## What failed

`pnpm check` in the d-v2-07 worktree (`/tmp/d-v2-07-check.log:1900`): `src/harness.test.ts:376` "two checks started together run one after the other" got `[start, start, end, end]`. Line 374 (`[a.status, b.status]` = `[0, 0]`) passed, so **both runs acquired the lock and ran their body at the same time**. Passed on the rerun.

Reproduction:
- The vitest file, `-t "two checks started together"`, 3 runs with `HARNESS_LOCK_HELD` unset and 3 with `HARNESS_LOCK_HELD=/tmp/bower-heavy.lock`: 6/6 pass. 200 unloaded paired runs of `with-lock.sh` against a scratch lock: 0 overlaps. The race window is too small to hit without load.
- **Reproduced deterministically**: a lock dir holding an *empty* `holder` file (the state a live holder is in between the truncate and the write at `with-lock.sh:41`). A second caller printed `Stale lock: its holder (pid , ) is gone, taking it over.` and ran its command at once (exit 0).

## Why (5 whys)

1. Why the wrong order? Both callers held the lock at once (both exit 0 at :374).
2. Why? The second caller (B) treated the live first holder (A) as stale and took the lock over.
3. Why? A creates the lock (`mkdir`, with-lock.sh:14) and then publishes itself with `printf ... > "$lock/holder"` (:41). The redirect creates/truncates the file before printf writes it (verified: expansion of `$(date)` runs first, then the open, then the write). If B polls in that instant, `[ -f holder ]` (:15) is true, `read -r pid` (:17) gets `""`, `kill -0 ""` (:18) fails, and B moves A's lock aside and deletes it (:20-22). Then its `mkdir` succeeds.
4. Why here and not in daily use? The test starts both callers together, so B's first failed `mkdir` lands right in A's setup window. Load from `pnpm check` (133 vitest workers, log line "133 workers spawned") makes a preemption between open and write more likely.
5. **Design cause.** Mutual exclusion rests on a user-space stale-holder heuristic: a pid file, then `kill -0`, then `mv` takeover, with a 5 s "never named a holder" timer. The lock is not one the kernel releases when its holder dies. Every check-then-act step is a time-of-check/time-of-use window, and "unreadable" is treated as "dead".

**Q1, inherited flag: ruled out (verified).** `with-lock.sh:12` passes through only if `HARNESS_LOCK_HELD` equals this lock's path. `runLocked` (harness.test.ts:361) inherits the outer flag (`/tmp/bower-heavy.lock`) but sets `HARNESS_LOCK` to a fresh `mkdtemp` path, so the two never match. The runs above with the flag set also pass.

**Timing assumption in the test: none.** With a correct lock the order is guaranteed; the 0.5 s sleep only widens the overlap.

Unverified: the failing run's own output. `runLocked` collects `out`, but the test never prints or asserts it, so the "Stale lock" line is not in the log. The other path that lets both through, the ownerless takeover at :33, needs A to stall over 5 s between :14 and :41. That is unlikely, but not excluded.

## Owner mechanism

Mechanism map, "Heavy-run lock and timer gate": `harness/with-lock.sh` (ARCHITECTURE.md:108).

## Same class elsewhere (check-then-act on the lock, or a second re-entrance rule)

1. `harness/with-lock.sh:33`: after 25 polls (5 s), a lock with no holder file is taken over, even when its holder is alive but stalled between :14 and :41.
2. `harness/with-lock.sh:15-18`: the holder file vanishes between `-f` and `read` (A exits in between). On the first poll `pid` is unset, and under `set -u` the waiter dies (`pid: unbound variable`, verified in isolation; exit 127). The run fails with a nonzero status instead of waiting.
3. `harness/with-lock.sh:18-20`: two waiters both judge the same dead pid stale. The first moves the lock aside and `mkdir`s a fresh one; the second's `mv` (:20) then moves that live lock aside. Three or more callers. Reasoned from the code, not run.
4. `harness/with-lock.sh:42`: the EXIT trap `rm -rf "$lock"` does not check that the lock is still its own. After any wrongful takeover, A's exit deletes B's lock and admits a third caller.
5. `scripts/e2e-both.sh:6`: a second, weaker re-entrance rule (`-n "$HARNESS_LOCK_HELD"`, any lock), unlike `with-lock.sh:12` (this lock's path). Under any outer locked run it skips the lock. That is why `harness.test.ts:408-409` has to `delete env.HARNESS_LOCK_HELD`.
6. Tests that inherit the outer flag: `harness.test.ts:361`, `:405`, and `harness-git.test.ts:103`, `:151`, `:211` spread `process.env`. They are safe today only because each sets its own `HARNESS_LOCK`. `:408-409` deletes the flag, so the tests are inconsistent with each other.

## Options

- **(a) Fix inside with-lock.sh, keeping mkdir.** Publish the holder atomically: write `$lock/holder.$$`, then `mv` it to `holder`. Treat an empty or unreadable pid as "not yet named" (the ownerless path), never as dead. Initialise `pid`. Have the trap remove the lock only while `holder` still names `$$`. Make e2e-both.sh:6 compare against the lock path, as :12 does. Size: S (about 8 lines in two scripts). Risk: low. It closes this failure and items 2, 4 and 5, but **not** item 3 or the 5 s heuristic (item 1): the design cause stays.
- **(b) Refactor first, then fix: acquire through macOS `lockf(1)` (`/usr/bin/lockf`, BSD `flock(2)`).** "In no event will lockf break a lock that is held by another process"; the kernel drops the lock when its holder dies (verified in the man page and present on this machine). `with-lock.sh` stays the one entry. Re-entrance through `HARNESS_LOCK_HELD` and the "waiting: pid, command, started" line stay: try `lockf -s -t 0` first; if busy, print the advisory holder file, then wait with `lockf -k`. Delete the stale/ownerless takeover code (:13-39) and the trap. The holder file becomes a message only, never a decision. e2e-both.sh:6 as in (a). This is the standard proven tool, so the comment "macOS has no flock" (:3) is half-true: there is no `flock(1)`, but there is `lockf(1)`. Size: M (with-lock.sh rewritten at about the same length; tests :379/:391/:428 adjust from lock dir to lock file). Risk: medium. The lock becomes a file, and the lock path changes for anyone polling `/tmp/bower-heavy.lock` by hand. macOS/BSD only, which matches local-only development. It removes the class, not just this case.
- **(c) New mechanism: not applicable.** The owner exists. Serialising or retrying the test would hide a real lock fault in the gate every heavy run trusts, so it is not offered.

## Regression test (the class)

In `src/harness.test.ts`, next to :369:
1. Plant each state a live holder passes through: a lock with no holder file, an empty holder, and a holder naming a live pid with no other lines. Assert that a second caller waits and does not run. Under (b), assert instead that a held `lockf` blocks the caller and a killed holder frees it.
2. A stress case: 6 callers started together, each appending `start`/`end`. Assert strict alternation and that no caller's exit removes another's lock.
3. Each spawned lock run clears `HARNESS_LOCK_HELD` through one shared helper, so no test inherits the outer lock. A source check asserts that `e2e-both.sh` uses the same re-entrance rule as `with-lock.sh:12`.
