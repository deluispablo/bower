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
