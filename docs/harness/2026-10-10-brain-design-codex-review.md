# Adversarial design review: TL-P4-38 brain port

Verdict: **Blocking — the design needs contract rulings before implementation.**  
Reviewed detached main `3e2d9f2021b3d24e80526c8538b1e88f28305b27`, including addenda 1–3.  
The existing spine supplies useful ownership, fencing, write-once, checkpoint and report mechanisms.  
The largest gaps are new writable regions, durable memory removal, proposal consent, continuation and aggregate budgets.  
Read-only repository inspection; no network, file changes, builds or tests.

## 1. What breaks

### F1 — Blocking: modifiedTime checks do not prevent an external Drive edit from being overwritten

The design requires modifiedTime on automatic note updates (`docs/harness/DECISIONS.md:407`). The actual transport compares a freshly read modifiedTime and then sends an unconditional content PATCH (`src/data/drive/drive-http.ts:193`, `src/data/drive/drive-http.ts:199`). The runner explicitly acknowledges this race (`src/data/spine/engine.ts:38`).

**Failing scenario:** Bower checks Alex’s profile; Alex changes it in Drive before the PATCH; Bower replaces the file with its earlier text. The operation stamp and checksum confirm Bower’s write, not preservation of Alex’s intervening edit (`src/data/spine/write-once.ts:111`).

This is an existing limitation whose exposure grows substantially with automatic profile, MOC, property and memory rewrites. Passing modifiedTime alone cannot establish the proposed safety guarantee.

**Fix direction:** Rule explicitly on the existing storage race before authorizing the additional automatic overwrites.

### F2 — Blocking: “Bower created the note” is broader than “Bower owns this section”

The latest ruling authorizes automatic updates to Bower-created notes (`docs/harness/DECISIONS.md:407`), but existing section ownership survives personal edits:

- Changed Current state requires a grant; an unmarked state remains personal (`src/data/contracts/note-edit.ts:415`, `src/data/contracts/note-edit.ts:418`).
- The edit invariant preserves the personal payload (`src/data/contracts/note-edit.ts:746`).
- The ownership grammar has only current, personal, timeline and bower-note regions (`src/data/contracts/ownership-format.ts:5`).

There are no writable regions for MOC Overview, figures and lists, profile prose, About me subsections or arbitrary frontmatter properties. The closed change union supports state, links, Timeline and rules only (`src/data/contracts/run-manifest.ts:66`).

**Failing scenario:** Alex corrects a MOC Overview. The next run treats the whole MOC as Bower’s and rewrites the correction; alternatively, the existing author refuses the required change.

**Fix direction:** Define the writable regions and personal-edit behavior through the existing ownership and note-edit contracts.

### F3 — Blocking: “after every run” maintenance has no specified recovery boundary

B1, B3 and B8 prescribe index, hot and log writes after a run (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:35`, `:37`, `:42`). B11 adds another after-run engine (`docs/harness/DECISIONS.md:419`).

The existing engine persists its manifest before effects and resumes that manifest without replanning (`src/data/spine/engine.ts:10`, `:15`, `:133`). Successful completion follows the report barrier (`src/data/spine/barrier.ts:2`). A completed report can cause the runner to skip work on redispatch (`runner/src/main.ts:238`).

**Failing scenario:** Filing succeeds, the report lands, and the process stops before hot/index maintenance. Redispatch finds done and leaves the derived files stale. Conversely, a lost log-write response followed by recomputing the append can duplicate a line.

The current runner-write allowlist admits only questions, requests and hashes (`src/data/vault/layout.ts:41`); `.bower/type-table.md`, tags, summary caches and root bookkeeping files need explicit contracts.

**Fix direction:** Place every new maintenance effect inside the existing recoverable execution and completion protocol.

### F4 — Blocking: About me cannot yet honor removal or lossless consolidation

B4 prohibits re-adding a removed fact from the same source (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:38`). Addendum 2 permits rewriting sections and archiving older detail in the same run (`docs/harness/DECISIONS.md:408`).

The existing About me template is personal text, without a Bower ownership mark (`src/data/contracts/folder-template.ts:29`). Timeline provenance stores a source string, not a durable fact identity or source-version binding (`src/data/contracts/run-manifest.ts:48`; `src/data/contracts/timeline-line.ts:8`).

**Failing scenarios:**

- Alex deletes “Prefers remote work”; reflection reads its archive copy and restores it.
- A source is renamed, and the same removed fact returns under its new source name.
- Consolidation removes detail from About me, but the archive write clashes or fails.
- A model “merges” conflicting sourced observations and loses a qualification while remaining within 1,000 words.

Neither absence from the current text nor a source display name establishes a durable removal decision.

**Fix direction:** Specify durable fact/removal provenance and recoverable consolidation before enabling B4.

### F5 — Blocking: a type proposal cannot safely reuse an ordinary filing question

B5 handles an unknown item using the closest row, then asks whether to add a row (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:39`).

Existing question subjects are inbox, state, pair or folder (`src/data/contracts/questions.ts:36`). An inbox question closes when its subject leaves the inbox (`src/data/contracts/questions.ts:129`); a folder-subject yes starts no immediate run (`src/data/answer-loop.ts:34`). The model’s Ask shape has no stored row, template, properties or proposal-version payload (`runner/src/claude.ts:823`).

**Failing scenario:** An unfamiliar certificate is filed using a generic row. Its proposal, represented as an inbox question, disappears because filing removed the subject. Representing it as a folder question preserves visibility but does not establish which exact schema the yes accepts.

**Fix direction:** Extend the existing question/answer mechanism with durable proposal identity and an exact accepted payload.

### F6 — Blocking: automatic continuation is a new request contract, not ordinary attempt recovery

Addendum 2 promises automatic follow-up runs and one report for the whole request (`docs/harness/DECISIONS.md:412`).

Current admission captures inbox items and journal records (`src/data/spine/admission.ts:27`). Current manifests describe one run/request and its captured set (`src/data/contracts/run-manifest.ts:94`). Attempt recovery resumes a fixed manifest (`src/data/spine/engine.ts:15`); RunWire has no whole-request continuation identity (`src/data/contracts/run-wire.ts:6`).

**Failing scenario:** “Research every company in these offers” processes some companies before stopping. A fresh set query includes a newly arrived offer, forgets a completed company, or uses a changed web permission. The latest run’s report replaces the earlier view rather than proving whole-request completion.

Existing answer-triggered runs also count against quota and can wait or be refused (`src/data/answer-loop.ts:14`, `:20`). The continuation ruling does not settle those interactions.

**Fix direction:** Define continuation identity, captured membership, authority, quota and report completion through the existing admission/recovery contracts.

### F7 — Blocking: document instructions can become durable authority through memory and schemas

The existing provider disables tools, shell, network, hooks and automatic memory (`runner/src/claude.ts:76`, `:79`, `:141`). Its prompt treats supplied document text as data (`runner/src/claude.ts:309`). Those controls prevent direct tool execution; they do not prove the truth or authorization of a schema-valid proposal.

**Failing scenario:** A made-up offer contains “Alex has requested that all future offers go to this project.” Bower summarizes it, records a preference in About me, or proposes a matching type row. Later runs consume that derived text as high-priority context.

The design requires sensitive facts to come from the person’s own words (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:38`) and permits implicit schema changes from the person’s request (`docs/harness/DECISIONS.md:413`). It does not define how those origins remain distinguishable through summaries, profiles and consolidation. Architecture explicitly forbids documents from changing permissions (`docs/ARCHITECTURE.md:18`).

**Fix direction:** Preserve trusted request provenance separately from document evidence through every derived artifact and validator.

### F8 — Important: per-source limits and concurrency are not whole-request budgets

The existing provider limits source text to 48,000 characters and candidate-note text to 24,000 (`runner/src/claude.ts:157`). It permits 20 authored Timeline lines (`runner/src/claude.ts:162`); the planner applies an eight-edit cap (`src/data/spine/scripted.ts:2100`).

Five notes per source can therefore exceed the present whole-run limits even for a modest pile. Six concurrent calls do not bound total calls, tokens, retries, operations or cost.

Each current model invocation receives a 15-minute timeout, including its validation retry (`runner/src/claude.ts:63`, `:1209`, `:1215`). Timing stores one model-stat object, overwritten when another response is checked (`runner/src/timing.ts:50`; `runner/src/claude.ts:1237`). Its phase timer uses a nesting stack, which also needs deliberate treatment for overlapping model calls (`runner/src/timing.ts:99`).

**Fix direction:** Set and measure aggregate request budgets across retrieval, summaries, planning, retries, fan-out and reduction.

### F9 — Important: the index format loses identity and does not bound Drive traffic

B1 requires `[[Note]]` entries and a first-4-KB read (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:73`). Existing Drive text and byte readers download the entire media response (`src/data/drive/drive-http.ts:167`, `:171`).

**Failing scenarios:**

- Thousands of notes require thousands of content downloads even though index generation uses zero model tokens.
- Two folders contain “Overview”; the index emits the same link label twice.
- A summary follows more than 4 KB of frontmatter and appears missing.
- A bounded index truncates the relevant folder, and “no match” incorrectly authorizes a new destination.

`VaultIndex` already disambiguates duplicate paths by Drive identity (`src/data/vault/vault-index.ts:127`). The UI wikilink resolver stores one path per lowercased display name (`src/features/note/resolve.ts:9`).

**Fix direction:** Specify identity-preserving retrieval, incomplete-index behavior and actual read/call bounds.

### F10 — Important: index and MOC drift can authorize incorrect planning

B1 rebuilds the index after runs; addendum 1 folds large folders to a MOC line (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:35`; `docs/harness/DECISIONS.md:407`).

The runner’s listing patch mechanism describes its own writes (`runner/src/drive.ts:135`). The shared cache is version-keyed and explicitly is not a write fence (`src/data/drive/read-cache.ts:12`).

**Failing scenario:** Alex moves a note, changes its company property or creates a new project between runs. The next planner trusts an old index/MOC and creates a duplicate or researches the wrong entity. A target write fence may pass because it checks the target, not every input used to calculate the result.

Time-dependent formulas also become stale without a run. Rewriting computed properties changes file modifiedTime, which can obscure a “stale for 60 days” check based on that timestamp (`src/data/drive/drive-http.ts:199`; design lint at `docs/harness/2026-10-10-tl-p4-38-brain-port.md:96`).

**Fix direction:** Define freshness, dependency versions and meaningful activity dates for all derived views.

### F11 — Important: independent map tasks can collide on shared notes

Addendum 2 validates and applies per-item closed operations (`docs/harness/DECISIONS.md:410`). Multiple offers can update the same company profile, project or MOC.

The manifest permits one edit per file (`src/data/contracts/run-manifest.ts:512`). The scheduler serializes shared file claims (`src/data/spine/schedule.ts:38`), but serialization does not combine two after-texts calculated from the same before-text.

**Failing scenario:** Two tasks each add a different skill to one profile. The first lands; the second clashes, or a bypass overwrites the first addition.

**Fix direction:** Resolve shared-target proposals through the existing planner before building effects.

### F12 — Important: B10 may summarize an already truncated extraction

The current PDF extractor stops at the source’s text-budget share (`runner/src/extract.ts:68`), and the provider bounds it before planning (`runner/src/claude.ts:374`). A 3,000-word threshold applied afterward can miss a long document whose visible prefix is shorter.

The new cache is described only as living in `.bower/` (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:44`). Architecture requires content hash, extraction version, relevant configuration and account/folder scope (`docs/ARCHITECTURE.md:24`).

**Failing scenario:** A deadline after the extraction cut is omitted; the cached summary appears complete. A later source change reuses the old summary, or an invented summary number becomes the apparent grounding source.

**Fix direction:** Specify complete-versus-partial extraction, summary provenance and versioned cache validity through C15’s preparation boundary.

### F13 — Important: B11 needs evaluation semantics and bounds beyond a closed grammar

Addendum 3 adds aggregates and formulas, including division, date differences and conditional expressions (`docs/harness/DECISIONS.md:414`).

“Validated grammar” does not settle missing values, units, currencies, timezones, division by zero, dependency cycles or expression complexity. Current note properties are flattened strings (`src/data/contracts/note-format.ts:94`, `:165`), insufficient as the authoritative typed representation for these calculations.

**Failing scenario:** “Spend per month” sums amounts in different currencies; a missing area produces a misleading price per square metre; computed properties feed themselves on the next evaluation.

**Fix direction:** Specify typed evaluation, dependency and resource semantics for the one engine before B11 preparation.

### F14 — Minor: log lines have no escaping or growth rule

The log grammar uses unescaped `|` separators (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:79`). Existing recordable-name validation does not exclude that character (`src/data/contracts/run-manifest.ts:148`).

**Failing scenario:** A note named “Options | alternatives” makes the log ambiguous. An indefinitely growing log eventually requires a large whole-file append.

**Fix direction:** Define reversible field encoding and a bounded append/storage policy.

## 2. Existing mechanisms each B-entry must reuse

These are extension obligations. New behavior is legitimate; a second transport, parser, writer or recovery engine is not (`docs/ARCHITECTURE.md:82`).

| Entry | Required existing homes; duplication to avoid | Rank and fix direction |
| --- | --- | --- |
| **B1 — Index** | Use `VaultIndex` for ID/path identity (`src/data/vault/vault-index.ts:27`), `ReadCache` for versioned reads (`src/data/drive/read-cache.ts:29`), and `parseNote` for summaries (`src/data/contracts/note-format.ts:148`). Persist through the spine/checkpoint/barrier homes (`src/data/spine/engine.ts:118`; `src/data/spine/barrier.ts:61`). Avoid a second tree, frontmatter parser or after-run writer. | **Blocking:** extend the runner-owned artifact contract and define bounded retrieval. |
| **B2 — Summaries** | Extend `serializeNote` and `parseNote` (`src/data/contracts/note-format.ts:196`, `:148`), generated-note construction (`src/data/spine/scripted.ts:1362`) and the one reply schema (`runner/src/claude.ts:804`). Existing edits preserve summaries outside Current state (`src/data/contracts/note-edit.ts:447`). Avoid independent YAML/string serializers. | **Important:** enumerate creation/update paths and preserve the person-note exception. |
| **B3 — Hot** | Use authoritative question state (`src/data/contracts/questions.ts:136`), outcome materialization (`src/data/spine/report.ts:51`), journal identity and the barrier (`src/data/spine/barrier.ts:61`). Keep root-file ownership in `layout.ts` (`src/data/vault/layout.ts:43`). Avoid another pending-question store or completion hook. | **Blocking:** make hot a recoverable derived artifact, never the authority for pending work. |
| **B4 — About me** | Extend ownership parsing/context (`src/data/contracts/ownership-format.ts:38`), note-edit’s author/invariants (`src/data/contracts/note-edit.ts:791`), Timeline grammar (`src/data/contracts/timeline-line.ts:11`) and manifest effects (`src/data/contracts/run-manifest.ts:66`). Reuse inverse-change semantics where Undo applies (`src/data/vault/journal.ts:539`). | **Blocking:** add explicit memory-region, provenance, removal and consolidation contracts. |
| **B5 — Types/profiles** | Extend `RUNNER_WRITES` (`src/data/vault/layout.ts:41`), question subjects (`src/data/contracts/questions.ts:36`), answer admission (`src/data/answer-loop.ts:68`), reply validation (`runner/src/claude.ts:800`) and C05 state updates (`src/data/spine/scripted.ts:1064`). Avoid a separate proposal queue or profile writer. | **Blocking:** bind acceptance to stored schema content and preserve section ownership. |
| **B6 — Templates/MOCs** | Use existing capture/decide/build boundaries (`src/data/spine/scripted.ts:347`, `:382`, `:1543`), naming/creation planning (`src/data/spine/scripted.ts:1338`), note serialization (`src/data/contracts/note-format.ts:196`) and reserved-ID creation (`src/data/spine/engine.ts:192`). Keep folder bootstrap in `folder-template.ts` (`src/data/contracts/folder-template.ts:22`). | **Blocking:** map templates and MOC regions into the existing ownership/edit contracts. |
| **B7 — Tags** | Use the note tag parser/serializer (`src/data/contracts/note-format.ts:170`, `:200`), the shared reply validator and runner-write allowlist (`runner/src/claude.ts:800`; `src/data/vault/layout.ts:41`). Reuse B5’s proposal mechanism if acceptance is required. Avoid another taxonomy registry or YAML parser. | **Important:** settle automatic-versus-approved growth and enforce limits deterministically. |
| **B8 — Log/lint** | Derive effects from settled outcomes (`src/data/spine/report.ts:51`), use write-once evidence (`src/data/spine/write-once.ts:111`), and extend report/barrier serialization (`src/data/spine/barrier.ts:123`). Reuse note/link/fence grammars (`src/data/contracts/note-format.ts:148`; `src/data/contracts/links.ts:42`; `src/data/contracts/ownership-format.ts:88`). | **Blocking:** attach logging and lint results to recovered outcomes, with a real report destination. |
| **B9 — Markers** | Extend `timeline-line.ts` (`src/data/contracts/timeline-line.ts:8`), field validation and note-edit (`src/data/contracts/note-edit.ts:62`, `:85`), plus tolerant note readers (`src/data/contracts/note-format.ts:117`). Avoid a second Timeline or contradiction-line format. | **Important:** define compatible marker storage and plain-note rendering before changing producers. |
| **B10 — Summaries of long texts** | Extend extraction (`runner/src/extract.ts:51`), context bounds (`runner/src/claude.ts:157`), isolated model calls (`runner/src/claude.ts:1203`), cache/hash primitives (`src/data/drive/read-cache.ts:26`; `src/data/contracts/hashes.ts`) and timing (`runner/src/timing.ts:45`). Share preparation with C15 as required by `docs/ARCHITECTURE.md:24`. | **Important:** use one versioned preparation path and aggregate every model step’s budget. |

**B11 is now mandatory scope:** addendum 3 explicitly adds it after B6 (`docs/harness/DECISIONS.md:419`). It must feed the same validated planner, note-edit and effects engine; “script-written” cannot establish a separate Drive writer.

## 3. Where the fixed UI cannot express the promised result

### U1 — Blocking: arbitrary properties do not all become Table columns

`FolderTable` takes only the first four custom property keys (`src/features/files/FolderScreen.tsx:259`). Status is separate; tags and summary are excluded from ordinary properties (`src/data/contracts/note-format.ts:27`). Rows are the supplied folder items, with properties read from Markdown notes (`src/features/files/FolderScreen.tsx:248`, `:264`).

**Failing scenario:** type, created, updated and source occupy the four columns. Salary, company and a newly requested computed metric never appear. Nested folders remain folder rows rather than a recursive declarative set.

The claim that new and computed properties automatically show as columns is therefore too broad (`docs/harness/DECISIONS.md:407`, `:419`).

**Fix direction:** Constrain the Table promise to its actual capacity or authorize a separate Table change.

### U2 — Blocking: Home yes/no can ask, but cannot currently identify an accepted schema

Home renders question text, an optional note link, an optional shown state update and two buttons (`src/features/home/Home.tsx:317`). The shown payload is a state-update structure, not a type/property/view proposal (`src/data/vault/layout.ts:109`; `src/data/contracts/questions.ts:36`).

Plain text can express “Add this type?” It cannot currently bind approval to the exact matcher, precedence, template, properties and profile target that will be installed. `.bower/` proposal files are hidden from the explorer (`src/data/vault/layout.ts:45`).

**Fix direction:** Rule on a reviewable, immutable proposal representation using the existing question surface.

### U3 — Blocking: lint findings have no displayed run-report collection

The manifest report has filing, creation, update, set-aside and question collections, plus specified optional results (`src/data/contracts/run-manifest.ts:84`). Materialization explicitly copies those fields (`src/data/spine/report.ts:55`). `RunLinks` displays new notes, updates and answers it could not act on (`src/features/tidy/RunLinks.tsx:15`).

**Failing scenario:** lint finds an orphan and an invalid tag. Adding a `lint` field does not make either visible. Calling them “updated” falsely claims a mutation; “set aside” describes inbox processing rather than garden diagnostics.

The fixed UI can link to a generated Markdown report note, but B8 does not specify that result route.

**Fix direction:** Name an existing visible result destination or authorize the required report extension.

### U4 — Important: whole-request reporting is absent from the current run surface

The tidy sheet shows one run’s phase and `RunLinks` (`src/features/tidy/TidySheet.tsx:125`, `:152`). Replay consumes that run’s filed items and update count (`src/features/tidy/Replay.tsx:40`).

Neither surface establishes “37 companies completed, 3 pending continuation, 2 unavailable” across multiple runs. A generated result note can carry those details, but backend request aggregation is still required before the existing surface can truthfully link to it.

**Fix direction:** Define a whole-request result artifact and completion meaning before promising invisible continuation.

### U5 — Important: About me correction and Forget require an external editor under the fixed UI

The note screen offers rendering and task toggles, not prose editing (`src/features/note/NoteScreen.tsx:153`). Its empty-note copy explicitly directs writing to Drive or another notes app (`src/features/note/NoteScreen.tsx:150`).

Hot, index and log are hidden (`src/data/vault/layout.ts:43`), so placing an open proposal only in hot does not expose it.

**Fix direction:** State the existing external correction path and ensure every actionable proposal appears through Home.

### U6 — Important: B9 markers display literally rather than as semantic callouts or footnotes

The Markdown renderer treats quoted lines as one ordinary blockquote (`src/features/note/markdown.tsx:117`). Inline parsing supports wikilinks, bold, italic and code, with no inferred-marker handling (`src/features/note/markdown.tsx:15`). Timeline text uses that same Inline renderer (`src/features/note/NoteScreen.tsx:185`).

Thus `[!contradiction]` and `^[inferred]` can remain readable text, but do not become specialized callouts or footnotes. Multiline callouts also cannot be ordinary Timeline text because control characters are rejected (`src/data/contracts/note-edit.ts:62`).

**Fix direction:** Specify literal plain-note output or authorize marker-rendering changes; do not promise existing semantic rendering.

## 4. Gaps and contradictions with earlier rulings

### R1 — Blocking: automatic updates need an explicit exception for person-edited Bower sections

TL-P4-08 requires a person-edited Current state to become a Timeline line plus a question (`docs/harness/DECISIONS.md:102`). TL-P4-10 withdrew automatic adoption based on a Bower write (`docs/harness/DECISIONS.md:114`). Both remain implemented (`src/data/contracts/note-edit.ts:417`).

Addendum 1’s “without being asked” cannot silently repeal those protections merely because Bower originally created the file (`docs/harness/DECISIONS.md:407`).

**Fix direction:** State that automatic maintenance retains the existing section-ownership protections, or explicitly rule on their replacement.

### R2 — Blocking: B2’s universal summary requirement conflicts with the person-note exception

“Every note Bower writes” receives summary/frontmatter requirements (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:36`, `:80`). C05 explicitly preserves the person’s summary and prose (`docs/harness/DECISIONS.md:352`) and requires every non-target byte to remain identical (`docs/harness/2026-10-10-tl-p4-32-c05-person-notes-contract.md:13`).

**Failing scenario:** A named personal note lacks a summary. Adding one during the authorized append violates C05; refusing the append violates its thin-slice behavior.

**Fix direction:** Limit mandatory generated metadata to the writable note kinds and preserve C05’s explicit exception.

### R3 — Important: generic automatic maintenance must preserve immutable sources

Earlier method rulings distinguish immutable source bodies from compiled Current state/Timeline (`docs/harness/DECISIONS.md:101`). The new appendix repeats source-body immutability (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:82`), while addendum 1 broadly includes notes Bower created (`docs/harness/DECISIONS.md:407`).

**Fix direction:** Explicitly exclude immutable source bodies from automatic profile/MOC/memory rewriting.

### R4 — Important: copied type destinations conflict with the accepted PARA layout

The appendix sends articles to “Sources” and CVs to “originals” (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:88`, `:90`). TL-P4-08 retained the original beside its note in the PARA folder (`docs/harness/2026-10-08-tl-p4-08-second-brain-method.md:21`).

The provider’s destinations exclude root, Inbox and bookkeeping paths (`runner/src/claude.ts:330`).

**Fix direction:** Translate the copied method’s logical roles into the accepted folder layout.

### R5 — Important: template order conflicts with the existing legacy section grammar

Project places Goal and Next steps before Current state; Area places Standard first (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:84`). The legacy parser recognizes Current state only immediately after frontmatter (`src/data/contracts/ownership-format.ts:152`).

**Failing scenario:** A generated Project looks correct as Markdown, but Current state becomes personal body content and later updates cannot use C05 safely. Updating Next steps also changes a personal payload under the current grammar.

**Fix direction:** Make template serialization conform to the existing ownership grammar or rule on a compatible extension.

### R6 — Important: the base document is stale relative to all three addenda

The base still describes stable-fact append growth, B1–B10 and preparations starting now (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:38`, `:65`). Later rulings add property schemas, hierarchical MOCs, two-step planning, immediate memory consolidation, deterministic fan-out and B11 (`docs/harness/DECISIONS.md:407`, `:408`, `:419`). Addendum 1 also says preparations remain on hold (`docs/harness/DECISIONS.md:407`).

Its root-file exclusion also requires an explicit archive placement: a root-level “About me - archive” would not enter the prescribed index (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:74`; `docs/harness/DECISIONS.md:408`).

**Fix direction:** Reconcile one authoritative scope, dependency order and preparation status before issuing packets.

### R7 — Important: the new declarative engine conflicts with model-only numeric grounding unless provenance is separated

The current prompt forbids working out figures (`runner/src/claude.ts:284`), following the no-invented-numbers ruling (`docs/harness/DECISIONS.md:106`). B11 deliberately computes counts, medians, sums and ratios (`docs/harness/DECISIONS.md:414`).

A script-derived result is valid new numeric evidence; a model-invented result is not. The current grounded-text checks cannot establish that distinction merely because the figure appears in a generated MOC.

**Fix direction:** Define validated computed-result provenance without weakening the existing model grounding rule.

### R8 — Minor: context priority is internally inconsistent

B3 reads hot first; B4 sees About me immediately afterward; the prompt order places About me before hot (`docs/harness/2026-10-10-tl-p4-38-brain-port.md:37`, `:38`, `:47`).

Restoring separate hot and About me is an intentional replacement of TL-P4-37 addendum 2, not itself a contradiction (`docs/harness/DECISIONS.md:395`).

**Fix direction:** Choose one context priority and distinguish retrieval order from prompt order.
