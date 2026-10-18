# Who does what: the app, the runner and Claude — design


Architecture revision `2026-10-05-contracts-2`: [ARCHITECTURE](../ARCHITECTURE.md) governs stable boundaries, compatible evolution, durable execution and early premise probes. Shapes and operation lists below are a historical implementation baseline, not the final capability ceiling; change them only with assigned migration/compatibility evidence.
Planning update 2026-10-05: read [PRODUCT](../PRODUCT.md), [WORK_PLAN](../WORK_PLAN.md) and [P2_ACCEPTANCE](../P2_ACCEPTANCE.md). The app-first, full second-brain capability contract governs delivery. Existing shapes below describe the current baseline; extensions must be versioned and implemented through assigned entries, not assumed present.

“One or two calls” is a target for simple ingestion, not a universal limit. Preserve rich document generation/revision, questions over existing material, cross-project connections, contradictions and permission-aware web enrichment. Claude may request bounded additional context; necessary new prose is valid output. P2 proves these flows with scripted persisted effects, P4 proves semantic quality.

Date: 2026-10-04. Status: direction agreed with the owner; details settle in the phase 2 to 4 specs.

Bower replaces the owner's local second brain (an Obsidian vault kept by Claude Code). That vault works well because Claude does only what needs thinking and everything else is done by scripts at zero tokens. Bower today is slow (about 5 minutes per tidy-up): a 53 KB rulebook loaded every run, a tool loop where every read and write is a model round trip, whole notes rewritten as output, and the whole Drive folder downloaded first. This spec splits the work in three so a tidy-up gets fast and Claude's reach stays narrow.

## The three layers

| Who | Does | Cost |
| --- | --- | --- |
| **The app**, at once, against Drive | Upload piles and warn about duplicates (SHA-256 in the browser, against `.bower/hashes.json`). Move, rename, create, put in the Bin. Tick tasks, change status and properties. Answer questions. Add rules in your words. Every change also writes a journal entry. | Zero tokens, instant |
| **Runner scripts**, before and after Claude | Before: fetch only what the run needs (inbox, `index.md`, `hot.md`, `Rules.md`, hub notes, candidate notes found through the index), text extraction and OCR cached in the folder, duplicate check, a one-line preview per thing, the journal digest. After: apply Claude's operations, rebuild the index, fix links after renames, write `log.md`, lint (report only), write the run manifest used to undo. | Zero tokens |
| **Claude** | Classify, compile, link, word the rules you typed, ask questions. | Tokens, as few as possible |

## Claude returns operations, not files

Claude never edits files. It answers with a closed list of operations that the runner applies without AI:

| Operation | Effect |
| --- | --- |
| `file` | This inbox thing goes to this folder with this name |
| `source.create` | A source note for an original: summary, key points, transcript |
| `state.set` | Rewrites a note's *Current state* |
| `timeline.add` | Appends a dated line to a note's *Timeline*, citing its source |
| `note.create` | A new note from a template, with its frontmatter |
| `hub.link` | Links a note from its folder's note |
| `rule.write` | The worded version of a rule you typed, with your words kept |
| `question` | A yes/no question for the report |
| `contradiction` | A callout when two sources disagree |

This baseline list bounds the current implementation; adopted generation/research capabilities require explicit validated extensions. Never infer permission to overwrite protected user text or hard-delete content. A simple tidy-up aims for one or two calls: classify from the previews, then compile with only the notes asked for. Complex synthesis, document creation and research may request bounded additional context and necessary output. Prefer cached extraction and task-relevant excerpts; model summarization is justified by measured need and retains access to the source.

## The change journal

Every change made in the app leaves one small file in `.bower/changes/` (one file per change, so two devices never collide; Drive cannot append). The change itself is applied at once in Drive; the journal only says what happened, where and when.

- The next run reads the journal first; Claude gets "since the last tidy-up, you…" in its prompt.
- A move of something Bower filed is a correction and teaches Bower where such things go.
- A note you edited gets its summary, index line and links refreshed; your text is never rewritten.
- A folder you made becomes structure Bower files into.
- A rule you typed is worded clearly in `Rules.md`, with your words next to it; if it is ambiguous, Bower asks in the report.
- After the run the entries are archived and logged in `log.md` as "by you".
- The app shows the journal on Home ("Since the last tidy-up") and offers "Let Bower read them now" (a short run that only reads the journal).

## Piles in the inbox

A pile is what you add together, with one line about it. In Drive it is a subfolder of the inbox, named by its day and its line (`Inbox/2026-10-04 Receipts from the Saltmere weekend/`), holding its things and `Pile note.md` with your words. A single thing with no line sits at the inbox root. A pile can also be only a note.

- The runner reads each subfolder as one pile and its note as context for every thing in it. No frontmatter matching between files and notes.
- A tidy-up takes the piles that were in the inbox when it started; piles added during a run wait for the next one.
- In the app the inbox is handled as piles: a pile is opened or removed as a whole; its things are never dragged, renamed or moved one by one. The pile's note can be changed until a tidy-up starts.
- Names in the inbox are made safe for Drive (no slashes); a pasted link becomes a `.url` file.

## Files in `.bower/`

Every JSON file carries `v: 1`. The shapes are in `src/data/vault/layout.ts`.

| File | Written by | Holds |
| --- | --- | --- |
| `changes/<time>-<id>.json` | The app, one file per change | The journal entry: kind, one line, the path, your words (a rule, a request, an answer), the device |
| `changes/archive/` | The runner, after reading | The journal files a tidy-up read |
| `last-run.json` | The runner, before it reports `done` | The run and its report |
| `questions.json` | The runner | The questions still open; the app leaves out the ones answered in the journal |
| `suggestions.json` | The runner | Rules Bower suggests; each device hides the ones you dismissed |
| `requests.json` | The runner | The last requests done, each with Bower's line |
| `hashes.json` | The runner | SHA-256 of every file outside the inbox, so Add can say "You already have this" |

Bower marks what it wrote with `appProperties.by = bower`, and what the latest tidy-up filed or changed with `bowerNew = 1`. A thing in the inbox keeps the name it was added under, its origin and its kind (`asAdded`, `origin`, `kind`); a pile keeps its id (`pile`). `Rules.md` keeps each rule's wording, your words under it and the day it was added (`src/data/vault/rules-format.ts`).

## Who owns what in a note

- Bower's: *Current state*, *Timeline*, Bower's note, and the frontmatter fields Bower writes. The app shows them, read-only.
- Yours: the rest of the body. Bower never rewrites it. The app lets you tick tasks today, and edit the body later (CodeMirror 6).
- Every write from the app checks the file's version in Drive first; if it changed, the app says so and writes nothing.
- While a run is going, the notes it touches are read-only in the app.

## What carries over from the second brain

PARA folders; three layers (immutable original, source note, compiled notes); one-line `summary:` in every note feeding `index.md`; `hot.md` as the short focus file; `log.md` append-only; tiered reading (hot, index, summaries, then at most five notes per source, ten for a request); classify before reading; the value gate (a document that only confirms a fact updates a line, not a new note); fit, create, ask; contradictions kept as callouts; never write ID numbers; one report with numbered yes/no questions, asked again until answered; a manifest per run so a tidy-up can be undone.

## UI that follows from this

- Add warns "you already have this" before uploading.
- Rules show at once as "waiting for the next tidy-up", then as Bower's wording with your words under it.
- Notes: Bower's sections read-only, tasks tickable.
- After a run: the report with its questions, the replay, and "Undo this tidy-up".
- Home: "Since the last tidy-up", the journal.
