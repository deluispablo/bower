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
