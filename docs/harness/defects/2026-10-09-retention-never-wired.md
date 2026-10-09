# retention-never-wired (Important)

## Evidence
- keepFinished (runner/src/spine/retention.ts:18, KEEP_FINISHED 20) has no production caller (P4-37b, coordinator grep).
- The closed entry spine-operations-checkpoints (TL-P3-21 points 2 and 3) promises "keeps the folders of the last 20 finished runs, moving older ones to the Bin". Its verify names "only the last 20 finished run folders are kept" (runner/test/checkpoints.test.ts:294), and that test calls keepFinished directly.
- So no run ever bins old run folders, yet the harness proved the promise.

## Class
A promised behaviour proved by calling a helper directly instead of through the path a person runs. This goes to the lead's stage-end pattern review.

## Ruling (lead, DECISIONS main f9e2515): (a) wire it, escalated (it bins)
- One call at run end, after the report barrier, through the engine and the write-once helper.
- A failure to bin is logged and never fails the run.
- Test through a real run: after 21 finished runs, 20 folders remain and the oldest is in the Bin.
- spine-operations-checkpoints is reopened until the wired test proves it.

## Ruling, round 2 (lead): bounded cost
- Round 1 (a6328140) added +128 Drive calls per run past 20 runs (37 → 165), so it was not merged.
- "Finished" is known without reading: at done the run folder is stamped in appProperties, so the listing the runner already has is enough.
- Bin only the oldest beyond 20, at most 3 per run (a backlog drains over time); no re-verification of kept chains.
- Target: at most +3 calls past run 20, pinned by a C04 golden variant with 25 earlier runs.

## Ruling, round 2 numbers (lead, DECISIONS main 5733eb8): option (a)
- Up to 3 Bins per run only while there is a backlog; in steady state each run adds one folder and bins one (+2 on top of the stamp).
- C04 = 78 is a recorded exception (it wires a P3 promise). No fence exception for record folders (that would be a second rule).
- Goldens pinned: C04 = 78, and the 25-earlier-runs case = 85. Merge after review.

## Ruling, round 5 (lead, after P4-38c): option (a), Bower acts only on what carries Bower's mark
- P4-38c found that the 24 h rule could bin a folder the person made inside .bower/runs ("Alex notes"), because run folders carried no Bower mark at create.
- Bower stamps bowerRun=<run_id> when it creates the folder, in the same create request, through the create-by-id helper.
- Retention, including the done stamps and the 24 h rule, only ever touches folders that carry it. Unstamped folders are never binned, whatever their age. Unstamped legacy staging folders are left alone (accepted).
- Tests: the "Alex notes" repro is kept (never binned), and a stamped 2-day-old run beyond 20 is binned.
- Class for the lead's stage-end review: "Bower acts only on what carries Bower's mark".

## Ruling, round 6 (lead, after P4-38d)
- A person's folder moved inside a marked run folder would be binned with it (same data-safety class). Bin a marked run folder only if every item inside it, known from the listing the runner already holds, also carries Bower's mark; otherwise skip that folder and log it, with no extra call.
- Round 6 detail (lead): option A. Every record create in a run folder carries bowerRun=<runId> (rides on the create). At the end only the ≤3 candidates' children are listed; a candidate is binned only if all its children carry the mark. The 25-run golden becomes 88; C04 stays 78. Existing unmarked records (staging only) are kept; no cutover rule. A skipped folder counts among the kept 20.
