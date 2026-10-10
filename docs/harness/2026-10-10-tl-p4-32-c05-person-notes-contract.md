# Technical-lead decision TL-P4-32: the C05 person-notes contract

Rulings on Codex's contract sign-off of the c05-person-notes packet (9 Important, `2026-10-10-c05-person-notes-contract-signoff.md`, on claude/p3 at ce7f1fdf). The product decision is TL-P4-28 addendum 3, the owner's option (b).

**Principle: a thin slice first.** The owner wants speed without losing stability. C05 ships the core: an explicit request, a single matching note, one appended line, and one state question. The rarer paths (two matching notes, a clash re-ask) are kept honest and simple, and either ride later or reuse what exists. Every finding is answered, either by a contract below or by a narrower scope.

## Rulings by finding

1. **State on a person's note: Codex's wording is adopted.** Alongside the Timeline admission, the existing state-rewrite mechanism admits one answered bullet replacement on a person's note.
   - The bullet replaced is the one the question showed.
   - Every other byte is preserved.
   - It writes no ownership mark (`bower_state` is not set).

   An unanswered state edit stays `not-bower`. Reds cover yes, no, the note changed before the answer (re-ask), unrelated bullets left byte-identical, and a later run that adopts nothing.
2. **The runner grants consent, never the model.** The runner derives it from the admitted request's words and the resolved target file id, at planning time.
   - The stable request identity is the inbox line's existing id, not the pile id and not a model field.
   - The binding (request id, target file id) travels through Filing and the existing run manifest to note-edit. `run-manifest.ts` and its tests join the owned files, and the field is additive.
   - Runner `main` refuses an unrelated request id, an unrelated target id, or a citation not filed in this run.
3. **Idempotence by request.** The existing persisted run checkpoint records the completion of (request id, target file id). Resume consults it before re-planning. A replay of that request changes nothing, even if the model would now word the line differently.

   The red runs through the production runner: the append lands, the answer is lost and the read-back fails, then resume, then a later replay. It ends with exactly one line.
4. **Two matching notes: not in C05 v1. Narrowed.** When the request's words match more than one note the person wrote, Bower does not guess and does not ask. It files the source and lists the matching notes in "Left as you wrote them" (finding 8). The why reads "More than one note matches; name the one you mean.", with a link to each note.

   This needs no new question kind and no change to answer-loop semantics. The which-note question becomes a follow-up entry, `c05-which-note`, after C05, if the corpus or the owner shows a need. The designer is told: this changes packet row 6, and their sign-off of the row's new copy is needed.
5. **Title-matching grammar.** A reference is a whole-word, case-insensitive match of a note's title within the request's words.
   - Unicode NFC is applied, and the surrounding punctuation and a leading article ("the", "my") are trimmed.
   - "the garden plot" matches "Garden plot".
   - Only the request's words count, never the source's text.
   - On overlapping titles, the longest match wins.
   - Named notes go into the context before hubs, at most 3. With more than 3 named, the request is left with the why "Too many notes named in one request." and nothing is written.

   The reds cover case, articles, overlapping titles, a mention only in the source, and more than 3 named.
6. **A clash on the append is retried, not re-asked.** If the append meets a changed note (the modifiedTime check), the request stays waiting with its binding (request id, target id, filed source id), and the next tidy-up re-reads the note and appends to the fresh text. An append adds a line and overwrites none of the person's edits, so the original request remains the consent. A clash on the state bullet uses the existing re-ask (finding 1).

   The red runs through the next production runner call: one clash, then exactly one line on the fresh note, with no personal edit lost.
7. **The corpus driver gains what C05 needs, as its own preparatory entry first.** Entry `p4-corpus-answers` (Codex, harness) owns the corpus driver and its runner test files. It adds:
   - an answer submitted through the real answer entry point ("Write it", "Keep mine");
   - an assertion per run (first-run append, the typed state question);
   - protected byte ranges and Drive properties compared directly;
   - a distinction between a replay of the original request and a new tidy-up.

   C05's red builds on it.
8. **"Left as you wrote them" is a new report collection,** additive: `leftAsWritten: { name, why, fileId? }[]`.
   - It owns its types, the manifest and checkpoint validators, report materialization and the result component.
   - Stored older reports stay readable, with a fixture test.
   - It never counts as an updated note.

   The reds cover the production runner and the screen. Row 5 has a working note link, row 7 has none, and neither raises the updated count.
9. **`timeline-line.ts` is the only grammar and formatter.** Row 1 is corrected to the formatter's ` · [[source]]` separator, and the designer is told. Supported person-note Timelines are exactly those `timeline-line.ts` parses, with their line endings preserved. A Timeline it cannot parse is left alone, with the why "This note's Timeline is in a format Bower doesn't write to." in "Left as you wrote them". No second format home is added.

## Order

1. p4-corpus-answers (Codex).
2. The C05 packet amended with these rulings. The designer signs rows 1 and 6 and the two new whys.
3. The C05 reds from a Codex red session.
4. The implementation (Codex), the gates, the Codex adversarial pass, a fresh Claude review, and the designer's check.

c05-which-note waits until after C05.
