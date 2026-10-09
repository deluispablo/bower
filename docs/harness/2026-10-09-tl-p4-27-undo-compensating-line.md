# Technical-lead decision TL-P4-27: Undo as a compensating line (re-plan of c4-undo-withdraw)

**Why a re-plan.** Four rounds of c4-undo-withdraw (TL-P4-24 addenda 3 and 11-14) each moved the point where the client decides. Codex kept finding new paths (the codex-c4-undo-withdraw-review.md passes) because the question stayed the same: "is there a live Drive file for line X anywhere?". The client answers it from partial state, against a store that the person, other tabs and runs all change. As the lead said after round 3, holes mean a re-plan.

**Input:** a read-only Plan agent's design note (2026-10-09) comparing two designs.

- **(A) One lock-held lifecycle** with retention. Size L, and a run-manifest contract change. It still decides on a listing, and Undo still fails offline. If Undo lands after a run applied X, the rule stays live while Undo reports success.
- **(B) A compensating line,** the standard event-sourcing pattern: undo is recorded as a new event, never as a delete. Size M.

The note's claims cite p3 and parked-branch lines, which the packet carries. The lead adopts **(B)**.

## Contract

1. **The client never changes a journal file in Drive.**
   - Undo drops a local line only when, read under the outbox lock, it has no reserved id (it was never sent).
   - Otherwise Undo appends `undo` (`kind: 'undo', undoes: <recordId>`), which is sent only after its target has left the outbox, either sent or refused.
   - Undo works offline.
2. **Every outbox send runs under the lock,** after its reserved id is stored, including the `kept` retry (journal.ts:259-270 at p3), which moves under the lock. The parked guard "not kept, so not sent" stays.
3. **One pure `fold(lines)` in `contracts/`.** It is the only cancellation logic: it drops X together with undo(X). The callers:
   - journal `list()`;
   - `contextRemoved` (pile-readiness.ts:484-486);
   - admission (spine/plan.ts:378);
   - `journalOf` (scripted.ts:1931-1974), folding before the 20-request cap.

   A run never applies X while it can see undo(X) in its listing; it holds X back instead.

4. **The run settles each undo,** and adds no new report or manifest field (run-manifest.ts:377 is a closed key list).
   - X with undo(X): both are archived, and the row shows `yourChanges: 0`, as rules have it.
   - An undo whose target is already archived is a "late undo". It is archived, and it gets its own report row with the designer's copy.
   - An undo whose target is nowhere is archived with no effect.
5. **Strict on write, lenient on read, released in two steps.** First the runner and the Worker read `undo`, then the app writes it. On staging the lead deploys the app and the runner together, and so does the cutover. A version-skew test, plus fixtures for old lines and old reports.

## What is kept and what goes

- **Kept from round 3:**
  - `toast.replace` and `press`;
  - `undoToast`;
  - the removePile copy (TL-P4-24 addendum 5);
  - write-once `withdraw` and `alone` for drive-vault `Sending`, uploads and `removePile`.
- **Goes:**
  - the journal as a withdraw keeper;
  - `confirmed`, `arrived`, `archivedByRun`, `listedNow` and `outboxWaits`;
  - the "Not undone yet" path for journal Undos.

  The mechanism map row is updated.

- **Call sites:**
  - the dock Undos (drive-vault.ts:1313, :1322, :1402, :469) call `undo`;
  - the line-folding sites (:331, :350, :434) call a local-only `retract` and keep their forward-line fallback.

## UI (designer consult)

- **The promise of a journal Undo** becomes "the next tidy-up skips it", and Undo is always possible, offline too.
- **A late undo** needs a report row sentence: a run that started elsewhere had already taken the change.

The designer gives both. The entry is `ui: true`.

## Tests

- **fast-check on `fold`:** idempotent, independent of order, and an undo of a missing target is inert.
- **A model property** over tabs, devices, send outcomes (landed, then 403), the person's moves and runs, interleaved anywhere:
  - no applied set contains an X whose undo the run could see at capture;
  - every resolved Undo either dropped a line with no reserved id, or its undo line reaches Drive or the failed list;
  - every late undo has a report row.
- **One red for each Codex finding** across the four rounds (12).

## Plan

A new entry, `c4-undo-compensate`, escalated, on Opus with a Codex pass. It starts from claude/p3 and takes the kept parts from the parked branch by cherry-pick, each named in the notes. The parked branch is then deleted through the normal cleanup, with its tip recorded in harness/deleted-branches.txt. TL-P4-24 #3 closes with this entry.
