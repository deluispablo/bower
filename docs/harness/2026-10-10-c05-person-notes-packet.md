# Packet: c05-person-notes (C05; TL-P4-28 addendum 3; escalated contract change; ui: true)

- **Entry:** `c05-person-notes`. Worktree `/private/tmp/bower-c05-person-notes`, branch `c05-person-notes` from `claude/p3`.
- **Verify:** the corpus case `c05-note-not-written-by-bower` (scripted, through the corpus driver) plus the reds named below; exact names are set by the red session and copied into features.json.
- **Rulings:** DECISIONS TL-P4-28 addendum 3 (owner chose (b)); TL-P4-28 addenda 1 and 2; TL-P4-10 (ownership, adoption withdrawn, DECISIONS:114); TL-P4-24 addenda 18 and 19 (write-once, fenced update); TL-P4-31 (pipeline and cap).
- **Starting model:** Codex, escalated pipeline (TL-P4-29): a Codex red session, a Codex implementation session (may not change the red), a read-only Codex adversarial pass, then a fresh Claude bower-reviewer PASS and the designer's check. Before dispatch: the Codex read-only contract sign-off (TL-P4-28 ruling 1) and the designer's signature below.
- **Owned files (TL-P4-31 ruling 3; C05 runs alone):** `runner/src/claude.ts`, `src/data/spine/scripted.ts`, `src/data/contracts/note-edit.ts` (+ its tests), the corpus case folder, and the screens' strings if the designer's section needs any new one.

## Background

`runner/src/claude.ts:413` (`notesShown`) shows the planner only Bower's notes and hubs, so a line on a person's note is refused as `lineNote`. `src/data/contracts/note-edit.ts:217,229,305,661` refuse every Timeline, rule or state edit on a note that is not Bower's (`not-bower`). The case and its exact reply are preserved in `2026-10-09-c05-open-question-person-notes.md`.

## Contract (TL-P4-28 addendum 3, amended by TL-P4-32: a thin slice first)

Read [TL-P4-32](2026-10-10-tl-p4-32-c05-person-notes-contract.md) whole: its specifics are contract. In short:

1. **Shown only when named (TL-P4-32 finding 5).** A reference is a whole-word, case-insensitive match of a note's title within the request's words: Unicode NFC; surrounding punctuation and a leading article ("the", "my") trimmed ("the garden plot" matches "Garden plot"); only the request's words count, never the source's text; on overlapping titles the longest match wins. Named notes go into the planner's context (`notesShown`, claude.ts:413) before hubs, at most 3. More than 3 named: nothing is written and the source is filed and row 7 says why.
2. **Two or more matching notes (finding 4, narrowed):** no guess and no question. The source is filed and the matching notes are listed in "Left as you wrote them" one row per note with its folder (row 6). The which-note question is a later entry (`c05-which-note`).
3. **Consent from the runner, never the model (finding 2).** The runner derives it at planning time from the admitted request's words and the resolved target file id. The request identity is the inbox line's existing id (not the pile id, not a model field). The binding (request id, target file id) travels through Filing and the existing run manifest (`run-manifest.ts`, additive field) to note-edit. Runner `main` refuses an unrelated request id, an unrelated target id, or a citation not filed in this run.
4. **One sourced Timeline line.** note-edit admits exactly one Timeline append on a `not-bower` note carrying that binding, appended at the end of the Timeline through `timeline-line.ts`, the only grammar and formatter (finding 9; separator ` · [[source]]`, line endings preserved). A Timeline `timeline-line.ts` cannot parse is left alone, with row 8 in "Left as you wrote them". Every other edit there stays refused (`not-bower`).
5. **Idempotence by request (finding 3).** The existing persisted run checkpoint records the completion of (request id, target file id); resume consults it before re-planning; a replay of that request changes nothing, even if the model would word the line differently.
6. **Never adopted.** No `by: bower`, no `bower_state`, no `bowerMd5` adoption, no Bower-section mark. Later runs leave it alone.
7. **State asks once (finding 1).** If the source implies a state change, Home asks once with the existing "Write it" / "Keep mine" pair. On yes, the existing state-rewrite mechanism replaces only the bullet the question showed, preserving every other byte and writing no ownership mark. On no, nothing more happens. An unanswered state edit stays `not-bower`. A clash on the state bullet uses the existing re-ask.
8. **A clash on the append is retried, not re-asked (finding 6).** The request stays waiting with its binding (request id, target id, filed source id); the next tidy-up re-reads the note and appends to the fresh text. No personal edit is lost.
9. **"Left as you wrote them" (finding 8)** is a new additive report collection `leftAsWritten: { name, why, fileId? }[]`, with its types, manifest and checkpoint validators, report materialization and result component; older stored reports stay readable (fixture test); it never counts as an updated note.
10. **One home** for each: the planner's context, note-edit's single admission, timeline-line.ts, the existing question pair and answer loop, the existing checkpoint. No second write path, no new question kind.
11. Compatibility: this changes `src/data/contracts`; the fix commit's notes carry `compatibility: FIXSHA`, and the app and the runner deploy together.

**Owned files (added by TL-P4-32):** `run-manifest.ts`, `run-checkpoint.ts` and their tests, `src/data/contracts/types.ts` (the report), `timeline-line.ts` tests, `src/features/tidy/RunLinks.tsx` (or the result component), the corpus case. The corpus driver belongs to `p4-corpus-answers`, which lands first; C05's reds build on it.

## Reds (Codex red session; tests only; built on p4-corpus-answers)

- Title grammar (finding 5): case, a leading article, overlapping titles (longest wins), a mention only in the source (not shown), more than 3 named (the why, nothing written).
- Two matching notes (finding 4): filed, both listed under "Left as you wrote them" with the why and a link each, no question, nothing written.
- Consent (finding 2), through runner `main`: an unrelated request id, an unrelated target id, a citation not filed in this run are each refused.
- note-edit: the one bound append is admitted; each other edit on a person's note is refused `not-bower`.
- Idempotence (finding 3), through the production runner: the append lands, the answer is lost and the read-back fails, then resume, then a later replay: exactly one line.
- State (finding 1): yes replaces only the shown bullet (other bullets byte-identical, no `bower_state`); no writes nothing and is not re-asked; the note changed before the answer re-asks; a later run adopts nothing.
- Append clash (finding 6), through the next production runner call: one clash, then exactly one line on the fresh note, no personal edit lost.
- Report (finding 8): older stored reports stay readable; row 5 has a working note link, row 7 none, neither raises the updated count.
- Timeline format (finding 9): an unparseable Timeline is left alone with its why.
- The corpus case `c05-note-not-written-by-bower` back in `harness/corpus/`, per run (p4-corpus-answers): first-run append and the state question; protected ranges (summary, Current state, My plans, prose) byte-identical; no `by`/`bower_state` properties; replay adds nothing.
- The screen: an e2e covering rows 1, 2, 5 and 6 on Home and in the result (demo and fake), with axe (WCAG 2.2, target-size).

## What the person sees (signed by the designer, claude/design 6135debd, docs/design/specs/2026-10-10-c05-what-the-person-sees.md; contract)

Signed by the designer on 2026-10-10 for TL-P4-28 addendum 3. `<note>` is the note's display name, and `<source>` is the source's display name (no extension). `<folder>` is the folder path in the app's breadcrumb form ("Areas / Home"). Everything reuses today's parts: the question card with its "Bower's update" list, the answer loop and its toasts, and the run result's labelled lists. One new list label is added (row 5).

| Situation | What shows |
| --- | --- |
| 1. The line is appended (the run that reads the request) | The run result, under "Brought up to date": the link `<note>` and the muted line `One line added to its Timeline, as you asked.` The note counts in "N notes brought up to date". The line in the note, in the one Timeline line format (`timeline-line.ts`): `- <date> · <one sentence of the news> · [[<source file>]]`, at the end of the Timeline. |
| 2. The source implies a state change (asked once, in the same run as the append) | A Home question: `<source> also changes the current state of <note>. Should Bower write its update there?` Under it, today's "Bower's update" list shows the whole Current state as it would read after the change: their other bullets as they are, and only the changed bullet new. Buttons: `Write it` / `Keep mine`. |
| 3. After "Write it" | The answer loop's toast, as today: `You chose "Write it". Bower does it in the next tidy-up.` In that tidy-up's result, under "Brought up to date": the link `<note>` and `Current state updated, as you chose.` A clash or refusal uses today's "Write it" rows word for word: the one re-ask, "Not written: …", "Nothing to write: …". |
| 4. After "Keep mine" | The answer loop's toast, as today. No row in any result. The question is never asked again for that request. |
| 5. The note has no Timeline section | The source is filed as usual. In the run result, under a new label `Left as you wrote them`: the link `<note>` and the muted line `Bower didn't add the line: this note has no Timeline.` The note is byte-identical, and it does not count as brought up to date. |
| 6. Two or more notes match the name (TL-P4-32 finding 4: no question in v1) | The source is filed. Under `Left as you wrote them`, one row per matching note: the link `<note>` and the muted line `In <folder>. Bower didn't update it: more than one note has this name. Ask again with its folder.` The folder tells apart rows whose links read the same. Neither note changes or counts as brought up to date. |
| 7. More than three notes named in one request (TL-P4-32 finding 5) | Nothing is written to any note, and the source is filed. Under `Left as you wrote them`, one row with no link: `Bower didn't update any note: this request names more than three. Ask for three at most at a time.` |
| 8. A Timeline that `timeline-line.ts` cannot read (TL-P4-32 finding 9) | The note is left byte-identical. Under `Left as you wrote them`: the link `<note>` and the muted line `Bower didn't add the line: it can't read this note's Timeline.` It does not count as brought up to date. |

Rules for every row: plain words, no file names in sentences (the `[[…]]` source link in the note is the note's own format), sentence case, and never "vault". The app's e2e checks rows 1, 2, 5 and 6 on Home and in the result (demo and fake), with axe.

**The designer's copy replaces TL-P4-32's draft whys** (findings 4, 5, 9): the rows above are the strings. Row 7 files the source and writes no note.

**New owned strings:** the result list label `Left as you wrote them`; the row lines `One line added to its Timeline, as you asked.`, `Current state updated, as you chose.`, `Bower didn't add the line: this note has no Timeline.`, `In <folder>. Bower didn't update it: more than one note has this name. Ask again with its folder.`, `Bower didn't update any note: this request names more than three. Ask for three at most at a time.`, `Bower didn't add the line: it can't read this note's Timeline.`, and the state question in row 2. Everything else reuses today's strings word for word.

## Commits

1. The reds (tests and the corpus case only). 2. The fix. 3. The notes (`docs/harness/2026-10-10-c05-person-notes-notes.md`) with `compatibility:` and `tests changed:` lines in the exact form `tests changed: <path>: <why>`.

## Addendum (TL-P4-32 addendum 5 (3); owner OK through the designer, 2026-10-10; claude/design 2b7455ac)

| A request older than the oldest retained run, with no binding or completion there | No line is added; the request is archived. Under `Left as you wrote them`: the link `<note>` and the muted line `Bower didn't add the line: this request is too old for Bower to know if it already did. Ask again if you still want it.` |
| A request names two notes, and Bower adds a line to one but finds nothing for the other (TL-P4-32 addendum 6) | One line is added to the first note; the request is archived in that run. Under `Left as you wrote them`: the link `<other note>` and the muted line `Bower didn't add the line: it found nothing about this note in what you added.` (owner OK via the designer, 2026-10-10, claude/design 3eec87a1) |
