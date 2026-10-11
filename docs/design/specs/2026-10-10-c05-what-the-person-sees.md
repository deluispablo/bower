# C05: what the person sees (designer's section for the c05-person-notes packet)

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

## Addendum (owner OK 2026-10-10, TL-P4-32 addendum 5 (3))

| Situation | What shows |
| --- | --- |
| A request to add a line is older than the history Bower keeps (20 tidy-ups), so Bower adds nothing and archives it | Under "Left as you wrote them", the note link and the muted line: "Bower didn't add the line: this request is too old for Bower to know if it already did. Ask again if you still want it." |
| The request names two notes and the source has something for only one (TL-P4-32 addendum 6; owner OK 2026-10-10) | Under "Left as you wrote them", the other note's link and the muted line: "Bower didn't add the line: it found nothing about this note in what you added." |
