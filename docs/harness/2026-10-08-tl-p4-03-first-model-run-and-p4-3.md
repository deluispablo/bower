# Technical-lead decision TL-P4-2026-10-08-03: the first model run, and batch P4-3

**Results, staging `58897f5`:**
- **Three scripted runs:** 1:59, 1:30 and 1:21 from the press to `done`. P3's run took 2:07.
- **The live C04 smoke with Claude Sonnet:** 1:50 from the press to `done`. The model step took 2.1 s and 1 turn (2,360 tokens in, 103 out); the runner took 72 s, 38 s of it on 16 checkpoints.
- **Safe but empty.** The run filed only the admitted PDF and touched nothing else. The corpus scorer fails, because the model saw file names only, with no contents and no note text.
- **Now off again.** `BOWER_PROVIDER` and `BOWER_MODEL` are unset in the instance repository.

**Reading.** The model is not the slow part: the spine is, with about 2 s per checkpoint and 25 s from the press to the job start. The original's agent step took 44–90 s, but it did real reading. A fair comparison needs the C04 slice first.

## Batch P4-3

1. **`runner-checkpoint-cost`** (`bower-escalated`). The recovery tests are the bar: every kill-after-step test must still pass.
   - **First, split the 25 s** from the press to the job start into the Worker's admission (manifest and pile-note reads) and GitHub's queue. R3 measured 2 s from dispatch to created.
   - **Then cut checkpoints:** merge them or drop the read-back, only where the recovery tests still pass.
   - **Cache the Claude Code install** with `actions/cache`, as the original did.
2. **`c04-incorporation`** (`bower-escalated`), the first P4-C slice, alongside.
   - **What the model sees:** bounded content, not just names. It gets the app's prepared text from the P2 preparation contract (C15) where it exists, and the runner's own extraction where it doesn't: plain text, and the text layer of PDFs, using a maintained library. Scanned PDFs (OCR) are a later slice.
   - **The note text** of the notes the model is asked to update.
   - **Proof order:** scripted proposals first, then the model on the corpus's C04 cases, scored by the corpus scorer.
   - **Unchanged:** the provider still returns structured operations only, and the spine validates them.
3. **Every live model run** sets `BOWER_PROVIDER` only for its duration, through the lead, and is recorded in [p4-speed-baseline.md](p4-speed-baseline.md).
