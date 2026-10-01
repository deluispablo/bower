# One faster session: context, rulebook, index and model (spec, 2026-10-01)

**For the technical lead.** This spec makes a single tidy-up session faster without changing the app. It covers the internal Bower files (`CLAUDE.md`, `index.md`, `log.md`, text copies), what the runner hands the model, and which model and effort the runner asks for. It was written against `main` at 9d660829 and checked against `agent/run.sh`, `agent/prompts/`, `vault-template/`, `app/src/file-origin.ts`, `app/src/companion.ts`, `app/src/drive.ts` and `claude --help` for Claude Code 2.1.283. Requirement ids are `R-SS-<n>`. Where this text and the code disagree on how something works today, the code wins; say so in the PR.

## 1. Brief

- **Goal:** a tidy-up of one to three files finishes in about 1.5 to 2 minutes instead of about 6.5, with the same filing quality.
- **Audience:** the owner, who adds files from the phone or the desktop and waits for Bower to file them.
- **Piece:** changes to the runner (`agent/`), the vault rulebook (`vault-template/`, rules version 24), one small Worker change (`api/`) and the docs.
- **Constraints:** no app change; the owner's Claude subscription token stays the only model credential; GitHub Actions stays the runner; Drive stays the only place vault content lives; the agent keeps running without Drive credentials.
- **Done when:** the benchmark (R-SS-1) shows the one-file case's agent step at 2 minutes or less, the agent's turns at least halved against the baseline, and every quality check passing.

### Measured baseline

From the ingest run of 29 September 2026 with one pending file (6 min 38 s in total):

| Phase | Time |
|---|---|
| Queue and job set-up (of which pandoc install 15 s) | 30 s |
| Sync down (`rclone sync`, whole vault) | 7 s |
| Reconcile, manifest, pre-scan | 2 s |
| **Agent run** | **5 min 29 s** |
| Sync up, moves, report, file facts | 26 s |

The agent is 85 % of the run. Today it runs Claude Code with no `--model` (the default model), a 42 KB `CLAUDE.md` that Claude Code loads automatically **and** that the prompt asks it to read again, `Rules.md`, `About-Me.md` and `index.md` read by tool calls, Grep and Read over the vault to join the dots, and the bookkeeping of `index.md`, `log.md` and hub notes. For one file it changed 13 files.

### Decisions

| Id | Decision | Why |
|---|---|---|
| D-1 | Optimise one session first. One structured call per file, files in parallel and replacing GitHub Actions are out of scope for now. | The owner's call: the session is where the time goes, and it is backend-only. |
| D-2 | Sonnet 5.5 at low effort for plain tidy-ups; high effort for instructions, context notes, "apply this rule" and questions. | The owner's call. Filing is pattern work; reasoning-heavy requests get more. |
| D-3 | A persistent Claude session is rejected. | Start-up costs seconds; each run's time is turns × time per turn. A long-lived session grows its history every run, mixes runs and needs a server. |
| D-4 | Replacing GitHub Actions is rejected for now. | It costs about 30 s of a run. Every option that runs the `claude` CLI with the subscription token needs a server or a paid plan. The incident risk is handled by R-SS-14. |
| D-5 | The session never gets Drive credentials. A partial download (Markdown only, binaries on demand through `.bower/need.txt` and `claude -p --resume`) is a later phase. | Security: a malicious file could otherwise act on Drive. The sync down costs 7 s today; R-SS-15 measures its growth. |
| D-6 | Text copies stay visible next to their originals (option A). Hidden copies under `.bower/` (option B) wait for an app phase. | The app reads text copies to show a file's details; hiding them needs an app change. |
| D-7 | The tag vocabulary lives in a `## Tags` section at the end of `index.md`, not in a separate file. | The owner's call. The runner cuts the section out for the prompt. |
| D-8 | Bower creates a new tag when no existing one fits, without a proposal. It must reuse an existing tag whose meaning fits. | The owner's call. It replaces today's "note it in `log.md` and file a proposal of kind `tag`". |
| D-9 | `CLAUDE.md` stays one file, with section markers. The runner hands the model only the core and the sections the run needs. | The app's rulebook update replaces `CLAUDE.md` alone (`saveNoteText` with `forceProtected`, `app/src/drive.ts`). A second rulebook file would need an app change. |
| D-10 | `--bare` is not used. | It would stop the automatic `CLAUDE.md` load, but it accepts only `ANTHROPIC_API_KEY`, not the subscription token. |

## 2. The session today and after

**Today:** sync down → `claude -p "<ingest.md>"` in the vault folder → Claude Code loads `CLAUDE.md` → the agent reads `CLAUDE.md`, `Rules.md`, `About-Me.md`, `index.md` → reads the pending files → Greps and Reads notes → writes notes, hub lines, `index.md` rows and `log.md` lines → the runner audits, moves, books and syncs up.

**After:** sync down → the runner builds the context pack (R-SS-4 to R-SS-7) and moves `CLAUDE.md` out of the session's folder → `claude -p` with `--model`, `--effort`, the rulebook as an appended system prompt and the run's facts in the prompt → the agent Greps `index.md` for related items, reads only those, writes the notes, hub lines and `index.md` rows → the runner restores `CLAUDE.md`, checks rows, counts tags, writes routine `log.md` lines and text-copy text, audits, moves, books and syncs up.

## 3. Requirements

### Measure

**R-SS-1. Benchmark.** A script `agent/bench/run-bench.sh` runs `agent/run.sh` against a synthetic vault on the local disk: an rclone remote of type `local` named `vault:`, and a stub for the status callback. It needs no Drive and no GitHub. The synthetic vault lives in `agent/bench/vault/`. It holds fake data only (CLAUDE.md rule: no personal data), about 60 notes and files across the PARA folders, plus five cases in the inbox, run one at a time:
1. a Markdown clipping of a job offer, with a context note asking for a summary;
2. a text PDF of no listed kind;
3. a receipt PDF, which is a listed kind;
4. a scanned PDF with no text layer;
5. an instruction note asking a question about a PDF already filed that has no text copy.

For each case the script writes one line of numbers to `agent/bench/results/<date>-<label>.tsv`: case, wall time of the agent step, turns, API time, input, output, cache-read and cache-creation tokens, tool calls per tool name, files changed. The results folder is git-ignored. The script runs on the owner's machine with the owner's own Claude Code login. A README in `agent/bench/` says how to run it.

**R-SS-2. Session stats in every run.** `run.sh` runs the agent with `--output-format stream-json --verbose` into a file under `$WORK_DIR`. That file is never under `$LOG_DIR`: `$LOG_DIR` is uploaded as a GitHub artifact when a run fails, and the stream holds vault content. After the session, the runner logs one line of numbers from the final `result` event and the tool-use events: `agent stats: turns=<n> api_ms=<n> in=<n> out=<n> cache_read=<n> cache_write=<n> tools=Read:<n>,Grep:<n>,...`. The line never contains a path, a file name or text. The six-line summary the runner parses today (ingest.md step 8) is read from the `result` event's text, so `agent_failure_reason` and the summary parsing keep working. Unit tests in `agent/test/` feed a recorded stream (fake content) and check the stats line and the summary.

### Model and effort

**R-SS-3. Model and effort per run.**
- `run.sh` passes `--model "$BOWER_MODEL"` (default `claude-sonnet-5-5`) and `--effort`.
- Effort is `low` for an ingest with no instruction note and no context note, and for a lint. It is `high` when the pending list holds an instruction note or a context note; "apply this rule" and questions arrive as instruction notes.
- The instance repo can override with `BOWER_MODEL`, `BOWER_EFFORT_LOW` and `BOWER_EFFORT_HIGH`; the workflow passes them through when set.
- The stats line (R-SS-2) adds `model=<id> effort=<level>`.
- The runbook says how to roll back to the old default by setting `BOWER_MODEL`.

### The rulebook (rules version 24)

**R-SS-4. Section markers in `CLAUDE.md`.**
- Each `##` section of `vault-template/CLAUDE.md` that only some runs need carries a marker on the line after its heading: `<!-- load: ingest -->`, `<!-- load: instructions -->`, `<!-- load: lint -->`, or several, comma-separated (`<!-- load: ingest, instructions -->`).
- A section with no marker is core and goes to every run.
- The core keeps: identity, the protected paths and **Rules**, the folder map, note names and file names, the note templates, tagging, and the `index.md` and `log.md` duties.
- **Kinds** and **Formats** load for `ingest`. **Instructions**, **Proposals** and **An answer** load for `instructions`. The lint workflow loads for `lint`.
- The sentence "Read `CLAUDE.md`, then `Rules.md`, then `About-Me.md`" becomes "Your rulebook, `Rules.md` and `About-Me.md` are in your instructions; do not open them".
- `bower_rules_version` becomes 24, and `docs/changelog.md` records what v24 changes.

**R-SS-5. The runner hands the rulebook in.**
- Before the session, after the manifest is taken, the runner copies `CLAUDE.md` to `$WORK_DIR/rulebook.md` and removes it from `$VAULT_DIR`, so Claude Code does not load it and the agent cannot read it (`blockReadsOutsideWorkingDirectories`). After the session, before the audit, it puts the file back byte for byte, so the audit sees it unchanged. The settings' deny rules on `CLAUDE.md` stay, so the agent cannot create one while it is away.
- It builds `$WORK_DIR/system.md` in this order:
  1. the core sections and the sections whose marker names this run's mode (`ingest`, plus `instructions` when R-SS-3 chose high effort for an instruction or context note; `lint` for a lint);
  2. `Rules.md`;
  3. `About-Me.md`.
- It passes the file with `--append-system-prompt-file`.
- A `CLAUDE.md` without any marker (rules version 23 or older) goes in whole, so an un-updated vault still works.
- The cutter is a pure function in `run.sh`, unit-tested with a small fixture rulebook: core only, ingest, ingest plus instructions, lint, and no markers.

**R-SS-6. The run's facts in the prompt.** `agent/prompts/ingest.md` and `agent/prompts/lint.md` are rewritten shorter. They no longer tell the agent to read the rulebook, `index.md` or `log.md`. The runner fills these placeholders:
- `{{TAGS}}`: the `## Tags` section of `index.md`, cut out by the runner.
- `{{FOLDERS}}`: the folder map. One line per folder that has a hub note: the path, the hub's first descriptive line, and its `statuses:` when present. The runner builds it from the hub notes.
- `{{CORRECTIONS}}`: the `Correction:` lines of `log.md`, counted per `<from> -> <to>` pair (`2-Areas/Work -> 1-Projects/Job hunt: 2`). This is the only thing the proposal rule needs from the log.
- `{{PENDING}}`: the pending list after the pre-scan, with each document's extracted-text path when the runner has one.
- `{{ALREADY_WRITTEN}}`: as today.

Stable text goes first in the system prompt and run-specific text last in the user prompt, so Claude Code's prompt cache reuses the rulebook across the session's turns.

**R-SS-7. Grep the index; never read it whole.** The prompt and the core rulebook tell the agent how to join the dots:
1. Grep `index.md` for the new item's likely tags and keywords (a company, a place, a topic).
2. Read only the rows' notes or text copies that matter.
3. Follow their tags and links when more context is needed.

Reading `index.md` whole is not allowed. R-SS-2 counts Read calls, so the benchmark shows whether the agent follows this.

### The index

**R-SS-8. Row format, version 24.** Every row the agent adds:

`- [[<path from the top of the folder>]] · <Type> · <#tag #tag> · <description> · <origin>`

- The type is one word, as today.
- One to five tags, all from `## Tags` or new ones added there in the same run.
- The description is at most 100 characters and says what the item is about, in plain words. It contains no `·` and no wikilink.
- The origin field stays last and keeps today's values (`filed by Bower`, ...).
- A note row that has an original keeps today's trailing link to it, which `parseCatalogueFiles` reads.
- Verified compatible with the app: `parseCatalogueOrigins` splits fields on `·` and takes the first field that is an origin; `parseCatalogueFiles` reads trailing wikilinks on note rows only. Rows in the old format stay valid.

**R-SS-9. `## Tags`.**
- `index.md` ends with `## Tags`, one line per tag: `- #<tag> · <meaning, at most 80 characters> · <count>`.
- Tags are English, lower case, words joined by hyphens (`#job-offer`).
- The agent reuses a tag whose meaning fits. Only when none fits does it add a line with the new tag, its meaning and count 1 (D-8).
- After the session, the runner recomputes every count from the rows, adds `· —` as a placeholder meaning for a tag used in a row but missing from the section, and logs `Tag added: #<tag>` in `log.md` for each new one.
- `vault-template/index.md` gets an empty `## Tags` section. The rulebook's **Domain tags** paragraph and the `tag` kind of proposal are replaced by this rule.

**R-SS-10. The runner checks rows.** After the session, the runner checks each row the agent added or changed against R-SS-8. The check is a pure function, unit-tested. A bad row is never refused or rewritten; it is counted, and the run summary (status callback) carries the count as a warning, like today's note-name warnings (R-AG-4, R-AG-5).

### Text copies

**R-SS-11. Scans.** For a PDF with no text layer, the runner's map says `-` (`pdf_text`). The agent now writes the text copy's `## The document` section itself: the readable text of the scan, transcribed, or for a long scan the parts that matter, at most about 3,000 characters, with a first line `Transcribed by Bower from a scan`. `append_document_text` already leaves a copy alone when it has `## The document`; the "Scanned: no text to copy" line is written only when the agent wrote nothing. The rulebook's **May never record** rule is unchanged: identifiers may sit in a note, never in `About-Me.md`, `Rules.md` or `CLAUDE.md`.

**R-SS-12. A copy the first time a filed PDF is read.** When an instruction asks about a filed PDF of no listed kind that has no text copy, the agent writes the text copy as Ingest step 6 says while it answers. After the session, the runner runs `pdftotext` on each PDF whose new text copy lacks `## The document`, and appends the text, or the scan line, the same way as for a pending PDF. The rulebook's **An answer** section says so.

### Bookkeeping

**R-SS-13. Routine log lines move to the runner.** The runner already writes `Filed:` lines and books moves. It now also writes `Tag added:` (R-SS-9). The agent keeps only the lines that need judgement: `Rule added/changed`, `Correction`, `Proposal`, `Context`, `Applied rule`. The agent never reads `log.md`; R-SS-6 hands in what it needs.

### Reliability and growth

**R-SS-14. A run that never starts is failed after 25 minutes.**
- When the Worker reads a run's status (the endpoint the app polls) and the run has been `queued` or `running` for more than 25 minutes since its last callback, the Worker marks it `failed` with reason `timeout`, an existing `RUN_FAILURE_REASONS` value the app already turns into a sentence.
- The 25 minutes are the job's 20-minute limit plus 5.
- Handler tests in `api/test/`: a stale run is failed, a fresh run is untouched.
- No cron and no app change.

**R-SS-15. Sync-down numbers.** `run.sh` logs `sync down: <n> files, <n> MB, <n> s` after the sync down. When the time passes 20 s in normal use, the partial download (D-5) moves up.

**R-SS-16. Pandoc from the cache.** `agent/workflows/ingest.yml` and `lint.yml` stop installing pandoc with `apt` on every run (15 s). They cache a pinned pandoc release binary, verified by SHA-256 the way rclone is, with `actions/cache`. The workflow change reaches the instance repo through `scripts/new-instance.sh`, as today.

### Backfill

**R-SS-17. Old rows get tags and descriptions in the lint run.** The lint run (weekly, and when the owner starts it) takes up to 50 rows that lack tags or a description, oldest first, and completes them per R-SS-8. For each it reads the note or the text copy, never a binary; a binary with no text copy is described from its name and folder. It fills `## Tags` as R-SS-9 says. `lint.md` and the lint section of the rulebook say so. A tidy-up never backfills, so it stays fast.

## 4. Order and dependencies

`agent/run.sh` is the hot spot: every runner requirement touches it. Its changes run in series.

1. **Measure first:** R-SS-1 and R-SS-2. Run the benchmark on `main` and record the baseline.
2. **Model and effort:** R-SS-3. Benchmark again: this shows what the model alone gives.
3. **Rulebook v24:** R-SS-4, R-SS-8, R-SS-9 (rule text), R-SS-11, R-SS-12 (rule text), R-SS-13 (rule text), R-SS-17 (rule text) in `vault-template/`, plus the two prompts. One owner for `vault-template/CLAUDE.md`, `vault-template/index.md` and `agent/prompts/`.
4. **Runner context pack:** R-SS-5, R-SS-6, R-SS-7, after step 3.
5. **Runner after the session:** R-SS-9 (counts), R-SS-10, R-SS-12 (pdftotext), R-SS-13, R-SS-15.
6. **In parallel with steps 2 to 5, other files:** R-SS-14 (`api/`) and R-SS-16 (`agent/workflows/`).
7. **Benchmark the result**, then docs: `docs/runbook.md` (model and effort variables, benchmark, stats line), `ARCHITECTURE.md` (the session's inputs), `docs/changelog.md` (rules v24).
8. **Production:** only with the owner's yes. Redeploy the runner with `scripts/new-instance.sh`; the owner applies rules v24 in Settings; the next lint starts the backfill.

## 5. Acceptance (milestone)

- [ ] The benchmark's one-file cases (1 to 3) have an agent step of 2 minutes or less, and their turns are at least halved against the baseline.
- [ ] Every benchmark case passes the quality checks, which the lead reviews by hand against the baseline output:
  - right folder;
  - a meaningful name;
  - tags from `## Tags`, or a new tag with a meaning;
  - a description;
  - the companion note's fields for the receipt;
  - a text copy with text, including the scan's transcription;
  - the question answered, with the PDF's text copy written;
  - `Rules.md` respected;
  - no protected path written.
- [ ] A vault on rules version 23 still runs: whole `CLAUDE.md`, old rows accepted.
- [ ] The app works unchanged on a v24 vault: file origins, companion links and folder lists, checked on the local demo with a v24 `index.md` fixture.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green in CI.

## 6. Later phases (not in this spec)

- Partial download: Markdown always, binaries on demand through `.bower/need.txt` and `claude -p --resume` (D-5).
- One structured call per file, with JSON output and files in parallel (D-1).
- Hidden text copies under `.bower/text/<Drive id>.md`, with the app change (D-6).

## 7. Open questions

None. Every choice above was the owner's or is recorded as a decision with its reason.
