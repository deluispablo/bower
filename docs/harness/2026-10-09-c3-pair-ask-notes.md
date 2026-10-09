# c3-pair-ask: implementer notes

Entry `c3-pair-ask` (escalated), branch `c3-pair-ask` from `claude/p3` c904970e. Ruling: TL-P4-16 addendum, option (b),
for defect keep-one-not-asked; TL-P4-14 addendum 3, carry-over row 3 (P4-19b).

## Commits

- `bcfdaacf` red, tests only: `src/data/contracts/questions.test.ts`, `runner/test/pair-ask.test.ts`, and new tests in
  `keep-one-note.test.ts` and `ask-answer-loop.test.ts`.
- `88f44107` fix: the typed pair subject (`contracts/questions.ts`, `answer-loop.ts`).
- `9326faad` fix: pair asks, words-only cites, keep-one report by reason (runner, planner, engine, report, grounding).
  One assertion of the red pair-merge test was loosened in this commit: the two notes shown with the yes are compared
  as a set, because they come in file-id order.
- `787353e3` docs: compatibility rows.

## What changed

1. **The typed pair.** `Subject` gains `{ kind: 'pair'; by: 'id' | 'name'; notes }`. A pair question's id is
   `q-pair-<fileId>.<fileId>`, sorted by code unit, so there is one question per pair. This is how a state question
   carries its note's id, and it needs no new wire field. `subjectOf` reads that id. An older question whose words
   say "keep one note" and link exactly two notes still reads as a pair by those names (the tolerant reader). The
   accepted app's `q1` names no note and stays a folder question. `answerRun` starts a run of your changes for any
   pair. The two `KEEP_ONE` regexes, one in `answer-loop.ts` and one in `claude.ts`, are replaced by one reader in
   `contracts/questions.ts`.
2. **The reply.** `asks[]` may hold `notes: [path, path]`: two different notes the model was shown. `askKeys` takes
   exactly one of `fileId`, `pileId` or `notes`. The new refusal kind `askNotes` is listed in the per-thing-ask
   refusal table, and `askTwice` covers a pair asked twice. `Filing` and `Decisions` gain `pairAsks`. The planner asks
   each pair by the notes' file ids, with `about` set to the first note. It does not ask when a note is missing or
   when the run already keeps those two notes. The answer's run reads the pair by id at the notes' paths now, so a
   note moved since still merges. Both notes are always shown to the model in that run, and the shown answer carries
   `notes`. `mergesOf` reads the subject.
3. **Words-only piles.** `lines[].cites`, and `states[].cites` when a line also cites the pile, may name a pile of
   words only that is not also made a note. The planner takes such a pile without a generated note. Its context note
   and folder go to the Bin after the edits of the notes that carry its lines. The pile is filed as the note its news
   went into, with one `filed` row ("Your note") on the first such edit. Grounding gives that row its place from the
   edit's path, and `wordsNotes` in `report.ts` counts edit-text, so the dispositions agree. If the pile's lines are
   not all written, or none is new, the pile waits whole for the next run (`tryAgain` held) and its lines are not
   written either.
4. **P4-19b.** The engine tells a keep's other-note Bin refusal by the fence's reason. `gone` gives `KEEP_BINNED`
   ("It went to the Bin while Bower worked, so only the kept note stays."). `name` or `parents` gives `KEEP_MOVED`
   ("It was moved or renamed while Bower worked, so both notes stay; the next tidy-up keeps one."). Anything else
   gives `KEEP_CHANGED`, as before. `materialize` writes the refusal's sentence on that row, extending the
   specialisation it already does for moves. `keptOther` in `report.ts` is now the one predicate for "the other note
   of a keep". Engine `check`, the new refusal mapping and `reportContradictions` all use it; it was written out three
   times before.
5. **Prompt.** About four lines added (the pair ask, the value gate for words, cites). Both model-input goldens were
   regenerated from the real input, and the diff touches prompt lines only. Drive-call goldens are unchanged: 78
   and 88.

## Mechanisms reused (mechanism map)

- The merge is `keep-one-note-merge`, unchanged: carry, hold, then a Bin checked by `stillAsSeen`.
- Question identity goes through `contracts/questions.ts` only.
- Reply validation is the `replySchema` rule lists.
- The report specialisation reuses `materialize`'s existing per-refusal mapping. Its sentences live in `note-edit.ts`
  beside `KEEP_CHANGED`.

## Sources

- Discriminated unions: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions
- Tolerant reader: https://martinfowler.com/bliki/TolerantReader.html
- Validate, then retry with the reason (unchanged): https://python.useinstructor.com/concepts/retrying/

## Gates

- Verify, red to green: the runner `-t` for the 4 runner names, and `pnpm vitest run -t "a pair question has a typed
  two-note subject"`. Logs: `/tmp/c3-pair-red-runner.log`, `/tmp/c3-pair-red-src.log`, `/tmp/c3-pair-g3.log`.
- `pnpm check` passes: `/tmp/c3-pair-check.log`.
- C11 e2e on both projects passes (2 passed, 2 skipped, as before): `/tmp/c3-pair-e2e-c11.log`. The e2e is
  unchanged: its question (`q1`) names no notes, so it still settles at the next tidy-up.
- Full `pnpm e2e:fake`: `/tmp/c3-pair-e2e-fake.log`.

## Left out

- A pair whose note was binned **before** the answer's run: the model cannot keep it, so the yes waits, the same as
  for the old text form. Closing that question and saying so needs a report row grounded on the questions write.
- A "no" to a pair closes it, but a later reply may ask the same pair again. Nothing records past answers.
- A words pile whose line is refused when it is written (the note changed during the run) stays in the inbox with no
  set-aside row. Any refused edit is silent today, and grounding allows no rejected row on an edit-text.
- A words pile cited only by lines that are already there (`present`) waits (held) rather than being binned.
- `notesShown` still decides which notes are Bower's by `appProperties.by`, while edits decide by the front matter
  (diagnosis item 6). The held-pile test uses exactly that mismatch.

## Fix round (TL-P4-19 addenda 8 and 9)

Merged `claude/p3` first (`dad2b4e3`, no conflict). Commits: `09f64090` red (tests only), `dfac85e6` fix,
`9b37c565` compatibility rows.

1. **words-pile-held-forever.** `duplicates.ts` gains `wordsSaved` (every cited line `present`: the pile is a copy of
   what its notes hold) and `savedWordsPile` (the structural predicate of its Bin, like `savedTwins` reading the
   plan's own row). The planner Bins the pile note (or the folder when none is bound) with the existing
   `alreadySaved {name, as}` row, plus an optional `notes` count (how many notes hold its lines), and a `SAVED_STAYS`
   row when the Bin is refused. Grounding counts that Bin's rows as a copy's; dispositions file the pile once it is
   done; contradictions trace the row to the pile's items. No new row type.
2. **pair-yes-waits-forever.** Only `q-ask` (inbox) settled through `subjectLeft`; `q-state` and `q-pair` did not. The
   path is now written once in `contracts/questions.ts`: `NotesSeen` (the listing's file ids and note names),
   `notesGone`, and `subjectLeft`/`openQuestions` take it for every kind. The planner builds it from its listing, so
   a state or pair question whose note is not listed closes, and its answer settles (by id without reading the
   list; an older pair by name once the list is read, which now happens for any unsettled answer, not only on a full
   run). A yes to such a pair gets a set-aside row on its archive contribution: the note that stays, and
   `keepAlreadyBinned(name | null)`; contradictions treat a row on your changes' archive like a keep's other note.
3. **Copy (addendum 9).** `linesAlreadyIn` in `src/features/tidy/run-words.ts`; `KEEP_ALREADY_BINNED` and
   `keepAlreadyBinned` in `src/data/contracts/note-edit.ts`. The run sentence is now joined part by part (a note name
   with a comma was cut by the old `, ` to ` and ` regex) and starts with a capital.

Tests: "a words-only pile whose lines are all in its note already is already saved", "a yes to an older pair question
whose note is in the Bin settles and names it" (`pair-ask.test.ts`); "a yes to a pair whose other note is in the Bin
settles and says nothing was merged", "with no new input a second run leaves nothing held or waiting for the same
reason" (`ask-answer-loop.test.ts`); "a pile of words already saved says its lines were already in its note"
(`run-words.test.ts`). The fix commit also replaced the red test's `reportOf` helper (it read `/status`, which carries
no report) with a read of the run's checkpoint.

Gates: verify unit parts `/tmp/c3-pair-r2-verify.log`; `pnpm check` (with-lock) pass `/tmp/c3-pair-r2-check.log`;
runner suite 245 pass, goldens 78/88 unchanged, no prompt change `/tmp/c3-pair-r2-runner.log`; C11 e2e both projects
2 passed, 2 skipped `/tmp/c3-pair-r2-e2e-c11.log`.

Left out: the app's question reader (`DriveVault.questions`) still passes no `NotesSeen`, so a pair question whose
note is binned shows until the next run closes it (its yes then settles at once). A pair whose both notes are gone
settles with no set-aside row (no note stays to name).
