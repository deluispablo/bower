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

## Fix round 3 (addendum 7)

red: 0edf5b3f (tests, fast-check 4.10.2 devDependency, lockfile); fix: f0409898. Sources: the Codex delta pass
(2 Important), round-3 packet `2026-10-09-c4-app-fence-round3-packet.md`.

tests changed: src/data/vault/drive-vault.test.ts: added the two reds and the fast-check property (seed 20261009,
500 runs, asserts all 88 cases met); the fix commit raised the property's runs from 120 and added the coverage check.
tests changed: src/data/vault/drive-vault.test.ts: 'a restore under a free name whose rename answer was lost is
resolved by its stamp' (c2) loses the untrash with a name: the free name now goes in that one write.
tests changed: src/data/vault/drive-vault.test.ts: 'a restore whose rename landed but lost its answer resolves on the
second press': the same, with `loseWithRead('untrash')`; its assertions are unchanged.
tests changed: src/data/vault/drive-vault.test.ts: 'restore rename (467)': no gap is left between unbin and rename,
so the outside rename happens in the Bin before the press; still refused, the name kept, the file left in the Bin.
tests changed: runner/test/drive-v3-real.ts: the replayed Drive v3 fixture's untrash applies the body's `name` and
`appProperties`, as Drive's files.update does; it dropped both before.

- Red today: restore after an outside Bin reports success while binned (Codex delta 1); an emptied pile note that
  landed then moved is accepted on retry (Codex delta 2); the property's first counterexample is a landed text write
  accepted after an outside Bin (`["text","bin","before the retry","its answer"]`).
- Landed (contract 1-3): `checkStillAsSeen(seen, read, message, { unanswered, landed: { intent, stamped } })`.
  Landed holds when `stamped(now)` (write-once `holds`) and `notAsSeen(expectedAfter(seen, intent), now) === null`.
  `expectedAfter` is private to the helper, built once from the intent, with no modifiedTime. Call sites pass
  `landing(f, intent)` from write-once and never state an after-state. `landedAs` is gone.
- The pile edit's note fence takes the edit's own intent: its words, a declared pile's empty note, or the Bin. A landed
  Bin is no longer accepted for an edit with words. `declared` is now read before that fence; it was read after it.
- No cached state (contract 4): restore takes the file out of the Bin under the chosen free name in one write,
  `untrash(id, op, name)` (Drive files.update with `trashed: false` and `name`). The intent is `unbin`, or
  `unbin:<name>`. Each press fences that write on a fresh read. `gone.back` keeps only the chosen name. After an outside
  Bin with the name unchanged, the file is again as read, so the retry takes it out again. Renamed, it is refused.
- One async signature (contract 5): no overloads, no `instanceof Promise`. `SeenFiles.assert` stays synchronous,
  because FakeDrive's `fenced` check runs in the very step of the change (nothing awaited, which keeps the run's
  authority and fence atomic). It decides with `notAsSeen` and `notAsSeenError`, the comparator the helper uses, and
  has no landed case. It does not call a second fence helper; `checkStillAsSeen` lost its unused `what` option.

| Area | Round 2 | Round 3 |
| --- | --- | --- |
| Landed test | stamp (+ name and place for a rename) | stamp and checksum, plus the full after-state from the intent |
| Restore under a free name | untrash, then a rename (two writes, two stamps) | one untrash with the name (one write, one stamp) |
| Restore retried after an outside Bin | success while binned | taken out again (as read), or refused if renamed |
| Stamps already stored | - | `unbin`, `bin`, `rename:`, `move:`, text are unchanged; `unbin:<name>` is new |
| Drive calls | - | a restore under a free name sends one PATCH, not two |
| DriveApi | - | `untrash(id, appProperties?, name?)`: the name is optional, every caller compiles unchanged |

## Fix round 4 (addendum 8)

red: a6c39106 (tests only); fix: a0d246ef. Sources: the Codex "Round 3 pass" (1 Important, `write-once.ts:85`/`:98`),
round-4 packet `2026-10-09-c4-app-fence-round4-packet.md`.

tests changed: src/data/vault/drive-vault.test.ts: `loseWithRead` takes an optional `meanwhile` (a change elsewhere run
before the recovery read, which then answers); every existing caller passes none and behaves as before.
tests changed: src/data/vault/drive-vault.test.ts: the property gains the timing "before the recovery read"; a first
press that is done (its lost answer found by that read) ends the case, since there is nothing to retry; all 132 cases
must be met (was 88); the fix commit raised its runs from 500 to 1200 so the seed meets all 132. Same seed 20261009.
tests changed: src/data/drive/drive-http.test.ts: added the guard 'untrash puts the name in the patch body' (passes
before the fix: `untrash` already sends `name`).

- Red today: a restore under a free name renamed elsewhere, and an emptied pile note moved into Projects elsewhere,
  both between the lost answer and the recovery read, resolve as landed. The property's counterexample before the fix
  is `["text","rename","before the recovery read","its answer"]`.
- One definition (contract 1): `landedAs(f, intent, now)` in `spine/write-once.ts`: the stamp and, for text, the
  checksum (private `stamped`), and `notAsSeen(expectedAfter(f, intent), now) === null` (`expectedAfter` moved here
  from still-as-seen, built from the intent, modifiedTime left out). `landing(f, intent)` is it as the fence's
  `Landing<T> = (now) => boolean`; `checkStillAsSeen` only calls it. `updateByStamp`'s recovery calls `landedAs`.
  `holds` is gone; its Bin and unbin checks are now `expectedAfter`'s trashed state.
- The app's `once`, when the recovery read finds the file changed or gone, now throws the fence's typed refusal
  (`notAsSeenError(reason, CHANGED_ELSEWHERE)`): same code and sentence, now with its reason, so a later press is a
  new read (the property needed it: the refresh had dropped a renamed note from its pile, and the retry was not one).
- Minor `seen-files.ts`: `SeenFiles.assert` ends with `refuseNotAsSeen`, the tail `checkStillAsSeen` ends with (log,
  then `notAsSeenError`); synchronous, no second fence. Minor `pure-rand` 8.4.2: published 2026-07-10, older than
  two weeks; no override.

### Site list (`git grep -n -E 'holds|confirms|landedAs|stampOf'` in src, runner/src, api/src)

Code sites:

- `src/data/spine/write-once.ts`: `:112 landedAs` is the definition; `:81 stamped` is its private stamp part; `:115
  landing` and `:125` (updateByStamp's recovery) call it. `:26 stampOf`, `:74 stampFor` derive a key; `:29 confirms`
  compares bytes; `:252 confirmed` checks the answer to the write just sent (or a recovery `landedAs` accepted), not a
  lost answer.
- `src/data/vault/drive-vault.ts:11` imports; `:1071`, `:1085`, `:1753` pass `landing(...)`; `:1757` updateByStamp.
  `:1130 confirms`: whether a pile note this page created holds words it sent, so it is Bower's to write over; that
  create's landing is by its reserved id (createById, case 1), and the write after it goes through `once`.
- `src/data/vault/journal.ts:508-509`: `landing(file, 'bin')` and updateByStamp: call the definition.
- `src/data/spine/barrier.ts:193`, `src/data/fake/fake-worker.ts:337`, `runner/src/rules-repair.ts:56-57`,
  `runner/src/spine/retention.ts:133,142`: updateByStamp, so their recovery calls `landedAs` (no runner red needed).
- `src/data/spine/engine.ts:425 stampSays` (run read-back, `reconcile`): decides a run operation landed by the run's
  own stamp (or that of an operation that waits on it), and records what Drive stores now as its evidence: TL-P4-05
  addendum ("what the person changed since is kept"); a later operation of the same run legitimately renames or moves
  it. Not changed here: requiring the after-state would contradict that ruling and resend or misreport a run's own
  chain. For the lead. `:546 confirms` and `:593 stampOf`: the direct answer's check (`answered`, full state via
  `shows`/`inPlace`) and the stamp sent.
- Ruled (TL-P4-24 addenda 9-10, c4-create-landed): `engine.ts:425 stampSays` asks write-once's `happened`, not `landed`.
- `src/data/spine/grounded.ts:17,129 stampOf`: the stamp a report row must name (plan validation); `:137,154 holds`:
  a runner JSON's shape. `src/data/spine/scripted.ts:39,1682 stampOf`: the stamp a row records as the run leaves
  the note. Not landed decisions.
- `src/data/spine/plan.ts:327,412 holds`: a subject in a file; `src/data/contracts/note-edit.ts:696,781 holds`: a text
  change kept. Not landed decisions.
- Lease, not landed: `src/data/contracts/lease.ts:91`, `lease-cases.ts` (9), `src/data/fake/fake-lease.ts:9,71,73`,
  `src/data/fake/fake-worker.ts:137`, `api/src/person.ts:21,541,542`, `api/src/session-lease.ts:57,61,62`.

Prose only (comments, log lines, prompt text, CSS, README; the English verb, or a description of the above):
`drive-vault.ts` (rest of 21), `scripted.ts` (rest), `plan.ts` (rest), `api/src/person.ts` (rest),
`fake-run-service.ts`, `runner/src/status.ts`, `engine.ts` (rest), `runner/src/claude.ts`, `runner/src/main.ts`,
`session.ts`, `resumable-upload.ts`, `fake-drive.ts`, `pile-readiness.ts`, `drive-api.ts`, `still-as-seen.ts`,
`run-manifest.ts`, `questions.ts`, `prefs.ts`, `api/src/recovery.ts`, `person-schema.ts`, `Add.tsx`, `upload-queue.ts`,
`admission.ts`, `live/runs.ts`, `pretend.ts`, `drive-http.ts`, `scenario.ts`, `ui-store.ts`, `runner/src/token.ts`,
`runner/src/drive.ts`, `api/src/process.ts`, `ui.module.css`, `focus.ts`, `Field.tsx`, `Settings.tsx`, `item-words.ts`,
`Welcome.tsx`, `new-lines.ts`, `FolderScreen.tsx`, `worker-http.ts`, `worker-api.ts`, `vault/seen.ts`,
`upload-store.ts`, `report.ts`, `spine/read.ts`, `budget.ts`, `seen-files.ts`, `read-cache.ts`, `run-checkpoint.ts`,
`folder-template.ts`, `fixtures/p2/README.md`, `compat-p2-fixtures.ts`, `choose.ts`, `bird/presence.ts`,
`bird/engine.ts`, `tabs-store.ts`, `runner/src/spine/records.ts`, `admitted.ts`, `api/src/vault.ts`, `security.ts`,
`run-ticket.ts`.

| Area | Round 3 | Round 4 |
| --- | --- | --- |
| Landed, at the fence | stamp + checksum + after-state, in still-as-seen | the same, one definition in write-once (`landedAs`) |
| Landed, lost answer's own read | stamp + checksum + Bin state (`holds`) | `landedAs` |
| Changed before that read (app) | success | "This changed somewhere else", typed reason |
| Runner updateByStamp recovery | stamp alone | `landedAs`: name and place as read, Bin as intended |
| Stamps, Drive calls, strings | - | unchanged |
