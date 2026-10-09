# Codex review of c4-undo-withdraw (TL-P4-23 ruling 6)

Range baaa781b..1ed9097f (worktree /private/tmp/bower-c4-undo), read-only, medium effort.

1. **Important — `src/data/vault/journal.ts:506`: Undo can succeed while another tab’s create stays live.** Tab B holds the outbox lock but has not yet reserved an id for a bare waiting line. Tab A starts Undo, captures that line without an id, and waits. B then reserves, creates successfully, and drops the line. A acquires the lock, finds no line, and calls `withdraw` with an empty holder. With A’s memoised listing still empty, Undo resolves without binning B’s file. **Violated home:** journal `acrossTabs` coordination and write-once’s reserved-id withdrawal. The added two-tab test starts with an already reserved id and misses this case.

2. **Important — `src/data/vault/drive-vault.ts:1706`: Sending is withdrawn before its active create settles.** Add a declared lone link and delay its create before it lands. Remove the pile while the request remains pending: the reserved-id read returns 404, so `withdraw` deletes the id and removal succeeds. The delayed create then lands, but its answer and read-back are lost. `sendAll` catches the failure; its late-file Bin path requires a confirmed result and never runs. The file remains live, and its Sending holder has lost the reserved id and been detached from `uploads`. **Violated home:** write-once’s Holder withdrawal must retain the id while the create outcome is unknown. Unlike queued uploads, this Sending path does not wait for the send to settle.

findings: 2
