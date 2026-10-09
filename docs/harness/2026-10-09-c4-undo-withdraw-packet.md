# Packet: c4-undo-withdraw (stage 4, TL-P4-24, data safety, ahead of V2)

- **Entry:** `c4-undo-withdraw` (escalated, `ui: true` for the refusal sentence). Worktree `/private/tmp/bower-c4-undo`, branch `c4-undo-withdraw` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-24 (main 8aa4205c), finding 3, option (a);
  - the diagnosis [undo-drops-reserved-create](defects/2026-10-09-undo-drops-reserved-create.md), source of the class test;
  - the Codex review finding ([review](2026-10-09-codex-p3-review.md));
  - AGENTS hard rules: every content write passes the modifiedTime it read, a move or rename checks stillAsSeen, Bin only;
  - TL-P4-20 trial: the reviewer signs off the contract before implementation.
- **Review:** an escalated Claude reviewer plus one Codex read-only review pass (TL-P4-23 ruling 6).
- **Starting model:** `bower-escalated`.

## Contract (TL-P4-24 addenda 1 and 3, main 09e633f1)

**Order.** This entry runs after c4-app-fence merges (addendum 2). Merge claude/p3 first; the Bin's check uses `contracts/still-as-seen.ts` from that entry.

1. **`withdraw` on the Holder port** (`src/data/spine/write-once.ts`) is the one home that withdraws an intended create.
   - A line never sent has no reserved id (`journal.ts:120-123`). It lets go without a read.
   - Otherwise it gets the file by its reserved id:
     - a **404** lets go;
     - a file found in the Bin counts as let go;
     - a file found live goes to the Bin, through the still-as-seen helper, never a hard delete;
     - anything else is **unknown** (not a 404 and not found). Unknown keeps the line and refuses the Undo. So it is refused offline.
2. **Callers.**
   - `journal.remove` (removeNow, `journal.ts:~489-505`) calls `withdraw` under `acrossTabs` before the line drops.
   - The other keepers use the same withdraw: drive-vault `Sending` and `reservedFile` (`:1016, 1556, 1694/1718`), `Intended`, and the upload record.
   - No second withdraw path.
3. **Scope.** The dock Undos are Bin, rule and restore, plus `removePile` (its refusal per TL-P4-24 addendum 5, below). Lines `drive-vault.ts:332, 352, 436` are line folds, not Undos, and stay as they are.
4. **The refusal is distinguishable.** It carries its own BowerError code, so `report()` and the dock can tell it apart from the storage-failure sentence at `journal.ts:498`, which stays.
5. **Dock replace-in-place.** `toast.tsx` gains `replace(id, text, action)`. It keeps the item, restarts its timer (8 s with an action, pausing on hover or focus), and keeps focus on the action. No second component, no second message.
   - Copy: "Not undone yet: Bower could not reach Drive to check. Try again when you are back online." It is never in --danger.
   - The action "Try again" runs the same Undo.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

| Situation | What shows |
| --- | --- |
| Undo of a change whose create never left the device | As today: Undo succeeds. |
| Undo of a change whose create landed but its answer was lost | Undo succeeds, and the file Bower made goes to the Bin. No new sentence. |
| Undo from a dock message, of a change whose create may or may not have landed, with Drive not answering | The same dock message is replaced in place: "Not undone yet: Bower could not reach Drive to check. Try again when you are back online.", not in --danger, with the action "Try again" that runs the same Undo. It uses the 8 s timer that pauses on hover or focus, and focus stays on the action. No second message. The change stays in "your changes". |
| The same case from an inline Undo | Rides with d-v2-02 (not this entry). |
| Remove the pile, when Bower cannot tell whether the pile's create landed and Drive is not answering (TL-P4-24 addendum 5) | Inline in the pile screen's open confirm box (PileScreen, role=alert): the box's line is replaced by "Not removed yet: Bower could not reach Drive to check. Try again when you are back online.", muted, never --danger. "Remove the pile" stays as the retry, with focus on it; "Keep it" closes the box. No "Pile removed" and no report() toast in this case. The generic "That did not work. Try again." stays for real failures. |

Copy ruled in TL-P4-24 addenda 1 and 5. Designer signed off the table at 9193d1fc; the removePile row is the designer's own answer (addendum 5).

## Red (class test, from the note)

`a withdrawn intended create never leaves a live file`, in `src/data/spine/write-once.test.ts`. One table-driven suite.
- **Keepers:** the journal outbox line, Sending, Intended and the upload record.
- **Create outcomes:**
  - unsent;
  - landed, with its answer and read-back lost;
  - landed and confirmed;
  - refused with a 4xx.
- **Withdrawals:** `removeRule`/`restore`, `removePile` and `trash`, run against a memoised listing.
- **Two more cells:**
  - two Journals in two tabs, sharing `navigator.locks`, where only one withdraw runs;
  - the line stays when the answer is unknown.
- **Expected:** the reserved id is 404 or trashed, or the holder is kept. Mark in the test which cells are red today; at least "landed, answer lost" is.

## Verify

- The red.
- `toast replace keeps the item and restarts its timer` (unit, `src/ui/toast.test.ts`).
- `a dock undo that cannot reach Drive is replaced in place with try again`: e2e on fake, phone and desktop, with axe. It needs a named fake trigger for an unreachable withdraw; name it on your card.
- `a pile removal that cannot reach Drive says so in its confirm box`: e2e on fake, phone and desktop, with axe. The line is replaced, focus is on "Remove the pile", and no toast shows. It uses the same named fake trigger.
- `pnpm check`.
- The goldens.

## Commits

The red (tests only), then the fix, then the notes in their own commit, with `tests changed:` lines and compatibility rows. The card carries `worktree:`. Every gate runs under `bash harness/with-lock.sh`.

Reviewers are read-only. They never move the main checkout.

## Contract review pass 1 (2026-10-09)

# c4-undo-withdraw contract sign-off (claude/p3, read-only)

Verdict: CHANGES. Seven required changes. Nothing here designs the fix; each says what the contract must state.

1. Files in scope are missing (WORKER: "the packet lists ... the files in scope"). The dock case needs a way to replace a toast in
   place, and src/ui/toast.tsx has none: `show` appends (toast.tsx:37-41); a button press runs the action then `dismiss` (108-110);
   the 8 s timer is set by `later` only from show/hold (28-34, 40, 51); focus is returned to the opener on close (82), which is
   not "focus stays on the action". Name toast.tsx (the one toast home) and the call sites BowerScreen.tsx:74, Home.tsx:388,
   file-actions.ts:63 and :113. Dock.tsx:32 only renders <Toasts/>.
2. Which dock Undos are covered, and how a refusal reaches them. drive-vault.ts:332, :352 and :436 catch `journal.remove`
   failures, log them and record a new line, so a refusal never reaches the dock there; :468, :1310, :1319 and :1399 propagate.
   Also say how the dock tells this refusal from other errors (every caller passes any error to `report(e, 'That did not work...')`,
   BowerScreen.tsx:74, Home.tsx:388): a BowerError code or flag must be in the contract, or the replace-in-place is untestable.
3. "stillAsSeen" contradicts the code. It is a drive-vault protected method (drive-vault.ts:1722, via notAsSeen against a fresh get)
   and journal.ts / write-once.ts cannot call it. journal.ts:505 bins with `updateByStamp`, no stillAsSeen. State what the Bin
   in `withdraw` compares against (the file `byId` just read: name and place), and what happens when it differs
   (reservedFile keeps a file filed elsewhere or holding other bytes, drive-vault.ts:1704-1710; withdraw must keep that guard
   or say it is dropped). Also say what happens when the found file is already trashed (no-op).
4. "Unknown answer" is undefined. `byId` rethrows every non-404 (write-once.ts:63-67): 403, 5xx and offline alike. Say which
   refuse the Undo (all, or only no-answer/5xx via `unsettled`/`failureKind`), and which sentence a 403 gets, since the copy is
   "could not reach Drive".
5. Table row 1 ("create never left the device: Undo succeeds") is only true for a line with no `reserved` id
   (journal sendWaiting reserves before sending; reserveFor write-once.ts:136-142). A line with a reserved id and a failed send
   cannot be told from a landed one offline, so its Undo is refused. Restate row 1 as "no reserved id" and add it to the red/e2e.
6. The class red omits what the diagnosis requires: the two-Journal case on one localStorage with a stub `navigator.locks`
   (diagnosis, Class regression test and item 1; jsdom has none, journal.ts:339-341). Add it by name, plus: the line stays
   when unknown (journal.ts:497 drops it first today), and `removePile`/`trash` unknown outcomes. Also say which cells are
   red today and which are guards: Intended, upload record and Sending are "effect unverified" in the diagnosis, so the suite may
   be partly green today. Point 2 names Sending and reservedFile but not the Intended and upload-record keepers the red lists.
7. removePile (drive-vault.ts:1016-1018, 1556-1560, 1694-1718) gets a new refusal when the read is unknown, but the only sentence
   ruled is the Undo one. Either scope the contract to journal.remove plus reservedFile, or give removePile/trash a ruled sentence.
   Also the e2e needs a named fake trigger for "landed, answer lost, Drive not answering"; none is given.

Minor: `journal.ts:498` is the volatile.set; the storage-failure throw is :499. Two ways to bin one file if `withdraw` and
`filesOf` (journal.ts:502-507) both hit the same id; say it is one bin.

Would the red fail today for the stated reason? Yes for "landed, answer lost" with a memoised listing: removeNow drops the line
(:497) and bins only filesOf/list (:501-508), per the diagnosis reproduction. OK.
