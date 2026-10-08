# deadlines-test-flake: the v11 migration test reads a deadline the real alarm has already moved

Diagnoser note (TL-P4-15), 2026-10-08, on `claude/p3` 36d41f08. Read-only; no repo file changed. Probes ran as scratch test files outside the repo.

## What failed

`pnpm check` inside `done.sh` at fe33b546 failed once in `api/test/deadlines.test.ts:107` ("storage from before the deadline table keeps its deadlines"): `expected 1791495263907 to be less than or equal to 1791490644034`. The line asserts `rows[1].at <= Date.now()`, so the run's deadline row was 1791495263907 and the wall clock was 1791490644034.

- **The value is `t0 + QUEUED_STALE_MS`.** `t0 = Date.now() + HOUR` (`:87`) and `QUEUED_STALE_MS` is 17 min (`api/src/process.ts:86`). 1791495263907 − 77 min = 1791490643907, which is 127 ms before the clock read at `:107`. So it is the run's own stale deadline, not the migration time.
- **Which path writes it.** The run row is written in five places (`person.ts:568, 678, 896, 918, 947, 971`). The table was dropped (`:92`), so the admission write (`:678`) is gone. The migration writes `now` (`:568`). Only `recover` → `planRecovery` writes `staleDeadline(...) = t0 + 17 min` when that is still ahead (`person.ts:917-918`). `recover` runs only from `wake`. The test calls `wake` itself at `:109`, after the failing line. So the object's **real alarm** ran between `:98` and `:99`.
- **Reproduced (deterministic).** A scratch copy of the test waited 200 ms after `schemaVersion()`. The run row was then exactly `t0 + QUEUED_STALE_MS`. 30 runs of the file under 20 `yes` processes on 10 cores passed 30/30, so the race window is narrow and load alone does not explain it.

**Answer: a test bug, not a product bug.** `moveDeadlines` arms the run at `now` on purpose (`person.ts:558-571`: "the alarm looks at once ... and recovery arms the run's own deadline again"). The real alarm did exactly that. The final assertion (`:111`, alarm at `t0 + QUEUED_STALE_MS`) is the same state, just reached earlier. No fake timers are involved (`vi.useFakeTimers` is not used in `api/test`). Eviction, the double clock read and backoff are not the cause: `handlerThrew` did not run, since `recover` returned before any fetch.

## Why (5 whys)

1. **Why did `:107` fail?** The run row had already moved from the migration time to the run's own deadline.
2. **Why had it moved?** workerd's alarm scheduler delivers a due alarm between two RPCs. The migration armed the alarm at the wall-clock `now`, so it was due at once.
3. **Why does the test not expect that?** It asserts a transient state, the row between the migration and the alarm. It assumes nothing runs between `schemaVersion()` and the next `runInDurableObject`.
4. **Why that assumption?** The file avoids real alarms by moving its time base an hour ahead (`:87, :117, :159, :185`), and `process.test.ts:75` uses a 2036 `T0` for the same reason. That works only while every deadline comes from the test's own `now`. `moveDeadlines` takes the real `Date.now()` in the constructor (`person.ts:181`), which no time base can move.
5. **Design cause.** The workerd suites have no single rule for real alarms. In `@cloudflare/vitest-pool-workers` they fire on the wall clock. Each file keeps its own convention: a far-ahead `T0`, an `HOUR` offset, or explicit `instance.wake(at, fakeGitHub)`. Nothing stops a test from arming a deadline in the past, or from reading state that a due alarm can change. An escaped alarm also uses the global `fetch` to GitHub with the fixture token (`person.ts:701`).

## Owner mechanism

**Worker deadlines (alarms)** (`api/src` deadlines table, `c1-worker-deadlines`). The product side is correct. The defect is in how its tests deal with the runtime's real alarm. No mechanism-map entry covers test time or alarms in `api/test`. The in-process harness has one for Node (`api/test/in-process.ts:268-277`, `fireAlarm`, where alarms never fire on their own).

## Same class elsewhere (4, all `api/test/person.test.ts`)

1. `:360`: `admit(... now: 2_000 ...)` arms the run's deadline in 1970. **Verified by a probe:** the real alarm runs within the same RPC. `recover` calls the real `https://api.github.com/repos/OWNER/REPO/actions/runs` with the fixture token, gets 401 ("tidy lookup failed: status 401"), and fails the run. The test passes only because it checks the lease next. `pnpm check` reaches the network.
2. `:368/:378` (v7→v8), 3. `:402/:411` (v8→v9), 4. `:453/:468` (v10→v11): a queued run plus `from < 12` → `moveDeadlines(Date.now())` arms the run at `now`, so the real alarm re-arms it during the test. Their assertions happen to be immune: `TABLES_BEFORE_V12` leaves out `deadlines`, and `:483` uses `objectContaining`. They were verified by reading the code, not by running them.

Not affected (verified in code): `recovery.test.ts`, `dispatch.test.ts`, `runner.test.ts` (`t0 = Date.now()`, every deadline ≥ 17 min or 60 s ahead), `process.test.ts` (2036), and `session*`/`lease-alike` (they arm no deadlines).

## Options

- **(a) Fix the tests inside the owner's suite.** At `deadlines.test.ts:106-107`, assert the invariant rather than the transient: `before <= rows[1].at <= t0 + QUEUED_STALE_MS`, then the existing explicit `wake` and the alarm check at `:111`. At `person.test.ts:360`, use `Date.now()` instead of `2_000`. Size S (two files, about 4 lines). Risk low. The test no longer tells "armed now, then re-armed" apart from "armed at its own deadline", although both are correct product behaviour. Classes 2-4 stay silent races.
- **(b) Refactor first, then fix.** Collapse the three conventions into one `api/test` helper: one far-ahead clock base, plus a rule that a test asserts what a due alarm leaves, after the existing explicit `instance.wake`. Move `deadlines.test.ts`, `process.test.ts`, `person.test.ts` and `dispatch.test.ts` onto it. Add a vitest `setupFiles` guard in the workerd isolate that fails any test whose code reached the global `fetch`. A probe showed that a `globalThis.fetch` wrapper in the test isolate sees the alarm's fetch. Then apply (a). Size M (about 5 files plus config). Risk low to medium. *Unverified:* that no current api test relies on the global `fetch` (`grep` finds none in `api/test`; `createApp()` defaults are not checked).
- **(c) New mechanism.** Not needed: the deadlines table and the explicit `wake` already exist. A fake clock inside `Person` would be a second way to set time, next to the `now` parameters.

## Regression test (class)

The `setupFiles` guard from (b): an `afterEach` that fails when any test reached the network through the global `fetch`. It catches every real alarm that escapes into recovery (class item 1 today). For the transient-read class: a test that arms a deadline at the wall clock waits about 200 ms, as the probe did, then asserts the state after the alarm. `deadlines.test.ts` v11 under that wait must stay green.
