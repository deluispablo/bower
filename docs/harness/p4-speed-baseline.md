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
| 2026-10-08 | cd3af43 | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37755728529`) | 0 min 56 s | 4.5 s (API 4.3 s) | 1 | 5908 in / 405 out | Fresh folder. Runner 49.6 s: reads 14.5, apply 13.1, checkpoints 7.2 (4), report 7.9. PASS (Resources) |
| 2026-10-08 | cd3af43 | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37755957502`) | 1 min 46 s | 3.9 s (API 3.7 s) | 1 | 5902 in / 407 out | Fresh folder; waited about 50 s for a runner. Runner 53.1 s. FAIL on placement (Areas), 4 dates present |
| 2026-10-08 | cd3af43 | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37756289571`) | 0 min 59 s | 4.2 s (API 4.0 s) | 1 | 5909 in / 401 out | Fresh folder. Runner 53.6 s: reads 13.7, apply 15.9, checkpoints 7.6 (4), report 9.8. PASS (Resources) |
| 2026-10-08 | cd3af43 | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37756541400`) | 0 min 51 s | 3.5 s (API 3.3 s) | 1 | 5906 in / 398 out | Fresh folder. Runner 45.2 s: reads 14.9, apply 9.3, checkpoints 6.9 (4), report 7.9. PASS (Resources) |
| 2026-10-08 | cd3af43 | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37756787581`) | 0 min 50 s | 3.4 s (API 3.3 s) | 1 | 5901 in / 402 out | Fresh folder. Runner 42.1 s: reads 12.4, apply 8.8, checkpoints 6.4 (4), report 8.5. PASS (Resources) |
| 2026-10-08 | c6ddb96 | claude (Sonnet 5.5), `c04-garden-newsletter` ×5 (runs `37764001648`, `37764218469`, `37764418263`, `37764624158`, `37764894630`) | 0:53, 0:47, 0:49, 1:08, 0:49 | — | 1 each | out 672 / 439 / 378 / 663 / 355 | Fresh folders, PDF in Resources every time. PASS 2/5: runs 2, 3 and 5 made no note (report created=[]). input= differed on every run |
| 2026-10-08 | 80ae66d | claude (Sonnet 5.5), `c04-garden-newsletter` ×5 (runs `37767147353`, `37767403211`, `37767650172`, `37767888067`, `37768128729`) | 1:03, 1:03, 0:52, 1:02, 1:01 | — | 1 each | out 883 / 787 / 846 / 811 / 743 | PASS 5/5 (Resources, a note with all 4 dates). Section hashes: only `things` varies between runs |
| 2026-10-08 | 80ae66d | claude (Sonnet 5.5), `c04-offer-and-flat` (run `bZImxv2M…`) | 0:40 (failed) | 15.2 s | 1 | 6621 in / 1679 out | Refused: "a question about a pile it also files"; nothing changed. Ruling asked |

## C04 garden on `80ae66d`, the second-brain method (2026-10-08)

Five live runs, all PASS. Press → done took 0:52–1:03. The runner's steps, in ms:

| Step | Median | Range |
| --- | ---: | ---: |
| total | 52,794 | 43,018–55,795 |
| reads | 14,618 | 13,385–19,389 |
| apply | 10,569 | 6,964–12,212 |
| report | 9,195 | 6,580–9,324 |
| checkpoints (4) | 7,311 | 6,914–8,381 |
| model | 7,117 | 6,549–7,876 |

**Reading.**
- **The model step doubled,** from 3–4 s to about 7 s, because the method's note is now always written (about 670 output tokens).
- **Reads (14.6 s) are the biggest step.** With 134 Drive calls per run, they are the next speed lever after the C04 slice passes.
- **Against the original:** 6:38 before its speed work, and its goal of 1.5–2 min after it. The new app takes about 1 min from press to done, with every note required.
| 2026-10-08 | b54392c | claude (Sonnet 5.5), `c04-offer-and-flat` ×3 (runs `37771712279`, `37772135160`, `37772493065`) | 1:52, 1:14, 1:22 | 12.6 / 13.4 / 13.7 s | 1 each | out 1406 / 1662 / 1602 | Reset before each run. Offer to Job hunt with a correct note; link to Flat hunt with a note; payslip to a new Area, "Pay and tax records"; the photo asked about. Run 1 did not rename the offer, and run 3 invented a 30-minute commute limit. Strict rubric 0/3 (photo, Money); ruling asked. Apply took 23–35 s |
| 2026-10-08 | b54392c | claude (Sonnet 5.5), `c04-garden-newsletter` ×2 (runs `37772839504`, `37773135151`) | 1:16, 0:59 | 7.6 / 7.0 s | 1 each | out 808 / 710 | PASS 2/2; the same input= on both (2d345dd279ce) |
| 2026-10-08 | 327b987 | claude (Sonnet 5.5), `c04-offer-and-flat` ×3 (runs `37776475911`, `37776930186`, `37777334479`) | 1:48, 1:20, 1:30 | 13.6 / 13.4 / 12.5 s | 1 each | out 1592 / 1568 / 1632 | PASS 3/3 under the updated rubric. Offer and payslip renamed, payslip in a new Area named Money, photo asked about, no invented numbers. input= equal on all three (3732e5adddda). Apply 26–37 s |
| 2026-10-08 | 327b987 | claude (Sonnet 5.5), `c04-garden-newsletter` (run `37777730972`) | 0:54 | 6.5 s | 1 | out 774 | PASS |

## C04 closed on `327b987` (2026-10-08)

All four runs pass against the updated rubric, with no retries and 4 checkpoints each. Within each case `input=` is the same.

| Case | Press → done | reads | model | apply | report (s) |
| --- | --- | ---: | ---: | ---: | ---: |
| offer-and-flat 1 | 1:48 | 25.0 | 13.6 | 37.1 | 9.7 |
| offer-and-flat 2 | 1:20 | 16.5 | 13.4 | 26.0 | 7.4 |
| offer-and-flat 3 | 1:30 | 18.1 | 12.5 | 28.6 | 8.4 |
| garden | 0:54 | 13.0 | 6.5 | 12.2 | 7.0 |

**Reading.** On a 4-thing pile, apply is the biggest step: 26–37 s for 3 moves and 4 notes, about 5 s per effect. `drive-calls-cut` covers reads and apply.

## TL-P4-11 batch on `2b08fc1` (2026-10-08)

Admission budget, honest start error, one question per thing, drive-calls-cut and state-rewrite live. No retries; 4 checkpoints each.

| Case | Press → done | reads | model | apply | report (s) | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| offer-and-flat 1 | 1:32 | 24.2 | 17.8 | 24.2 | 9.3 | pass; photo asked once (6 stale questions closed) |
| offer-and-flat 2 | 1:34 | 26.7 | 16.6 | 23.9 | 10.9 | pass; re-upload kept the one question |
| offer-and-flat 3 | 1:46 | 35.7 | 20.4 | 21.0 | 9.7 | pass; no new question |
| garden | 1:20 | 31.1 | 11.1 | 15.6 | 9.1 | pass; 4 dates; waiting photo not asked again |
| c05-hub-lines (corpus offer) | 1:23 | 25.5 | 8.6 | 20.6 | 9.0 | not valid: the corpus offer is text with a PDF header, unreadable live |
| c05-hub-lines 1 | 1:13 | 20.6 | 11.2 | 18.5 | 9.0 | pass; both hubs cited lines, Job hunt state rewritten |
| c05-hub-lines 2 (hand edit) | 1:48 | 49.4 | 10.0 | 22.5 | 13.3 | edit kept, line + one folder question; no listing line in Flat hunt |

**Reading.** Apply is 21–24 s on offer-and-flat (was 26–37 s), far from the modelled 4.7 s; reads grew to 24–49 s. Home took about 24 s to show the Inbox, with 221 Drive calls (189 media reads of 42 files, one file up to 10 times).

## C05 no-adoption check on `924e6d6` (2026-10-08)

Hubs restored with Bower's `bower_state` mark (Bower-owned), then hand-edited for runs 2 and 3. Home with one 2-thing pile: about 108 Drive calls, each file read at most twice (was 221, up to 10×); the Inbox showed after about 45 s, behind the last run's report.

| Run | Press → done | reads | model | apply | report (s) | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| c05 clean | 1:36 | 38.3 | 13.3 | 18.4 | 13.0 | pass; Job hunt state rewritten, both hubs got cited lines |
| c05 after hand edit | 1:18 | 16.8 | 11.6 | 23.5 | 11.1 | edit kept, one question; Job hunt offer line twice (model line + "New:" line) |
| c05 third run | 1:21 | 24.7 | 14.8 | 15.4 | 10.8 | pass; edit kept, no adoption, no new question |

## Stage 2 smoke on `c9d20a67` (2026-10-09)

Staging c9d20a67 (version 1c2f9b49), bower-home edc9c39, Claude Sonnet 5.5. Before the runs, 129 unstamped `.bower/piles` records in account A's folder went to the Bin (none stamped were left). Each run was reset first: outputs binned, hubs restored with Bower's mark, Inbox emptied. The runner logs no Drive-call count.

| Case | Run | Press → done | reads | model (in/out) | apply | report (s) | Result |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| garden | `h35vnXfd` (37889339478) | 0:55 | 13.2 | 6.3 (7303 / 800) | 14.2 | 8.0 | pass; 5 dates, fee and shed code; PDF and note renamed; no question |
| offer-and-flat | `Qk4IDeXs` (37889576104) | 1:21 | 20.3 | 14.8 (7432 / 1870) | 22.0 | 9.3 | pass; offer and payslip renamed, Money area, photo asked, both hubs got a line |
| c05-hub-lines | `CbTN5Md_` (37889848483) | 1:12 | 13.7 | 11.4 (7279 / 1413) | 20.9 | 8.9 | pass; hand edit kept, the open q-state not asked again; Flat hunt line unreported (report-misses-hub-line) |

Stage 1 on 9265d860, for comparison: garden 57 s, offer-and-flat 75 s (attempt 2), c05 76 s; Home 59 s with 144 calls.

**Home on an empty Inbox:** the Inbox showed in 4.1 s, with 15 Drive calls (2 media). After 25 s it had made 17 calls (4 media), the last ending at 4.8 s. `.bower` was unchanged before and after (no history growth); `.bower/runs` holds 71 folders.

Fingerprint change (c3-fingerprint, df2bfc88): input= and sections= hashes from before df2bfc88 do not compare with later ones; the model input itself is unchanged (raw golden model-input-c04.raw.golden.txt).

## Planner-split smoke on `a0a0c1a7` (2026-10-09)

Staging a0a0c1a7 (version b2b8627d), bower-home 7cea21a, Claude Sonnet 5.5. Each run was reset first. Fixtures are now off the live path (TL-P4-14 addendum 23). Note: input= and section hashes from before c3-fingerprint do not compare with these.

| Case | Run | Press → done | reads | model (in/out) | apply | report (s) | Result |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| garden | `D3waCJ2E` (37914066517) | 0:51 | 11.1 | 6.3 (7307 / 746) | 8.4 | 8.6 | pass; 5 dates, fee and shed code; no question |
| offer-and-flat | `Yh5z_hOk` (37914369657) | 1:01 | 11.2 | 16.2 (7431 / 1889) | 13.8 | 6.1 | pass; offer and payslip renamed, Money area, photo asked; Flat hunt 2 lines = 2 rows (op id, line 0/1); New mark on both lines, not on older ones |
| c05-hub-lines | `eQtprzk5` (37914723982) | 0:55 | 10.4 | 11.8 (7277 / 1479) | 13.7 | 6.0 | pass; hand edit kept, open q-state not asked again; Flat hunt 2 lines = 2 rows |

**Home on an empty Inbox:** the Inbox showed in 4.5 s, with 15 Drive calls (2 media). After 25 s there were 17 calls in all, the last ending at 5.1 s. `.bower` was unchanged. `.bower/runs` holds 74 folders: 6 carry the Bower mark and are ended; the older unmarked ones are kept by the ruling.

Stage 2 smoke on c9d20a67, for comparison: garden 0:55, offer-and-flat 1:21, c05 1:12; Home 4.1 s with 15 calls.

## Stage 3 smoke on `55ea8194` (2026-10-09)

Staging 55ea8194 (version d3d26e5f), bower-home 1af1684, Claude Sonnet 5.5, account A. Each run was reset first: outputs binned, hubs restored with Bower's mark, Inbox emptied. For c05, the Job hunt hand edit was added.

| Case | Run | Press → done | reads | model (in/out) | apply | checkpoints | report (s) | Result |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| garden | `aAQA9cHu` (37943293492) | 1:06 | 14.9 | 11.2 (7497 / 839) | 12.0 | 13.6 | 13.3 | pass. Five dates, the fee and the shed code. PDF and note renamed. No question. |
| offer-and-flat | `pG4oY1SZ` (37943770442) | 1:36 | 29.4 | 15.6 (7623 / 1982) | 23.6 | 7.8 | 9.0 | pass. Offer and payslip renamed, a Money area, the photo asked. Each hub got 1 line and 1 row, each citing the offer note. New mark on Job hunt's new line only (Flat hunt's note had been opened once before checking, so it was already seen). |
| c05-hub-lines | `sahn5Inn` (37944364582) | 1:19 | 16.3 | 13.8 (7642 / 1657) | 22.3 | 7.7 | 9.8 | pass. Hand edit kept, the open q-state not asked again, both hubs got a cited line. |
| Write it (old q-state, no `shown`) | `qhpcBoL3` (37944694250) | 1:01 | 10.1 | 6.4 (7555 / 591) | 19.1 | 6.2 | 7.6 | pass. Scoped "instructions" run on the old path. The state was written and the hand edit kept. The new no-model path was not reached: this scenario asks no new q-state. |

**Home after the runs** (not an empty Inbox: 3 open questions and 6 recent files): 21 Drive calls (8 media), the last ending at 6.2 s. The old q-state card shows no "Bower's update" list, since it was asked before `shown` existed (expected).

Planner-split smoke on a0a0c1a7, for comparison: garden 0:51, offer-and-flat 1:01, c05 0:55. This smoke is 15–35 s slower on every case. The extra time is in reads (offer-and-flat 29.4 vs 11.2), apply (+8–10 s) and garden's checkpoints (13.6 s).

**Reading (stage-3-live-slower, TL-P4-22 addendum 2):** the 55ea8194 slowdown came from the runner's region and per-call latency (a0a0c1a7 ran in eastus; 55ea8194 ran in the US west and in Mexico). The Drive-call goldens are the same at both SHAs, and c05 was not like-for-like. Compare like-for-like cases only. From c4-run-counts on, the timing line also carries calls, bytes and region.

## Stage 4 smoke on `03b5d0d2` (2026-10-10)

Staging 03b5d0d2 (version b5de87dc), bundle `index-DmEj6T_E.js`, Claude Sonnet 5.5, account A. Each run was reset first: outputs binned, hubs restored with Bower's mark (`__c05m_*`), and the Inbox emptied. For c05, the Job hunt hand edit was added. The Write-it attempt used the unmarked hubs (`__of_*`). Times run from the press to `finishedAt` (Worker /status). The breakdown comes from the runner's `timing:` line.

| Case | Run | Press → done | reads | model (in/out) | apply | checkpoints | report (s) | region | Result |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| garden | 38019173680 | 0:56 | 10.6 | 6.0 (7492 / 772) | 9.9 | 5.4 | 6.4 | eastus | Pass. Renamed "Larkspur Lane Community Garden newsletter, autumn" into Resources/Community garden, with a note giving the dates and the 2027 fee. No question. |
| offer-and-flat | 38019382423 | 1:18 | 15.3 | 12.0 (7630 / 1549) | 20.6 | 6.2 | 7.1 | centralus | Pass. Offer renamed into Job hunt with a note (remote, 42,000, start 2 November). The link went to Flat hunt with a note. The payslip went to a new Area, Money. The photo was asked about. Each hub got one line. |
| c05-hub-lines (1) | 38019565934 | 1:14 | 14.7 | 6.6 (7451 / 718) | 15.2 | 6.8 | 9.0 | **unknown** | **Partial.** The hand edit was kept, and nothing was asked again. **No hub got a line.** The offer PDF (`__c05_offer`, a made-up PDF with no text layer) was filed with no note. |
| c05-hub-lines (2) | 38019716281 | 1:12 | 14.6 | 9.2 (7437 / 989) | 14.3 | 6.3 | 6.8 | centralus | Pass. The hand edit was kept, and both hubs got a line. Job hunt's line says "its text could not be read" (the same PDF). Run 1 versus run 2 is model variance on an unreadable PDF. |
| Write it, new q-state | 38019867511 | 1:09 | 12.4 | 4.5 (7312 / 560) | 16.6 | 6.4 | 8.6 | westcentralus | **Not reached.** With unmarked hubs and the real offer PDF, Bower only added a Timeline line to Job hunt. It proposed no state change, so no q-state question with `shown` was asked. The no-model Write-it path is still unexercised live. |

**Home after the runs** (empty Inbox, 1 open question): 20 Drive calls (5 media); the last ends at 5.0 s (stage 3: 21 calls, 6.2 s).

**Runner region check:** the timing line carries `region=` on every run. Four of five show a region (eastus, centralus, centralus, westcentralus). One shows `region=unknown` (38019565934): the metadata call failed or timed out within its 2 s (`curl -m 2`). Compared like-for-like with stage 3 (55ea8194, US west and Mexico): garden 1:06 → 0:56, offer-and-flat 1:36 → 1:18, c05 1:19 → 1:12–1:14.


## smoke-request-slow smoke on `539fe3a3` (2026-10-10)

Staging 539fe3a3 (version 7fdf8136), bundle `index-BUZNGxSW.js`, account A, Claude off (scripted). Times are the runner's `timing:` line; Drive reads are the `reads:` call count.

| Case | Run | total | reads (s / calls) | apply | checkpoints | report | region | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| C05 request ("Add to Allotment diary: …") | 38081473688 | 51.0 | 25.3 / 51 | 10.4 | 6.6 | 6.1 | westus2 | Pass. Was 341 s and 763 reads on 645710a4. Home shows the request done and "Left as you wrote them: … found nothing about this note" (scripted); no "can't read" (c05-timeline-list live). |
| One pile ("Speed run six …") | 38081615898 | 29.7 | 7.1 / 24 | 9.0 | 5.6 | 4.8 | centralus | Pass. Filed to Resources/Ideas with a new note. Was 31 s and 21 reads. |

## Batch smoke on `5bab1288` (2026-10-11)

Staging 5bab1288 (version bfa0c812), bundle `index-DOzbpzq4.js`, account A, Claude off (scripted). PWA: the first reload still ran the 539fe3a3 bundle; the second loaded `index-DOzbpzq4.js` (the old worker predates the one-reload fix; the next deploy must take one).

| Case | Run | total | reads (s / calls) | apply | checkpoints | report | region | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| One pile ("Add to Allotment diary smoke eleven …" as a note) | 38097183298 | 35.7 | 8.1 / 24 | 11.9 | 6.2 | 5.7 | westcentralus | Pass. Filed to Resources/Ideas with a new note; press to done 52 s. |
| C05 request ("Add to Allotment diary: Alex staked the runner beans …", Let Bower do it now) | 38097367975 | 27.6 | 6.7 / 21 | 8.5 | 5.3 | 4.5 | eastus2 | Pass. "Done. See what changed in your folders."; press to done 43 s (was 51.0 s runner total, 51 reads on 539fe3a3). |
