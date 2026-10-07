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

## How P4 compares

- **Same cases.** `p4-corpus` includes the original's five bench cases as they are, so the comparison is like for like.
- **Same split.** The runner logs one timing line per run: job start, token, plan reads, model (wall time, API time, turns, tokens), applying, checkpoints, report and status. This mirrors the original's `agent stats` line and `agent_seconds`.
- **Recorded per run** in the table below: end to end from the press to `done`, and the model step on its own. A difference is only called after at least three runs per case, because one run varies about 2×.
- **Target:** the original's post-speed numbers or better, for both the model step and end to end, with the same quality checks passing.

| Date | SHA | Case | Press → done | Model step | Turns | Tokens | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
