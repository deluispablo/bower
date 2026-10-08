# smoke-runner-offline and smoke-runner-silent-stop: one stalled Drive read stops the run, and the Worker never hears

Diagnoser note (TL-P4-15), 2026-10-08, on `claude/p3` 5cf0dac0 (staging 9265d860, runner bundle `bower-home` 797f38b). Read-only. The only command run was `npx vitest run test/network-retry.test.ts test/barrier.test.ts` in `runner/`: 11/11 pass. The note covers both log lines, as the lead asked.

## What failed

Actions 37843268864, run `dtSmuIz4…`, attempt 1, claude provider. The log shows `Tidy-up … attempt 1` at 20:57:27.73. Then 31.5 s with no other line. Then `timing: end=stopped total=31495 start=80 token=594 reads=30900 … status=0`, and `BowerError: You're offline` (code `offline`) from `DriveHttp.call ← DriveHttp.readText ← readBytes ← stored ← shownDone`. The job exited 1.

- **Retries.** There are no `TypeError` or `Answered 5xx; sending again` lines. `retried` logs one of these on every retry (`runner/src/retry.ts:34,37`), so no fetch failed fast and no retry ran.
- **Comparison runs.** 37842961632 ran three minutes earlier on the same bundle 797f38b: `end=done reads=20332`. 37828633594 (46117f4, stage 0) ended `done` with `reads=18315`. The last 59 runs of `bower-home` all succeeded.
- **Worker.** `/status` kept phase `queued` after the job exited.

## Defect 1, smoke-runner-offline

### Why (5 whys)

1. **Why "offline"?** `shownDone` (`src/data/spine/barrier.ts:101`) first lists Bower's folders. Then it reads `.bower/last-run.json` through `runnerReads.readBytes` → `RunnerDrive.readText` → `DriveHttp.readText` (`runner/src/spine/records.ts:52`, `runner/src/drive.ts:285`). No answer came within `ANSWER_WAIT_MS` = 30 000 ms (`src/data/wait.ts:14`). `answered` ends such a wait as `TypeError('No answer in time')` (`wait.ts:39`), and `DriveHttp.call` maps every `TypeError` to `offline` (`drive-http.ts:377`).
   - The arithmetic fits: reads = 30 900 ms, which is one listing (~0.9 s) plus the 30 s bound.
   - Nothing is wrong with the network as a whole. The token route had answered 0.6 s before.
2. **Why was the read not sent again?** The runner's GET retry sits *inside* the bound. `DriveHttp.call` → `answered(this.fetchFn)`, and `fetchFn` is `RunnerDrive.hooked`, whose GET branch is `retried(...)` (`runner/src/drive.ts:127,451`). When the 30 s timer fires, it aborts the whole retry sequence. The underlying fetch rejects with `AbortError`, and `retried` does not retry that (`retry.ts:36`). `DriveHttp.call` itself retries only 429/5xx (`drive-http.ts:390`). So a request that stalls (connected, no headers) is never sent twice. Only a fast `TypeError` is.
3. **Why do the two layers disagree?** They were built for different clients. The bound came from the browser (TL-P3-28 point 4, 1bef02d7): "nobody stares at Saving… for a minute", and the person can press again. The runner's retry came separately (71ee4ad2) and wraps the fetch that `DriveHttp` hands to `answered`, not each attempt. The runner's other Drive path is the other way round: listings (`RunnerDrive.read`, `drive.ts:508`) retry but have no bound.
4. **Why did tests not catch it?** The retry tests stub a fetch that *rejects* at once (`runner/test/network-retry.test.ts:107`). No test in `runner/test` or `src` uses a fetch that never settles against a runner read. `answered` is only exercised from the app side.
5. **Design cause:** the Drive transport has no single policy for an idempotent request: a bound per try, a retry with backoff, then the error. Every client composes its own (`c2-drive-transport`: "four clients today"). So whether a Drive stall stops a headless run depends on which path happens to read the file.

**Stage 1 or transient?** The trigger was transient: one Drive `alt=media` GET that did not answer in 30 s. It is not reproducible from code, and nothing in the log shows Drive's side (unverified). No stage 1 change touches this path. Since 924e6d6, `git diff 924e6d6 9265d860` shows no change to:
- `drive-http.ts`, `wait.ts` or `runner/src/spine/records.ts`;
- `RunnerDrive.readText` or `hooked`.

The `runner/src/drive.ts` changes are only the hash calls (`md5Hex`, `sha256Hex`). No hash runs before or inside `readText` on this path. The changes to `barrier.ts` (`alreadySaved`) and `drive-api.ts` (`DRIVE_OPS`) are off the path too. The weakness dates from 2026-10-07 (1bef02d7 and 71ee4ad2), before stage 0.

### Owner mechanism

**Drive transport** (token, retry, errors, wire type), `src/data/drive/`, target `c2-drive-transport`.

### Same class elsewhere (6)

Each item is a different retry or bound policy around the same kind of request:

1. `src/data/drive/drive-http.ts:374-377` `call`: the browser's GETs also go `offline` after one stall, with no retry.
2. `src/data/drive/drive-http.ts:292-297` `raw` (resumable status and chunks): the same.
3. `runner/src/drive.ts:451` `hooked`: retry inside the bound (this defect).
4. `runner/src/drive.ts:508` `RunnerDrive.read` (listings, `stamped`): retried but unbounded. A stall waits on Node's own fetch timeouts (undici `headersTimeout`, 300 s by default: unverified for Node 24.21).
5. `runner/src/token.ts:105`: unbounded, with retries.
6. `runner/src/status.ts:94`: unbounded, with retries. A stalled status post can hold the job until `timeout-minutes: 30` (`runner/workflows/tidy.yml:38`).

`src/data/worker/worker-http.ts:111-119` is bounded and maps a stall to `offline` with no retry, which is acceptable in the browser. It belongs to the same transport list for `c2-drive-transport`.

### Options

- **(a) Fix in the owner. Size S, risk low-medium.**
  - **Change.** In `DriveHttp.call` and `raw`, a `TypeError` (network error or no answer in time) on an idempotent request (GET) joins the existing `WAITS` loop as a retryable failure. The bound stays per try. The runner's `hooked` GET branch then drops its `retried`, so one retry policy remains for Drive content reads.
  - **Unchanged.** Writes never retry here; a lost answer still goes to read-back.
  - **Risks.**
    - A browser read can now wait up to ~4 × 30 s before "offline". Consider one retry for a timeout, or a shorter per-try bound for GETs.
    - It leaves item 4 unbounded.
- **(b) Refactor first, then fix. Size L, risk low per step.**
  - **Refactor.** `c2-drive-transport` (stage 2) makes one transport function: per-try bound, idempotent retry with jitter (`retry.ts`'s policy), and error classification. `DriveHttp`, `RunnerDrive.read`, `RunnerToken`, `RunnerStatus` and `WorkerHttp` all use it.
  - **Fix.** (a) then becomes one rule in one place, and items 1-6 close together.
  - **Risk.** Staging keeps the flake until stage 2. Its rate today is 1 in 60.
- **(c) New mechanism.** Not needed: the transport home exists.

### Regression test (class)

"A request that never answers": a parametrized test over every transport client (`DriveHttp` read, listing and resumable status; `RunnerDrive.read`; `RunnerToken`; `RunnerStatus`; `WorkerHttp`), with fake timers and a fetch whose first send never settles. It asserts:

- Every idempotent request ends within its bound and is sent again, then succeeds.
- A stalled write is never sent again and reaches the lost-reply read-back.
- No client waits without a bound.

Add one runner case: `shownDone`'s read stalls once, and the run ends `done`.

## Defect 2, smoke-runner-silent-stop

### Why (5 whys)

1. **Why did the Worker stay `queued`?** The runner sent no status at all (`status=0`).
   - The run's first status (`reading`) is posted only after `shownDone` and `records.found` (`runner/src/main.ts:198,215`), and the error came inside `shownDone`.
   - `tidyRun` caught it as `stopped` (`main.ts:146-147`). Since `seen.chain === null`, it rethrows with no report (`main.ts:156`).
   - `main` logs it and returns 1 (`main.ts:341-343`).
2. **Why rethrow instead of reporting?** It is deliberate (6cf8463f, TL-P3-22 add. I1): with the chain unread, the runner cannot know what an earlier attempt changed. Neither "failed: nothing changed" nor `saving` would be true. So "the job fails visibly and the Worker's recovery decides". `runner/test/barrier.test.ts:352` asserts it.
3. **Why does the Worker not decide at once?** Its recovery is purely time-based. The only trigger is the run's stale deadline (`api/src/recovery.ts:70`): `requestedAt + QUEUED_STALE_MS` (17 min, `api/src/process.ts:86`) while `queued`, and `phaseAt + 30 min` once started.
   - Only at that deadline does `decide` look up the Actions job. A completed job with no report at attempt 1 is redispatched as attempt 2 (`recovery.ts:93-99`).
   - So this run should show `queued` for ~17 min, not 30 as logged, then run again. That this happened on staging is unverified; the coordinator is watching.
4. **Why is there no way to say "this attempt ended"?** The runner wire has only phase reports. The phases are queued, reading, writing, saving, done and failed (`api/src/runner.ts:99-110`, `isRunPhase`). An exit without a terminal phase has no message. The only signal is silence until a deadline.
5. **Design cause:** the runner–Worker contract has no "attempt ended without a terminal report" signal. Recovery of a dead attempt therefore waits for a stale window sized for a *live* runner. Every exit-1 path inherits that wait.

**Stage 1?** No. The rethrow dates from 6cf8463f (2026-10-07). `git diff 924e6d6 9265d860 -- runner/src/main.ts` changes only the md5 helper. `c1-shared-contracts` moved `PHASE_RANK` (`status.ts`) without changing what is sent. `c1-worker-routes` and `c1-worker-deadlines` did not change the status route or `decide`. The v13 deadline table still arms `run` at `staleDeadline` (`api/src/person.ts:947`).

### Owner mechanism

- **Contracts shared by app, Worker and runner** (wire, phases), `src/data/contracts/`: the missing message.
- **Worker deadlines**, `api/src` deadlines table: the earlier wake. It already has the 60 s recheck kind (`RECHECK_MS`, `person.ts:85`).

The runner's ending rule (`tidyRun`, `main.ts:128-165`) is not on the map. The lead may add it as "Run ending (what a runner reports when it stops)".

### Same class elsewhere (4 exit paths)

All of them exit with no report and wait for a deadline:

1. `runner/src/main.ts:156`: chain unread. Any error in `token.grant`, `shownDone` or `records.found` lands here.
2. `runner/src/main.ts:340`: left in `saving` exits 1. Recovery waits `phaseAt + 30 min`.
3. `runner/src/main.ts:146`: `mayNotReport` or `status.finished`. This one is correct: a newer attempt or a revoked ticket owns the run.
4. A job killed by Actions (`timeout-minutes: 30`, cancel). Only the deadline can catch it, by design.

### Options

- **(a) Fix in the owners. Size M, risk medium.**
  - **Contract.** Extend the runner status wire (`src/data/contracts/`, the Worker's status route) with one additive report: "attempt N ended, no terminal report".
  - **Runner.** It sends the report on every exit-1 path after the ticket is read: items 1 and 2, and `main`'s catch. Item 3 excepted.
  - **Worker.** The Worker arms its existing `run` deadline at `now + RECHECK_MS` instead of the stale deadline. The existing `decide` then runs: a completed job at attempt 1 is redispatched, attempt 2 ends with `staleFailure(phase)`, and a job still in progress is waited for.
  - **Fit.** No second recovery path, and the truth rule I1 stays: the runner still claims nothing about what changed.
  - **Risks.**
    - A contract change, so an old runner must keep working. The report is additive, and the Worker tolerates its absence.
    - Actions may still show the job `in_progress` at +60 s; then `decide` waits, as it does today.
- **(b) Refactor first, then fix. Size M+, risk low.**
  - **Refactor.** Move "how a runner stops" into one function that every exit of `runTidy` and `main` goes through: its terminal report, `saving`, or the new ended report. Today it is split across `main.ts:139-165` and `:333-343`.
  - **Fix.** Then (a). This keeps a future exit path from skipping the report.
- **(c) New mechanism.** Not needed.
  - Rejected: a workflow `if: failure()` step that calls the Worker. It would be a second path, could not tell a stale attempt apart, and needs the ticket outside the runner.
  - Rejected: posting `failed` when the chain is unread. It breaks I1 and refuses a free redispatch.

### Regression test (class)

"Every runner exit is reported or recovered within `RECHECK_MS`."

- **Runner.** Parametrize a thrown error at each step: token, `shownDone`, `found`, plan, apply, report and status, plus the `saving` exit. Assert the Worker stub receives either a terminal phase or the ended report, except for stale-attempt and auth.
- **Worker** (api test with the time helper). An ended report arms `run` at `now + 60 s`, and the alarm's `decide` with a completed job redispatches attempt 2 well before 17 min.
- **Existing test.** Update `barrier.test.ts:352` to expect the ended report in place of silence.

## Ruling: TL-P4-16 addendum 4 (main 053aca0)

Both (b), in stage 2.
- offline → `c2-drive-transport`: one retry policy (a timeout per attempt; idempotent GETs retried with backoff inside a total budget; errors mapped by context; outside a browser never "offline"). The note's 6 transport sites become named tests.
- silent-stop → new `c2-runner-exit` (escalated): one exit function for all 4 runner exit paths, then the additive "attempt ended" report, Worker deadline at +60 s. No if:failure step. Test: every exit, including an uncaught error, reaches the Worker or is recovered within 60 s.
