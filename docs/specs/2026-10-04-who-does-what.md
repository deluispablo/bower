# Who does what: the app, the runner and Claude — design

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

This list is also the perimeter: nothing outside it, never your own text, never a delete. A tidy-up becomes one or two calls instead of a tool loop: classify from the previews, then compile with only the notes asked for. Long texts are summarised first by a cheap model in parallel.

## The change journal

Every change made in the app leaves one small file in `.bower/changes/` (one file per change, so two devices never collide; Drive cannot append). The change itself is applied at once in Drive; the journal only says what happened, where and when.

- The next run reads the journal first; Claude gets "since the last tidy-up, you…" in its prompt.
- A move of something Bower filed is a correction and teaches Bower where such things go.
- A note you edited gets its summary, index line and links refreshed; your text is never rewritten.
- A folder you made becomes structure Bower files into.
- A rule you typed is worded clearly in `Rules.md`, with your words next to it; if it is ambiguous, Bower asks in the report.
- After the run the entries are archived and logged in `log.md` as "by you".
- The app shows the journal on Home ("Since the last tidy-up") and offers "Let Bower read them now" (a short run that only reads the journal).

## Who owns what in a note

- Bower's: *Current state*, *Timeline*, Bower's note, and the frontmatter fields Bower writes. The app shows them, read-only.
- Yours: the rest of the body. Bower never rewrites it. The app lets you tick tasks today, and edit the body later (CodeMirror 6).
- Every write from the app checks the file's version in Drive first; if it changed, the app says so and writes nothing.
- While a run is going, the notes it touches are read-only in the app.

## What carries over from the second brain

PARA folders; three layers (immutable original, source note, compiled notes); one-line `summary:` in every note feeding `index.md`; `hot.md` as the short focus file; `log.md` append-only; tiered reading (hot, index, summaries, then at most five notes per source); classify before reading; the value gate (a document that only confirms a fact updates a line, not a new note); fit, create, ask; contradictions kept as callouts; never write ID numbers; one report with numbered yes/no questions, asked again until answered; a manifest per run so a tidy-up can be undone.

## UI that follows from this

- Add warns "you already have this" before uploading.
- Rules show at once as "waiting for the next tidy-up", then as Bower's wording with your words under it.
- Notes: Bower's sections read-only, tasks tickable.
- After a run: the report with its questions, the replay, and "Undo this tidy-up".
- Home: "Since the last tidy-up", the journal.
