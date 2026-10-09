# Load timeouts and Vite 504: diagnosis (2026-10-09)

Defects: `size-cap-test-timeout-under-load`, `per-thing-ask-timeout-under-load`, `import-rule-timeout-under-load`, `vite-outdated-optimize-dep` (DEFECT_LOG.md:50, 51, 64, 63). Diagnoser, read-only. Measured on claude/p3 0318cfaf, unit tests only, every run under `harness/with-lock.sh`. Scratch logs: `/private/tmp/claude-501/-Users-deluisp-Projects-bower-app/19ca090d-5e3d-4a2f-899c-8f2af3d7d836/scratchpad/` (`m1/summary.txt`, `before-after.out`, `prof/`, `prof2/`).

## What failed

| Test (timeout) | Alone: test ms / wall s / user CPU s (load) | Loaded check (main, 18:36 `test-results/unit.json`) |
| --- | --- | --- |
| fake-worker.test.ts:4299 size cap (30 s) | 11 492 / 12.5 / 15.1 (load 11); the skip-all baseline is 0.8 / 0.9 | 23 989 ms, 80 % of its budget |
| per-thing-ask.test.ts:128 (5 s) | 1 088 / 1.6 / 1.8 (baseline 0.5 / 0.5) | 2 281 ms in the runner run at 18:20 |
| architecture.test.ts:26 import rule (5 s) | 1 597 / 2.1 / 2.0 + its child processes | 5 552 ms, failed |

- **Vite.** Log `/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/tmp.VizK5fg5RM` (18:16:37, main checkout). The demo pass skipped all 4 tests; the fake pass failed 3 of 4 with `504 (Outdated Optimize Dep)`, which `e2e/fixtures.ts:28` turns into a failure. Main's `node_modules/.vite/deps/_metadata.json` was rewritten at 18:16:51, during the rerun.
- **Contention.** The machine has 10 CPUs and the load was 12 to 20. The lock covers only done.sh:107 and integrate.sh:25. done.sh's own e2e verify runs outside it twice, in `expect_red` (:64) and in the green verify (:108). Workers ran gates outside the lock until WORKER.md:9 (addendum 11).

## Why (5 whys)

1. **Why do these tests time out?** Wall time grows by 2 to 3.5 times under load, and each test was already using 20 to 80 % of its budget. None of them waits on time: none is in `harness/real-timers.json`, and the timer gate would fail a real wait of 100 ms or more. The answer to Q1 is **compute plus contention, with no real waits.**
2. **Why is each one heavy?**
   - **Size cap.** The cost is product code, not hashing. Profile: `rawByteAt` (ownership-format.ts:129) takes 47 % self time, and `parseOwnership` takes 75 % inclusive. `@noble/hashes` takes about 3 %, so the test's own comment ("hashing takes seconds", :4376) is wrong.
   - **per-thing-ask.** One test makes 38 full runner runs: one per REFUSALS kind (37) plus the structured case, :187-206.
   - **Import rule.** It runs `spawnSync` four times, and each run is `node check-dependencies.mjs`, which spawns `depcruise` (dependency-gate.ts:12, check-dependencies.mjs:13). That makes 8 Node starts.
3. **Why did the size cap get slower?** c3-note-sections (8233a111, 10-09 11:50) added `rawByteAt`. Each call walks the text from offset 0 and re-encodes the whole prefix, and one legacy parse makes up to 11 such calls. The callers also re-parse the same bytes: there are 13 `parseOwnership` call sites in note-edit.ts and note-format.ts.
   - **Measured, same machine, under the lock:** 6.2 / 6.5 s at 8233a111^ against 12.6 / 18.8 s at 8233a111. The test's CPU doubled, and the first timeout was logged the same day.
4. **Why did no gate catch it?** Wall time is "report only" (check-harness.mjs:65, TL-P4-17 addendum 9). The timer gate catches only sleeping tests. Nothing budgets compute, so the 30 s timeout was the only alarm, and only under load.
5. **Design cause.** The test-time mechanism checks the cause "waits on the clock" (the timer gate) but not the cause "does too much work". Its contention control (the lock) is opt-in per caller, and even done.sh leaves its e2e verify outside it.

### Vite (Q2)

- **When Vite 8.3.2 answers 504.** It answers 504 to a request whose `?v=` browserHash is stale after the optimizer re-ran (vite `dist/node/chunks/node.js:25681-25703`, `:20233`).
- **What makes the optimizer re-run.** A cache whose hash changed: the lockfile, or the config hash, which includes the plugin names (`getConfigHash`, :28790-28798). A dependency discovered after the crawl also triggers it.
- **The file move was not the trigger.** v2-name-sheet's code (51978d36) adds no bare import, so moving those files back cannot change the dependency set.
- **Most likely cause (unverified, needs a server to reproduce).** Before c4-e2e-port, every worktree used port 5191 with `reuseExistingServer`. The green verify, which runs unlocked, met another worktree's dev server whose optimizer re-ran. Supporting evidence: main's cache was rebuilt at the rerun, and a valid cache of its own would not have been.
- **Status.** c4-e2e-port (9c9d9a37) removes the shared port.
- **Remaining risk.** c4-e2e-port added the plugin `bower-e2e-identity`. So any red/green flip, or integrate merge-and-abort, of `vite.config.ts` or of the lockfile invalidates the cache. Four parallel Playwright workers then meet a cold optimizer (unverified, not reproduced).
- **Standard fix.**
  - Put every dependency in `optimizeDeps.include`, so nothing is found late. Vite's docs say that when the scanner plus `include` find every dependency, `holdUntilCrawlEnd` can be turned off.
  - Optionally add `server.warmup.clientFiles` with the entry.
  - Reject a fresh cache per run (`--force`): it makes every run a cold start, which is the race itself.
  - `noDiscovery: true` needs a second, hand-kept dependency list, which breaks the one-home rule unless the list is derived.

## Owner mechanism

- **Size cap.** "Note sections", `src/data/contracts/ownership-format.ts`. The map row still says "Target", but c3-note-sections passes, so the row is stale.
- **The two test reshapes and the CPU budget.** The c3-timer-gate / c3-test-time home: `harness/timer-gate*.ts` and `harness/real-timers.json`. This home is not in the mechanism map.
- **Contention.** `harness/with-lock.sh`.
- **Vite.** None in the map. The nearest homes are `vite.config.ts` and `e2e/port.ts` (c4-e2e-port).

## Same class elsewhere (9)

Measured at load in the 18:36, 18:20 and 18:19 reports:
1. architecture.test.ts:35, 2 spawns: 2.65 s against 5 s.
2. upload-queue-real.test.ts:193: 3.3 s against 5 s.
3. upload-queue-real.test.ts:228: 3.1 s against 5 s.
4. run-manifest.test.ts:428: 2.1 s against 5 s.
5. harness.test.ts:394, 9 eslint spawns: 11.9 s against 60 s.
6. harness-git.test.ts, git spawns: 1.5 to 1.7 s against 5 s. Line numbers not checked.
7. api/test/runner.test.ts:200: 6.3 s against 20 s; it is on the allowlist.
8. done.sh:64 and :108 run the e2e verify outside the lock.
9. scripts/quiet-gates.mjs:7-16 leaves alone any redirected or chained command. WORKER.md:9 tells workers to redirect, so a lock added by that hook would miss those runs.

## Options

- **(a) Fix inside the owners.**
  - **a1.** `legacyNote` computes every byte offset in one pass, with a single encode. Size S, about 15 lines. Risk low to medium (CRLF, BOM, multibyte); keep the existing ownership tests and add a test that the spans equal the old ones. Expected effect: the test goes back to about 6 s, and the runner's CPU on 1 MiB notes halves. Also correct the wrong comment at :4376.
  - **a2.** per-thing-ask becomes `test.for` over the REFUSALS kinds, one test per kind of about 30 ms (vitest test.each/for). Size S, risk low; it needs a `tests changed` line.
  - **a3.** The import rule and the provider test each build one fixture tree and run the gate once, asserting each file by name. Size S, risk low.
  - **a4.** `optimizeDeps.include` covering every dependency (derived, not hand-kept), plus `server.warmup` for the entry. Size S, risk low to medium.
- **(b) Refactor first, then fix.**
  - **b1.** Parse each note once per decision instead of at the 13 call sites. Size M, risk medium.
  - **b2.** The lock moves into the heavy commands themselves: a vitest and Playwright `globalSetup` takes it, and `with-lock.sh` exports a held flag so nested calls do not deadlock. Every caller is then covered: done.sh's verify, workers, and redirected forms. Size M, risk medium: deadlock if the flag is wrong, and lower throughput.
  - **Alternatives to b2, both weaker.** WORKER.md only (already done, relies on discipline). A quiet-gates hook (misses redirected or chained commands; needs the owner's OK and a restart).
- **(c) Load-scaled per-test timeouts: reject.** It loosens a gate, against TL-P4-17 addendum 9 ("the 5000 ms backstop stays") and TL-P4-20. A fixed `testTimeout` is vitest's budget per test. A scaled budget is non-deterministic and would have hidden the 2× regression from c3-note-sections that this timeout exposed. No new mechanism is needed.
- **Possible extension of the timer gate.** Record each test's CPU time (`process.cpuUsage`) in the timer-gate setup file and fail a test that uses more than 25 % of its timeout. TL-P4-17 addendum 9 rejected CPU time as a replacement for the timer gate because a sleeping test uses none. As a complement it catches compute. It misses spawned children. Report first, then gate.

## Regression test (class)

- The timer-gate setup file reports, then fails, any unit test whose CPU time exceeds a set share of its timeout. Red: a fixture test that burns CPU.
- A fast fixture test for a1: `parseOwnership` encodes at most a set multiple of the note's size (a spy on the encoder).
- A harness test for b2: a fixture `pnpm check` or Playwright run started without the lock waits on `HARNESS_LOCK`.

## For c4-test-timers (lead to rule)

1. The 22 allowlisted tests move to fake timers or event waits (its current scope).
2. a2 and a3.
3. done.sh `expect_red` and the verify go under `with-lock.sh`, and b2 or the hook, as ruled.
4. a4 in `vite.config.ts`, with a class test that the include list covers every bare runtime import in `src/`.
5. The CPU-budget report in the timer gate (report now, gate after a baseline).
6. A map row "Unit test time and heavy runs" (`harness/timer-gate*.ts`, `with-lock.sh`); the "Note sections" row set to Done.

a1 (and b1) are product code under "Note sections" and should be their own entry, not part of c4-test-timers.
