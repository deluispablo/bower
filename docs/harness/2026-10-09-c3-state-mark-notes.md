# c3-state-mark notes

- Red `1299ca14` (tests only), fix `d36ba829`, compatibility row `501e4b44`. Resumed from a stopped worker; the fix was
  re-read against the packet's contract, committed as left, and the gates re-run.
- Contract 1 (state mark): `withoutSaid` and its 2^12 subset search are gone (`note-edit.ts`). `stateNewsLine(lines,
  existing, said)` takes the lines Bower last wrote, which the planner reads (`scripted.ts`, `lastWritten`) from earlier
  run manifests in `.bower/runs`, newest first: the `state-rewrite` whose `stateMark(lines)` equals the section's mark,
  for the same file id (undo `release`/`mark` changes are passed over). A manifest that cannot be read or parsed is
  passed over with `console.error` (lenient read). No previous change found (retention binned it, or the mark is older
  than manifests): nothing is taken as said, and the line names every line the section lacks (tested).
- Contract 2 (write-it-silent): `Question.shown` (`types.ts`: `lines`, `md5`, optional `stamp`) is set when q-state is
  asked; `build` fills in the note as the run leaves it (the edit's md5 and the stamp of the New-mark move or the edit
  op, the same two things the New mark compares). A yes writes `shown.lines` through the usual fence (engine recheck,
  `rewriteState` with `previous` and `granted.mark`). It re-asks if the section mark changed (STATE_ASK_AGAIN) or the
  note no longer carries that stamp and md5 (write-once's comparison via `STAMP`; no new helper). The Claude provider
  plans with no model when the run's only changes are answers to questions that kept `shown`, and no pile.
  Old questions without `shown` keep today's path (model's update). Validator `layout.ts`; report rows strip `shown`.
- Contract 3 (UI copy): constants `STATE_ASK` and `STATE_ASK_AGAIN` in `src/data/contracts/questions.ts`; both are the
  sentences already in the app, word for word, so no new copy:
  - "You changed the current state of <name>. Should Bower write its update there?"
  - "You changed the current state of <name> again. Should Bower still write its update there?"
- Seams (left for the second round once c3-pair-ask's `answered` row is on the base):
  - `src/data/spine/scripted.ts:844` SEAM (TL-P4-19 addendum 10, answered): yes whose note moved or went to the Bin.
    Approved copy for later: "Not written: <note> had moved or gone to the Bin before Bower got to it." Fallback:
    "Not written: the note had moved or gone to the Bin." Under the Home result only.
  - `src/data/spine/scripted.ts:1076` SEAM (answered): a refused write.
  - `src/data/spine/scripted.ts:1079` SEAM (answered): nothing to write for this yes.
  - `src/data/spine/scripted.ts:1066` SEAM (c3-state-mark card): re-ask after a change elsewhere in the note (stamp or
    md5 differ, section unchanged) uses the first-ask wording, STATE_ASK; no approved reason sentence exists.
- removed: `withoutSaid` (note-edit.ts, 8 lines: the subset search); `stateNewsLine`'s `mark` parameter.
- Tests (red then green): `runner/test/state-rewrite.test.ts` "Bower's last state is read from the previous state
  change, not searched", "with no previous state change to read, every line the section lacks is news";
  `runner/test/ask-answer-loop.test.ts` "a yes to write it applies the shown text with no model call", "write it
  re-asks when the section changed since it was shown". The latter two drive the answer through the answer loop and
  the runner (real entry point, TL-P4-17).
- tests changed: runner/test/state-rewrite.test.ts: two existing hub cases now seed the earlier run's state change
  (`wroteBefore`), since the said lines are read from it; `manifestOf` skips that earlier run's manifest.
- tests changed: runner/test/earlier-runs.ts: `finishedBefore` split so `stateWrittenBefore` can seed one earlier run
  with a state change; same records as before.
- tests changed: runner/test/ask-answer-loop.test.ts: two red tests added, no existing test changed.
- No `.only` or `.skip` added.
- Gates: `pnpm check` exit 0 (/tmp/csm-check2.log; unit 3865, api 234, runner 249). Goldens unchanged: C04 78,
  25 runs 88. `pnpm e2e:fake` 257 passed, 61 skipped, on the same tree (/tmp/csm-e2e2.log; a first run,
  /tmp/csm-e2e.log, died on dev-server ERR_CONNECTION_REFUSED). docs test 19 passed (/tmp/csm-docs.log).
- Sources: optimistic concurrency, If-Match precondition, RFC 9110 section 13.1.1
  (https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1); Drive `md5Checksum` and `appProperties`
  (https://developers.google.com/drive/api/reference/rest/v3/files).
- Left out: no fake e2e for "Write it" (the scripted provider never grants a state write; the runner tests above
  drive it); open questions do not take fresh evidence (c3-subject).

## Round 2 (answered-row seams)

- Merge `c65fb2ab` (claude/p3 at 365e4a2f). Conflicts: `scripted.ts` import (STATE_ASK* plus `answeredGone`;
  `notesGone` no longer used there), the decided fields (`questionsList`, `stateAsks`, and `answeredRows` in place of
  `keepGone`), the report-row comment in `questions.ts`, and the compatibility rows (both kept).
- Test `95fdd9d8` "a write it yes whose note is gone writes one answered row" (`runner/test/ask-answer-loop.test.ts`,
  helper `reportRowsAll`). It passed on the merge: pair-ask's `answeredGone` already writes the state row (copy
  "Not written: Job hunt had moved or gone to the Bin before Bower got to it."). Red shown by taking out the state
  kind in `answeredGone`: `expected [] to deeply equal [ { questionId: 'q-state-f13', ... } ]` (/tmp/csm2-red-probe.log).
- Fix `11e79dc6`: the gone seam comment now points to `answeredRows` and `answeredGone`. No code path added.
- Open (no approved sentence, for the designer): a refused write (`scripted.ts` refused seam) and nothing to write
  (the section already reads as the update, carries no mark, or an older question's run had no update). Today in
  both: the question closes, nothing is written, and Home's run line counts it as "1 change of yours read".
- The re-ask seam is unchanged.
- tests changed: runner/test/ask-answer-loop.test.ts: one test and one helper added, no existing test changed.
- Gates: `pnpm check` exit 0 (/tmp/csm2-check.log; unit 3868, api 234, runner 250); goldens C04 78, 25 runs 88
  unchanged; e2e:fake capabilities and capabilities-b 22 passed (/tmp/csm2-e2e.log).

## Round 3 (one re-ask, answered rows of Write it; TL-P4-19 addenda 12 and 13; P4-47 fold-in)

- Merge `c861afa6` (claude/p3 at `ee761276`, pair-ask round 3). One conflict, the `scripted.ts` import from
  `contracts/questions`: kept this entry's `STATE_ASK`, `STATE_ASK_AGAIN` and pair-ask's `binnedPairNote`.
- Red `e5301fc3` (tests only), fix `d824059e`, compatibility rows `cdad1b12`.
- One re-ask (`scripted.ts`, the Write it branch): re-asked when the section changed, when the note's stamp or md5
  differ from `shown` (`held`), or when the write's own check refuses as a clash (`person-edited`, `state-changed`);
  always `STATE_ASK_AGAIN`, now the designer's sentence. The first-ask wording on a re-ask (the round 1 seam) is gone.
- Answered rows: `answeredState` (`contracts/questions.ts`, beside `answeredGone`, same `AnsweredRow` and validator)
  with outcomes `refused` and `nothing-to-write`, kind `state`, `note` = the note's path now; copy word for word,
  fallback "the note". Nothing to write is checked first: a section that already reads as the update settles with the
  row, never a re-ask. A refused write is any refusal of `applyChanges` that is not a clash (`too-large` in the test).
- Manifest reader: `lastWritten` reads earlier manifests with `parseRunManifestV2` (bytes, root, `RUNNER_WRITES`), the
  engine's reader; one it refuses or cannot read is passed over with `console.error`. `stateChangesOf` now walks the
  typed manifest; the lenient regex `MANIFEST_PATH` is gone (`records.ts` exports `isManifestName`).
- Scripted provider (addendum 13): `scriptedDecisions(updates, states)`; with states (only the fake `write-it`
  situation, `src/data/fake/write-it.ts`, chosen in `choose.ts`) it leaves out `settles`, so the plan grants Write it
  as for the model's reply. The runner's `scriptedProvider` and the Claude provider never pass states; the
  dependency-cruiser rule passes. The situation's page hook `__editElsewhere` changes a note as another device would.
- Tests (red then green, `runner/test/ask-answer-loop.test.ts` unless named):
  - "write it re-asks when the note changed elsewhere since it was shown": red, the re-ask had the first-ask words.
    With `held` replaced by `true` it fails: Bower writes over the note (`expected '---\nsummary…' to be …`,
    /tmp/csm3-held-probe.log).
  - "a write it refused for good writes one answered row on Home and on the note": red `expected [] to deeply equal
    [ { questionId: 'q-state-f13', …(4) } ]` (refusal `too-large`).
  - "a write it with nothing to write writes one answered row": red, the question was asked again (`expected true to
    be false`).
  - Minors, green on the red tree: "a lone no to write it closes the question with no model call", "a yes to write it
    beside a pile asks the model" (claude.ts no-model branch); `runner/test/state-rewrite.test.ts` "a run manifest that
    cannot be read is passed over, and every line the section lacks is news".
  - `src/data/contracts/questions.test.ts`: "asks again in one sentence that says why", "a refused write and nothing
    to write name the note, or say "the note", and show on it", "rows stored before still read, and the new rows read
    too" (red: `answeredState` not exported).
  - `src/data/fake/write-it.test.ts`: "asks Write it about each note with the update shown, and a yes writes it",
    "a change elsewhere asks again, and the update typed by hand settles as an answered row".
  - e2e:fake `e2e/capabilities.spec.ts` "write it shows the state written, re-asks on a clash and settles as an
    answered row" (Money written; Car changed elsewhere, re-asked; Car typed by hand, row on the note, axe WCAG 2.2
    with target-size).
- tests changed: runner/test/ask-answer-loop.test.ts: "a person edit after the question stops Write it" and "write it
  re-asks when the section changed since it was shown" expect the one re-ask sentence (addendum 12 replaces the old
  words); `stateWorld` takes an optional pad; the app vault type adds `addPile`, `settled`; five tests added.
- tests changed: runner/test/earlier-runs.ts: `planned` takes an optional edit; `stateWrittenBefore` records a
  one-edit manifest the one reader accepts (the note a captured place, real digests); its zero digests and uncaptured
  note were refused by `parseRunManifestV2` (seen: `one-per-file`, then `target`). Same lines recorded.
- tests changed: runner/test/state-rewrite.test.ts: one test added, none changed.
- tests changed: src/data/contracts/questions.test.ts, e2e/capabilities.spec.ts: tests added, none changed.
- tests changed: src/testing/tidy-up.ts: optional `states` passed to `planRun`; default unchanged.
- No `.only` or `.skip` added.
- Blocked (lead ruling): a clash Drive finds at the write itself (the fence's read differs: engine `NOTE_CHANGED`).
  Probe on the runner: the edit and the questions write are rejected, the answer stays in `.bower/changes`, the
  question stays in `questions.json` as it was; the app hides it (its answer is in the journal) and no run follows (a
  press with an empty inbox answers 409 nothing). The next run of your changes re-asks through `held` with the new
  sentence, so the one path is ready; what starts that run is not. Options: (a) the runner's end status tells the
  Worker an answer stayed and `Person.wake` starts its run, as for answers that waited (TL-P4-13 addendum); (b) the
  app starts it when the answer's run ends with the answer still waiting; (c) the question shows as waiting until the
  next tidy-up. The re-ask uses the answer up, so none loops. The packet's red "a clash on write it re-asks with the
  reason" is not added until then.
- Open for the designer: an answer's own run (scope instructions, nothing filed) has no Home result card
  (`hasReplay` needs a full run that filed things), so its answered row shows on the note, and under Home's result
  only after a full tidy-up. The `raced` path (the note changed while the run read it) still re-asks as first asked.
- Gates: `pnpm check` exit 0 (/tmp/csm3-check.log; unit 3893, api 234, runner 256); goldens C04 78, 25 runs 88
  unchanged; e2e:fake capabilities and capabilities-b 24 passed, phone and desktop (/tmp/csm3-e2e.log).
- Sources: RFC 9110 section 13.1.1 (https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1); Drive `md5Checksum`,
  `appProperties` (https://developers.google.com/drive/api/reference/rest/v3/files).

## Round 3b: write-time clash (TL-P4-19 addendum 15, option a)

- Commits: merge d3977010 (claude/p3), red dcb46f11, fix abca07ea.
- Path reused: the waiting-answers alarm (`ANSWERS_WAITING`, `wakeForWaiting`, `startWaiting` in `api/src/person.ts`).
  A `done` report with `answersStayed: true` adds a waiting entry with no requestId or subject; the run's end arms
  the `answers` deadline now; only the alarm admits (`answers-after-<run>`) and dispatches. No new dispatch path.
- Runner: `finishRun` (barrier.ts, shared by the runner and the fake run service) returns `answersStayed` when an
  edit holding a granted state-rewrite did not land; `runTidy` sends it with `done`. The fake Worker starts the
  same run at the next status (its stand-in for the alarm), as for answers that waited.
- Raced clash (note changed while the run read it) re-asks with `STATE_ASK_AGAIN`, the held clash's sentence.
- Reds: runner `a clash at write time leads to the re-ask with the new sentence and no extra press` (failed: dispatched
  length 2, expected 3); same name in `src/data/fake/write-it.test.ts` (failed: expected null not to be null) and
  e2e:fake (failed: `__editAtWrite` missing); `a clash while the run reads the note re-asks with the new sentence`
  (failed: first-ask text); api `a report says an answer stayed only with done` (failed: 200, expected 415).
- Page hook (fake only, write-it situation): `__editAtWrite` arms one edit right before Bower's write to that note.
- Home result card unchanged (designer's answer pending via the lead).
- Left out: the app sees the re-ask run at its next status poll (slow poll after a run ends, up to 60 s on the real
  Worker); the fake's taken-once flag is not kept across a reload (the answer then waits for the next tidy-up).
- tests changed: runner/test/ask-answer-loop.test.ts: one test added; in the fix commit its alarm step reads the
  dispatch the in-process host's due alarm already made (re-checked red without the fix: length 2, expected 3).
- tests changed: src/data/fake/write-it.test.ts: two tests added; the fix commit swaps the test's own hook for the
  `editAtWrite` seam it adds.
- tests changed: api/test/runner.test.ts: one test added, none changed.
- tests changed: e2e/capabilities.spec.ts: one test added, none changed; 107e2da1 lets that test allow the fence's
  two expected log lines (`allowConsole`), assertions unchanged.
- tests changed: src/data/contracts/questions.test.ts: tests added in round 3, none changed.
- Gates: `pnpm check` exit 0 (/tmp/csm3b-check.log); e2e:fake capabilities and capabilities-b 26 passed, phone and
  desktop (/tmp/csm3b-e2e.log).

## Round 4 (TL-P4-19 addenda 16, 17, 18)

- Commits: red d4d2de42, fix d5c9042d (addendum 16); red a7f7c938, fix f3db5b5b (addendum 17).
- Addendum 16, done: `Finished.answersStayed` (barrier.ts `grantedClashed`) is true only when the granted edit was
  rejected with failure code `conflict` (the engine's clash: NOTE_CHANGED, NOT_AS_SEEN, and STAYED). person.ts
  `answersStayed()` keeps the waiting entry's `tries` instead of setting 0. No new table, counter or dispatch path.
  Red `only a clash keeps an answer for a re-ask` (runner): Drive answers 503 to the write every time; failed with
  dispatched length 3, expected 2 (the loop's next run). Green after the fix.
- Addendum 16, stalled: the class test `the same non-clash refusal never starts more runs than the cap, then shows
  the not-written row` is not added. A refusal at the write is known only to the runner at run time, and answered rows
  are made only at plan time (scripted.ts); the Worker's `tries` (AnswersWaiting) is lost when a run takes the entry
  (`takeWaiting`) and never reaches the runner. Settling the row at the cap or at once (permanent kind; today a
  permanent error stops the run, it is never `done`) needs a channel the lead must rule on: e.g. a field in the
  admission manifest, or the runner reading earlier runs' outcomes. After this round a non-clash refusal starts no
  run on its own (bounded: 0 runs) and the answer waits in your changes for the next press, with no row.
- Addendum 17, done: Home's question card shows "Bower's update" (`tidy.module.css` `linksLabel`, the New notes
  label) then `shown.lines` as a bullet list in the Current state panel (`note.module.css` `state`). No new component.
  Red `the write it card shows every line of Bower's update` (Home.test.tsx) failed: card text lacked
  'Insurance runs until 30 June.'. `a yes writes only the update that was shown` (write-it.test.ts) passes before
  and after: scripted.ts writes `shown.lines` over the run's own update. The e2e write-it test checks the list and
  runs axe (WCAG 2.2 tags, target-size) on the questions section.
- Addendum 18, not done (stalled): neither home refuses a news line with no source today. note-edit.ts
  `entryOk` allows `source === null`; the zod reply schema (runner/src/claude.ts) has `cites` optional on lines and
  states. `cites` on WRITE_IT_STATES must be an inbox thing's file id (scripted.ts matches states by id), which the
  fake seed makes at run time, so a static fixture cannot name one without matching by name. Needs a ruling on the
  home and on how the fixture names its thing.
- tests changed: runner/test/ask-answer-loop.test.ts: one test added, none changed.
- tests changed: src/features/home/Home.test.tsx: one test added, none changed.
- tests changed: src/data/fake/write-it.test.ts: one test added, none changed.
- tests changed: e2e/capabilities.spec.ts: the write-it test gains the update list and axe checks; nothing removed.
- No `.only` or `.skip` added.
