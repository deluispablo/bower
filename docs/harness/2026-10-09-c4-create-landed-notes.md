# c4-create-landed notes (TL-P4-24 addendum 10)

Worktree `/private/tmp/bower-c4-create`, branch `c4-create-landed` from `claude/p3` `b2b815a8`. Commits: `f0511826` red
(tests only), `fe7a2161` fix, then these notes. Diagnosis: `docs/harness/defects/2026-10-09-pile-note-lost-create-moved.md`,
option (b) with c4-reconcile-guard folded in.

## What changed

1. **Two questions, two names, one home** (`src/data/spine/write-once.ts`). `happened(key, now)`: the reserved id is
   there (case 1) or the stamp is this write's (case 2). `landed(key, intended, now, texts?)`: happened, plus
   `notAsSeen(intended)` with modifiedTime left out, plus the checksum of a text sent. `landedAs` (case 2) is now
   `landed` with `expectedAfter`; creates use `landed` with `createdAs` (the name and place the create was sent with,
   trashed false), built only inside write-once. No call site builds an expectation.
2. **App creates recover through `landed`.** `makeFolder` and `makeText` read a lost create back by its id
   (`makeAs`). If it is found but not as made, it is refused with `notAsSeenError(reason, CHANGED_ELSEWHERE)`. A
   different text counts as `modified`. `madeAt` is the same check for a kept id read before the send (the pile note).
3. **The refusal lets the id go.** `releases` lets go on a not-as-seen refusal. The transport's table
   (`failureKind`) makes that refusal `permanent`, by its typed marker and never by its words. So a journal line is
   refused and kept among what failed, and is never made again under a new id.
4. **The runner's reconcile and the upload ask `happened`.** `stampSays` takes the file and matches stamps through
   `happened`. A create's reconcile asks `happened({id})`. `resumable-upload.ts` `check` asks `happened({id})`. None
   of their behaviour changes.
5. **updatePile's pile note** drops its hand checks (Bin, then checksum, then adopt wherever it is). Inside
   `intended.make`, a kept id is read with `madeAt(..., sent)`. If it landed with words Bower sent, the new words go
   in through `once`. A refusal lets the id go, clears `pileNoteSent`, and refreshes.

## Inventory: each create site and which question it asks

Search: `git grep -n "createById\|makeFolder\|makeText\|makeOnce\|madeAt\|happened("` (addendum 8's search, widened).

| Site | Asks | Why |
| --- | --- | --- |
| `drive-vault.ts:1098` pile folder (`intended.make` + `makeFolder`) | `landed` | an app create; a folder moved elsewhere is refused, so the lone thing is never moved into it |
| `drive-vault.ts:369` `create` note or folder | `landed` | an app create; the path it reports and records must be where the file is |
| `drive-vault.ts:1540` link or empty thing (`makeOnce` + `makeText`) | `landed` | an app create; a found link moved elsewhere is refused (upload -1), never filed or binned |
| `drive-vault.ts:1130-1131` pile note (`madeAt`, then `makeText`) | `landed` | the reproduced case: never written over in a place the person moved it to |
| `journal.ts:404` change line (`makeOnce` + `makeText`) | `landed` | a line found outside the changes folder is refused (permanent) and kept among what failed |
| `write-once.ts:205,209` `makeFolder`/`makeText` (were :145/:149) | `landed` | the root of the class: `makeAs` checks a found create with `asMade` |
| `write-once.ts:58` `createById` | neither | the rule only (send, else find by id); each caller's find asks its own question |
| `engine.ts:575` reconcile of a create | `happened` | TL-P4-05: what the person did with it since is kept; making or sending again would undo it |
| `engine.ts:426` `stampSays` (reconcile of an update) | `happened` | the same; an app edit carries a foreign stamp, so it is never counted |
| `resumable-upload.ts:68` `check` | `happened` | an upload "still arrived" when it was filed or moved since; the size and SHA-256 are its own bytes check |
| `drive-vault.ts:926, 952, 973, 980, 1842`; `barrier.ts:192, 199`; `records.ts:167, 180, 290-292` | `landed` (through `makeText`/`makeFolder`) | no kept id: exposed only between the send and its read-back, where a moved file is now refused |

`drive-vault.ts` `reservedFile` (:1697) is not a landed decision: it decides only whether to bin an upload, by its place.

## Verify

- Reds (`f0511826`, failing on assertions before the fix, logs `/tmp/c4-create-red.log`, `/tmp/c4-create-red2.log`,
  `/tmp/c4-create-j0.log`):
  - `a pile note whose create landed and then moved is refused on retry and not written in its new place`: got
    `{ reason: null, message: undefined }` (saved);
  - `a pile folder whose create landed and then moved is refused on retry`: got reason null;
  - `a change line whose create landed and then moved is refused, never made again, and stays where it was put`:
    got no failed line;
  - `every app create, its answer lost, against a move, rename or Bin elsewhere: success only as it was made`
    (seed 20261009, 800 runs, 72 cases: 6 creates x 4 changes x 3 timings): counterexample
    `["note","rename","before the recovery read"]`.
- The guard: `after a lost answer and an outside move the run reports applied and sends nothing` (engine.test.ts, a run
  move and a run create) passes before and after the fix, as addendum 9 expected.
- For a create, the timing "before the write" has no file yet, so the change finds nothing. The property then expects
  the retry to be done.

## tests changed

- tests changed: src/data/vault/drive-vault.test.ts: `a pile note retried after a double failure never overwrites an
  edit made between tries` now expects CHANGED_ELSEWHERE in place of the old conflict sentence, because the hand
  checksum check went into `landed` (addendum 10: "the existing CHANGED_ELSEWHERE sentence"). The note and its words
  are unchanged.
- tests changed: src/data/vault/drive-vault.test.ts: `a pile note binned elsewhere after a double failure is made again
  with the new words` keeps its title, because c2-create-by-id's verify names it. Its body changes: addendum 10 rules
  that a create binned elsewhere is refused. The retry is refused (reason `gone`) and makes nothing, then the next
  press makes the new note with the new words. The lead may retitle it in features.json.
- tests changed: src/data/vault/drive-vault.test.ts: new describe `c4-create-landed` (3 reds and the create property).
- tests changed: src/data/spine/engine.test.ts: new describe `c4-create-landed` (the reconcile guard). No existing test
  changed.

## Compatibility rows

None. No commit touches `src/features/**` or `src/data/contracts/**`, and no stored format, route or string changes.
CHANGED_ELSEWHERE is an existing sentence.

## Left out

- The runner goldens (C04 78, 25-runs 88) pass unchanged in `pnpm check` (`runner/test/drive-calls-golden.test.ts`).
- Designer: no new copy (CHANGED_ELSEWHERE exists). A refused link shows the existing "failed" mark with Try again.
