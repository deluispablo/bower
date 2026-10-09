# Packet: c4-undo-compensate (TL-P4-27 addendum 2: Undo is the inverse forward change; escalated, ui: true)

- **Entry:** `c4-undo-compensate`. Worktree `/private/tmp/bower-c4-compensate`, branch `c4-undo-compensate`, from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-27, with addendum 2 (main c7a6556c). Addendum 2 governs: design (B) and addendum 1's `tooLate` are withdrawn.
  - TL-P4-24 finding 3; this entry closes TL-P4-24 #3.
  - The Codex passes in `docs/harness/2026-10-09-codex-c4-undo-withdraw-review.md`.
  - Contract pass 1: `2026-10-09-c4-undo-compensate-contract-review.md`, whose 26 findings were mostly removed by addendum 2.
  - The parked branch `c4-undo-withdraw` at 70a2b0da (`/private/tmp/bower-c4-undo`).
  - Owner rule: the simplest honest design for rare cases.
- **Addenda 4 and 5 (main a370c1da, b938c629) govern where they differ from the sections above;** see the last section.
- **Starting model:** `bower-escalated` (Opus). Afterwards: a Claude review, one Codex pass and the designer's check. Size S-M.

## Contract (addendum 2)

**Undo is the inverse forward change.** Each Undo already has an existing inverse (references at claude/p3):
- a kept rule (`drive-vault.ts:1402`) or an added rule: the "Removed the rule" line (removeRule's forward path, `:1316`);
- a removed rule (`:1322`): `addRule`;
- a Bin (`trash` line, `:438`): restore through `fromBin` (fenced), recorded as a forward `move` line back from the Bin;
- a move (`:331`): a forward move back.

History is never deleted. There is no new line kind, no fold in the app, the Worker or the runner, no release steps and no `tooLate`. A "late" Undo cannot exist, because the inverse applies whenever it arrives.

1. **Under the outbox lock, Undo reads the original line.**
   - If the line has no reserved id (it was never sent), Undo drops it locally and records nothing.
   - Otherwise, or if the line is gone, Undo records the inverse forward line.
   - That is the only decision. It never touches a Drive journal file.
2. **The outbox lock covers storing the reserved id before any send.** This includes the fast path (`journal.ts:250-270`) and the kept retry. A line dropped under the lock can never be sent.
3. **The outbox sends in order per folder.**
   - A line is never sent before an earlier waiting line.
   - A line refused for good moves to the failed list and unblocks the rest.
   - So an inverse never reaches Drive before its original.
4. **The three line-folding sites** (`:331`, `:350`, `:434`) keep their forward-line fallback whenever the line was sent. `Journal.remove` of a sent line is deleted, so no fourth path remains.
5. **Pairs (TL-P4-27 addendum 3, main 6742d00d, from the designer).**
   - An inverse line carries an optional `undoes: <recordId>`. It is an additive field, and old readers get a fixture.
   - One pure `pairsOf(lines)` lives in `src/data/contracts/journal-record.ts`. Two places use it: the app's "Since the last tidy-up" and the report's materialize. A pair taken in the same run gives no rows and no count.
   - The run still applies both lines in order. Pairing is for presentation and counting only.
   - A later inverse, one not in the same run as its original, is an ordinary line with its own row.
   - The app and the runner deploy together.
6. **Failures.** A storage failure uses the existing "keep this page open" path. A refused inverse uses its kind's existing sentence.

## Kept from the parked branch (taken by path, not by cherry-pick; contract pass 1, finding 21)

- `toast.replace` and `press`;
- `undoToast`, as far as removePile uses it;
- the removePile copy and confirm box (TL-P4-24 addendum 5);
- write-once `withdraw` for `Sending`, uploads and `removePile`.

Name each file and what was taken in the notes. Everything else on the parked branch goes, including `confirmed`, `arrived`, `archivedByRun`, `listedNow`, `outboxWaits`, `bower:sent-lines` and the journal "Not undone yet" path.

**Mechanism map:** add a row: "Undo = the inverse forward change, decided under the outbox lock; the client never deletes a sent line."

**After this entry merges,** the coordinator deletes the parked branch through the normal cleanup and records its tip (70a2b0da) in `harness/deleted-branches.txt`.

## What the person sees (TL-P4-22; the designer signs this off again before dispatch)

| Situation | What shows |
| --- | --- |
| Undo of a change (Bin, rule, restore, move), online | Today's confirmation, replaced in place: "The rule is back.", "<name> is back", "The pile is back in the inbox". No promise line. |
| Undo of a Bin while offline | The kept undoToast: "Not undone yet: Bower could not reach Drive. Try again when you are back online." with "Try again", replaced in place. It never says "is back" before the file is back (TL-P4-27 addenda 4 (4) and 5). |
| "Since the last tidy-up" after an Undo | The original and its inverse are hidden as a pair (`pairsOf`). |
| The run report, when a run takes an original and its inverse together | Neither line is listed, and neither counts in "N changes of yours read" (TL-P4-27 addendum 3). |
| The run report, for an inverse that arrives after its original's run | The inverse shows alone, in the run that applies it, worded with its kind's existing line ("Removed the rule", "Put back <name>", and so on). No new list. |
| Undo when the outbox can't be stored | The existing "keep this page open" sentence. |
| A refused inverse | Its kind's existing sentence. |
| Remove the pile, when Drive can't be reached to check | Unchanged (TL-P4-24 addendum 5). |

**Re-signed** by the designer on 2026-10-09 (1e46b9b7), with the report rows as above (TL-P4-27 addendum 3).

## Red

These go through the vault API (`removeRule`, `restore`, `undo`) on a fake Drive with the Web Locks stub:
- round 1 #1 and #2;
- addenda 13–14 #3 and #4.
Each red names its Codex finding.

Also:
- `a same-run pair gives no report row and a count of 0`;
- `a later inverse gives one ordinary row`;
- `pairsOf hides a pair in Since the last tidy-up`;
- the old-reader fixture: a line without `undoes` still reads.

Every other finding is listed in the notes as "n/a by construction", each with a one-line reason.

The **model property** runs on the real Journal over a fake Drive with the Web Locks stub. It covers tabs, send outcomes (landed, refused, unknown) and the person's moves, interleaved anywhere. It checks that:
- a line dropped under the lock is never sent;
- an inverse never reaches Drive before its original;
- every resolved Undo either dropped an unreserved line or recorded its inverse.

## Verify

- The reds and the property.
- e2e on fake, phone and desktop, with axe:
  - the dock Undo online, and offline ("Not undone yet: Bower could not reach Drive. Try again when you are back online.");
  - "Since the last tidy-up" hiding the pair;
  - removePile.
- The runner goldens (C04 78, 25-runs 88) do not rise.
- `pnpm check`, through `bash harness/with-lock.sh`.

## Commits

1. The kept files, by path.
2. The red.
3. The fix.
4. The notes, with compatibility rows and `tests changed:` lines.

A worker may not loosen its own red (TL-P4-22 addendum 22).

## Addenda 4 and 5 (contract pass 2, main a370c1da and b938c629; no pass 3)

Review: `2026-10-09-c4-undo-compensate-contract-review-2.md`. The full text is in DECISIONS.md, TL-P4-27 addenda 4 and 5.

1. **Rules apply in line order, through the one home.**
   - The rules-wording change's remove items gain an optional `since` (the line's `at`). An old manifest without it keeps the removals-first behaviour, with a fixture.
   - wordRules (`note-edit.ts:621-634`) applies adds and removes as one stable sequence by since. An add is skipped when ruleLike.
   - The same pure sequence function serves the app's rules() view (`drive-vault.ts:1291`). A pending add followed by its pending remove is not listed. There is no second fold.
2. **pairsOf pairs every line whose `undoes` is X with X,** so two inverses of one original fold as one pair.
   - A restore inverse is a `move` line with `path` and `from` both set to where it came back, plus fileId and undoes.
   - A round-trip test proves that a run seeing trash plus restore, or a move plus the move back (formerNames, `links.ts:10`), leaves notes and links as they were.
   - Files: changes() (`drive-vault.ts:553`), the demo and fake vaults, and `vault-contract.ts:237`, which needs a `tests changed:` line.
3. **`Journal.retract(id)` returns `'dropped' | 'sent'`, decided under the lock.**
   - A line in the outbox without a reserved id, or on the failed list, is dropped. Anything else is 'sent'.
   - All 7 callers use it:
     - the Undos (`:331`, `:469`, `:1322`, `:1402`) record the inverse with `undoes` on 'sent';
     - `:1313` records "Removed the rule" on 'sent';
     - `:350` and `:434` write their combined line on 'dropped' and their forward fallback on 'sent'.
   - A failed keep throws the existing "keep this page open". The journal.test.ts uses of remove get `tests changed:` lines.
4. **Offline Bin Undo copy.** "Not undone yet: Bower could not reach Drive. Try again when you are back online." with the "Try again" action, replaced in place.
   - undoToast, its branch and ErrorCode 'unreached' stay.
   - removePile keeps "Not removed yet: Bower could not reach Drive to check. …".
5. **FIFO** stops at the first line that is neither sent nor refused.
   - A line behind it stays in the outbox, and record() answers it as `later`.
   - A `waits` head (sign-in, permission) blocks the later lines until the person acts. This is accepted.
   - A line refused inside record() throws, as today, so no Undo is offered for it.
   - No inverse is ever sent for an original on the failed list; retract drops that original instead.
6. **Lock scope:** the kept retry, sendWaiting (already locked) and Undo.
   - send is split into an inner send and a locked wrapper, because acrossTabs is not re-entrant.
   - The fast path stays unlocked. An inverse (a line with `undoes`) never takes the fast path while its original's send is in flight in this tab: record() awaits that send first.
7. **Reds and their assertions** (these replace the Red list above where they differ):
   - round 1 #1: two vaults on one outbox with the Web Locks stub; Undo during the reserve leaves X absent at the end;
   - round 1 #2: removePile with Sending, through write-once withdraw;
   - #3: the original is refused onto the failed list, then Undo drops it and records nothing;
   - #4: two tabs Undo one change; the end state is X absent, with at most one row shown, through pairsOf. In its Bin form, the second restore fails with the fence's "no longer in the Bin", which is accepted;
   - the rule red through the vault API: addRule online, Undo, a tidy-up, then Rules.md lacks X.
   - The model property gains an independent oracle (replay the Drive journal in `at` order). It covers a reserve failing offline and a `waits` head.
8. **Files in scope:** journal.ts, drive-vault.ts, contracts/journal-record.ts, note-edit.ts, the rules-wording manifest type, Home.tsx, the demo and fake vaults, vault-contract.ts, journal.test.ts and the fixtures. Remove write-once Keeps and hold if knip shows them unused.
