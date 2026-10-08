# Technical-lead decision TL-P4-08: the owner's local second brain is the semantic reference

**Owner direction, 2026-10-08.** Bower should behave like the owner's local second brain, which "works perfectly", rather than like the original app's prompts. Asked whether to keep the current layout and change it later, the owner left the call to the lead: adopt the local method now and keep Bower's folder layout for good (reasons below). The owner can overrule. Only the method is copied: rules, note shapes and workflow. No content, names, tags or files from the owner's vault enter the repo, and every example stays made up.

**What changes.** The local second brain's method becomes the reference for every P4-C slice: how Bower classifies, writes, updates and connects. The original app stays the reference for the wire, the permission policy, `CLAUDE_CODE_OAUTH_TOKEN` handling and the benchmark. Where the two differ in behaviour, the local method wins.

**The method, as Bower adopts it:**
1. **Fit, then create, then ask.**
   - Reuse an existing project, area or topic.
   - If none fits and the destination is clear, create it and say so in the report: the new folder and why. This is the `responsibility` basis of TL-P4-07 addendum 3.
   - Check for near-duplicate names first.
   - If the destination is genuinely ambiguous, ask. A run has nobody to answer, so the item stays in the inbox untouched with a question for the person (C11), and everything else is processed. A run never waits and never guesses.
2. **The value gate.** A document that only confirms a known fact updates the existing note (its state, checklist or timeline). It does not create a new note.
3. **Source notes are immutable.** A compiled note has a *Current state* that is rewritten, and a *Timeline* that is appended to, with each entry citing its source. A contradiction is marked with both sources (C07).
4. **Every new note links** its hub or MOC and 1–5 related notes (C06).
5. **Kinds of document.** A type table maps kinds to destinations and note shapes. A new kind is handled like the closest known kind, and at most 2 table rows are proposed per run, through the report.
6. **Budget.** Classify before reading. Read at most 5 existing notes per source. A long text is summarized first.
7. **Look for what the document changes,** such as statuses, dates, deadlines and amounts, and update those notes too (C05).
8. **The report** gives the outcome first: saved, updated, warnings and questions, one short line each.

**What stays: Bower's layout.** An original sits next to its note in its PARA folder, as now. The local vault keeps binaries in an attachments folder because it is read in Obsidian. Bower's folder is read in Google Drive, where a PDF beside its note is easier to find. The owner's real folder from the original app already uses this layout, so changing it later would mean migrating that folder at the cutover. The layout is decided now and stays.

**Entries:**
- `second-brain-method` (`bower-escalated`, since the prompt contract crosses every slice). It rewrites the provider's instructions from points 1–8. It keeps the operation list as a starting contract (PRODUCT): if "leave in the inbox with a question" or "update the timeline" has no operation yet, it registers one and does not stretch an existing one. It checks every C04–C15 rubric against the method and fixes a rubric only where it contradicts the method, recording each change. The model-input golden is regenerated on purpose.
- `placement-check` finishes under TL-P4-07 addendum 3. Its `responsibility` basis is point 1's "create and say why".
- P4_PLAN's "Reuse from the original app" now names this decision.

**Addendum, 2026-10-08: what `second-brain-method` left open.** The rubric changes are accepted as recorded in [the rubric changes](2026-10-08-p4-method-rubric-changes.md).
1. **Rewriting Current state needs a change kind of its own,** so it can be undone (C13) and checked against the person's text. It is the first entry of the C05 slice: `state-rewrite-change` (`bower-escalated`, since it touches contracts and undo).
   - It rewrites only the Bower-owned *Current state* section, through `stillAsSeen` and the modifiedTime it read.
   - The manifest keeps the previous text, so undo restores it.
   - A section the person edited after Bower is never rewritten: the change becomes a timeline line plus a question.
2. **Proposing type-table rows** waits for the C11 slice (rules and proposals) as `type-proposals`: a report field, at most 2 per run, applied only once the person accepts.
3. **`bench-4-scanned-pdf` stays unchanged,** so the speed comparison with the original stays like for like. Its file `scan0001.pdf` has no text and a name that says nothing, so under the method "asks" is the correct outcome. Quality is judged that way. The original's filing is recorded as the original's behaviour, not as Bower's bar.
4. **The answer to an ask reaching the model** waits for the C11 slice as `ask-answer-loop`. Until then, an item that is asked about stays in the inbox, and a later run does not repeat a question that is already open.
