# Technical-lead decision TL-P4-07: C04 placement regression on a566241

**Measured, 2026-10-08.** Three live C04 runs on `a566241`, each in a fresh folder with test account A and the same 4-thing inbox. Claude Sonnet ran in 3.1–3.6 s with 1 turn.

| Run | Press → done | Job | Runner |
| --- | ---: | ---: | ---: |
| 1 | 0:56 | 1:01 | 49.5 s |
| 2 | 0:42 | 0:44 | 34.6 s |
| 3 | 0:43 | 0:45 | 35.5 s |

- **Speed.** The median falls from 1:28 on `c76fd2f` to 0:43, about half. The original took 6:38 before its speed work and aimed at 1.5–2 min after it.
- **Placement.** All three runs fail C04: the PDF and the note go to `Areas/Community garden`, while the corpus expects `Resources/*`. The three `c76fd2f` runs chose Resources. The note itself is right: all 4 dates, filed=1, created=1.
- **Checkpoints.** The timing line counts 8 checkpoints, not the 4 that TL-P4-05 addendum 2 accepted.

**Ruling.** The speed result does not count until C04 passes again. A fast wrong answer is a regression, not a gain.
1. **`model-context-regression`** (`bower-implementer`), first.
   - **Suspect.** Between the two SHAs, the plan reads became aimed at the run's scope (`provider.ts` `aimed`, `drive.planReads`), and the Rules repair moved inside the plan. Either could change what the model sees: the folder tree, the existing Resources folders, or Rules.md.
   - **Red test.** On the C04 fixture, the provider's input on `a566241` differs from the input on `c76fd2f`. Capture both from the scripted fake, without the model.
   - **Fix.** Restore whatever the model needs to see, while keeping the read savings. Then add a golden test of the model's input on the C04 fixture, so a later read optimization cannot silently change what the model sees.
   - **If the inputs are identical,** say so, and the lead treats the change as model variance (5 more runs).
2. **`checkpoint-count`** (`bower-mechanical`, or folded into entry 1 when it is the same code): explain the 8. Either the run writes 4 and the timer counts something else, which is fixed in the timing line, or the run writes 8, which is fixed to 4 plus one per extra batch. Test: C04 writes exactly 4 checkpoints.
3. **Then** the lead redeploys and runs C04 three more times. It needs 3/3 passes to count the speed result.
