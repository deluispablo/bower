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
