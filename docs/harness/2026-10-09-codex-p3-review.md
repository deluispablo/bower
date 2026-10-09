# Codex review TL-P3-16 (TL-P4-23 ruling 5), 2026-10-09

Read-only `codex exec --sandbox read-only`, medium effort, on claude/p3 849ac78f. Ranges: P3 93d70e9..426a9fd (api, runner/src, src/data/spine) and stage 2 9265d860..c9d20a67 (api, runner/src, src/data). Findings enter the defect flow (TL-P4-15); none is fixed where it shows.

1. **Important — [src/data/drive/transport.ts:119](src/data/drive/transport.ts:119): retries bypass the write fence.**  
   After a retryable refusal, the transport resends the same request without rechecking modifiedTime, name/place, or the runner’s attempt. For example, a note write passes its check, receives 429, and waits; someone edits the note during that wait. The retry overwrites their edit using the earlier body. The runner’s fence surrounds the entire transport call, so it does not protect individual retries.  
   **Mechanism home violated:** `src/data/contracts/` still-as-seen fence, and `src/data/spine/` checked application through the Drive adapter.

2. **Important — [src/data/vault/drive-vault.ts:1747](src/data/vault/drive-vault.ts:1747): app Bin operations skip the target’s read check.**  
   `toBin` sends `trash` directly. Neither `updateByStamp` nor `DriveHttp.trash` checks the target before sending; the live wrapper checks only the session lease. For example, the app lists an Inbox pile, someone moves it to Projects through Drive, and the stale app then removes it. Bower bins the already-filed pile without detecting its changed place.  
   **Mechanism home violated:** `src/data/contracts/` still-as-seen fence.

3. **Important — [src/data/vault/journal.ts:497](src/data/vault/journal.ts:497): Undo discards an unresolved create’s recovery identity.**  
   Removal drops the waiting line, including its reserved Drive id, before checking whether that create landed. It then relies on `filesOf` or the cached journal listing. For example, a new rule’s create lands, its response and read-back fail, and the line enters the outbox. Undo removes it locally and succeeds, but the cached listing contains no corresponding file. The live rule remains in Drive and a later tidy-up applies the withdrawn instruction.  
   **Mechanism home violated:** `src/data/spine/write-once.ts` reserved-id recovery, through the journal’s outbox keeper.

findings: 3
