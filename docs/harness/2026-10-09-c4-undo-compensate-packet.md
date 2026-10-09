# Packet: c4-undo-compensate (TL-P4-27, Undo as a compensating line; escalated, ui: true)

- **Entry:** `c4-undo-compensate`. Worktree `/private/tmp/bower-c4-compensate`, branch `c4-undo-compensate` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-27 (`2026-10-09-tl-p4-27-undo-compensating-line.md`, main 802ac116). It governs; where this packet differs, the ruling wins.
  - TL-P4-24 finding 3 and addenda 1, 3, 5 and 11–14, for history only. This entry replaces them and closes TL-P4-24 #3.
  - Every Codex pass in `docs/harness/2026-10-09-codex-c4-undo-withdraw-review.md`: 12 Important findings across four rounds, one red each.
  - The parked branch `c4-undo-withdraw` at 70a2b0da (`/private/tmp/bower-c4-undo`).
  - TL-P4-20 trial: a contract sign-off before implementation.
- **Starting model:** `bower-escalated` (Opus). Afterwards, a Claude review, one Codex pass and the designer's check.

## Contract (TL-P4-27, in brief; the doc has the line references)

1. **The client never changes a journal file in Drive.**
   - Undo drops a local line only when, read under the outbox lock, it has no reserved id (it was never sent).
   - Otherwise Undo appends `{ kind: 'undo', undoes: <recordId> }`. That line is sent only after its target has left the outbox, either sent or refused.
   - Undo works offline.
2. **Every outbox send runs under the lock,** after its reserved id is stored. This includes the `kept` retry (journal.ts:259-270 at p3), which moves under the lock. The parked guard "not kept, so not sent" stays.
3. **One pure `fold(lines)` in `src/data/contracts/`** is the only cancellation logic: it drops X together with undo(X). Its callers:
   - journal `list()`;
   - `contextRemoved` (pile-readiness.ts:484-486);
   - admission (spine/plan.ts:378);
   - `journalOf` (scripted.ts:1931-1974), which folds before the 20-request cap.
   - A run never applies X while it can see undo(X) in its listing; it holds X back.
4. **The run settles each undo.** Corrected by TL-P4-27 addendum 1 (main 8c4d1f80): `RunReport` gains one optional field, `tooLate: [{ kind: 'bin' | 'restore' | 'rule', name, recordId }]`. It is additive, like `answered` (TL-P4-19 addendum 10):
   - the closed key list (run-manifest.ts:377) gains the key in the same deploy;
   - old reports still read;
   - an old-report fixture test covers it;
   - it is never folded into `answered`, because these are changes, not answers.
   - X with undo(X): both are archived, and the row shows `yourChanges: 0`, as rules do.
   - An undo whose target is already archived (a late undo) is archived, and its change goes into `tooLate`.
   - An undo whose target is nowhere is archived with no effect.
5. **Strict on write, lenient on read, released in two steps.**
   - First, the runner and the Worker read `undo`. Then the app writes it.
   - On staging the lead deploys the app and the runner together, and does the same at cutover.
   - Add a version-skew test, plus fixtures for old lines and old reports.

## Kept from the parked branch (cherry-pick, each named in the notes)

- `toast.replace` and `press`, and `undoToast`.
- The removePile copy and confirm box (TL-P4-24 addendum 5).
- write-once `withdraw` and `alone` for drive-vault `Sending`, uploads and `removePile`.
- Resolve the conflicts in this worktree.

**Goes:**
- the journal as a withdraw keeper;
- `confirmed`, `arrived`, `archivedByRun`, `listedNow` and `outboxWaits`;
- the "Not undone yet" path for journal Undos.

Update the mechanism map row.

**Call sites:**
- The dock Undos (drive-vault.ts:1313, :1322, :1402, :469) call `undo`.
- The line-folding sites (:331, :350, :434) call a local-only `retract` and keep their forward-line fallback.

**After this entry merges,** the coordinator deletes the parked branch through the normal cleanup and records its tip (70a2b0da) in `harness/deleted-branches.txt`.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

| Situation | What shows |
| --- | --- |
| Undo of a change (Bin, rule, restore), online or offline | No promise line. Today's confirmation is kept and replaced in place: "The rule is back.", "<name> is back", or "The pile is back in the inbox". The change leaves "Since the last tidy-up" as it does today, and there is no "Not undone yet" for journal Undos. **The line must stay true.** If a Bin Undo while offline can only record the line, so the file is still in the Drive Bin and not in the tree, it reads "<name> comes back when you are online." It never says "is back" before it is. |
| A late undo (a run that started elsewhere had already taken the change) | A labelled list, "Too late to undo", in the "New notes" style, on the Home card and the done sheet. It is not counted. Its rows use display names only:<br>- Bin: "<name> was already in the Bin before your Undo.", with the link "Open the Bin in Drive";<br>- Restore: "<name> was already back before your Undo.", with the link "Open <name>";<br>- Rule: "The rule "<words>" was already added before your Undo.", with the link "Open Your rules". |
| Remove the pile, when Drive can't be reached to check | As in TL-P4-24 addendum 5: the confirm box's line, "Not removed yet: …", unchanged. |

## Tests

- **fast-check on `fold`:** idempotent, independent of order, and an undo of a missing target is inert.
- **A model property** over tabs, devices, send outcomes (landed, then 403), the person's moves and runs, interleaved anywhere:
  - no applied set contains an X whose undo the run could see at capture;
  - every resolved Undo either dropped a line with no reserved id, or its undo line reaches Drive or the failed list;
  - every late undo has a report row.
- **One red for each of the 12 Codex findings,** named in the notes against the review sections.
- **The version-skew test and the old-line and old-report fixtures,** including a report without `tooLate`.
- **e2e:** the "Too late to undo" list on the Home card and the done sheet, from a scripted late undo on fake, phone and desktop, with axe.
- **e2e:** the dock Undo online ("is back") and offline ("comes back when you are online" when the file is still in the Bin), and removePile, on fake, phone and desktop, with axe.

## Verify

- The above.
- The runner tests and goldens (C04 78, 25-runs 88, which must not rise).
- api tests.
- `pnpm check`, through `bash harness/with-lock.sh`.

## Commits

1. The cherry-picks (named).
2. The red.
3. The fix.
4. The notes, with compatibility rows (the new line kind and the version skew) and `tests changed:` lines.

**Signed off** by the designer on 2026-10-09 (7e329e48), with the copy above (TL-P4-27 addendum 1), including the offline condition on "is back".

A worker may not loosen its own red (TL-P4-22 addendum 22).
