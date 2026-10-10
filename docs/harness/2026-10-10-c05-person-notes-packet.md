# Packet: c05-person-notes (C05; TL-P4-28 addendum 3; escalated contract change; ui: true)

- **Entry:** `c05-person-notes`. Worktree `/private/tmp/bower-c05-person-notes`, branch `c05-person-notes` from `claude/p3`.
- **Verify:** the corpus case `c05-note-not-written-by-bower` (scripted, through the corpus driver) plus the reds named below; exact names are set by the red session and copied into features.json.
- **Rulings:** DECISIONS TL-P4-28 addendum 3 (owner chose (b)); TL-P4-28 addenda 1 and 2; TL-P4-10 (ownership, adoption withdrawn, DECISIONS:114); TL-P4-24 addenda 18 and 19 (write-once, fenced update); TL-P4-31 (pipeline and cap).
- **Starting model:** Codex, escalated pipeline (TL-P4-29): a Codex red session, a Codex implementation session (may not change the red), a read-only Codex adversarial pass, then a fresh Claude bower-reviewer PASS and the designer's check. Before dispatch: the Codex read-only contract sign-off (TL-P4-28 ruling 1) and the designer's signature below.
- **Owned files (TL-P4-31 ruling 3; C05 runs alone):** `runner/src/claude.ts`, `src/data/spine/scripted.ts`, `src/data/contracts/note-edit.ts` (+ its tests), the corpus case folder, and the screens' strings if the designer's section needs any new one.

## Background

`runner/src/claude.ts:413` (`notesShown`) shows the planner only Bower's notes and hubs, so a line on a person's note is refused as `lineNote`. `src/data/contracts/note-edit.ts:217,229,305,661` refuse every Timeline, rule or state edit on a note that is not Bower's (`not-bower`). The case and its exact reply are preserved in `2026-10-09-c05-open-question-person-notes.md`.

## Contract (TL-P4-28 addendum 3)

1. **Shown only when named.** The planner is shown a person's note (one not `by: bower` and not a hub) only when the request's own inbox words name it (by its title, matched to the note's file id through the index; never a substring of other text). Otherwise nothing changes: person notes stay unseen.
2. **Two notes match:** Bower asks which (row 6: a question about the pile, so the pile waits in the inbox) and writes nothing to either until answered. **Three or more match:** no question; the source is filed and row 7 says why.
3. **One sourced Timeline line.** note-edit admits exactly one Timeline append on a `not-bower` note when it carries the request's id as consent (the request that named the note). It is appended at the end of the Timeline, in the note's own line format, citing the source. Every other edit there stays refused (`not-bower`): summary, front matter, My plans, prose, Current state, a second line, a line from another request.
4. **Never adopted.** The note never becomes Bower's: no `by: bower`, no `bower_state`, no `bowerMd5` adoption, no Bower-section mark. Later runs leave it alone; the same request replayed adds no second line (idempotent by request id).
5. **State asks once.** If the source implies a state change, Home asks once with the existing "Write it" question pair (strings in the designer's section). On yes, the next tidy-up rewrites only that Current state bullet ("You chose…" per the existing answer loop); on no, nothing more happens and it is not re-asked.
6. **No Timeline section:** Bower files the source, writes nothing to the note, says why, and gives the "Open <note>" link (strings in the designer's section).
7. **Fences:** the usual modifiedTime check on the append (a person's edit between read and write refuses and re-asks the next run, losing nothing); match by file id.
8. **One home:** the planner's context (`notesShown`), note-edit's single admission, the existing question pair and answer loop. No second write path, no new question kind unless the designer's section requires one.
9. Compatibility: this changes `src/data/contracts`; the fix commit's notes carry `compatibility: FIXSHA`, and the app and the runner deploy together.

## Reds (Codex red session; tests only)

- note-edit: the one consented append is admitted; each other edit on a person's note is refused `not-bower`; a second append for the same request id is `unchanged`; an append without the request id is refused.
- claude.ts: a person's note is shown only when the request names it; a substring match or a note named in a file's text (not the request words) does not show it; two matches produce the which-note question and no line.
- The corpus case `c05-note-not-written-by-bower` back in `harness/corpus/`, updated to this behaviour: one line, `questionsExactly: 1`, `excludes: by: bower, bower_state:`, the person's summary, state, My plans and prose byte-identical; a replay adds nothing.
- A variant with no Timeline section: the source is filed, the note is byte-identical, the report has the why line and the Open link.
- A fence red: the note changes between read and append; nothing is lost and no line is written.
- Two matches give the which-note question and the pile waits; three or more give row 7 and no question.
- The screen: an e2e covering rows 1, 2 and 5 on Home and in the result (demo and fake), with axe (WCAG 2.2, target-size).

## What the person sees (signed by the designer, claude/design ae703905, docs/design/specs/2026-10-10-c05-what-the-person-sees.md; contract)

Signed by the designer on 2026-10-10 for TL-P4-28 addendum 3. `<note>` is the note's display name, and `<source>` is the source's display name (no extension). `<folder>` is the folder path in the app's breadcrumb form ("Areas / Home"). Everything reuses today's parts: the question card with its "Bower's update" list, the answer loop and its toasts, and the run result's labelled lists. One new list label is added (row 5).

| Situation | What shows |
| --- | --- |
| 1. The line is appended (the run that reads the request) | The run result, under "Brought up to date": the link `<note>` and the muted line `One line added to its Timeline, as you asked.` The note counts in "N notes brought up to date". The line in the note: `- <date> · <one sentence of the news>. [[<source file>]]`, at the end of the Timeline, in the note's own format. |
| 2. The source implies a state change (asked once, in the same run as the append) | A Home question: `<source> also changes the current state of <note>. Should Bower write its update there?` Under it, today's "Bower's update" list shows the whole Current state as it would read after the change: their other bullets as they are, and only the changed bullet new. Buttons: `Write it` / `Keep mine`. |
| 3. After "Write it" | The answer loop's toast, as today: `You chose "Write it". Bower does it in the next tidy-up.` In that tidy-up's result, under "Brought up to date": the link `<note>` and `Current state updated, as you chose.` A clash or refusal uses today's "Write it" rows word for word: the one re-ask, "Not written: …", "Nothing to write: …". |
| 4. After "Keep mine" | The answer loop's toast, as today. No row in any result. The question is never asked again for that request. |
| 5. The note has no Timeline section | The source is filed as usual. In the run result, under a new label `Left as you wrote them`: the link `<note>` and the muted line `Bower didn't add the line: this note has no Timeline.` The note is byte-identical, and it does not count as brought up to date. |
| 6. Two notes match the name | A Home question about the pile: `You asked Bower to update <note>, and two notes have that name: one in <folder A> and one in <folder B>. Should Bower update the one in <folder A>?` Folder A is the note changed most recently. Buttons: `That one` / `The other one`. The pile stays in the inbox until answered, as any question about a pile does. After either answer: the answer loop's toast, then rows 1 to 5 in the next tidy-up for the note chosen. |
| 7. Three or more notes match | No question. The source is filed. Under `Left as you wrote them`, one row with no link: `Bower didn't update <note>: more than one note has that name.` |

Rules for every row: plain words, no file names in sentences (the `[[…]]` source link in the note is the note's own format), sentence case, and never "vault". The app's e2e checks rows 1, 2 and 5 on Home and in the result (demo and fake), with axe.

**New owned strings:** the result list label `Left as you wrote them`; the which-note question and its `That one` / `The other one` buttons; the row lines `One line added to its Timeline, as you asked.`, `Current state updated, as you chose.`, `Bower didn't add the line: this note has no Timeline.`, `Bower didn't update <note>: more than one note has that name.` Everything else reuses today's strings word for word.

## Commits

1. The reds (tests and the corpus case only). 2. The fix. 3. The notes (`docs/harness/2026-10-10-c05-person-notes-notes.md`) with `compatibility:` and `tests changed:` lines in the exact form `tests changed: <path>: <why>`.
