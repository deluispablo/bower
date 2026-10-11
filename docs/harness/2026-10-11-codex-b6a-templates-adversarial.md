B6a templates — adversarial review, pass 1

Verdict: **BLOCK**

Blocking findings:

- **Ungrounded links survive planning** — `src/data/spine/scripted.ts:1820`. With an existing Gardening hub, authoring `[[Gardening]]` and `[[Imaginary note]]` succeeds. The missing target is skipped during resolution but remains in the created Source body. The production planner probe returned a manifest instead of refusing before effects.

- **Required sections disappear from the app’s display model** — `src/data/contracts/note-format.ts:352`. New Project Goal/Next steps, Area Standard to maintain, and MOC Overview/Notes/Sources sit outside the personal payload. `parseNote` projects only Source’s additional payload (`:233`). Reproduction: serialize and parse populated templates; Project and Area expose only Notes, while MOC exposes an empty body. NoteScreen renders that body.

- **Quoted metadata changes meaning on read** — `src/data/contracts/note-format.ts:303`. The new writer quotes values, but the reader strips outer quotes without decoding escapes or quoted tag items. Tags `2026` and `on` return with literal quotation marks; original filename `Garden "mint".txt` returns with backslashes, breaking its Original link. The filename regression also affects legacy serializer callers (`:305`).

Minor / v1 limits:

- No additional findings.

Second serializer: **no**. The declaration home and `validSummary` baseline removal are correct.

All three findings reproduced through offline, in-memory production API probes. No files edited.
