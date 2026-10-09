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
