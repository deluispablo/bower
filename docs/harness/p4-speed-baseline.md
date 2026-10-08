# P4 speed baseline: the original app's recorded times

Owner request, 2026-10-07: compare the new app's tidy-up times with those recorded for the original. The source is the original repository, `docs/superpowers/2026-10-01-session-speed-spec.md` (its "Measured baseline" and section 8), and its `agent/bench/`.

## The original app

**Before its speed work (one real run, 29 September 2026, one pending file): 6 min 38 s.**

| Phase | Time |
| --- | ---: |
| Queue and job set-up (15 s of it installing pandoc) | 30 s |
| Sync down (`rclone sync` of the whole folder) | 7 s |
| Reconcile, manifest and pre-scan | 2 s |
| **Agent run** | **5 min 29 s** |
| Sync up, moves, report and file facts | 26 s |

**After its speed work** (Sonnet 5.5 at low effort with a "filing sheet", a cached pandoc, and bookkeeping moved out of the agent). These numbers come from `agent/bench/` on the lead's machine, one run per case, and cover the agent step only:

| Bench case | Agent seconds | Turns |
| --- | ---: | ---: |
| 1 Job offer clipping | 90 | 23 |
| 2 Text PDF | 44 | 14 |
| 3 Receipt | 60 | 14 |
| 4 Scan | 60 | 18 |
| 5 Question about a filed PDF | 64 | 19 |

The spec's goal was a tidy-up of one to three files in about 1.5 to 2 minutes, end to end. The non-agent part was about 65 s before the cache, and less after it.

## The new app so far

- **P3's first real run, scripted provider (no model):** 6 s from the press to dispatch, and **2 min 07 s** to `done` (TL-P3-24).
- **Recovery's attempt 2,** which only wrote the report, took 24 s on Actions.

With no model at all, the new runner's overhead (the job, Node, the token, the Drive reads and writes, a checkpoint per operation and an attempt check before every write) already takes about as long as the original's whole goal. **Adding the model on top would make the new app slower than the original.** That is a P4 risk, so it is measured and cut, not assumed.

## Reading after the C04 comparison (2026-10-08)

The C04 median is 1:28 from the press to `done` with the quality check passing, against the original's 6:38 before its speed work and its 1.5–2 min goal after it. The model step takes 3–4 s and 1 turn, against 44 s and 14 turns in the original's bench case 2. What remains is about 60 s of spine overhead (TL-P4-05).

## How P4 compares

- **Same cases.** `p4-corpus` includes the original's five bench cases as they are, so the comparison is like for like.
- **Same split.** The runner logs one timing line per run: job start, token, plan reads, model (wall time, API time, turns, tokens), applying, checkpoints, report and status. This mirrors the original's `agent stats` line and `agent_seconds`.
- **Recorded per run** in the table below: end to end from the press to `done`, and the model step on its own. A difference is only called after at least three runs per case, because one run varies about 2×.
- **Target:** the original's post-speed numbers or better, for both the model step and end to end, with the same quality checks passing.

| Date | SHA | Case | Press → done | Model step | Turns | Tokens | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 2026-10-08 | 58897f5 | scripted, words-only pile (run `37734385418`) | 1 min 59 s | — | — | — | Dispatch 28 s; runner 82.1 s: reads 13.7, apply 11.7, checkpoints 46.6 (19), report 8.7, status 0.7; 1 journal line too |
| 2026-10-08 | 58897f5 | scripted, words-only pile (run `37734625824`) | 1 min 30 s | — | — | — | Dispatch 25 s; runner 54.3 s: reads 10.6, apply 6.2, checkpoints 27.6 (13), report 8.4, status 0.7 |
| 2026-10-08 | 58897f5 | scripted, words-only pile (run `37734833636`) | 1 min 21 s | — | — | — | Dispatch 25 s; runner 46.8 s: reads 9.3, apply 4.7, checkpoints 24.0 (13), report 7.7, status 0.7 |
| 2026-10-08 | 58897f5 | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37735080427`) | 1 min 50 s | 2.1 s (API 1.9 s) | 1 | 2360 in / 103 out | Dispatch 23 s; Claude Code install 4 s; runner 72.3 s: reads 10.6, apply 7.5, checkpoints 38.3 (16), report 10.7. Scorer by hand: FAIL. The PDF was filed to `Resources/Community garden/`, but no note was created and none of the 4 dates appeared (the model sees names only, no file contents; P4-C) |
| 2026-10-08 | 67d09cf | scripted, words-only pile (run `37739140133`) | 1 min 35 s | — | — | — | Dispatch 27 s (admission split in the Worker logs); runner 57.4 s: reads 12.4, apply 6.1, checkpoints 28.7 (13, still about 2.2 s each after the read-back cut), report 8.9 |
| 2026-10-08 | 67d09cf | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37739425188`) | 2 min 00 s | 3.1 s (API 2.9 s) | 1 | 5780 in / 415 out | Dispatch 25 s; install 5 s (cache miss); runner 77.3 s: reads 14.7, apply 8.2, checkpoints 40.5 (16), report 8.7. Scorer by hand: PASS. The note `Resources/Community garden/…autumn.md` holds all 4 dates, and the PDF is filed beside it |
| 2026-10-08 | 67d09cf | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37739709978`) | 2 min 04 s | 2.1 s (API 2.0 s) | 1 | 6002 in / 110 out | Dispatch 31 s; cache hit 2 s; runner 75.9 s: reads 17.3, checkpoints 33.3 (16), report 12.6. Not like for like: run 1's note already existed, so only the PDF was filed and no note was written |
| 2026-10-08 | 67d09cf | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37741660613`, attempt 2) | 18 min 47 s | 3.5 s (API 3.3 s) | 1 | 5767 in / 415 out | The first dispatch failed on a network error after 40 ms; the 17-min alarm redispatched it at 07:08:51Z (dispatch-retry, P4-4). Attempt 2 took 1 min 39 s; runner 83.3 s: reads 18.7, checkpoints 35.8 (16), report 13.3. Scorer by hand: PASS (note with all 4 dates). Started from a fresh folder |
| 2026-10-08 | c76fd2f | scripted, words-only pile (run `37744022305`) | 1 min 23 s | — | — | — | Press → job created 11 s (was 25–31 s: admission-reads-cost); runner 58.8 s: reads 12.1, apply 7.2, checkpoints 29.3 (15, still about 2 s each after attempt-check-light, so the cost is the Drive write itself), report 8.6 |
| 2026-10-08 | c76fd2f | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37744301766`) | 1 min 35 s | 3.5 s (API 3.3 s) | 1 | 5760 in / 407 out | Fresh folder. Press → job 10 s; runner 70.7 s: reads 17.0, apply 7.0, checkpoints 31.2 (16), report 9.6. Scorer by hand: PASS |
| 2026-10-08 | c76fd2f | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37744536564`) | 1 min 17 s | 3.1 s (API 2.9 s) | 1 | 5765 in / 407 out | Fresh folder. Press → job 9 s; runner 56.3 s: reads 15.2, apply 4.3, checkpoints 23.3 (14), report 8.6. Scorer by hand: PASS |
| 2026-10-08 | c76fd2f | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37744737867`) | 1 min 28 s | 4.1 s (API 3.9 s) | 1 | 5766 in / 413 out | Fresh folder. Press → job 9 s; runner 64.9 s: reads 15.7, apply 6.1, checkpoints 26.0 (14), report 9.7. Scorer by hand: PASS |
| 2026-10-08 | a566241 | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37751420040`) | 0 min 56 s | 3.6 s (API 3.4 s) | 1 | 5760 in / 415 out | Fresh folder. Job 61 s; runner 49.5 s: reads 16.0, apply 6.6, checkpoints 16.0 (8), report 4.1. Scorer by hand: FAIL on placement (`Areas/Community garden/`, expected `Resources/`); the note holds all 4 dates |
| 2026-10-08 | a566241 | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37751677244`) | 0 min 42 s | 3.3 s (API 3.1 s) | 1 | 5775 in / 398 out | Fresh folder. Job 44 s; runner 34.6 s: reads 10.8, apply 4.4, checkpoints 11.5 (8), report 2.5. FAIL on placement (Areas), 4 dates present |
| 2026-10-08 | a566241 | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37751871102`) | 0 min 43 s | 3.1 s (API 2.9 s) | 1 | 5767 in / 402 out | Fresh folder. Job 45 s; runner 35.5 s: reads 10.6, apply 5.3, checkpoints 11.6 (8), report 2.7. FAIL on placement (Areas), 4 dates present |
