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

## Delta pass (round 2, f772b9ce..f47217e5)

The three earlier lost-answer reproductions are fixed. The delta introduces two Important gaps. No second fence mechanism was added.

1. **Important — `src/data/vault/drive-vault.ts:471`: cached restore state skips the next fence.**  
   Restore now reuses `gone.back.file` without calling `fromBin`. Restore a file whose original name remains free; let unbin succeed, then let journal removal fail. Bin the file elsewhere in Drive before retrying. The retry skips both unbin and rename, deletes the restore record, and reports success while the file remains binned.  
   **Mechanism home violated:** `src/data/contracts/still-as-seen.ts` — current Bin state must be checked, rather than treating an earlier successful answer as current state.

2. **Important — `src/data/vault/drive-vault.ts:1089`: empty-text recovery accepts an outside move, rename or Bin.**  
   `landedAs(note, { text: '' })` checks only the stamp and checksum; it does not check name, parents or Bin state. Clear a declared pile’s note, lose the write answer and recovery read, then move that note to Projects through Drive. Retrying accepts the empty write as landed, bypasses the changed-place refusal, and completes against a note that is no longer in the pile. This bypass becomes reachable for empty text in this delta.  
   **Mechanism home violated:** `src/data/contracts/still-as-seen.ts` — landed recovery bypasses the fence despite a subsequent outside structural change.

findings: 2

## Round 3 pass (babe395b..344ad493)

1. **Important — `src/data/spine/write-once.ts:85` (recovery at `:98`): same-call recovery still accepts a state the write did not make.** `checkStillAsSeen` now validates the intended name, place and Bin state, but `updateByStamp` resolves lost answers using only `holds`. For example, restore unbins under a free name, its answer is lost, and another device renames or moves the file before the recovery read. The stamp remains and the file is unbinned, so recovery reports success in the wrong final state. The same gap remains for an emptied note moved before recovery. The property forces the recovery read to fail and changes the file between presses, so it misses this interleaving.

   **Mechanism home violated:** `src/data/contracts/still-as-seen.ts`; packet contracts 1–3 require one definition of landed state. Retry checks are fixed, but same-call recovery retains a second, weaker acceptance path.

findings: 1

## Round 4 pass (8dec5faa..d735fa11)

Round-3 finding: fixed. Same-call recovery now uses `landedAs`, including the intended name, place and Bin state.

1. **Important — `src/data/spine/engine.ts:579`: runner recovery retains a second landed definition.** `reconcile` accepts `stampSays === 'landed'` without the checksum or intended after-state. For example, a runner text write lands, its answer is lost, and another device edits or moves the file before recovery. The retained stamp makes recovery report the operation applied. The notes’ TL-P4-05 justification explains this behavior, but conflicts with round-4 contracts 1–2, which explicitly require stamp-only runner sites to be fixed. **Mechanism home violated:** `src/data/spine/write-once.ts`, the single landed definition.

2. **Important — `src/data/vault/drive-vault.ts:1141`: lost-create recovery adopts an outside move as the write’s expected place.** Create a pile note, lose both its answer and recovery read, then move it into Projects through Drive. Retry `updatePile` with new words. The checksum check at `:1130` accepts the note, and `once` fences against the newly read Projects location before overwriting it there. The original pile remains without its requested note. The fence runs, but its expectation has discarded the intended pile location, so it cannot reject the outside move. **Mechanism home violated:** `contracts/still-as-seen.ts` and `spine/write-once.ts`; the retry contract requires the intended final state and protection against outside moves.

findings: 2
