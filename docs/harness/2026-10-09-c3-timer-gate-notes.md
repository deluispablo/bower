# c3-timer-gate: notes

- Commits: red b6e01216 (tests + stubs), fix e4825860.
- Mechanism: `harness/timer-gate.ts` wraps `globalThis.setTimeout`/`setInterval`; `harness/timer-gate-setup.ts` is the one setup file in the app, api and runner vitest configs (`setupFiles`, https://vitest.dev/config/#setupfiles). It fails the test in `afterEach` naming the test and call site. Fake timers: `vi.isFakeTimers()` (https://vitest.dev/guide/mocking/timers).
- Deviation, one: a timer counts when it fires (a real wait), not when it is scheduled. Scheduled-based failed 510 tests (waitFor limits, library guards, cleared timeouts that waited for nothing); fire-based fails 22. A timer that fires after its test ended is ignored.
- Re-entrancy: `vi.isFakeTimers()` builds vitest's clock on first use and reads setTimeout, so the wrap guards against asking itself (it recursed to a stack overflow before).
- Allowlist `harness/real-timers.json`: 22 names (15 app, 7 api, 0 runner), `REAL_TIMER_CEILING = 22`; check-harness fails a longer list or a line matching no test of the three packages. Replaces `harness/slow-tests.json` (8 lines).
- Removed: `harness/slow-tests.json`, `scripts/harness-alone.mjs`, `SLOW_MS`, `ALONE_MS`, `SLOW_CEILING`, `slowProblems`, the three slow-list tests and two alone-margin tests in `src/harness.test.ts`.
- Added: `slowReport` (slowest 5, printed by check-harness, never a failure); `timerListProblems`.
- Renames in features.json (proof now stale, coordinator re-proves with done.sh): `c3-test-time` (3 slow names -> "the timer allowlist may only shrink|wall-clock times are reported, never failed"); `c3-alone-margin` (2 names -> "wall-clock times are reported, never failed"; it should be retired).
- Gate: `pnpm check` is green except the two stale proofs above, which only done.sh can write; bundle and landing gates pass. Run while `pnpm exec vitest run` ran in the background.
- Observed: with two extra suites loading the machine, runner `per-thing-ask` "every validation refusal is retried once with its reason" hit the 5000 ms backstop (1.0 s alone). Not a timer; left as is.

## Fix round (addendum 10)

- Lock: `harness/with-lock.sh` (one home), mkdir-based, `HARNESS_LOCK` overrides the dir (default `/tmp/bower-heavy.lock`). done.sh wraps its `pnpm check`; integrate.sh wraps `INTEGRATE_CHECK`/`pnpm check`. Waiting prints pid, command, start time; a dead holder is moved aside atomically and taken over with a printed line; an ownerless dir older than ~5 s is also taken over. e2e suites have no script in the harness, so a caller runs them as `bash harness/with-lock.sh pnpm e2e ...`.
- Tests (harness.test.ts): two checks run one after the other; a second waits and names the holder; a stale lock is taken over. harness-git.test.ts gives integrate.sh a temp lock.
- features.json: c3-timer-gate verify gains the two extra lock tests; c3-test-time and c3-alone-margin verify names exist (precheck ok), passes=false for the coordinator to re-prove.
