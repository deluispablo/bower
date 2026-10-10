# c5-test-margin notes

implementer: codex

Entry: c5-test-margin, TL-P4-31 addendum 1. Tests only; no assertion red is required by the packet.
The initial split is committed; the coordinator commits fix-round changes and notes separately.

## Research

- Vitest parameterized tests: https://vitest.dev/api/#test-each. Existing tests already use `it.each`.
- fast-check sampling: https://fast-check.dev/docs/core-blocks/sampling/.
- Offline evidence: installed `node_modules/fast-check/lib/fast-check.js`, `sample` / `streamSample`;
  its API comment says sample returns all values that assert/check would generate.
  Passing the original property preserves its generation and run-index bias.
- No network was used.

## Initial split: changes and retained coverage

tests changed: src/bird/engine.test.ts: split the cadence/entry Cartesian product into 48 tests plus geometry; keep seed 2610, numRuns 20 and the original body.
tests changed: src/data/vault/undo-compensate.property.test.ts: sample each of random batches 1 and 2 with unchanged numRuns 50, then execute the original model-run body in ten five-run tests per batch.
tests changed: src/codex-run.test.ts: give each of the five original refusal cases its own it.each test and fresh fixture.

Case counts before = after:
- Startle: 9 poses + phase-dependent preen + fixed 0.6 s preen + minded doze = 12 entries;
  4 cadences × 12 entries × 20 seed-2610 phase/offset pairs = 960 simulation cases before = 960 after.
  Geometry: (9 pose ranges + 1 preen range) × 2 endpoints = 20 assertions before = 20 after.
  The split mapping is checked and each simulation test asserts that exactly 20 property runs executed.
- Undo random batch 1: 50 model runs before = 10 parts × 5 runs = 50 after.
- Undo random batch 2: 50 model runs before = 10 parts × 5 runs = 50 after.
  Generation and partition lengths are asserted. Every run calls the unchanged checkUndo body once.
  The original 30 seed-427285 runs and four remaining 50-run random batches are unchanged;
  all-file total remains 330 model runs. Those other batches were not run for this entry.
- Runner refusal: 5 cases before = 5 cases after; five original assertions per case are retained.
- Every original bound, assertion, property budget, explicit seed and default 5 s timeout remains.
  At initial delivery, random batches retained unspecified seeds; fix round 1 below pins batches 1 and 2.
  No load-dependent logic, skips, stubs or product edits.
  Undo already used endOnFailure: true, so sampling does not remove an existing shrinking pass.

removed: src/bird/engine.test.ts: the original single it registration becomes a describe; no cases or assertions removed.
removed: src/data/vault/undo-compensate.property.test.ts: only the two original single it registrations become describes; no cases or assertions removed.
removed: src/codex-run.test.ts: the original five-case loop becomes five it.each registrations; no cases or assertions removed.

## Measurements (initial split)

Each target ran alone, sequentially, with --maxWorkers=2 as explicitly requested (overriding packet --maxWorkers=1).
Before/after durations below are Vitest JSON per-test wall times, in milliseconds.
The final targeted measurements ran without another verification command launched alongside them.
All 74 resulting tests pass, and each resulting test is below the unchanged 1,000 ms acceptance bound.

| Original test | Before ms | After parts | After max ms |
| --- | ---: | ---: | ---: |
| Startle settling from every pose | 2115.700 | 49 | 251.974 |
| TL-P4-28(2): compensating Undo preserves FIFO and the Drive-only person-state oracle (random batch 1) | 734.211 | 10 | 113.739 |
| TL-P4-28(2): compensating Undo preserves FIFO and the Drive-only person-state oracle (random batch 2) | 824.189 | 10 | 72.711 |
| Refuses guarded paths, secrets and addresses | 2511.220 | 5 | 503.557 |

Every after part:

| Target | Part | After ms |
| --- | --- | ---: |
| startle | every pose and preen endpoint meets the geometry bound | 0.766 |
| startle | 30 fps: idle | 42.303 |
| startle | 30 fps: wait | 22.762 |
| startle | 30 fps: read | 33.182 |
| startle | 30 fps: write | 31.161 |
| startle | 30 fps: carry | 41.797 |
| startle | 30 fps: proud | 36.674 |
| startle | 30 fps: sleep | 34.347 |
| startle | 30 fps: alarm | 29.447 |
| startle | 30 fps: land | 119.103 |
| startle | 30 fps: preen phase | 19.226 |
| startle | 30 fps: preen at 0.6 s | 24.855 |
| startle | 30 fps: minded doze | 22.087 |
| startle | 60 fps: idle | 24.177 |
| startle | 60 fps: wait | 28.580 |
| startle | 60 fps: read | 51.481 |
| startle | 60 fps: write | 54.379 |
| startle | 60 fps: carry | 59.383 |
| startle | 60 fps: proud | 51.585 |
| startle | 60 fps: sleep | 44.087 |
| startle | 60 fps: alarm | 42.110 |
| startle | 60 fps: land | 181.358 |
| startle | 60 fps: preen phase | 17.158 |
| startle | 60 fps: preen at 0.6 s | 20.774 |
| startle | 60 fps: minded doze | 26.269 |
| startle | 120 fps: idle | 86.741 |
| startle | 120 fps: wait | 44.781 |
| startle | 120 fps: read | 59.666 |
| startle | 120 fps: write | 96.810 |
| startle | 120 fps: carry | 127.012 |
| startle | 120 fps: proud | 126.186 |
| startle | 120 fps: sleep | 88.271 |
| startle | 120 fps: alarm | 75.472 |
| startle | 120 fps: land | 251.974 |
| startle | 120 fps: preen phase | 30.803 |
| startle | 120 fps: preen at 0.6 s | 23.748 |
| startle | 120 fps: minded doze | 20.584 |
| startle | jittered: idle | 27.867 |
| startle | jittered: wait | 22.712 |
| startle | jittered: read | 36.791 |
| startle | jittered: write | 42.991 |
| startle | jittered: carry | 58.339 |
| startle | jittered: proud | 45.145 |
| startle | jittered: sleep | 36.483 |
| startle | jittered: alarm | 33.302 |
| startle | jittered: land | 116.802 |
| startle | jittered: preen phase | 14.582 |
| startle | jittered: preen at 0.6 s | 13.891 |
| startle | jittered: minded doze | 15.236 |
| undo | (random batch 1) runs 1–5 | 113.739 |
| undo | (random batch 1) runs 6–10 | 72.572 |
| undo | (random batch 1) runs 11–15 | 65.642 |
| undo | (random batch 1) runs 16–20 | 69.351 |
| undo | (random batch 1) runs 21–25 | 75.301 |
| undo | (random batch 1) runs 26–30 | 68.538 |
| undo | (random batch 1) runs 31–35 | 68.659 |
| undo | (random batch 1) runs 36–40 | 60.123 |
| undo | (random batch 1) runs 41–45 | 67.611 |
| undo | (random batch 1) runs 46–50 | 69.048 |
| undo | (random batch 2) runs 1–5 | 63.273 |
| undo | (random batch 2) runs 6–10 | 70.438 |
| undo | (random batch 2) runs 11–15 | 71.282 |
| undo | (random batch 2) runs 16–20 | 72.711 |
| undo | (random batch 2) runs 21–25 | 66.931 |
| undo | (random batch 2) runs 26–30 | 69.966 |
| undo | (random batch 2) runs 31–35 | 72.107 |
| undo | (random batch 2) runs 36–40 | 63.227 |
| undo | (random batch 2) runs 41–45 | 67.323 |
| undo | (random batch 2) runs 46–50 | 66.254 |
| codex | refuses guarded paths, secrets and addresses: guarded settings | 503.557 |
| codex | refuses guarded paths, secrets and addresses: guarded script | 446.259 |
| codex | refuses guarded paths, secrets and addresses: guarded environment | 445.741 |
| codex | refuses guarded paths, secrets and addresses: secret | 446.982 |
| codex | refuses guarded paths, secrets and addresses: address | 442.502 |

Commands (each before/after run used both verbose and JSON reporters):

```sh
pnpm exec vitest run src/bird/engine.test.ts -t "the startle settles" --maxWorkers=2 --reporter=verbose --reporter=json --outputFile.json=/tmp/c5tm-startle-WHEN.json > /tmp/c5tm-startle-WHEN.log 2>&1
pnpm exec vitest run src/data/vault/undo-compensate.property.test.ts -t "random batch [12]" --maxWorkers=2 --reporter=verbose --reporter=json --outputFile.json=/tmp/c5tm-undo-WHEN.json > /tmp/c5tm-undo-WHEN.log 2>&1
pnpm exec vitest run src/codex-run.test.ts -t "refuses guarded paths, secrets and addresses" --maxWorkers=2 --reporter=verbose --reporter=json --outputFile.json=/tmp/c5tm-codex-WHEN.json > /tmp/c5tm-codex-WHEN.log 2>&1
pnpm exec tsc -p tsconfig.app.json > /tmp/c5tm-tsc.log 2>&1
pnpm exec eslint src/bird/engine.test.ts src/data/vault/undo-compensate.property.test.ts src/codex-run.test.ts > /tmp/c5tm-eslint.log 2>&1
```

WHEN is before or after. Initial post-split startle evidence was replaced by the final measurement after adding the explicit run-count assertion.
TypeScript and ESLint pass. No pnpm check, full suite or e2e was run, as requested.
Only failure output and timing fields were read; all verification output is in /tmp/c5tm-*.log.

## Verifies affected

The requested jq query reports only `c5-codex-run`. Its existing regex matches all five new names;
the coordinator can update and re-prove the verify. harness/features.json is unchanged.

New names:
- `refuses guarded paths, secrets and addresses: guarded settings`
- `refuses guarded paths, secrets and addresses: guarded script`
- `refuses guarded paths, secrets and addresses: guarded environment`
- `refuses guarded paths, secrets and addresses: secret`
- `refuses guarded paths, secrets and addresses: address`

No verify names startle or compensating Undo. Their old names now name describes:
- Startle children: `$schedule.name: $name` for all 48 cadence/entry pairs, plus geometry.
- Undo random batch 1/2 children: `runs 1–5`, `runs 6–10`, …, `runs 46–50`.

left out: none. Git writes in this worktree: none; runner-test Git writes are confined to temporary fixtures.


## Fix round 1

P4-76 Important finding: sampled parts lost fast-check's seed, counterexample and replay report.
The two split random batches now use fixed seeds 427286 and 427287, printed in their describe names.
Each five-run part calls fast-check's own `fc.assert` with that seed, its zero-based starting `path`,
`numRuns: 5` and the unchanged `endOnFailure: true`. Root-only paths resume the original generated
sequence, preserving run-index bias and all 50 cases. Native failures report the seed, absolute path,
commands' `toString()` and boolean case, with the original error as their cause.
The pre-existing endOnFailure setting still prevents shrinking; no shrinking setting changed.
There is no sampling at collection: only run numbers and part boundaries are registered.
Filtering out these tests with -t therefore performs no property generation for them.

Offline standard solution: fast-check runner parameters, https://fast-check.dev/docs/configuration/.
Installed primary-source evidence: `node_modules/fast-check/lib/fast-check.js`, `check`, `pathWalk`,
`toss`, `lazyToss`, `preFormatFailure` and `assert`. A root-only path drops generator positions,
retains their original indices, limits execution to numRuns, and merges that offset into failures.
No network was used.

tests changed: src/data/vault/undo-compensate.property.test.ts: replace sampled execution with seeded fc.assert parts; retain all 50 model runs per batch and the original body, bounds and timeout; add tiny failure-report and deterministic-sequence regressions.
tests changed: src/bird/engine.test.ts: compare the startle simulation count with the independent expected 960, instead of the Cartesian-product tautology; retain every case, assertion, seed, bound and timeout.

Test-first red: `a failing property part reports its seed, replay path and command case` failed on
`expected 'Deliberate part failure' to contain 'seed: 427286'`. The temporary extracted sample/direct-run
helper reproduced the old reporting loss; replacing it with native fc.assert made the same test green.
The stand-in property executes one tiny command, then deliberately fails. The test checks the seed,
absolute path 5 and the full counterexample, including the command's toString() and its boolean.
It does not execute the real Undo model.

`seeded property parts keep all 50 cases in order` runs once for each fixed batch seed. It uses the
real command arbitrary and maxCommands: 24 with a tiny collecting predicate, not the Undo model.
It compares two repeated ten-part sequences with an unsplit seeded 50-run sequence, including every
command's toString() and the undoAll flag. Each comparison independently asserts exactly 50 cases.
The existing generation/partition count checks now check run-number and partition lengths; the new
regressions verify the actual generated sequences. Both split batches still execute exactly 50 real
model runs, once per case, across ten parts. The all-file real-model total stays 330; original seeded
runs and random batches 3–6 are unchanged. The added stand-in tests do not add real-model runs.

removed: src/data/vault/undo-compensate.property.test.ts: collection-time fc.sample and direct case execution only; no original cases, property assertions, bounds or timeouts removed.
removed: src/bird/engine.test.ts: the derived expected-count expression only; the count assertion now checks 960.

Fix-round verification ran each target sequentially with --maxWorkers=2 and JSON reporting.
All 77 selected tests pass (49 startle, 20 Undo parts, 3 stand-in regressions, 5 runner refusals).
Each part is below the unchanged 1,000 ms acceptance bound. No parallel gate ran during measurements.
The runner test file is unchanged in this round and was re-verified for its existing five cases.

| Target | Passing tests | Max ms |
| --- | ---: | ---: |
| undo | 23 | 366.961 |
| startle | 49 | 277.547 |
| codex | 5 | 841.674 |

Every measured part (Vitest JSON durations, milliseconds):

| Target | Test | ms |
| --- | --- | ---: |
| undo | a failing property part reports its seed, replay path and command case | 6.299 |
| undo | seeded property parts keep all 50 cases in order (random batch 1, seed 427286) | 10.865 |
| undo | seeded property parts keep all 50 cases in order (random batch 2, seed 427287) | 2.027 |
| undo | (random batch 1, seed 427286) runs 1–5 | 366.961 |
| undo | (random batch 1, seed 427286) runs 6–10 | 263.157 |
| undo | (random batch 1, seed 427286) runs 11–15 | 319.966 |
| undo | (random batch 1, seed 427286) runs 16–20 | 252.991 |
| undo | (random batch 1, seed 427286) runs 21–25 | 153.806 |
| undo | (random batch 1, seed 427286) runs 26–30 | 89.378 |
| undo | (random batch 1, seed 427286) runs 31–35 | 76.697 |
| undo | (random batch 1, seed 427286) runs 36–40 | 83.680 |
| undo | (random batch 1, seed 427286) runs 41–45 | 73.277 |
| undo | (random batch 1, seed 427286) runs 46–50 | 75.407 |
| undo | (random batch 2, seed 427287) runs 1–5 | 76.383 |
| undo | (random batch 2, seed 427287) runs 6–10 | 79.360 |
| undo | (random batch 2, seed 427287) runs 11–15 | 84.468 |
| undo | (random batch 2, seed 427287) runs 16–20 | 79.863 |
| undo | (random batch 2, seed 427287) runs 21–25 | 83.882 |
| undo | (random batch 2, seed 427287) runs 26–30 | 79.810 |
| undo | (random batch 2, seed 427287) runs 31–35 | 80.433 |
| undo | (random batch 2, seed 427287) runs 36–40 | 87.595 |
| undo | (random batch 2, seed 427287) runs 41–45 | 75.030 |
| undo | (random batch 2, seed 427287) runs 46–50 | 76.385 |
| startle | every pose and preen endpoint meets the geometry bound | 0.833 |
| startle | 30 fps: idle | 41.118 |
| startle | 30 fps: wait | 18.838 |
| startle | 30 fps: read | 31.718 |
| startle | 30 fps: write | 28.956 |
| startle | 30 fps: carry | 40.705 |
| startle | 30 fps: proud | 32.733 |
| startle | 30 fps: sleep | 38.459 |
| startle | 30 fps: alarm | 30.015 |
| startle | 30 fps: land | 88.686 |
| startle | 30 fps: preen phase | 10.454 |
| startle | 30 fps: preen at 0.6 s | 10.761 |
| startle | 30 fps: minded doze | 11.798 |
| startle | 60 fps: idle | 24.157 |
| startle | 60 fps: wait | 21.682 |
| startle | 60 fps: read | 36.067 |
| startle | 60 fps: write | 37.279 |
| startle | 60 fps: carry | 49.812 |
| startle | 60 fps: proud | 49.817 |
| startle | 60 fps: sleep | 38.807 |
| startle | 60 fps: alarm | 39.484 |
| startle | 60 fps: land | 134.001 |
| startle | 60 fps: preen phase | 14.309 |
| startle | 60 fps: preen at 0.6 s | 15.003 |
| startle | 60 fps: minded doze | 15.127 |
| startle | 120 fps: idle | 42.543 |
| startle | 120 fps: wait | 38.120 |
| startle | 120 fps: read | 62.399 |
| startle | 120 fps: write | 62.698 |
| startle | 120 fps: carry | 83.736 |
| startle | 120 fps: proud | 80.718 |
| startle | 120 fps: sleep | 62.580 |
| startle | 120 fps: alarm | 75.623 |
| startle | 120 fps: land | 277.547 |
| startle | 120 fps: preen phase | 24.771 |
| startle | 120 fps: preen at 0.6 s | 26.220 |
| startle | 120 fps: minded doze | 26.029 |
| startle | jittered: idle | 26.743 |
| startle | jittered: wait | 22.622 |
| startle | jittered: read | 40.015 |
| startle | jittered: write | 36.634 |
| startle | jittered: carry | 53.524 |
| startle | jittered: proud | 60.287 |
| startle | jittered: sleep | 40.785 |
| startle | jittered: alarm | 36.988 |
| startle | jittered: land | 129.899 |
| startle | jittered: preen phase | 13.806 |
| startle | jittered: preen at 0.6 s | 13.804 |
| startle | jittered: minded doze | 13.499 |
| codex | refuses guarded paths, secrets and addresses: guarded settings | 841.674 |
| codex | refuses guarded paths, secrets and addresses: guarded script | 802.477 |
| codex | refuses guarded paths, secrets and addresses: guarded environment | 811.524 |
| codex | refuses guarded paths, secrets and addresses: secret | 787.778 |
| codex | refuses guarded paths, secrets and addresses: address | 781.569 |

Commands:

```sh
pnpm exec vitest run src/data/vault/undo-compensate.property.test.ts -t 'a failing property part reports' --maxWorkers=2 --reporter=json --outputFile.json=/tmp/c5tm-fix1-red.json > /tmp/c5tm-fix1-red.log 2>&1
pnpm exec vitest run src/data/vault/undo-compensate.property.test.ts -t 'random batch [12]|a failing property part reports|seeded property parts keep' --maxWorkers=2 --reporter=json --outputFile.json=/tmp/c5tm-fix1-undo.json > /tmp/c5tm-fix1-undo.log 2>&1
pnpm exec vitest run src/bird/engine.test.ts -t 'the startle settles' --maxWorkers=2 --reporter=json --outputFile.json=/tmp/c5tm-fix1-startle.json > /tmp/c5tm-fix1-startle.log 2>&1
pnpm exec vitest run src/codex-run.test.ts -t 'refuses guarded paths, secrets and addresses' --maxWorkers=2 --reporter=json --outputFile.json=/tmp/c5tm-fix1-codex.json > /tmp/c5tm-fix1-codex.log 2>&1
pnpm exec tsc -p /tmp/c5tm-fix1-tsconfig.json > /tmp/c5tm-fix1-tsc.log 2>&1
pnpm exec eslint src/bird/engine.test.ts src/data/vault/undo-compensate.property.test.ts > /tmp/c5tm-fix1-eslint.log 2>&1
```

TypeScript and ESLint pass. The temporary tsc config extends this worktree's tsconfig.app.json and
includes only the two touched test files, plus their imported dependencies. Its typeRoots point to
this worktree's node_modules/@types and node_modules. The first scoped tsc attempt could not locate
the inherited type libraries from /tmp; setting those typeRoots resolved the config-only failure.
Only failure output, statuses, counts and timing fields were read. Reports and logs:
`/tmp/c5tm-fix1-{red,undo,startle,codex}.{json,log}`, `/tmp/c5tm-fix1-{tsc,eslint}.log`;
all part timings also saved to `/tmp/c5tm-fix1-timings.json`.

New Undo describe names retain the old batch label and add `, seed 427286` / `, seed 427287`.
Their child names still cover `runs 1–5` through `runs 46–50`.
The existing c5-codex-run verify still matches all five refusal test names and is unaffected this round.
No product code, harness records, timeouts or contract bounds changed.
No pnpm check, full suite, e2e, network or worktree-writing git command ran. Runner-test git writes
remain confined to their temporary fixtures. The coordinator commits test changes and notes separately.

left out: none within the fix-round scope.
