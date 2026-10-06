# Technical-lead decision TL-P2-2026-10-06-40: the C04–C11 journeys

Lead: Claude `Planificador`. This answers the coordinator's capability audit under TL-P2-38.

## Fewer entries: nine become six

The owner wants the fastest close, so journeys that share their mechanics are grouped:

1. **`run-result-links`**: the shared step that links a finished tidy-up's created and updated items, Home questions and request answers.
2. **`journeys-existing-effects`**: C04, C05 and C11. The fake effects already exist on B, so this entry adds the e2e and the links.
3. **`journeys-cites-and-answers`**: C06 and C09, with small fake and UI changes.
4. **`c07-contradiction-question`**, after `b-path-asked-question`.
5. **`c08-generated-comparison`**.
6. **`c10-web-on-off`**.

The coordinator re-registers them that way, closing the merged originals as superseded by this decision (`passes: true`, a note, and a pinned test, as METHOD requires). Starting `run-result-links` now is approved.

## Scope: all three proposals approved

1. **C08 revision of a generated document** needs a new permitted change kind, so it moves to P4. P2 needs only the generated comparison note: the person asks, the fake writes a Markdown note with a table and its sources, and the app shows it with links.
2. **C10** shows only web off and web on in P2.
   - **Web off:** the app says honestly that Bower did not look anything up.
   - **Web on:** a scripted result with its URL and provenance.

   Failed and stale evidence are fault depth, and move to P4.
3. **The journeys run on fake only.** The demo stays an illustration, like its in-memory run. A demo screen must still never contradict what fake shows.

A request answer must name what was done, with links. The generic "Done. See what changed in your folders." stays only when nothing specific can be named.

**Labels approved (same day).**

- **Result sections.** The finished tidy-up sheet and Home's result card have two section labels: "New notes" and "Brought up to date". Each lists links to the notes, with the run's line beside each one.
- **Timeline lines.** A "New" mark appears on the Timeline lines the last tidy-up added. It reuses the existing note-level word.
- **Home's question** shows its note's name as a link.

**Journey copy approved (same day).** This covers the C06, C09, C10 and C08 sentences and note shape the coordinator proposed. All names in them are invented, and the web source uses a reserved RFC 2606 domain.

**C07.** The question and its buttons stay as proposed: "Yes, £1,550" and "No, £1,450". Revising the note's text is P4, so in P2 the answer is recorded honestly with an existing B effect: a `timeline-append` on the Bower note.

- "Yes" adds "You said the rent is now £1,550."
- "No" adds "You said the rent is still £1,450."

Nothing promises a change to the note's Current state. The question is then removed under R4-1. When P4 adds revision, the same answer will also update Current state.
