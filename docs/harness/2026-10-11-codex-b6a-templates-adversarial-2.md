B6a templates — adversarial review, pass 2 (scoped)

Verdict: **BLOCK**

Blocking findings:

- **Summary links bypass grounding** — `src/data/spine/scripted.ts:1851`. With a grounded Gardening hub/body and summary `Alex follows [[Imaginary note]].`, `planScripted` returns an executable manifest containing the missing link. Only `authored.body` is checked; the serializer can also copy the summary into the Source’s Summary section.

- **Displayed tasks target different stored tasks** — `src/data/contracts/note-format.ts:267`. A Project with Next steps `- [ ] Plant mint.` and personal Notes `- [ ] Buy a pot.` displays both in `note.body`. NoteScreen numbers all displayed checkboxes, but mutation indices cover personal tasks only. Clicking Plant mint toggles Buy a pot; clicking Buy a pot refuses. Reproduced through production parsing and mutation APIs.

Minor / v1 limits:

- None.

The original missing-body-link case now refuses before effects. All five templates’ sections reach the display model. Tested quoted tags and Original filenames round-trip for new and legacy output. **Second serializer: no.**

Offline, in-memory probes only; no files edited.
