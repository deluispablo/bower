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
