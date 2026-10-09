# 2026-10-09 pile-note-lost-create-moved

Diagnoser note (TL-P4-15, step 2). Read-only, on claude/p3 baaa781b. The checkout moved to a2b94020 during the read, and
`git diff baaa781b a2b94020 -- src/data` is empty. Source: DEFECT_LOG's last line; the Codex review "Round 4 pass" item 2;
TL-P4-24 addendum 9 (2).

## What failed

**Reproduced** with FakeDrive. This was a scratch vitest file outside the repo; it reused `lostPileNote` from
drive-vault.test.ts:3016-3036 and was not committed. The create of `Pile note.md` lands, then its answer and its read-back
by id are both lost. The person changes the note in Drive. Then `updatePile(pile, 'Job offer, signed papers')` is called:

| Change in Drive | Retry says | The note afterwards | Pile |
| --- | --- | --- | --- |
| moved into Projects | saved | in Projects, **with the new words** (the first words are gone) | no note, text "" |
| renamed `Ideas.md` in the pile | saved | `Ideas.md`, **with the new words** | no `Pile note.md`, text "" |

The trace runs through drive-vault.ts. The note is not listed, so the code reaches the `else if (text && folderId)` branch.
At :1121, `there = byId(kept)` reads the file wherever it is now. :1122 only checks whether it is in the Bin. :1130 checks
only the checksum (`confirms` against the words sent), and the bytes are still the first words, so it passes. Then
`intended.make` with the kept id calls `this.once(there, {text})` (:1141). `once` builds its `seen` from `there`
(:1752, `seenPlace(f)`), so the fence compares the fresh read with itself, passes, and `writeText` overwrites the moved note.

## Why (5 whys)

1. The note was overwritten in Projects because `once` was fenced on `there`, and `there` already reflected the person's move.
2. `there` was adopted because the only tests applied to it are "not in the Bin" (:1122) and "holds words Bower sent"
   (:1130). Its name and parent are never compared with the create's intended place (`folderId`, `PILE_NOTE`, :1138).
3. Those two checks are a hand-written "did my create land". In write-once, a create counts as landed when *a file with
   that id exists*: `makeFolder` and `makeText` find it with `byId(reads, id)`, which includes the Bin (write-once.ts:145,
   :149), and `makeText` adds a checksum through `confirmed`. Creates have no `expectedAfter`, while every update does
   (write-once.ts:90-104, :112).
4. Addenda 7 and 8 defined "landed" (stamp, checksum and `notAsSeen(expectedAfter)`) only for writes to existing files.
   The addendum 8 inventory searched for `holds|confirms|landedAs|stampOf` (app-fence notes :170). It listed :1130 as
   "landing by its reserved id (createById, case 1)" and so did not check that case's own definition.
5. **Design cause:** for creates, write-once can only answer "did it happen" (the id exists, wherever it is). It cannot
   answer "did it land as intended" (in its place, under its name, out of the Bin, with its bytes). So every caller
   that *goes on* to write, move or report a path after recovering a create takes the place from the fresh read instead of
   from the create's intent. Addendum 9 names `happened` and `landed`, but at this commit write-once has no `happened`
   (c4-reconcile-guard is not merged yet; verified with `git grep`).

**Should the retry write to a note the person moved out of its pile?** No. Addendum 7's property says "never writes over
a file that changed", and a different place or name is a change (AGENTS: a move checks the name and place it read).

## Owner mechanism

Write-once (`src/data/spine/write-once.ts`), case 1 (`createById`, `makeFolder`, `makeText`): what a recovered create
means. The comparison itself is still-as-seen's `notAsSeen` (`contracts/still-as-seen.ts:52`), used as it is.

## Same class elsewhere (a recovered create adopted wherever it is now, then acted on)

1. drive-vault.ts:1098-1100, the pile folder. **Reproduced.** Its create is lost twice, then the person moves the empty
   folder into Projects. The retry gets a 409 and finds the folder by id. `once(f, move:folder)` then moves the person's
   thing into `Projects/<pile>/`, and the call answers "That pile is already filed." If the folder was put in the Bin
   instead, the retry fails with "That isn't in your Bower folder any more." (also reproduced).
2. drive-vault.ts:367-373, `create`. **Reproduced.** The note is moved to Projects, and the retry still returns
   `Resources/Cooking/Untitled.md` and records "New note "Untitled" in Resources / Cooking", a path where no file exists.
3. drive-vault.ts:1542, plus :1550 for a link or an empty thing kept on `Sending`. A found link is put in the pile's index
   or binned through a fence on the fresh read. Code-read; effect **unverified**.
4. journal.ts:404, a change line kept on its outbox line. If found outside `.bower/changes`, it still goes into `filesOf`.
   Code-read; low impact.
5. The root of all of them: write-once.ts:145 and :149 (`find = byId`, which includes the Bin). Callers with no kept id
   (drive-vault.ts:926, :952, :973, :980, :1841; barrier.ts:192, :199; records.ts:167, :180, :290-292) are exposed
   only between their send and their read-back.

Not in the class, by ruling: engine.ts:569-574 (TL-P4-05, "what the person did with it since is kept") and
resumable-upload.ts:62-70 (an upload "still arrived"). Both are "happened" answers that are never written over with a
fresh expectation. The model to follow: drive-vault.ts:1697-1714 `reservedFile`, which compares the place with the
intended `item.parentId` using `notAsSeen`.

## Options

Standard: a precondition must come from what the client meant or last knew, never from a read taken just before the write
(RFC 9110 §13.1.1, If-Match; W3C "Detecting the lost update problem", https://www.w3.org/1999/04/Editing/). An
idempotency key that finds a different state is refused, not reinterpreted (Stripe, idempotent requests, "errors if
parameters differ"; cited from memory, **not re-fetched**).

**(a) Fix in the owner.** `expectedAfter` gains the create intent, built from the `Place` (`{id, name, parents: [parent],
trashed: false}`). `landedAs` then covers case 1 with the checksum for text, and there is still one definition.
`makeFolder` and `makeText` recover through it. A file found by id but not as intended throws `notAsSeenError(reason)`,
and the holder lets the id go. This needs care: today a `conflict` is "unsettled" and keeps the id (write-once.ts:35,
:183), so the refusal needs its own marker, or the id stays stuck forever. updatePile :1121-1135 drops its hand checks and
calls `landedAs(place, {text: w})` for each word sent. Lead's call: whether a Bin found here keeps today's "make a new
note" (:1122, tested at drive-vault.test.ts:3052) or refuses like a move. Size M: about 40 lines plus reds for sites 1-2.
Risk: medium. The barrier and records system creates go from accepting a moved system file to refusing it (runner-side
effect **unverified**). The sentence is the existing conflict one, but the designer should confirm it fits a moved note.

**(b) Refactor, then fix.** First do addendum 9's naming for both cases. write-once exports `happened` (the id exists, or
the stamp is this op's) and `landed` (`happened` plus `expectedAfter`). `createById` returns three outcomes: landed,
happened elsewhere, or none. engine.ts:569 and resumable-upload.ts:66 state `happened`, as their rulings say; the app
callers (sites 1-4 and the pile note) state `landed`. Then (a). It also merges with c4-reconcile-guard's naming (it does
not exist yet). Size M-L: about 80 lines across write-once, engine, upload, and drive-vault. Risk: low to medium. It is
the cleaner home, but escalated, because it touches runner recovery.

**(c) New mechanism:** none. Write-once and still-as-seen exist. Rejected: a place check written only at :1130
(`notAsSeen(there, folderId)`). That would be a second landed definition at a call site, against addendum 8.

## Regression test (the class)

Extend the property at drive-vault.test.ts:3668 ("every app write, its answer lost...") with the reserved-id creates:
`create` note and folder, the pile folder, the pile note (same words and new words), and a link. For each, lose the
answer and the read-back, apply each change (none, move, rename or Bin) at each moment, then retry. Invariant: success
only when the file is at its intended name and parent, out of the Bin, with its bytes. Nothing is ever written to or moved
into a file whose place differs from the intent, and no path is reported where no file is. Widen the addendum 8 inventory
search to `createById|makeFolder|makeText|makeOnce`.
