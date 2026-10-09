# c4-app-fence implementation notes

implementer: claude (bower-escalated)
red: 992f9458 (tests only)
fix: c9c9bf11

tests changed: src/data/vault/drive-vault.test.ts: added the c4-app-fence describe block and two imports
(`notAsSeenReason`, `notRead`; `type DriveFile`); no existing test was edited or removed.
tests changed: src/data/vault/drive-vault.test.ts:2855 "Home Drive calls match the golden": not edited. A Home
load sends no write, so the Bin's extra `get` cannot reach it; it stays green as it was.

## What changed

- `src/data/contracts/still-as-seen.ts`: the one helper `checkStillAsSeen(seen, read, message, opts)`. It takes
  the reader (contracts stays pure), resolves the stored file when it already `holds` the write (`opts.landed`),
  null when still as seen, and throws `notAsSeenError` or `notReadError` (a read with no answer, by the caller's
  `unanswered` test, the transport's `isNoAnswer`). Its two steps, `readForFence` and `refuseUnlessAsSeen`, are
  exported so `SeenFiles` calls them: its fenced step on FakeDrive is synchronous and must stay one step.
  `SeenExpectation` gains `trashed?` (default false); `notAsSeen` says `gone` when missing or when the Bin state
  differs from the expectation.
- `src/data/drive/seen-files.ts`: `assert` keeps its map, folder case and never-read refusal, and refuses through
  `refuseUnlessAsSeen` (same log line, `target|parent|destination <id>`); `read` is `readForFence(.., isNoAnswer)`.
- `src/data/vault/drive-vault.ts`: `once` fences every send, Bin and unbin included (unbin expects `trashed: true`),
  through `fence` (byId, never `get`). Text writes add the modifiedTime read. A second press after a lost answer
  resolves as landed and sends nothing. `stillAsSeen` now calls `fence`; its explicit calls in `move` and `rename`
  are dropped since `once` fences them. The pile note hand check (was :1078, modifiedTime only) is the same fence
  with name, place and modifiedTime. `reservedFile` (was :1708) decides "still where it was sent" with `notAsSeen`.
  The lost-answer classification reuses the same expectation with the real Bin state.
- `src/data/vault/journal.ts`: `removeNow` (Undo) fences each record file with `checkStillAsSeen` before its Bin,
  and resolves as landed when the file already holds that Bin.

## Class sites

| Site (base line) | Now |
| --- | --- |
| trash note 429, pile 400, removePile 1024 | `once` fence (rows in the table) |
| declaration copies 703, 1089 | `once` fence (rows) |
| pile note 1078/1112 | `fence` with name, place, modifiedTime, then `once` (rows) |
| held.made 404/1030, reservedFile 1708 | `notAsSeen` place check, then `once` fence on the Bin |
| unbin 453/465/466 | `once` fence expecting `trashed: true` (row, `unbin expects the file in the Bin`) |
| restore rename 467 | `once` fence on the untrash answer |
| late upload 1544, half pile 983 | `once` fence on the create's answer |
| journal Undo 505 | `checkStillAsSeen` (row) |
| move 326, rename 347 | `once` fence (controls, green before and after) |

## Compatibility

| Area | Before | After |
| --- | --- | --- |
| Drive calls per app write | move/rename: 1 get + send | 1 byId + send (same count) |
| Drive calls per Bin/unbin | send only | 1 byId + send (accepted, TL-P4-24 addendum 4) |
| Pile edit with a note | 1 get (note) + sends | 1 byId (note) + 1 byId per send |
| Refusal sentence | 'This changed somewhere else. Look again and try once more.' | unchanged |
| Runner fence log line | `Refused a write to <part> <id>: <reason>` | unchanged |
| Stored formats | none touched | none touched |
| Runner goldens (C04 78, 25-runs 88) | green | green (runner path unchanged) |

## Sources

- Drive v3 trash and restore with `files.update` `trashed`, and `files.get` returning `trashed` for a file in the Bin:
  https://developers.google.com/workspace/drive/api/guides/delete
- Drive v3 single parent (parents compared as a set): https://developers.google.com/workspace/drive/api/guides/ref-single-parent
- AGENTS hard rules: every content write passes the modifiedTime it read; a move or rename checks `stillAsSeen`;
  Drive Bin only.

## Gates

- `pnpm check`: /tmp/c4-fence-check.log
- e2e fake, phone and desktop, qa9, qa10, capabilities, capabilities-b: /tmp/c4-fence-e2e.log

## Fix round (addendum 6)

red: 76f37dfc (tests only); fix: b829a69a. Source: docs/harness/2026-10-09-codex-c4-app-fence-review.md (3 Important).

tests changed: src/data/vault/drive-vault.test.ts: added round-2 reds (restore rename, updatePile folder rename,
clearing words: note Bin and declared empty note, journal Undo lost answer) and gap rows 404/1030/1708, 467, 1544;
no existing test was edited or removed.

- Red today: the restore rename, the updatePile folder rename, and both clearing-words cells (refused as changed).
- Green before the fix (round 1 already fenced them): held upload 404/1030/1708 (stays where filed), restore rename
  467 refused after a rename elsewhere, late upload 1544 left where filed, journal Undo lost answer (no resend).
- `checkStillAsSeen` asks `landed` before `notAsSeen`. It answers synchronously when its reader does, so
  `SeenFiles.assert` calls it inside FakeDrive's one-step fence. `refuseUnlessAsSeen` is gone. `SeenFiles.read` still
  calls `readForFence`, the helper's read step: it also guards the attempt read, which is no file check.
- `landedAs(f, intent)` is every app fence's landed test: `holds`, plus name and place for a rename.
- Restore keeps the file it took out of the Bin and the free name it chose (`gone.back`). A second press renames
  that file, and `once` recognises the landed rename by its stamp.
- The updatePile folder precheck accepts its own landed rename (the name it computes) or move (the kept folder id).
  The note precheck accepts its own landed text (empty included) or Bin.
- `CHANGED_ELSEWHERE` lives in contracts/still-as-seen.ts and is shared by DriveVault and the Journal; the Journal
  cannot import DriveVault (cycle).

| Area | Round 1 | Round 2 |
| --- | --- | --- |
| Retry after a landed restore rename, pile rename, cleared words | refused as changed elsewhere | resolves as landed |
| Drive calls | unchanged | unchanged (the prechecks read once, as before) |
| Stored formats, strings | none | none |
