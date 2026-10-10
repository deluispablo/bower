# Technical-lead decision TL-P4-38: port the brain of the owner's local vault

**Owner, 2026-10-10:**
- "I'm only asking for the back-end behaviour of my local Second Brain in Bower, because it works very well."
- "Look at how Claude works with these files: how it reads and uses them, the prompts, skills and agents."
- "Drop all designer work for now. I don't care about the UI, I care about the brain."

This ruling replaces TL-P4-37's scope for C17 and its addenda 1 and 2. The designer's About me surface is parked.

**Source:** a read-only study of the vault's mechanism files: its rules file, its hooks and settings, the inbox, mail and lint skills with their type and triage tables, the summarizer agent, its scripts and templates, and its replication guide. The method is copied, never the content. Every fixture uses made-up data.

## What Bower has today and what it lacks

| Vault mechanism | Bower runner today |
| --- | --- |
| L0: `hot.md` (focus, open threads, recent changes, about 300 words), injected first and rewritten every run | none: runner/src never reads or writes it |
| L1: `index.md` (`- [[Note]] — summary`, grouped by folder, built by a script at zero tokens) | none: the model sees folder paths only (claude.ts:182) |
| L2/L3: scan the summaries, then open at most 5 notes per source | a fixed cut of 12 Bower notes or hubs (claude.ts:413) |
| A required frontmatter `summary` on every note | partial (note-format) |
| A type table that grows: no row fits, so propose one (at most 2 per run), and the person accepts | none (the type-proposals entry is open) |
| Templates: Concept, Area, Project, MOC, Source | the folder template only |
| Fit → create → ask, for folders, hubs and MOCs | folders in the prompt, but no hub or MOC creation from templates |
| Tags: an allowed list that grows by rule, checked by lint | none |
| A profile note kept in sync by a type-table row (a CV updates the career profile) | none |
| `log.md`: append-only `date | action | note | detail` | none |
| Lint after each run (report only) | none |
| `> [!contradiction]` callouts and `^[inferred]` markers | none (C07 covers disagreement) |
| A cheap summarizer for long texts | none |
| The value gate; Current state plus an append-only Timeline; three layers | yes |

## Rulings

1. **C17 becomes "the brain".** It is a set of runner-side entries that bring the vault's mechanisms into Bower's runner. They run right after C05 (in flight) and before C06, because every later slice depends on them. There is no UI work: the app keeps rendering these files as plain notes, and the designer is not involved.
2. **The entries, in order.** Each is its own entry, prepared by Codex with made-up fixtures, then red, implementation, Codex pass and Claude review. Entries that touch contracts are escalated (TL-P4-29).
   - **B1, the index (L1).** After every run, the runner builds `index.md` at zero tokens, exactly in the vault's format: grouped by top folder and subfolder, `- [[Note]] — summary` or `(no summary)`, first 4 KB per note, skipping `.bower` and the inbox, written only when something changed. The planner always sees it, bounded, and candidate notes come through it. L3 opens at most 5 notes per source, which replaces the fixed 12-note cut.
   - **B2, the summary everywhere.** Every note Bower writes carries a one-line `summary` in its front matter. The index and the planner rely on it. Lint reports notes without one; nothing rewrites the person's notes.
   - **B3, hot (L0).** The runner reads `hot.md` first and rewrites it at the end of each run from the run's result and the journal: `## Current focus`, `## Open threads` (pending questions and type-table proposals go here), `## Recent changes`, about 300 words. Only the runner writes it; the app never does (existing hard rule).
   - **B4, About me.** It grows with stable facts about the person, under "## What Bower has learned" (About you, What you're working on, How you like things). Each fact is one line in the timeline-line grammar, with its source. A fact the person removed is never re-added from the same source. Sensitive facts come only from the person's own words. The planner sees it right after hot.
   - **B5, the type table and profiles.** A Bower-owned `.bower/type-table.md`, where the first match wins, seeded with generic rows: article, offer, CV, certificate, identity document, project material and area material. When no row fits, Bower handles the item like the closest row and proposes a new row (at most 2 per run, listed in hot's Open threads and asked through the existing question). The row is added when the person says yes. A row may name a profile note to keep in sync, which goes through C05's update path. The open entry type-proposals is folded into B5.
   - **B6, templates and fit → create → ask.** The vault's five templates (Concept, Area, Project, MOC, Source) with their sections. Bower reuses an existing project, area, topic or tag. If none fits and the destination is clear, it checks for near-duplicate names, creates the folder and its hub or MOC from the template, and reports it. If the destination is genuinely ambiguous, it asks.
   - **B7, tags.** The allowed tag list lives in `.bower/` and grows by the same rule: a new tag is added and logged. A note has at most 3 tags. Lint checks the list.
   - **B8, log and lint.** The runner appends `log.md` lines (`date | action | note | detail`) for every create, move, update and ingest. After applying a run, a zero-token lint reports, never fixes: missing summaries, broken links, orphans, disallowed tags, stale projects (60 days) and duplicate names. Its findings go in the run report.
   - **B9, markers.** `> [!contradiction]` callouts and `^[inferred]` markers enter the note format, through timeline-line.ts and note-edit, as the one home. The contradiction logic itself stays in C07.
   - **B10, long texts.** Extracted texts over about 3,000 words are summarised by a cheap model step (Haiku) before planning, as the vault's summarizer agent does. It is bounded, the result is cached in `.bower/`, and it is shared with C15.
3. **The prompt follows the vault's skill.**
   - The planner prompt (runner claude.ts) is rewritten from the vault's inbox skill, its note formats and its type table, keeping Bower's closed operation list and validators. The key rules: classify and remember, record facts only (no advice), value gate, fit → create → ask, correlate each item with the notes already tracked, and look in every item for what it changes in existing notes.
   - Its context order is About me, hot, the index, the type table, Rules, then the candidate notes.
   - The corpus cases and the speed baseline guard against regressions.
4. **Measured against the vault.** Codex adds made-up corpus cases modelled on the owner's real failure modes:
   - an item about selling something personal goes to its project, never to a generic Ideas folder;
   - a CV updates the profile and is not filed under applications;
   - a job offer goes to the job search, never to an unrelated project.

   When B1-B6 land, the owner's own staging test is repeated with Claude on.

## Order

1. C05, which is in flight.
2. B1, B2 and B3 together, since they touch the runner context and the index file.
3. B5 and B6.
4. B4.
5. B7, B8 and B9.
6. B10, with C15.

Then C06 onward, as in TL-P4-31. The Codex preparation of B1-B6 starts now, in free slots.
