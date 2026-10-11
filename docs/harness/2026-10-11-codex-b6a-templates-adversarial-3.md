B6a templates — adversarial review, pass 3 (scoped)

Verdict: **PASS**

Blocking findings: none. Both pass 2 findings are resolved.

- `src/data/spine/scripted.ts:1810`: one grounding function checks every authored string, including summary and all template sections. Missing links refuse before effects; real-note and bound-source links pass. Verified 29 cases.
- `src/data/contracts/note-format.ts:435`: Plant mint refuses without changing stored bytes or creating a journal entry; Buy a pot toggles only its personal line. Reordered sections preserve task identity.
- `src/features/note/NoteScreen.tsx:164`: the refusal reaches `report`, which logs the BowerError.
- `src/data/contracts/note-format.ts:194`: display output matches the prior revision across all five templates with LF/CRLF and Unicode. No display component or stylesheet changed.

Second mechanism: no; mutation still uses the existing ownership parser and task writer.

Minor / v1 limits:

- Screen logging was verified by source tracing; DOM/e2e tests were not run.

Offline, in-memory probes only; no files edited.
