# Technical-lead decision TL-P4-39: the brain design, first full plan

**Owner, 2026-10-10:** "Before planning these changes, do a second, deep research. What can break, what users may ask, how to solve it in the back end in the best way, how to optimise Claude for it, how it fits the UI we already have (no UI changes for one-off cases), and what an impossible request means. Leave nothing out."

**Inputs:**
- TL-P4-38 and its addenda 1-3.
- A deep-research run on 2026-10-10: 22 sources, 103 claims and 25 verified (19 confirmed, 6 refuted). The cited findings are below. Where this doc says "reasoned", there was no verified source.
- A Codex adversarial review of the design against the code, folded in as addendum 1 when it lands.

All examples are made up.

## 1. Principles the research changes or confirms

1. **Primary evidence and derived views (changes the design).** Repeated in-place consolidation by a model degrades memory: it distorts it, merges topics and drops conditions. Keeping the raw episodes roughly doubles accuracy against forced consolidation ([arXiv 2605.12978](https://arxiv.org/pdf/2605.12978); one preprint, medium confidence).
   - In Bower, these are primary: source notes, the journal, `log.md`, and a Bower-owned observation log, `.bower/observations.jsonl`. Each line holds one observation about the person, with its source, date and section.
   - These are derived views: About me, every MOC Overview and `hot.md`.
   - A derived view is rebuilt from the primary evidence plus the current view, never summarised from itself alone. The previous version is archived before it is rewritten.
   - Consolidation is gated (addendum 2's size budget, plus a minimum of 5 new observations since the last rewrite of that section), not run on every write.
   - After an undo, derived views are rebuilt from the evidence. They are never patched.
2. **The trusted request fixes what runs (confirms and tightens).** Once a model has read untrusted text, that text must not be able to choose consequential actions. Plan-then-execute bounds which actions run, but not their parameters ([Beurer-Kellner et al. 2025](https://arxiv.org/html/2506.08837v1); [CaMeL](https://arxiv.org/abs/2503.18813)).
   - In Bower, the request and the script-computed neighbourhood fix the allowed targets before step 2. Step 2 may write only to those targets, or create under the destination folders step 1 chose.
   - Operations stay closed and validated against schema, path, type, the property allowlist, modifiedTime and stillAsSeen.
   - A free-text value is bounded by its property's type and length.
   - The run report lists every Bower note written, so a poisoned value stays visible and undoable.
3. **Map workers are harmless by construction (confirms and tightens).** In map-reduce, each worker can be injected on its own, so workers return only validated outputs and the reduce step is code ([same paper, §3.1](https://arxiv.org/html/2506.08837v1)).
   - In Bower, the reduce step (MOCs, the index, hot) is a script.
   - **A worker with web access never sees note content.** It gets only the entity key (for example "Example Co"), so there is nothing to exfiltrate.
   - A worker that reads notes has no web access.
4. **Small curated context plus just-in-time reads (confirms).** Recall worsens as context grows. The pattern is a small, high-signal preload plus fetching on demand ([Anthropic, context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). This is the two-step planning.
5. **Prompt order follows cache stability (new).** Caching is prefix-based: a change invalidates everything after it. A write costs 1.25x and a read 0.1x, or 0.05x on Sonnet and Opus 5.5 ([prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). The planner prompt is ordered:
   1. fixed instructions;
   2. the type table and templates;
   3. Rules;
   4. About me;
   5. the index;
   6. hot;
   7. the neighbourhood;
   8. the request and items.

   Inside one run, the steps and map workers share the prefix. Runs more than 5 minutes apart start cold, which is accepted.
6. **Drive's changes feed (new; also closes TL-P4-35 (2b)).** A stored `startPageToken` plus `changes.list` lets the runner find the person's edits between runs without listing the whole folder ([Drive changes](https://developers.google.com/workspace/drive/api/guides/manage-changes)). B1 uses it:
   - for each changed file in the Bower folder (filtered by the cached tree), refresh its index and MOC entries;
   - detect renames and moves made outside Bower by file id and fix [[links]], as the journal-driven fix already does;
   - re-validate the neighbourhood.

   The modifiedTime and stillAsSeen checks at write time remain the final guard. When the token is lost, Bower falls back to a full listing.
7. **Subscription, not batch (constraint).** Each person's runner uses their own Claude subscription through `CLAUDE_CODE_OAUTH_TOKEN` in their instance repository (TL-P3-13). That is the multi-user model, and it is correct ([Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)). The Message Batches API at 50% off needs an API key, so it is not used. Fan-out is parallel headless calls with bounded concurrency (about 4-6, the subscription's rate limit), `--max-turns`, and a smaller model for map workers and classification once the corpus shows it is enough.

## 2. What people will ask: the request classes and how the back end serves each (reasoned)

| Class | Example (made up) | Back end | Where the person sees it (existing UI) |
| --- | --- | --- | --- |
| A. Capture | a pile with an offer PDF and words | inbox flow: two-step plan, closed ops | run report; the note; Table columns from properties |
| B. Correct or update | "my notice period is now 1 month" | C05 update of Bower notes; an About me observation | run report; the note |
| C. Ask | "which active offers ask for dbt?" | Ask Bower (C09) over the index, MOCs and properties, cited | the Ask Bower answer |
| D. Compute | "rank the skills offers ask for" | the view language (addendum 3), written into the MOC's figures | the MOC note; Table columns |
| E. Enrich | "add each company's rating" | map over a set, web workers on entity keys only | Table columns; the run report |
| F. Reorganise | "split Offers by country", "tag my AI articles" | map over a set with closed ops (move, rename, property, tag) | the tree; the run report |
| G. Author | "compare the three flats in a note" | C08 creates a Bower note with sources | a new note |
| H. Teach | "always file receipts by year" | Rules (C11), a type-table row or a property | Rules; later runs |
| I. Remember about me | "I prefer remote roles" | an About me observation (B4) | About me |
| J. Time | "tell me 30 days before the visa expires" | a view with "days until", surfaced in hot's Open threads and on Home | Home; hot |
| K. Undo | "undo the last tidy-up" | C13, with derived views rebuilt | the run report |
| L. Forget | "forget that I…" | removes the observation; About me rebuilt | About me |
| M. Act outside | "email the landlord", "apply to this job" | impossible (out of scope) | the answer, with the nearest alternative |

**One rule:** every class lands in a surface that already exists. These are notes (Markdown), MOCs (notes), properties (Table columns), Home yes/no questions, the run report and the Ask Bower answer. A class that would need new UI is either re-expressed in these surfaces or answered as impossible. A Home question is always yes/no. A choice among N options becomes "Left as you wrote them" with links, or a yes/no on the most likely option (reasoned).

## 3. What counts as an impossible request, and how Bower answers (reasoned)

A request is impossible when no plan built from the closed operation set, the view language and map over a set, within the permitted scope and budget, can satisfy it. There are five kinds:

1. **Forbidden:** a hard delete (the Bin is offered instead), editing a note the person wrote beyond C05's named append, writing `index.md`, `hot.md`, `log.md` or Bower's sections from the app, or touching anything outside the Bower folder.
2. **Capability off:** web access when the person has not allowed it.
3. **Not expressible:** a calculation outside the view language whose one-off map over a set would exceed the run budget. The budget is 200 items or 30 minutes per request.
4. **No data:** the answer is not in the folder, and the web is off or finds nothing.
5. **Outside Bower:** sending messages, payments, other accounts or apps.

**The answer:** one plain sentence saying why, plus the nearest possible alternative. When there is one, it comes as a yes/no question on Home, for example "Bower can't delete files for good. Put these 12 in the Bin instead?". If a request mixes possible and impossible parts and they can be separated, Bower does the possible part and the report states what it left undone. If they cannot be separated, nothing runs. Nothing is ever done partially or silently.

## 4. What can break, and the guard for each

| Risk | Guard |
| --- | --- |
| Drift in About me, MOCs and hot | derived views rebuilt from evidence; gated consolidation; archive before rewrite; lint checks MOC figures against the folder |
| The person edits Bower's notes or sections | read first and treated as a correction; modifiedTime on every write; never overwritten silently |
| Renames, moves or deletes made outside Bower | the changes feed (§1.6) plus stillAsSeen |
| Prompt injection from a document | the trusted plan fixes the targets; closed ops; bounded values; web workers see no content; the report lists every write |
| A wrong filing cascades into MOCs, About me and tags | ask when the classification is unsure; undo rebuilds the derived views |
| Proposal spam (type rows, tags) | at most 2 per run; tag caps; Open threads |
| Sensitive inference about the person | written only from the person's own words; Forget |
| Cost runaway | per-request budget; dedup by entity; a 30-day result cache; a smaller worker model; measured on the corpus |
| Rate limits and long runs | bounded concurrency; checkpoints; automatic continuation |
| Scale (thousands of notes) | MOC folding at 40; incremental changes feed; embeddings only if the corpus shows a need (not now) |
| Rules or type rows that conflict | first match wins; lint reports the conflict |
| Partial failure | checkpoints; derived views rebuilt at the end, idempotent |

## 5. Open questions for the owner

1. **The language of Bower's notes.** The vault writes everything in English. Bower could write in English always, or in the language of the source or the person's words.
2. **The budget for a single large request,** proposed above as 200 items or 30 minutes.
3. **The consolidation gate:** the section budget plus at least 5 new observations. Accept or tune.

## 6. Entries (supersedes TL-P4-38's order)

1. **B1:** the index and MOC folding, the changes feed, and two-step planning with the neighbourhood.
2. **B2:** summaries.
3. **B3:** hot, with its script-written sections.
4. **B5:** the type table with properties and profiles.
5. **B6:** templates, and fit → create → ask.
6. **B11:** the view language.
7. **B4:** About me, with the observation log, gating and archive.
8. **B7, B8, B9:** tags, log and lint, markers.
9. **B12:** map over a set, with safe workers.
10. **B10:** long texts.

Each entry is Codex-prepared with made-up data, then red, implementation, Codex pass and Claude review. Escalated entries follow TL-P4-29. Corpus cases cover every class in §2 and every impossible kind in §3.

## Addendum 1: Codex's adversarial review (2026-10-10-brain-design-codex-review.md; 7 Blocking, 6 Important, 1 Minor)

Every finding is accepted. Each B-entry's packet must cite its findings and the existing homes in the review's §2 table, and the Codex contract sign-off checks that. The rulings now:

**F1 (the existing overwrite race).** It stays the accepted, documented limitation (owner, 2026-10-06), and its exposure is reduced in three ways:
- automatic rewrites touch only Bower-owned regions;
- the region is re-read right before the write;
- after an automatic rewrite, Bower checks the file's Drive revision history, and if another author's revision landed between its read and its write, it restores that version, re-applies its change through note-edit, and reports it.

The revision check is researched and confirmed in B1's packet before it is relied on.

**F2 and R1.** Automatic maintenance keeps every existing ownership protection (TL-P4-08, TL-P4-10): a region the person edited becomes a Timeline line plus a question, never a silent rewrite. The new writable regions (MOC Overview, figures and list; About me's three subsections; a profile's Bower section; declared properties) are added to ownership-format.ts and note-edit. Each region gets its own mark and its personal-edit rule. "Bower created the file" alone grants nothing.

**F3.** Every maintenance write (index, hot, log, MOC figures, views) is an effect inside the run's manifest, before the report barrier. Each is idempotent: derived files are rebuilt whole, and a log line is keyed by its op id, so a resumed run re-applies it at most once. RUNNER_WRITES (layout.ts:41) is extended explicitly, file by file.

**F4.** `.bower/observations.jsonl` gives every fact a fact id and its origin (person's words, answer, rule or document), plus the source's file id and content hash. Forget and a person's deletion write a tombstone keyed by fact id and source; a tombstoned fact is never rebuilt, including from the archive. Consolidation writes the archive first (write-once) and About me second, and only from observations, so nothing is merged from summaries alone.

**F5 and U2.** A proposal (type row, property, view, tag) is an immutable `.bower/proposals/<id>.json` with its exact payload, behind a new question subject, `proposal`. The Home text summarises it ("Add a type 'Lease': goes to Areas/Home, columns Rent, Start, End, Landlord?"). Yes installs exactly that payload; no records a decline. The question survives the item being filed.

**F6 and U4.** A large request gets a request id at admission with a frozen member set, so later arrivals are not added. Continuation runs carry that id, and its permissions are captured at admission. A Bower result note, "Request: <short title>", gathers the outcomes across runs (done, pending, unavailable), and each run's report links to it. Continuation runs count against the quota like any run.

**F7.** Provenance is kept through every derived artifact. Only the person's words, answers and rules can create rules, type rows, preferences, sensitive facts or schema changes. A document only creates facts about its own subject, and an instruction-shaped sentence inside a document is evidence, never authority. The validators check this; there is no prompt-only guard.

**F8.** There is one aggregate budget per run and per request, covering calls, tokens, characters, operations and retries. It is measured in timing.ts, with per-call stats kept and parallel calls timed.

**F9.** The index is keyed by file id, and the path is shown only when a name is ambiguous (VaultIndex is the one home). Summaries are read through a cache keyed by file id and version, so only files the changes feed reports are re-read, with a ranged read for front matter if Drive allows it (checked in B1). An index cut by its budget says so, and "no match in a cut index" never authorises creating a new destination.

**F10.** Every derived view records the input versions it used. The changes feed refreshes what changed, and computed "days until" values are recomputed every run. Stale detection uses a meaningful activity date (the last Timeline line), never the file's modifiedTime.

**F11.** Per-item results that target the same note are merged by the planner into one edit per file before effects (one home), never applied as competing after-texts.

**F12.** B10 sits inside C15's preparation boundary. It marks an extraction as complete or partial, and its cache key covers the content hash, extractor version, configuration and folder scope (ARCHITECTURE.md:24).

**F13.** Properties are typed in the type row (number, money with its currency, date, enum, list, text). Money in different currencies is never summed together; it is grouped by currency. Missing values are excluded and counted. Computed values never feed other computed values (no cycles). Expressions have a fixed size cap.

**F14.** Log fields are escaped, and the log rotates per year (`log/2026.md`).

**U1 (no UI change).** A type row declares its "table" properties in order, at most 4, which fits FolderTable's capacity (FolderScreen.tsx:259). Other properties stay in the note.

**U3 (no UI change).** Lint findings go to a Bower note, "Bower health", rebuilt each run. The report links it as an updated note, which is true because it was rewritten.

**U5 (no UI change).** Corrections are made through the existing path (Drive or any editor, TL-P4-33). Forget is request class L through the words of a pile. Every actionable proposal reaches Home, never only hot.

**U6 (no UI change).** Markers are plain text that reads well as rendered Markdown: "> Contradiction: …" and "(inferred)". No special rendering is promised.

**R2.** Generated metadata (summary, type and the rest) is required only on Bower's notes. A note the person wrote never gains it, including in C05's named append.

## Addendum 2: the owner's answers and the supported-use principle (2026-10-10)

1. **Language.** Everything is English for now. Localization of the app, the notes and the model's writing will come later, so nothing new hard-codes the language in a second place:
   - one setting, `language` in the folder's `.bower/` config (default `en`);
   - prompts take the language as a parameter;
   - section names and line grammar (Current state, Timeline, the B-regions) are stable internal keys with English labels, kept in one home (note-format, timeline-line, ownership-format), so a later localization maps labels without changing parsing.
2. **The large-request limit is 200 items or 30 minutes.** Beyond it, "propose a split" means this:
   - Bower runs nothing yet.
   - Bower asks one yes/no question on Home that names a meaningful first part, chosen by the request's own set: the most recent, the active ones, or those in one folder. For example: "This needs about 500 company lookups; Bower does up to 200 at a time. Start with the 180 companies from your active offers?"
   - Yes runs that part as a normal request with its result note. Afterwards the person can ask for the rest in their own words.
   - No leaves everything unchanged.
3. **The consolidation gate, from the research** (gated, delayed, rebuilt from the evidence). A section is consolidated when it is over its size budget and has at least 5 new observations since its last consolidation. It is always rebuilt from the observation log plus tombstones, never from its own previous text, and the previous version is archived first.
4. **Supported use (the owner's principle).** Bower designs for normal use, not for unusual actions outside Bower:
   - **Supported outside Bower:** writing in your own notes with any editor (TL-P4-33), and adding files to the Bower folder. Bower reads these on its next run.
   - **Not designed for:** editing Bower's own notes, regions or files (MOCs, About me's Bower section, `index.md`, `hot.md`, `log.md`, `.bower/`), moving or renaming in Drive instead of in Bower, and editing a note during a tidy-up. If the person does these, Bower's next run may overwrite or ignore the change. That is documented, not engineered around.
   - **Future:** a short "things to know" guide or tutorial in the app (a later UI item, not now).

   Effect on addendum 1:
   - **F1:** no revision-history check; the accepted limitation stands as documented.
   - **F2 and R1:** the existing protections stay as already built (TL-P4-08 and TL-P4-10 for Current state), and the new B-regions are Bower's, with no personal-edit handling of their own.
   - **F10 and §1.6:** the changes feed stays only to refresh the index and summaries efficiently. There is no repair of renames made outside Bower, and TL-P4-35 (2b) stays post-P4 backlog.
   - **U5:** About me corrections happen through Forget in the person's words, or by editing their own text above Bower's section.

   Everything else in addendum 1 stands. It covers what Bower itself does (recovery, provenance, budgets, merging, typing) or plain correctness.
