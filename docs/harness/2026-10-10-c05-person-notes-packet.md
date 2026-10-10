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
2. **Two notes match:** Bower asks which, with the existing question, and writes nothing to either until answered.
3. **One sourced Timeline line.** note-edit admits exactly one Timeline append on a `not-bower` note when it carries the request's id as consent (the request that named the note). It is appended at the end of the Timeline, in the note's own line format, citing the source. Every other edit there stays refused (`not-bower`): summary, front matter, My plans, prose, Current state, a second line, a line from another request.
4. **Never adopted.** The note never becomes Bower's: no `by: bower`, no `bower_state`, no `bowerMd5` adoption, no Bower-section mark. Later runs leave it alone; the same request replayed adds no second line (idempotent by request id).
5. **State asks once.** If the source implies a state change, Home asks once with the existing "Write it" question pair (strings below). On yes, the next tidy-up rewrites only that Current state bullet ("You chose…" per the existing answer loop); on no, nothing more happens and it is not re-asked.
6. **No Timeline section:** Bower files the source, writes nothing to the note, says why, and gives the "Open <note>" link (strings below).
7. **Fences:** the usual modifiedTime check on the append (a person's edit between read and write refuses and re-asks the next run, losing nothing); match by file id.
8. **One home:** the planner's context (`notesShown`), note-edit's single admission, the existing question pair and answer loop. No second write path, no new question kind unless the designer's section requires one.
9. Compatibility: this changes `src/data/contracts`; the fix commit's notes carry `compatibility: FIXSHA`, and the app and the runner deploy together.

## Reds (Codex red session; tests only)

- note-edit: the one consented append is admitted; each other edit on a person's note is refused `not-bower`; a second append for the same request id is `unchanged`; an append without the request id is refused.
- claude.ts: a person's note is shown only when the request names it; a substring match or a note named in a file's text (not the request words) does not show it; two matches produce the which-note question and no line.
- The corpus case `c05-note-not-written-by-bower` back in `harness/corpus/`, updated to this behaviour: one line, `questionsExactly: 1`, `excludes: by: bower, bower_state:`, the person's summary, state, My plans and prose byte-identical; a replay adds nothing.
- A variant with no Timeline section: the source is filed, the note is byte-identical, the report has the why line and the Open link.
- A fence red: the note changes between read and append; nothing is lost and no line is written.
- The screen: the e2e that shows the question and the no-Timeline line on Home (demo and fake), with axe (WCAG 2.2, target-size).

## What the person sees (the designer writes and signs this section before dispatch)

- Home, the state question on a person's note: exact text, the two buttons, and what each does.
- Home, the which-note question when two notes match: exact text and buttons.
- The run report row for the appended line (and its link).
- The no-Timeline case: the report's why sentence and the "Open <note>" link text.
- After yes / after no: the rows that settle.

## Commits

1. The reds (tests and the corpus case only). 2. The fix. 3. The notes (`docs/harness/2026-10-10-c05-person-notes-notes.md`) with `compatibility:` and `tests changed:` lines in the exact form `tests changed: <path>: <why>`.
