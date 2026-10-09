# Codex review of c4-undo-withdraw (TL-P4-23 ruling 6)

Range baaa781b..1ed9097f (worktree /private/tmp/bower-c4-undo), read-only, medium effort.

1. **Important — `src/data/vault/journal.ts:506`: Undo can succeed while another tab’s create stays live.** Tab B holds the outbox lock but has not yet reserved an id for a bare waiting line. Tab A starts Undo, captures that line without an id, and waits. B then reserves, creates successfully, and drops the line. A acquires the lock, finds no line, and calls `withdraw` with an empty holder. With A’s memoised listing still empty, Undo resolves without binning B’s file. **Violated home:** journal `acrossTabs` coordination and write-once’s reserved-id withdrawal. The added two-tab test starts with an already reserved id and misses this case.

2. **Important — `src/data/vault/drive-vault.ts:1706`: Sending is withdrawn before its active create settles.** Add a declared lone link and delay its create before it lands. Remove the pile while the request remains pending: the reserved-id read returns 404, so `withdraw` deletes the id and removal succeeds. The delayed create then lands, but its answer and read-back are lost. `sendAll` catches the failure; its late-file Bin path requires a confirmed result and never runs. The file remains live, and its Sending holder has lost the reserved id and been detached from `uploads`. **Violated home:** write-once’s Holder withdrawal must retain the id while the create outcome is unknown. Unlike queued uploads, this Sending path does not wait for the send to settle.

findings: 2

## Round 2 pass (66f295ba..6f7c7310)

The prior Sending race is fixed. The journal now reads under its lock, but the new sent-id store leaves three ways for the prior false-success failure to recur. No second withdraw path was added.

1. **Important — `src/data/vault/journal.ts:184`: eviction can make Undo succeed while the file stays live.** Tab A lists a bare waiting rule against an empty memoised listing, then presses Undo while tab B holds the outbox lock. B confirms 21 waiting creates; `slice(-20)` discards the first rule’s file id before dropping its line. A acquires the lock, finds neither line nor sent record, withdraws `{}`, and resolves against its empty listing. The rule’s file remains live. **Violated home:** journal’s locked confirmed-record handoff to write-once `withdraw` (round-2 contract 1).

2. **Important — `src/data/vault/journal.ts:188`: failure to persist the id is swallowed before the line drops.** In the same two-tab scenario with one rule, storing `bower:sent-lines` fails, for example because storage is full. `keepSent` logs and returns; `sendWaiting` removes the outbox entry, whose storage removal can succeed despite the quota failure. A’s Undo then finds no id and succeeds against its stale empty listing, leaving the created file live. **Violated home:** journal’s confirmed-record handoff and write-once’s reserved-id withdrawal; unknown must refuse Undo.

3. **Important — `src/data/vault/journal.ts:184`: different outbox locks do not protect the shared sent-lines key.** Tabs sending for folders X and Y hold different locks. Both read the shared map; X writes its confirmed record, then Y writes its previously read map plus Y’s record, overwriting X’s record. Both subsequently drop their outbox lines. An Undo in another X tab with a memoised empty listing finds neither line nor record and reports success while X’s file stays live. **Violated home:** journal `acrossTabs` coordination must protect the state used to hand confirmed ids to write-once `withdraw`.

findings: 3
