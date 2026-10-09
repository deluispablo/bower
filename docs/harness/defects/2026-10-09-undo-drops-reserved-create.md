# 2026-10-09 undo-drops-reserved-create

Diagnoser note (TL-P4-15, step 2). Read-only, on claude/p3 3a073487. Source: Codex TL-P3-16 finding 3, DEFECT_LOG line 67.

## What failed

`Journal.removeNow` (src/data/vault/journal.ts:494-509) drops a waiting outbox line (journal.ts:497) and then bins only the
files it knows about: `filesOf` (set only after a confirmed send, journal.ts:406) or `list()`, which reads `place.files`.
In the app, `place.files` is the cached `VaultIndex` (drive-vault.ts:183, cached by `index()` at drive-vault.ts:1406-1424).
`removeNow` never reads `Waiting.reserved`, and it makes no get by id before it forgets that id.

What Undo does for a line with a reserved id, by state (verified in code; the third row is reproduced):

| State of the create | What Undo does | Result |
| --- | --- | --- |
| Unsent, or sent and did not land (429, full Drive, no answer) | drops the line; listing finds nothing | right by luck; id discarded unchecked |
| Sent, outcome unknown, **landed** (answer and read-back by id lost) | drops the line; `filesOf` empty; cached index lacks the file; resolves | **file stays in `.bower/changes/`** |
| Landed and confirmed | not in the outbox; `filesOf` has it; binned by `updateByStamp` (journal.ts:505) | right |
| Refused for good (4xx) | already out of the outbox (journal.ts:274, 379); nothing to bin | right |
| Being sent by another tab (`sendWaiting` under Web Lock, journal.ts:252, 333) | `remove` takes no cross-tab lock (journal.ts:489-491); drops the line mid-send | can land after Undo (code-read; **unverified**, jsdom has no `navigator.locks`) |

Reproduction: a scratch unit test, not committed, run under `harness/with-lock.sh`. It used FakeDrive, `createText` lands then throws
offline, the `get` after it throws offline once, `journal.list()` runs before `addRule`'s line, then `remove(rec.id)` resolves.
With a memoised `files` (like drive-vault) the file under the reserved id ends up `trashed=false`. With a fresh listing
it ends up `trashed=true`. The existing journal tests use a fresh listing (journal.test.ts:22), which hides the defect.
Consequence: after the next refresh, `rules()` lists the rule as pending again (drive-vault.ts:1286-1292). The tidy-up then words
it into Rules.md (spine/scripted.ts:465, 1987). The same holds for a "Removed the rule" line whose Undo is lost (drive-vault.ts:1319).

## Why (5 whys)

1. The rule stays in Drive because Undo binned only the files it knew, and the landed file was not one of them.
2. It was unknown because a lost answer never reaches `filesOf` or `place.wrote`, and drive-vault's listing is a cache built before the landing.
3. Undo trusts a listing because `removeNow` assumes a line is either sent (it has a file) or waiting (it has none).
   Reserved ids (c2-create-by-id, c3-reservation-home) added a third state: waiting, but perhaps landed.
4. That state is not handled because write-once's Holder port (write-once.ts:122-126) owns keeping, reserving and releasing
   on the create's own outcomes. `makeOnce` lets go only on a permanent refusal (write-once.ts:149, 164-167), but the port
   has no operation for "the person withdrew the intent". Each keeper forgets on its own: `drop` or `keep`, `Intended.forget`,
   `uploads.delete`, `queue.discard`.
5. **Design cause:** the rule "an id is let go only on Drive's word about it" is enforced only inside `makeOnce`.
   A withdrawal is a way out of the keeper that the mechanism does not own, so nothing requires a get by id first.

## Owner mechanism

Write-once (`src/data/spine/write-once.ts`), through its keeper port: the journal outbox line (`Waiting extends Holder`,
journal.ts:125). The fence and transport are not involved.

## Same class elsewhere (a holder of a reserved id dropped with no get by id)

1. journal.ts:489-491: `remove` runs outside `acrossTabs`, while `sendWaiting` runs inside it (journal.ts:252, 333, 337-342).
   It can drop a line that another tab is sending. Code-read; unverified.
2. drive-vault.ts:1016-1017, `removePile`: the `Sending` holders of `u` (links and empty things, reserved by
   `makeOnce(e, …)` at drive-vault.ts:1539) are dropped. Only queued uploads are looked up, by `haltQueued`
   (drive-vault.ts:1670-1688). For a lone pile (parent Inbox, drive-vault.ts:964-976), a link that landed but whose answer
   was lost stays in Inbox once its declaration is binned. Effect unverified.
3. drive-vault.ts:1556-1560: a pile is removed while a link's create is unsettled. Without `e.queued`, the error is only
   logged (`upload = -1`), and nothing looks up `e.reserved`.
4. drive-vault.ts:1694-1702 and 1717-1718: `reservedFile` returns null on any failure that is not a 404, then `endQueued`
   discards the record with its `fileId`. The comment accepts this ("it stays, where the person sees it"). It is also a
   second lookup by reserved id (`getUploaded` plus a size and SHA check) next to write-once's `byId`.

Models that do it right: drive-vault.ts:1117-1121 (pile note: `byId` before reuse), spine/engine.ts:565-572 (reconcile by
reserved id), `haltQueued` (the get-404 case).

## Options

**(a) Fix in the owner.** Add one exit to the Holder port in write-once.ts, e.g. `withdraw(h, reads)`. With `h.reserved`,
it reads `byId`. A 404 lets the id go (`letGo`). Found means it returns the file, which the caller bins with the existing
`updateByStamp(…, 'bin')`. An unknown read throws, and the holder keeps its id. `removeNow` runs under `acrossTabs` and calls
`withdraw` before it drops the line. If the result is unknown, the line stays and the existing sentence is thrown (journal.ts:499).
Size S: about 30 lines and 3 tests. Risk low. UI change: Undo of a waiting line while offline is now refused instead of
silently succeeding, so the designer must be consulted on the copy. No second way: it reuses `byId` and `updateByStamp`.

**(b) Refactor, then fix.** Make "withdrawn" a state of the outbox line, the keeper. `removeNow` marks the line under the
lock and never calls Drive; `sendWaiting` settles withdrawn lines with the same `withdraw` from (a), never creating them.
`list()` and `rules()` hide them, and the tidy-up's required flush (live/runs.ts:116) waits until they settle.
Then move drive-vault `Sending` (items 2-3) and `reservedFile` (item 4) onto `withdraw`, so one exit serves every keeper.
Size M: about 120 lines, the outbox shape (old lines stay readable in `isWaiting`), and drive-vault removal paths. Risk
medium: until this device is back online, another device or a run sees the landed line. Whether any tidy-up can start
without this device's flush is **unverified**.

**(c) New mechanism.** Not applicable. Write-once and its Holder port are the home; a separate "undo ledger" would be a second way.

## Class regression test

One table-driven unit suite over the keepers of the Holder port: the journal outbox line, drive-vault `Sending`, `Intended`,
and the upload record. It runs every create outcome (unsent; landed with answer and read-back lost; landed and confirmed;
refused 4xx) against every withdrawal (`journal.remove` through `removeRule` or `restore`, `removePile`, `trash`).
It always uses a **memoised listing**, like drive-vault. Invariant: once a withdrawal resolves, `get(reserved, {binned:true})`
is a 404 or `trashed`. When that cannot be known, the withdrawal rejects and the holder still has its id. Add a two-Journal
case on one localStorage with a stub `navigator.locks` for item 1.
