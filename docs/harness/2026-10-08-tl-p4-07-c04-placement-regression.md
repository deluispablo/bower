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

**Addendum, 2026-10-08: the model saw the same thing, so this is a placement weakness and not a regression.**
- **The input matches on the fixture.** The model's input on the C04 fixture is byte-identical on both SHAs: 2913 bytes, compared with `cmp`.
- **The input matches live too.** The Actions logs give the model's input size for every live run: `in=5760–5766` tokens on `c76fd2f` and `5760–5775` on `a566241`. The only difference is the run id and dates. A different tree or Rules.md would move this by hundreds of tokens, so option (a), a worker rebuilding the live input, is not needed.
- **The expectation and the result.** The case's rubric allows Resources, or Areas/Home when it links the existing plot note. `expected.json` allows only Resources. The model made a new `Areas/Community garden`, which fits neither. The same input led to Resources in three runs at 07:3x and to Areas in three runs at 08:4x, so placement is under-specified for the model.

Entries, in place of `model-context-regression`:
1. **`model-input-fingerprint`** (`bower-mechanical`): the timing line adds `input=<first 12 hex of sha256 of the model input>`, and the golden test of the C04 fixture input is option (c). The next comparison is then a log search, not a worker.
2. **`placement-guidance`** (`bower-implementer`), reusing the original first (owner rule).
   - **Prompt.** Compare the provider prompt's placement rules with the original's `agent/prompts/ingest.md`, and adopt its wording. A source with no fitting existing folder goes to Resources. A new Area or Project only when the person's rules or their existing notes show an ongoing responsibility.
   - **Corpus.** Align `expected.json` with the rubric, so Areas/Home is accepted when the plot note is linked.
   - **Proof.** The spine tests stay green, and the live check is 5 runs with 5/5 passing.
3. **The speed result,** a median of 0:43, counts once C04 passes 5/5. The model step is the same on both SHAs, so the gain comes from the spine, as designed.

**Next speed lever.** Live `reads` take 10.6–16.0 s. The model put plan reads at 1.8 s, so `reads` now cost more than checkpoints (11.5 s over 8 writes). `checkpoint-count` reports the 8. A later entry measures where the live reads go, after C04 passes.
