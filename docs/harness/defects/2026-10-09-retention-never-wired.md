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
