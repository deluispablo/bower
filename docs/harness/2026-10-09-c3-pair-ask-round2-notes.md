# c3-pair-ask round 2 notes (answered row, TL-P4-19 addendum 10)

- Red: `c29a2862` (tests only). Fix: `26ff7d54`. Compatibility rows: `3f1657a8`.
- Worker: started by one session (stopped for a restart with the fix uncommitted and green), finished by a fresh one,
  which read the diff against the packet, committed it unchanged, and ran the gates below.

## What changed

- `src/data/contracts/questions.ts` is the subject home and the one entry point for the row: type `AnsweredRow`,
  writer `answeredGone(question, inbox, notes, at)`, validator `isAnsweredRow`, copy `askGone` / `stateGone` (pair copy
  stays `keepAlreadyBinned` in note-edit.ts). c3-state-mark reuses these.
- The one "gone" path (`subjectLeft` / `notesGone`) feeds `answeredGone` for q-pair, q-ask and q-state. The planner
  (`scripted.ts`) writes one row per question (its last answer; a no writes none) on the line's archive contribution,
  as `answered`, never `setAside`. `report.ts` no longer needs its "yours" set-aside exception; `grounded.ts` requires an
  answered row to ride an applied archive move of a journal line.
- `VaultIndex.notesSeen()` is the one source of `NotesSeen`, used by the planner and the app reader
  (`drive-vault.ts questions()`), so a pair whose other note is in the Bin is not listed.
- Readers: run-manifest, run-checkpoint (closed shapes, optional `answered`), `layout.ts` run view, barrier's
  `fixedReport`, `materialize`. Old reports with no `answered` still read (compat-p2 fixture test).
- Shown: `AnsweredRows` in `RunLinks.tsx` (under the Home result and the tidy sheet, all kinds in one list) and on
  `NoteScreen.tsx` for the pair's note that stays (`row.note === path`). `runDetail` counts no answered row.
- Fake scenario `gone-answers` (`src/data/fake/gone-answers.ts`): `?source=fake&scenario=gone-answers`, then Tidy up.

## Verify

- `a refused merge shows as an answered row on the note that stays and under the Home result, and is not counted as
  set aside` (e2e capabilities, fake, phone and desktop): pass.
- `a pair question whose other note is in the Bin is not listed` (drive-vault.test): pass.
- `an old run report with no answered field still reads` (compat-p2.test): pass.
- `a gone subject writes one answered row for each question kind` (fake-runner.test): pass.
- C11 (fake, both projects): pass. capabilities + screens specs, demo and fake: pass.
- Goldens: C04 78 and 25 runs 88 unchanged (runner drive-calls-golden). `pnpm check`: exit 0.
- Logs: /tmp/c3-pair2-check.log, /tmp/c3-pair2-e2e-fake.log, /tmp/c3-pair2-e2e-touched-fake.log,
  /tmp/c3-pair2-e2e-touched-demo.log.

## Tests changed

- tests changed: e2e/capabilities.spec.ts: new red test added; in the fix commit two locators narrowed to one element (the
  note row by its full link name instead of `.first()`, the Home card by `/things? filed/`), assertions unchanged.
- tests changed: runner/test/pair-ask.test.ts: the gone-pair yes now expects an `answered` row and an empty `setAside`
  (addendum 10 moves it out of set aside).
- tests changed: runner/test/ask-answer-loop.test.ts: same move to `answered`; the answer is given while both notes are
  there and the other note goes to the Bin after, since a question whose note is gone is no longer listed to answer.
- tests changed: src/data/compat-p2.test.ts: added the old-report fixture test; nothing removed.
- tests changed: src/data/fake/fake-runner.test.ts: added the per-kind test; nothing removed.
- tests changed: src/data/vault/drive-vault.test.ts: added the hidden-pair test; nothing removed.
- No `.only` or `.skip` added.

## Left out

- A pair asked by file id whose other note is in the Bin reads the fallback ("the other note"): the Bin is not in the
  listing, so its name is not known without an extra Drive read. The named copy shows for pairs asked by name.
- The answered list has no visible label (no copy given for one); the designer checks it before close.

## Sources

- Tolerant reader, optional fields added without breaking old readers: https://martinfowler.com/bliki/TolerantReader.html
- Protocol Buffers, updating a message type (adding a field is backward compatible):
  https://protobuf.dev/programming-guides/proto3/#updating
- WAI tutorials, content structure, lists: https://www.w3.org/WAI/tutorials/page-structure/content/#lists
