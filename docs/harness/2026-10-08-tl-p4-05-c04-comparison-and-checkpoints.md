# Technical-lead decision TL-P4-2026-10-08-05: the C04 comparison, and where checkpoints live

**Results, staging `c76fd2f`, three C04 runs with Claude Sonnet, each from a fresh folder:**
- **All three pass** the corpus scorer: the note has all four dates, and the PDF is filed beside it.
- **Press to `done`:** 1:35, 1:17 and 1:28 (median 1:28). Press to job: 9–10 s, down from 25–31 s.
- **Model step:** 3.1–4.1 s, 1 turn, about 5,760 tokens in and 410 out.
- **Runner:** 56–71 s. Reads took 15–17 s, checkpoints 23–31 s (about 1.7–2 s each) and the report 9–10 s.
- **The live tail:** 84 attempt checks, median 127 ms in the Worker. One admission read 3.9 s in total. The attempt check is no longer the cost; each checkpoint's two Drive writes are.

**Against the original** ([p4-speed-baseline.md](p4-speed-baseline.md)):
- **End to end,** the original took 6 min 38 s before its speed work, and aimed at 1.5–2 min after it. The new app takes 1:28, with the quality check passing.
- **The model step** took 44 s and 14 turns in the original (bench case 2, a text PDF). Here it takes 3–4 s and 1 turn, because the runner hands the model what it needs and does the bookkeeping itself.
- **What is left is the spine's own overhead,** about 60 s.

## Ruling: checkpoints stay in Drive, one per batch

The coordinator proposed moving checkpoints into the person object. **Declined.** [ARCHITECTURE](../ARCHITECTURE.md) puts content, reports and recovery artifacts in Drive, and keeps only operational metadata in the Worker. A checkpoint names files and operations in the person's folder, so it is a recovery artifact. It must also survive what happens to the Worker, including "Delete my account".

**What the evidence does justify is fewer of them.** Since TL-P3-23, every operation in flight at a crash is reconciled by reading it back, never redone blindly. So the write-ahead record can cover a batch of operations, not each one:
1. a checkpoint before the batch, naming its operations;
2. the effects;
3. a checkpoint after.

On a crash mid-batch, recovery reconciles every operation the batch names. **`checkpoint-per-batch`** (`bower-escalated`). The bar is the recovery tests: a kill after every step, including mid-batch, must end equal to an uninterrupted run. That takes about 15 checkpoints down to 2–4 per run, which is about 20 s.

**Next targets:** the reads (15–17 s) and the report (9–10 s), profiled the same way, by `runner-reads-and-report` (`bower-implementer`) after `checkpoint-per-batch`.
