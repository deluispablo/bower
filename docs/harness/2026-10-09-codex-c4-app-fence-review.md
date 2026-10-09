# Codex review of c4-app-fence (TL-P4-23 ruling 6)

Range 397ec1a5..7dcdacf8 (worktree /private/tmp/bower-c4-fence), read-only, medium effort.

1. **Important — `src/data/vault/drive-vault.ts:1747`: restore refuses its own landed rename.**  
   Restore unbins a file, then renames it because its original name is occupied. If the rename lands but its answer and recovery read are lost, it overwrites the unbin stamp. Pressing Undo again calls `fromBin(gone.file)`: `holds(..., 'unbin', now)` fails, and the fence rejects the already restored file because it is outside the Bin. Recovery cannot finish.  
   **Mechanism home violated:** `src/data/spine/write-once.ts` stamped recovery and `src/data/contracts/still-as-seen.ts` landed-write shortcut; packet contract 4.

2. **Important — `src/data/vault/drive-vault.ts:1066`: the pile preflight rejects a landed rename before stamped recovery runs.**  
   Change a folder pile’s words so its folder needs renaming. Let that rename land, then lose both its answer and recovery read. The index retains the old folder name. Retrying `updatePile` reaches `stillAsSeen(f)` without a landed predicate and reports a name conflict before `once` can recognize the rename stamp. The folder changed, but the requested note update cannot finish through that retry.  
   **Mechanism home violated:** `src/data/contracts/still-as-seen.ts` landed-write shortcut and `src/data/spine/write-once.ts` stamped recovery; packet contract 4.

3. **Important — `src/data/vault/drive-vault.ts:1078`: clearing pile words disables landed-write recognition.**  
   The preflight supplies `holds` only when `text` is truthy. Clear a declared pile’s note; let the empty content write at line 1107 land, then lose its answer and recovery read. On retry, the preflight rejects the changed modifiedTime before `once` recognizes the stamped empty write. Clearing an ordinary pile’s note has the equivalent failure when its Bin operation lands: retry rejects its Bin state.  
   **Mechanism home violated:** `src/data/contracts/still-as-seen.ts` landed-write shortcut and `src/data/spine/write-once.ts` stamped recovery; packet contract 4.

findings: 3
