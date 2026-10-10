# c5-test-margin notes

implementer: codex

Entry: c5-test-margin, TL-P4-31 addendum 1. Tests only; no assertion red is required by the packet.
Uncommitted delivery: the coordinator commits the test changes and notes separately.

## Research

- Vitest parameterized tests: https://vitest.dev/api/#test-each. Existing tests already use `it.each`.
- fast-check sampling: https://fast-check.dev/docs/core-blocks/sampling/.
- Offline evidence: installed `node_modules/fast-check/lib/fast-check.js`, `sample` / `streamSample`;
  its API comment says sample returns all values that assert/check would generate.
  Passing the original property preserves its generation and run-index bias.
- No network was used.

## Changes and retained coverage

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
  Random batches retain unspecified seeds. No load-dependent logic, skips, stubs or product edits.
  Undo already used endOnFailure: true, so sampling does not remove an existing shrinking pass.

removed: src/bird/engine.test.ts: the original single it registration becomes a describe; no cases or assertions removed.
removed: src/data/vault/undo-compensate.property.test.ts: only the two original single it registrations become describes; no cases or assertions removed.
removed: src/codex-run.test.ts: the original five-case loop becomes five it.each registrations; no cases or assertions removed.

## Measurements

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
