# stage-3-live-slower (2026-10-09)

Diagnoser note for `docs/harness/defects/2026-10-09-stage-3-live-slower.md`. Read-only. Code at 55ea8194 (equal to HEAD 16927e2f for runner/, src/ and api/).

## What failed

Runner timing lines (ms) from the job logs. a0 = a0a0c1a7 (37914066517, 37914369657, 37914723982); s3 = 55ea8194 (37943293492, 37943770442, 37944364582).

| Phase | garden a0 → s3 | offer-and-flat a0 → s3 | c05 a0 → s3 |
| --- | --- | --- | --- |
| total | 46.2 → 68.9 s (+22.7) | 55.4 → 89.2 (+33.9) | 49.7 → 74.0 (+24.3) |
| token (fixed calls) | 0.61 → 0.81 (×1.34) | 0.42 → 0.89 (×2.12) | 0.40 → 0.93 (×2.31) |
| reads | 11.1 → 14.9 (×1.34) | 11.2 → 29.4 (×2.63) | 10.4 → 16.3 (×1.57) |
| model (api) | 6.1 → 11.0, out 746 → 839 | 16.0 → 15.3 | 11.6 → 13.5, out 1479 → 1657 |
| apply | 8.4 → 12.0 (×1.43) | 13.8 → 23.6 (×1.71) | 13.7 → 22.3 (×1.63) |
| checkpoints | 9.1 → 13.6, 4 writes both (×1.50) | 5.5 → 7.8, 4 both (×1.43) | 5.3 → 7.7, 4 both (×1.46) |
| report | 8.6 → 13.3 (×1.55) | 6.1 → 9.0 (×1.47) | 6.0 → 9.8 (×1.62) |
| status (4 posts) | 0.73 → 0.96 (×1.32) | 0.67 → 0.89 (×1.33) | 0.66 → 1.09 (×1.65) |
| runner region | eastus → westus3 | eastus → westus | eastus → mexicocentral |

Notes. The a0 smoke did have checkpoints (9061/4, 5455/4, 5250/4). The baseline table left that column out, so garden's 13.6 s is not new; it is ×1.5. Planned operations are the same (6, 12, 11). For garden and offer the `things` and `notes` hashes are equal. c05 is **not like-for-like**: its `things` went from f88fe9 to 47b778, which is offer-and-flat's set, and the s3 log has the unreadable-PDF line. The prompt hash changed (d1a932 → d4f541, +~190 input tokens), which is negligible.

## Why (5 whys)

1. **Why slower?** Every phase in every case grew, by ×1.3 to ×2.6. No single phase accounts for the growth.
2. **Why every phase?** Each call got slower; the number of calls did not grow. Three phases have a fixed call count, and their code has no added call in the range: token (`runner/src/main.ts:224`), the 4 status posts (`main.ts:128`; `status.ts` changed types only) and the 4 checkpoint writes. Those three still grew ×1.3 to ×2.3. The goldens are identical at both SHAs (I ran them): C04 78 calls, per step 2/17/3/19/4/43/4; 88 calls with 25 earlier runs; modelled reads 1980 ms, report 2280 ms, apply 4880 ms. On offer-and-flat, the pre-model reads (forModel and shownOf in `runner/src/claude.ts`, no new reads in the range) already took about twice as long. The unreadable-PDF line came 5.1 s after runner start at a0 and 10.7 s after at s3.
3. **Why was each call slower?** It depends where the GitHub runner lands. All three a0 jobs ran in eastus; the s3 jobs ran in the west and Mexico. Across 14 jobs, eastus is always the fastest: status 0.66 to 0.76 s in eastus, against 0.82 to 1.09 s elsewhere. On one SHA (327b987), offer-and-flat took 71.6 s in eastus (37776930186) and 98.8 s in westus (37776475911). The garden model step (api 6.1 → 11.0 s, +93 output tokens) is Anthropic latency variance. The location of Drive data and of the Worker's Durable Object is **unverified**.
4. **Why did the smoke read it as a regression?** The two smokes compared one run per case. The faster batch happened to be the only one that ran all in eastus. Earlier offer-and-flat runs on unchanged code had reads of 16.5 to 35.7 s and apply of 21 to 37 s (p4-speed-baseline, lines 99–119).
5. **Design cause:** the timing line (`runner/src/timing.ts:80`) gives time per phase but not calls, bytes or runner region per phase. So a live smoke cannot tell "more calls" from "slower calls". The per-step call count exists only in the modelled golden (`runner/test/drive-calls-golden.test.ts:86`). The Worker tail cannot help, because the runner calls Drive directly (`runner/src/drive.ts:4,88`).

**Stage 3 code ruled out for garden and offer-and-flat.** These are the new reads stage 3 added, all in the planner after the model step:
- `scripted.ts:426`: a read of the questions file when an answer's subject may be gone.
- `scripted.ts:455`: a Bin get of a pair note, only for yes answers to pair questions.
- `scripted.ts:870-896`: `lastWritten`, which reads manifests only for a Current state the person owns, with no line already citing the news (call site `:1124`).

None of the three conditions holds in garden or offer-and-flat; their hubs were restored with Bower's mark. In c05, `lastWritten` may have run (**unverified**: only failures are logged). It is bounded, though. s3 c05 reads were 16.3 s in total, and ~9 s of that came before the model (the PDF line at +9.2 s), so the manifest reads cost a few seconds at most. Checkpoint and manifest bytes: stage 3 adds only optional fields (`answered`, `notes`), which these runs do not fill. Live byte counts are **unverified**, because none are logged.

## Owner mechanism

None in the mechanism map. The timing line lives in `runner/src/timing.ts` (TL-P4-01 addendum). Call counts would come from the one Drive transport, through RunnerDrive's fetch hook (`runner/src/drive.ts:90,351`).

## Same class elsewhere (2)

1. **Reads that grow with history.** `src/data/spine/scripted.ts:890-896` (`lastWritten`) reads every listed run manifest one at a time, newest first, until one carries the section's mark. With a mark no manifest has (for example a hub restored by hand), it reads all of them. Retention bins only ended, stamped folders, and `.bower/runs` held 74 folders at a0 (baseline line 160). No golden pins this; compare `src/data/live/home-cache.test.ts:189` for Home. It is latent, and not the cause here.
2. **Live speed claims with no call count.** The stage 2 section says "The runner logs no Drive-call count" (p4-speed-baseline line 136). Home smokes do count their Drive calls (lines 146, 160, 175); the runner's timing line does not.

## Options

- **(a) Fix in the owner.** The timing line adds `calls/bytes` per phase, counted at RunnerDrive's one fetch hook. The smoke records each job's region and the checkpoints column. Size S (~40 lines plus a unit test). Risk low: numbers only, no new path. Optionally, a separate packet bounds `lastWritten`.
- **(b) Refactor first, then fix.** Move the golden's per-step call attribution (`drive-calls-golden.test.ts` `analyzeCalls`) into `timing.ts`, so the live line and the golden count calls the same way, then add the counts. Size M. Risk low to medium, because test pins move.
- **(c) New mechanism:** none is needed. Pinning the runner region (a self-hosted or larger runner) would be an executor change, which ARCHITECTURE line 7 rules out without a measured problem. I do not recommend it.

Decisive single rerun, if the lead wants proof beyond these logs: one offer-and-flat run on 55ea8194, same reset, with a working `wrangler tail`. Compare the Worker's own time for the token grant and the 4 status posts with the runner's `token=` and `status=`. If the Worker time is equal and the runner time is larger, the gap is network. A job that lands in eastus with reads of about 11 s and apply of about 14 s rules out code.

## Regression test (class)

1. Extend `runner/test/drive-calls-golden.test.ts` with a goldens-per-step case for c05, where the person owns the Current state. Assert "the same Drive calls after 10 and after 500 earlier runs", as `home-cache.test.ts:189` does. This catches any read that grows with history.
2. A `timing.test.ts` case asserting that the line carries calls and bytes per phase, equal to the modelled golden's per-step counts. A live smoke then shows count and per-call time apart.
