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

## Contract

1. **`withdraw` on the Holder port** in `src/data/spine/write-once.ts`. It is the one home that withdraws an intended create:
   - a get by the reserved id;
   - a 404 lets the id go;
   - a found file goes to the Bin, never a hard delete, with stillAsSeen;
   - an unknown answer keeps the line and refuses the Undo.
2. **The journal uses it.** `journal.remove` (removeNow, `journal.ts:~489-505`) calls `withdraw` under `acrossTabs` before the line is dropped.
   - The same class elsewhere uses the same withdraw: drive-vault `Sending` and `reservedFile` (`drive-vault.ts:1016, 1556, 1694/1718`).
   - No second withdraw path.
3. **Refusal (TL-P4-24 addendum 1, main 7a3eca46).**
   - The sentence is "Not undone yet: Bower could not reach Drive to check. Try again when you are back online.", never in --danger.
   - This entry builds the dock case only: a dock-message Undo is replaced in place through the v2-dock home. Its action, "Try again", runs the same Undo. It keeps the 8 s timer that pauses on hover or focus, and focus stays on the action. No second message.
   - The inline Undo case (muted, role=status, "Undo" stays) rides with d-v2-02.
   - `journal.ts:498` keeps its storage-failure sentence.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

| Situation | What shows |
| --- | --- |
| Undo of a change whose create never left the device | As today: Undo succeeds. |
| Undo of a change whose create landed but its answer was lost | Undo succeeds, and the file Bower made goes to the Bin. No new sentence. |
| Undo from a dock message, of a change whose create may or may not have landed, with Drive not answering | The same dock message is replaced in place: "Not undone yet: Bower could not reach Drive to check. Try again when you are back online.", not in --danger, with the action "Try again" that runs the same Undo. It uses the 8 s timer that pauses on hover or focus, and focus stays on the action. No second message. The change stays in "your changes". |
| The same case from an inline Undo | Rides with d-v2-02 (not this entry). |

Copy ruled in TL-P4-24 addendum 1. The designer signs off this table before dispatch.

## Red (class test, from the note)

`a withdrawn intended create never leaves a live file`. It is one table-driven suite over the Holder keepers (journal outbox line, Sending, Intended, upload record), running every create outcome against every withdrawal (`removeRule`/`restore`, `removePile`, `trash`), with a memoised listing. It expects the reserved id to be 404 or trashed, or the holder to be kept. It fails today for "landed, answer lost".

## Verify

The red; `a dock undo that cannot reach Drive is replaced in place with try again` (e2e, fake, phone and desktop, with axe); `pnpm check`; the goldens.

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
