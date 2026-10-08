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

## Addendum: how a batch is reconciled — the run's own stamp on every effect

**The blocker.** With one checkpoint per batch, a crash mid-batch leaves operations that may or may not have been sent. Comparing states cannot tell "the person renamed it and Bower never sent its move" from "Bower moved it, then the person renamed it".

**Ruling: option (b), a stamp.** Every effect the runner sends carries the run's stamp in the same request: one `appProperties` key, `bowerOp`, set to `<run_id>:<operation id>`, overwritten rather than accumulated. Only Bower's OAuth client sees it, and a person's edits in Drive never touch it ([Drive, custom file properties](https://developers.google.com/workspace/drive/api/guides/properties)). Reconciliation then reads the stamp first, so it is exact:
- **the stamp is present:** the operation landed. If the file has changed since, the person changed it afterwards, and that change is kept and reported, never undone;
- **the stamp is absent:** the operation never landed. It is sent only if the file is still as the plan saw it. If the person changed it, the operation is set aside and reported;
- **the file is unreadable:** the run stops honestly in `saving`, as before.

This closes the window instead of narrowing it, adds no Drive calls, and also settles item 3, because a person's undo is seen and kept. It strengthens TL-P3-23's reconcile rule; it does not loosen it.

- **The bar stays** that every kill ends equal to an uninterrupted run. Where the person changed something in between, the run keeps their change and reports it.
- **The listed tests may change** where their doubles answered "unreadable" for operations that were never sent, since real Drive answers "not landed": `checkpoints.test.ts:81` and `:144`, `barrier.test.ts:45`, `dispositions.test.ts:89`, and `recovery.test.ts:350`'s list of kinds. Each change says why.
- **New tests:** the person renames inside a batch, then a kill (set aside, honest); the person undoes a landed effect, then a kill (kept, not re-applied); and the stamp is overwritten, never accumulated.

**Addendum 2, 2026-10-08: two deviations in checkpoint-per-batch, both accepted.**
1. **The stamp is a hash.** `bowerOp` = the first 32 hex characters of SHA-256(`run_id:op id`). Drive allows 124 bytes for an app property's key and value together ([Drive API, properties](https://developers.google.com/workspace/drive/api/guides/properties)), and the plain literal needs about 152. The hash still identifies the effect exactly: reconcile recomputes it from the manifest, and 128 bits makes a collision negligible.
2. **Four checkpoints per run, not one per batch:** first; opening, just before the first send; closing, with the report pending; done. These keep the report barrier (TL-P3-22) and its test. With more batches, the count may grow by one per batch, never per operation.

**Left out: the report line for a change the person made during the run.** Register it as `report-kept-your-change` in the C12 slice (honest partial results), not in the P4-6 close. Until then the effect is still kept and skipped correctly; only the explanation in the report is missing.
