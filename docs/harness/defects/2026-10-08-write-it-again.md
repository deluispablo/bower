# write-it-again: "Write it" re-asks "you changed it again" over an unchanged section

Diagnoser note (TL-P4-15), 2026-10-08, on `claude/p3` b116844 (staging 45e9742, same runner and planner code). Read-only; no code changed. Unit run: `runner/test/ask-answer-loop.test.ts` 9/9 green.

## What failed

Staging, real Drive, account A (log line in `DEFECT_LOG.md`). `Job hunt.md` has mark `c33e034159b3377f` (`["One application open."]`) and a person-edited Current state of two lines. Question `q-state-1CTq…` was asked by a run on **924e6d6** and stayed open. The test reset re-uploaded the note with the same section. Run lU3Lq (scope all) appended one Timeline line and asked nothing new. Then "Write it" started run YLqjlTI2 (scope instructions). It wrote nothing and re-asked "You changed the current state of Job hunt again. Should Bower still write its update there?". That wording is built in one place only: `scripted.ts:830`.

## Answers to the coordinator

- **What the check compares:** neither the file's modifiedTime or md5 nor `askedAt`. It compares `grant.seen`, the open question's `state` field from `questions.json` (`scripted.ts:650`), with `stateMark(section.lines)`, the FNV mark of the Current state lines read now (`:828`, `note-edit.ts:297`). A `seen` of `null` always re-asks (`:828`, comment `:829`: "or asked before questions kept what they saw").
- **Would a Timeline append alone make Write it fail?** No. The section span ends at the next heading (`note-edit.ts:344-350`), so Timeline lines are not part of the mark. The front-matter mark that the grant keeps (`granted.mark`, `:833`) is read in the same run. I verified this by reading the code, not by running it.
- **Is the reset the cause?** No. The section text did not change. The real cause is that the question is older than `state-yes-writes`. At 924e6d6 the q-state question was written without `state` (`git show 924e6d6:src/data/spine/scripted.ts:787`), and the field was added in a38c0cb (`types.ts:134`, `scripted.ts:940`). *Unverified:* I did not read the live `.bower/questions.json`. Check that the `q-state-1CTq…` entry has no `"state"` key.
- **Why lU3Lq did not repair it:** a later run that asks the same question again (with `state`) is dropped as "already open" (`scripted.ts:1159`, `sameThing` matches by id at `:550`). The merge refreshes only `subject`/`about` (`:1161-1163`). An open question keeps the evidence from its first ask forever.
- **After the re-ask** the question now has `state`, the mark of the current two lines (`:830`, written by `:1159`). A second "Write it" should then write, if the model returns an update for the note. That is inferred, not run.

## Why (5 whys)

1. **Why re-ask?** `grant.seen` is `null`, and `null` takes the "changed since" branch (`scripted.ts:828`).
2. **Why null?** The open question was written before questions carried `state` (924e6d6), and nothing has added it since.
3. **Why was it never added?** The question merge treats an open question as fixed. A re-ask with the same id adds nothing (`:1159`), and only the subject is ever refreshed (`:1161`). New evidence fields on `Question` (`hash`, then `state`) never reach questions that are already open.
4. **Why does the person read "again"?** Two different cases share one branch and one wording: "changed since" (proven by the marks) and "we never kept what you saw" (no evidence at all). The copy states the first case as fact for both.
5. **Design cause:** "what Bower saw when it asked" is an optional field that each question builder sets inline in the planner (`:830`, `:940`). It has no single home that says how a question without it behaves, or how it gets one while still unanswered. The contract tests always seed `state` (`ask-answer-loop.test.ts:177`). The previous release's question shape is never tested.

## Owner mechanism

**Question subject and identity** (`src/data/contracts/`, target `c3-subject`). `state`, like `subject` and `hash`, is the question's record of what it is about as seen when it was asked. The comparison itself (`stateMark`, Note sections) and the write fence (`granted.mark`, `stillAsSeen`) work correctly and are not the cause.

## Same class elsewhere (5)

1. `scripted.ts:828-830`: absent `state` is treated as a person edit, with the "again" wording (this defect).
2. `scripted.ts:798-800`: a race re-ask copies the stored question (`...grant.question`), so a question without `state` stays without it, and the next yes fails the same way.
3. `scripted.ts:1159` and `:1161-1163`: an open question never takes evidence from a later ask (`state`, `hash`). Only `subject`/`about` are retargeted.
4. `scripted.ts:549`: `sameContent` needs `a.hash`, so q-ask questions written before `hash` existed never deduplicate by content. This is the harmless direction (the person may be asked twice). The release that added `hash` is unverified.
5. `scripted.ts:830` and `:940`: the q-state question and its wording are built in two places (also `c4-copy`).

Related, verified by reading the code only: a granted yes whose run returns no update for the note (`w.state` absent, `:831`) writes nothing and asks nothing. It is still settled (`:250`) and dropped from questions.json (`:1146`, `:1165`), so the yes is used up with no visible outcome.

## Options

- **(a) Fix in the owner. Size S, risk low.** Build the q-state question in one function (`stateQuestion(path, seen, changed)`) used at `:830`, `:940` and `:800`. With `seen === null`, re-ask with the first-ask wording and the current `state`. Use "again" only when both marks exist and differ. In the merge at `:1161`, extend the existing retarget so an **unanswered** open question takes a missing `state` from the same-id re-ask of that run. Still fail-closed: a yes without evidence never writes.
- **(b) Refactor first, then fix. Size M, risk medium.** Do `c3-subject` first: one `Question` builder and merge in `src/data/contracts/` that owns id, subject, hash and state, with one rule for evidence an open question lacks (taken from a re-ask while unanswered, never after an answer). Then (a) becomes that rule plus the wording choice. It also covers item 4 and the q-ask dedupe. It touches retarget and dedupe, which TL-P4-11 covers.
- **(c) New mechanism. Not needed, and two alternatives are rejected.** Comparing the file's modifiedTime or md5 would make every Timeline append fail Write it. A `questions.json` v2 migration would be a second way to version questions alongside the optional fields.

## Regression test (class)

"An open question written by the previous release still works." Use a `questions.json` fixture in the 924e6d6 shape (no `state`, no `hash`) and a byte-identical re-upload of the note. Run a scope-all run that appends a Timeline line, then a yes. Assert: (1) the scope-all run adds `state` to the open question; (2) the yes writes the update, after only a Timeline append between ask and yes; (3) a question that still has no `state` is re-asked with the first-ask wording, never "again"; (4) "again" appears only when both marks exist and differ (the existing test, `ask-answer-loop.test.ts:342`). Run the same shape check for every optional evidence field on `Question`.

## Ruling: TL-P4-16

Option (b), per [TL-P4-16](../2026-10-08-tl-p4-16-baseline-defects.md): fixed inside `c3-subject` with the rules in that decision (unanswered questions take missing evidence; "again" only when both marks differ; no silent used-up yes). Now: verify Write it and Undo on a question the current code creates, and close the old question through the app.
