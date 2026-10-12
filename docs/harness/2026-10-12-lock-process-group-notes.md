# lock-process-group (TL-P4-62)

implementer: codex

Scope: harness/with-lock.sh, the three coordinator gate scripts that start Playwright,
src/harness.test.ts, and this note. No app screens, dependencies or shared harness records changed.

The lock holder uses core Perl fork/setpgrp/exec and a wall-clock alarm. Its child owns the
command group. An END block kills the group on normal exit, timeout and caught signals.
The wrapper forwards HUP/INT/TERM to the supervisor. The supervisor also checks the wrapper
once per second, so SIGKILL of the wrapper cannot leave its workers running.
The default is 1500 seconds; a timeout prints "Heavy run timed out" and returns 124.
The deadline starts after lock acquisition, so waiting for another holder does not consume it.
The lock path re-entry, advisory holder, once-only exit-75 channel and original output remain.
Original stdin is preserved explicitly across the background lockf launch.
Temporary status files replace the command substitution so signal traps can interrupt wait.

removed: unbounded direct command launch in harness/with-lock.sh.
removed: synchronous command-substitution wait that defers the wrapper signal traps.
removed: repository-local Playwright fixture writes in src/harness.test.ts.
removed: local generated test-results artifacts from the initial test runs; no tracked files removed.

tests changed: src/harness.test.ts: new "with-lock process group kills a background child after command exit".
tests changed: src/harness.test.ts: new "with-lock process group times out and kills its child".
tests changed: src/harness.test.ts: new "with-lock process group kills children when the wrapper is signalled".
tests changed: src/harness.test.ts: new "with-lock process group passes a failure once and waits for a held lock".
tests changed: src/harness.test.ts: "a test that passes only on retry fails a batch run": move its shared fixture to OS temp.
tests changed: src/harness.test.ts: "a quarantined test that passes on retry is reported, not failed": same shared fixture move.
The temp fixture has a module package marker and an absolute import of the installed Playwright
entry point, preserving its former module resolution. Assertions and bounds are unchanged.

Research (offline): local man perlfunc documents portable setpgrp(0, 0); local man lockf
confirms -k and the separate EX_TEMPFAIL (75) acquisition result.
Reference: https://perldoc.perl.org/functions/setpgrp
Reference: https://perldoc.perl.org/Time::HiRes

Red: two new tests failed with a child still alive; the once-only/held-lock control passed.
Log: /tmp/lock-process-group-red.log
Green: all 51 tests in src/harness.test.ts pass, including timeout, child cleanup, TERM,
SIGKILL, once-only exit 75, waiting, re-entry and the existing c4-lockf contracts.
Log: /tmp/lock-process-group-vitest.log
Command: pnpm exec vitest run src/harness.test.ts --maxWorkers=2 --config /private/tmp/lock-process-group-test/config.mts
The temporary config copies the existing timer setup, retaining its checks and directing only
its CPU report into OS temp. The first red exposed the existing setup's repository CPU write;
that artifact was removed. Subsequent runs use the temp configuration.
Packet verify: the same command with -t "with-lock process group"; /tmp/lock-process-group-verify.log.
ESLint: src/harness.test.ts passes; shell files have no ESLint configuration and were checked with bash -n.
Log: /tmp/lock-process-group-eslint.log
Manual checks: stdin survives the background launch; a 2-second command with limit 3 survives
alarm rearming. Logs: /tmp/lock-process-group-stdin.log, /tmp/lock-process-group-long.log.

node scripts/check-harness.mjs ran and failed only because this worktree has no
test-results/unit.json from a full pnpm test run. Log: /tmp/lock-process-group-harness.log.
No fabricated report was supplied. The runner commits the diff and runs pnpm check, as instructed.
No git write, network access, node_modules replacement, or UI screen e2e was performed.

Limits: SIGKILL cannot run the wrapper trap; the supervisor detects it within one second,
while the small temporary status directory may remain. Tests wait for process stream closure
and confirm child disappearance and lock release. Deliberately detached groups are outside
this group cleanup contract. Browser cleanup before gates follows the requested process patterns.
