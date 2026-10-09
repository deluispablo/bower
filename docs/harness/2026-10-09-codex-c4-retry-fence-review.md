# Codex review of c4-retry-fence (TL-P4-23 ruling 6)

Range baaa781b..22cff4b0 (worktree /private/tmp/bower-c4-retry), read-only, medium effort.

1. **Important — `src/data/vault/journal.ts:509`**: Journal Undo checks the target at line 508 but does not pass that fence to `trash`. A retryable refusal therefore ends the write immediately. Concrete scenario: `DriveVault.restore` successfully unbins the item, then the journal PATCH receives 429; journal removal fails, leaving the trash record present and restore unfinished despite the item already being restored. Mechanism home: `contracts/still-as-seen.ts` supplies the fence; `drive/transport.ts` owns resends. Forward the existing fence through `WriteOptions`.

No second retry path found. `spine/barrier.ts:193` receives its transport fence through `RunnerDrive.fenced`.

findings: 1

## Fix-round pass (37f1c696..a4430287)

PASS — `37f1c696..a4430287` fixes the prior finding: Undo Bin forwards its existing fresh still-as-seen check as the resend fence.

No new Critical or Important findings in the delta. No second retry path added. Tests reviewed, not run.

findings: 0
