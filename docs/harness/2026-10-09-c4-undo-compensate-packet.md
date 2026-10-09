# Packet: c4-undo-compensate (TL-P4-27 addendum 2: Undo is the inverse forward change; escalated, ui: true)

- **Entry:** `c4-undo-compensate`. Worktree `/private/tmp/bower-c4-compensate`, branch `c4-undo-compensate`, from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-27, with addendum 2 (main c7a6556c). Addendum 2 governs: design (B) and addendum 1's `tooLate` are withdrawn.
  - TL-P4-24 finding 3; this entry closes TL-P4-24 #3.
  - The Codex passes in `docs/harness/2026-10-09-codex-c4-undo-withdraw-review.md`.
  - Contract pass 1: `2026-10-09-c4-undo-compensate-contract-review.md`, whose 26 findings were mostly removed by addendum 2.
  - The parked branch `c4-undo-withdraw` at 70a2b0da (`/private/tmp/bower-c4-undo`).
  - Owner rule: the simplest honest design for rare cases.
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
5. **"Since the last tidy-up" hides an original and its inverse as a pair.** This is presentation only, in the app's list; the designer confirms it. The run report shows both lines as they happened.
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
| Undo of a Bin while offline, when the file is still in the Drive Bin | "<name> comes back when you are online." It never says "is back" before the file is back (designer condition, 2026-10-09). |
| "Since the last tidy-up" after an Undo | The original and its inverse are hidden as a pair. The designer confirms this; it is presentation only. |
| The run report after an Undo whose original was already sent | Both lines as they happened. The designer confirms the wording, and no new list is added. |
| Undo when the outbox can't be stored | The existing "keep this page open" sentence. |
| A refused inverse | Its kind's existing sentence. |
| Remove the pile, when Drive can't be reached to check | Unchanged (TL-P4-24 addendum 5). |

## Red

These go through the vault API (`removeRule`, `restore`, `undo`) on a fake Drive with the Web Locks stub:
- round 1 #1 and #2;
- addenda 13–14 #3 and #4.
Each red names its Codex finding.

Every other finding is listed in the notes as "n/a by construction", each with a one-line reason.

The **model property** runs on the real Journal over a fake Drive with the Web Locks stub. It covers tabs, send outcomes (landed, refused, unknown) and the person's moves, interleaved anywhere. It checks that:
- a line dropped under the lock is never sent;
- an inverse never reaches Drive before its original;
- every resolved Undo either dropped an unreserved line or recorded its inverse.

## Verify

- The reds and the property.
- e2e on fake, phone and desktop, with axe:
  - the dock Undo online, and offline ("comes back when you are online");
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
