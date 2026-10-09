# c4-test-timers: notes

Worktree `/private/tmp/bower-c4-timers`, branch `c4-test-timers`.

## Parts, with red and fix

| Part | Red | Fix |
| --- | --- | --- |
| 1 byte table per note | 5824b7c5 (bound reshaped in f55f8fc5) | 65ceae64 |
| 2 re-entrant lock | f7011429 | 1d6dd4e6 |
| 3 Vite include and warmup | 78fddccb | fa687993 |
| 4 axe helper | 535bc9f0 | a1148af0 |
| 5 allowlist empty, test.for, CPU report, map rows | a6f8b906 | 2b0c9552, 919d97c5, 9129082f, 83daa97b |

## Part 1: how the bound was measured

- The size-cap run (ten notes of about 1 MiB) took 11.4 s of wall time on an idle machine before, and 6.8 s after.
- The profile counted 1256 `parseOwnership` calls, 9.5 s of the run, 890 MB of bytes.
- The red first used CPU seconds (14.1 before, 9.5 after, bound 12). Inside the full unit run the fixed code used 15.8 s, so
  CPU seconds moved with load. The bound is now characters handed to `TextEncoder.encode`: 5.96 billion before, 1.51
  billion after, bound 3 billion. It does not move with load. Checked against `e1f5bbe1`'s parser: it fails; against the fix: passes.
- A differential test (`legacy spans are byte-exact with LF/CRLF and wide characters`) passes on the old and the new parser.
- Not done: parsing each note once across the 13 call sites (b1 of the diagnosis). Parsing is still about 850 times in that run.
  That is the product-code refactor the diagnosis keeps as its own entry.

## Part 3: the 504

- Reproduced the mechanism: with a dev server running, a change to `vite.config.ts` restarts the server and re-optimizes
  ("Re-optimizing dependencies because vite config has changed"); a request with the old `?v=` hash then answers 504.
  `optimizeDeps.include` cannot prevent it. It is a config change under a live server, which a red/green flip of `vite.config.ts` does.
- Not reproduced: a cold optimizer (cache deleted, server started, two runs of 79 e2e tests: no re-optimize line, no 504).
- So the change is prevention: every bare runtime import in `vite.deps.ts`, plus `server.warmup` for the entry. The class test
  `pre-bundles every bare runtime import of the app` scans `src/` and fails if one is missing.

## Part 4

- No shared axe helper existed: 13 specs built `AxeBuilder` themselves, and two had local animation waits. All move to `e2e/axe.ts`
  (`axeScan`, `expectAxeClean`, `animationsEnd`). It waits on `document.getAnimations()` and each `finished`, skipping infinite ones.

## Part 2

- `with-lock.sh` exports `HARNESS_LOCK_HELD=<lock path>` and `exec`s the command when it equals the lock it would take.
- `pnpm check` is now the lock around `check:run`; `e2e`, `e2e:fake`, `e2e:pwa` (with `e2e:pwa:run`), `scripts/e2e-both.sh`,
  and done.sh's two verify runs are wrapped. No globalSetup lock.
- Side effect to know: any focused vitest or e2e run under the lock waits when another worker holds it.

## Part 5

- The allowlist is empty and `REAL_TIMER_CEILING` is 0. The 22 tests: 17 root, 7 api (the list had 22 names; the runner one was `per-thing-ask`, a CPU matter, not a timer).
- `per-thing-ask` is `it.for` over the refusal kinds: 47 tests, about 30 ms each.
- The CPU report: the shared setup file records each test's CPU time; check-harness prints the top five. Report only. The api tests (Workers runtime) report none.
- Map rows: "Heavy-run lock and timer gate" added; "Note sections" set to Done.
- Compatibility list rows for `65ceae64` and `2b0c9552` (src/docs.test.ts requires one per commit under `src/features` or `src/data/contracts`).
- One production seam: `backoffPace` in `api/src/github.ts` (scale of a retry's wait; tests set 0). The waits themselves stay pinned through `dispatchTidy`'s `sleep` argument.

## tests changed

- tests changed: src/data/fake/fake-worker.test.ts: the size-cap test split in two (small notes keep their name; ten big notes become `the size-cap run fits its time bound with no load`, same assertions plus the encode bound); the 30 s timeout is kept.
- tests changed: src/data/vault/ownership-format.test.ts: added the byte-exact span test (new, nothing removed).
- tests changed: src/harness.test.ts: added the lock, nested-call, entry-point and CPU-report tests; the allowlist test now also requires an empty list and ceiling 0 (stricter).
- tests changed: src/hooks.test.ts: `pnpm check` is now the lock around `check:run`; the green-mark assertion moves to `check:run` and also checks that `check` runs it.
- tests changed: src/features/palette/Palette.test.tsx: the 200 ms search wait runs on fake time (fireEvent instead of typing, since userEvent hangs under fake timers).
- tests changed: src/ui/focus.test.ts: `wait` advances fake time instead of sleeping, in a `beforeEach`/`afterEach` pair.
- tests changed: src/features/home/Home.test.tsx: two 100 ms sleeps become one zero-delay turn (the code under test uses `setTimeout 0`).
- tests changed: src/app/OpenElsewhere.test.tsx: the demo panel test preloads the lazy chunk and advances fake time past React's 300 ms Suspense throttle; same assertions.
- tests changed: src/data/live/live.test.ts: `a run already going ... fast pace` waits for the `done` event (vi.waitFor) instead of 400 ms; `createFolder` runs on fake time for its 300 ms steps.
- tests changed: src/data/live/home-cache.test.ts: the file runs on a fake clock that jumps to the next timer when the event loop is quiet (modelled 300 ms calls); assertions and numbers unchanged.
- tests changed: runner/test/per-thing-ask.test.ts: the loop over refusal kinds is `it.for`; the structured-output case is its own test; a new test keeps the check that every kind has a bad reply. Same assertions.
- tests changed: api/test/dispatch.test.ts: retry waits take no time (`backoffPace.scale = 0`).
- tests changed: api/test/admission-reads.test.ts: modelled Drive latency 150 ms to 15 ms and budget 3000 ms to 300 ms (same ratio), below the timer gate's 100 ms; measured 92 ms against 300.
- tests changed: api/test/runner.test.ts: `after the last ticket expires no gone row is kept` runs the alarm's `wake` at expiry and fakes Date for the next access, instead of waiting 3 s and polling.
- tests changed: api/test/vault.test.ts: `a call whose claim lapsed before reserving` holds the marked list on a promise the test settles, instead of a 300 ms delay.
- tests changed: e2e/app.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/bird-engine.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/c4-segmented-one.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/capabilities.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/focus-after-close.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/qa26.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/qa27.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/qa28.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/qa5.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/v2-dock.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/v2-field.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/v2-name-sheet.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).
- tests changed: e2e/v2-targets.spec.ts: axe scans go through `e2e/axe.ts` (same includes, tags and rules; now after animations end).

## Coordinator addendum (TL-P4-22 addendum 18, main 5083a711)

- **The split is released.** b1 (parse once per note per run) is now its own escalated entry, `c4-parse-once`, after the TL-P4-24 entries. The P4-52 BLOCK on it is resolved by that ruling. There is no re-review.
- **Why a3 fits the empty allowlist.** The timer gate (`harness/timer-gate.ts`) counts only in-process timers of 100 ms or more. The import-rule test (`src/architecture.test.ts:26`) and the provider test schedule no such timer. Their time goes to child processes (dependency-cruiser) and CPU, so they never belonged on `real-timers.json`. The load timeout they showed came from concurrent heavy runs, and the re-entrant lock now prevents those. a3 (one fixture tree and one gate run) remains a speed-up only, not a timer-gate item.
- **Map row.** The ARCHITECTURE row now names `check:run` and `e2e:pwa:run` as the unlocked bodies, called only through the lock.
- review: P4-52 BLOCK (b1 only), released by TL-P4-22 addendum 18.
