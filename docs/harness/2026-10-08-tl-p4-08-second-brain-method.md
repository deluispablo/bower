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

**Addendum 2, 2026-10-08: live garden ×5 on `c6ddb96` passes 2/5, because the note is dropped.** Every run filed the PDF in `Resources/Community garden`, with no ask and no new area. In three runs no note was made: `created=[]`, with 355–439 output tokens against about 670 in the passing runs. The input, `"note" (optional)` in `runner/src/claude.ts`, leaves the note to the model. The value gate is the only stated reason to skip it, and a fresh folder has no note it could confirm.
- **The method requires the note.** In the local method every binary gets a source note. In the original, "a document (a PDF or a converted file) gets its companion note". The value gate decides only whether a compiled note is created or updated, never whether a document's own note is written.
- **`document-note-required`** (`bower-implementer`), with the same validation as `placement-check`:
  - Every thing with prepared text gets its `note`, unless a Timeline line on an existing note cites it (the value gate).
  - The spine refuses a reply that breaks this, retries once with the reason, and a second refusal ends the run as C12 does.
  - Photos and things with no text need no note.
  - The prompt says so in the same words. Scripted tests cover all three paths.
- **`fingerprint-normalised` is reopened** (`bower-mechanical`): `input=` still differs every run. The test is two runs on fresh fake folders with the same case, which must give the same fingerprint.
- **`c04-offer-and-flat` waits** for these two entries, so its runs measure the fixed prompt. Claude is off.

**Addendum 4, 2026-10-08: live runs on `80ae66d`.**
- **Garden ×5 passes 5/5.** Every run put the PDF and its note in `Resources/Community garden`, and every note holds the 4 dates. Press → done took 0:52–1:03.
- **The input sections.** prompt, tree, notes and rules are identical on all five runs. Only `things` varies, so a per-run value in the shown piles is not normalised.
- **Offer-and-flat run 1 failed** with nothing changed. The model filed part of the 4-thing pile and asked about the same pile. The spine refused the reply, and that refusal had no retry.

**Ruling: both changes.**
1. **An ask can name one thing.** The local method asks about a file and processes everything else, so `asks` takes a `fileId` (a thing) as well as a `pileId` (a words-only pile, or the whole pile).
   - The things asked about stay in the inbox untouched, keeping the pile's words, and the rest of the pile is filed.
   - It is `per-thing-ask` (`bower-escalated`, since it changes the operation contract). The report and the question flow show which thing is meant.
2. **Every validation refusal gets the same single retry** with its reason, then ends as C12 does. No refusal kind ends a run without one. The same entry makes this uniform, with a test that lists every refusal kind and checks that each one retries.
3. **`things-normalised`** (`bower-mechanical`) finds the per-run value in the shown piles, most likely a pile id or a time, and normalises it in the fingerprint only, never in what the model sees, unless the value is noise the model does not need.

Then offer-and-flat ×3, and garden ×2 as a regression check. Claude is off.

**Addendum 5, 2026-10-08: offer-and-flat ×3 and garden ×2 on `b54392c`.** Both garden runs pass. Offer-and-flat shows the same pattern in all three runs:
- the offer goes to Job hunt, with a correct note;
- the link goes to Flat hunt, with a "Flat listing 88213" note;
- the payslip goes to a new `Areas/Pay and tax records`;
- the photo is asked about;
- both hubs get a line.

No run needed a retry.

**What is accepted:**
1. **The photo ask is a pass.** `IMG_2301.jpg` is an unread image whose name says nothing. The local method asks in that case, and the rubric itself says nothing is filed only because of the pile's words. The rubric gains this as a passing outcome; the change is logged in the rubric-change file.
2. **The listing note without an address is a pass.** The link has no prepared content (no web, no preparation yet), so an address would be invented. The rubric becomes "keeps the address when the link's prepared text has one". C15 checks it again once links are prepared.
3. **The payslip is a pass** with any Area named for money, pay or finance. The kinds line in the prompt says "payslip: Areas, pay and tax records", and the example became the folder name. The kinds table should describe the area, not name it ("the person's money area"), and the responsibility example should not be a ready-made folder name. That goes in `c04-prompt-fixes`.

**Real misses, in `c04-prompt-fixes`** (`bower-implementer`):
- **Run 3 invented "the 30-minute commute limit".** Add `numbers-grounded`: every number in a note body, summary or Timeline line must appear in the cited thing's prepared text, the pile's words or a note shown. Otherwise the reply is refused and retried once. This is a deterministic grounding check and does not judge style.
- **Run 1 kept `Offer_letter_final(2).pdf`.** The prompt states the original's naming rule and makes it concrete: underscores, copy numbers like "(2)", "final" and camera-style ids make a name that says nothing, which is replaced by a plain one.
- **`things-normalised` round 2:** a per-run value remains in multi-thing and link piles.
- **The pile's request,** "Compare the commute", belongs to C08/C11 (requests in the pile's words). It is recorded, not fixed here.

**Then** offer-and-flat ×3 and garden ×1. C04 closes when they pass.

**Speed.** On offer-and-flat, apply takes 23–35 s and reads 15–36 s. `drive-calls-cut` (`bower-implementer`) runs beside the C05 slice once C04 closes. Its aim is a ≥40% cut of the Drive calls per run on the C04 golden, with batching and the listing reused.

**Addendum 6, 2026-10-08: C04 passes live on `327b987`.** Offer-and-flat passes 3/3 and garden 1/1. There were no retries and no invented numbers, and names say what each thing is. The payslip's new Area Money gives its reason. The photo is asked about. Timings are in [p4-speed-baseline](p4-speed-baseline.md).

Next, two workers in parallel:
- **C05**, opening with `state-rewrite-change`.
- **`drive-calls-cut`.** Fewer Drive calls per run (at least 40% fewer on the C04 golden), and apply on offer-and-flat at no more than half its median.
  - Effects that do not depend on each other run with bounded concurrency.
  - Each effect still has its `bowerOp` stamp and its own `stillAsSeen` check, and the checkpoint barrier stays as it is.
  - The Drive-call golden is updated on purpose.

**Addendum 7, 2026-10-08: two C05 rulings.**
1. **`c05-hub-lines` `expected.json`.** It pinned "scored 7 out of 10 against your CV", but no source has a CV or a score. A line that invents a score breaks the method and `numbers-grounded`, so the expectation is wrong. It becomes a grounded line ("fully remote, 42,000 a year, start 2 November"), logged in the rubric-change file.
2. **`c05-keep-one-note` stays in C05,** since "keep one note" is in C05's matrix row. It is split:
   - **`keep-one-note-merge`** (`bower-escalated`), now. The spine gains a merge of two existing notes:
     - the intent names the kept note and the other note;
     - the facts and the Timeline are carried into the kept note, with sources;
     - the other note goes to the Drive Bin;
     - links are rewritten;
     - every step is undoable from the manifest.
     It is proven with scripted proposals in which the person's answer is given in the fixture.
   - **`ask-answer-loop` comes forward from C11,** because C05 needs it. It waits for the owner's decision on its trigger (TL-P4-09 note): either a small tidy-up for that item at once, or the next tidy-up the person starts.
   - C05 closes when both pass.
