# c4-run-counts notes

Ruling: TL-P4-22 addendum 2, option (b); defect `stage-3-live-slower`.

## What changed

- `runner/src/timing.ts` is the one home: `RunTiming.meter(fetch)` wraps the Drive transport's fetch (`RunnerDrive`, via the new `timing` option) and counts each Drive call and its bytes (request plus response) under the phase running when it was sent. `runner` holds calls outside every phase. Worker calls (token, attempt, status) go by another fetch and are not counted.
- The `timing:` line ends with `drive=<phase>:<calls>/<bytes>,...` and `region=<name>`. Existing fields keep name and order.
- Region: GitHub documents no region variable on its runners (default variables: `RUNNER_OS`, `RUNNER_ARCH`, `RUNNER_NAME`, `RUNNER_ENVIRONMENT`, https://docs.github.com/en/actions/reference/workflows-and-actions/variables). The line reads `BOWER_RUNNER_REGION` and says `unknown` without it. No workflow sets it yet: lead to rule (the job log's own "Set up job" region line is what the diagnosis used).
- Golden: infers nothing; modelled runs return the logged line and the golden reads timing's counts. C04 78 and 25-runs 88 are the sums of the line's calls.
- Timing's phases attribute differently from the old inference (reads 15, apply 47, checkpoints 4, report 10, 2 outside a phase), since the old one counted Worker calls and guessed by order.

## tests changed

- tests changed: runner/test/drive-calls-golden.test.ts: drops its own phase inference; asserts timing's counts (totals 78 and 88 unchanged; per-phase numbers are timing's, Drive only).
- tests changed: runner/test/modelled.ts: returns the run's timing line, takes an env, adds `countsOf`/`drivecalls` readers.
- tests changed: runner/test/corpus-run.ts: `runScripted` takes an env for the run.
- tests changed: runner/test/claude-provider.test.ts: the line may be up to 460 characters (was 300) and its fields end with `drive` and `region`.
