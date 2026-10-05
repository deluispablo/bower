# The phases of the Bower app rebuild

Every phase of the project in one place: why it exists, what it built, how it was checked, where it stands and what it owes the next one. For how work is done see `docs/harness/METHOD.md`; for the state of the current session's work and the next steps see `docs/harness/HANDOFF.md`. Keep this file true when a phase changes state.

Last updated: 2026-10-05.

## Why a rebuild

Bower is an app that keeps a person's notes and files in their own Google Drive folder and has Claude tidy them: you drop things into an inbox, Bower names them, writes what matters into notes and files them by PARA (Projects, Areas, Resources, Archive). It replaces the owner's local "second brain" (an Obsidian folder kept by Claude Code), whose mechanics it must match (see `docs/specs/2026-10-04-who-does-what.md`, "What carries over from the second brain").

The first Bower (`/Users/deluisp/Projects/bower`: app, `api/` Worker, `agent/` runner) works but carries years of patches, and a tidy-up takes about 5 minutes. On 2026-10-04 the owner chose to start the app again from zero in this project, using the old one only as a reference for behaviour, copy and the API (never copying code). This project is local only: no remote, never push.

The rebuild runs in four phases, each with its own spec and plan. **The owner's rule: no next phase until the current one is right** (every finding fixed, a review and an evaluation that come back clean).

| Phase | What | Status |
| --- | --- | --- |
| 1 | The app's UI on demo data | Done |
| 2 | The app's logic over Google Drive and the Worker, with a pretend Drive and Worker | Built; closing (findings rounds) |
| 3 | A new Worker (Cloudflare): sign-in, tokens, the tidy-up dispatch | Not started; contract written |
| 4 | A new agent (the runner on GitHub Actions) with the second brain's logic | Not started; direction agreed |

## The three layers (all phases build toward this)

From `docs/specs/2026-10-04-who-does-what.md`, agreed with the owner:

- **The app** does everything mechanical at once, in Drive itself: adds piles to the inbox (warning about duplicates by SHA-256), moves, renames, creates, puts in the Bin, ticks tasks, answers questions, takes rules in your words. Every change also writes one small journal file in `.bower/changes/`.
- **Runner scripts** do the zero-token work before and after Claude: fetch only what a run needs, extract text and OCR, apply Claude's operations, rebuild the index, fix links after renames, write `log.md`, lint, write the manifest used to undo a run.
- **Claude** only classifies, compiles, links, words your rules and asks questions, answering with a closed list of operations (`file`, `source.create`, `state.set`, `timeline.add`, `note.create`, `hub.link`, `rule.write`, `question`, `contradiction`), never editing files itself.

## Phase 1: the UI on demo data (done)

- **Spec:** `docs/specs/2026-10-04-app-ui-design.md` (approved in conversation). The screens come from the design canvas "Bower app v10 screens"; the landing page (`public/landing/`) is exported from the same canvas and fixed only through `scripts/fix-landing.mjs`.
- **Built:** every screen, phone and desktop: Home (inbox piles, questions, suggestions, recent), Add (files, photos, links, a note), piles, the Obsidian-like file tree (menus, drag to move, rename, sort, keyboard), folder pages (list and table), notes (Bower's sections read-only, tasks tickable, outline, linked notes), search and the ⌘K palette, the tidy-up sheet with live phases and the replay of where things went, the Bower tab (rules, requests), Settings, sign-in, first run and the tour, the demo panel (⌘⇧D) with situations (`default`, `signed-out`, `first`, `back`, `running`, `empty`, `fail-run`, `slow`, `offline`). Bower the bowerbird lives in the app (`src/bird/`): one per screen, moving like a bird, respecting reduced motion.
- **Data:** a typed `Sources` interface (`src/data/sources.ts`) with the demo implementation (`src/data/demo/`, Alex's made-up folder), so phase 2 could add real sources without touching screens.
- **Checked by:** four rounds of phone and desktop testers (commits "fix: round two … four"), Playwright e2e.
- **Stack:** React 19, TypeScript 6 strict, Vite 8, React Router 7, Zustand, Radix, cmdk, CSS Modules with tokens from `src/styles/tokens.json`.

## Phase 2: the logic (built; closing)

- **Plan:** `docs/superpowers/plans/2026-10-04-phase-2-app-logic.md`; its execution ledger (rulings and deferred minors): `docs/superpowers/plans/2026-10-04-phase-2-ledger.md`.
- **Specs it wrote:** `docs/specs/2026-10-04-worker-contract.md` (the app side of the Worker, which phase 3 must answer exactly) and `docs/specs/2026-10-04-who-does-what.md`.
- **Built:**
  - Drive: `DriveApi` with `DriveHttp` (Drive REST v3: paging, retries, resumable uploads, one token refresh) and `FakeDrive` (in memory).
  - The vault over Drive: `DriveVault`, `VaultIndex` (paths over Drive ids), the note format (Bower's sections kept apart), `Rules.md` format, the change journal with its outbox (lines that could not be written wait on the device and are sent before a tidy-up, when back online and at start, never twice).
  - Worker: `WorkerApi` with `WorkerHttp` and `FakeWorker`, plus a scripted fake runner (`src/data/fake/fake-runner.ts`) that files, words rules, does requests, asks questions, rewrites links after renames and writes the report, as the real runner must.
  - Live session and runs (`src/data/live/`), choosing the source at start (`?source=demo|fake|real`, `src/data/choose.ts`), the pretend Drive kept for the tab in sessionStorage, the PWA (installable, offline shell; the Worker's paths left to the network).
- **Checked by:** the harness (`harness/features.json`, 186 entries, each closed through `harness/done.sh` with a red-then-green proof), the vault contract suite run on demo and on fake (`src/data/contract/`), the whole Playwright suite run on both sources, sensors for architecture, copy and docs (`src/*.test.ts`), and rounds of fresh evaluators and reviewers:

  | Round | From | Entries |
  | --- | --- | --- |
  | 1–14 | the plan's tasks | 14 |
  | qa-5, qa-6 | evaluators | 48, 50 |
  | qa-7 | reviewer | 17 |
  | qa-8 | evaluator | 20 |
  | qa-9 | reviewer | 18 |
  | qa-10 | evaluator | 19 |

- **Decisions taken** (with where they are written): `docs/harness/HANDOFF.md`, "Decisions taken in phase 2".
- **To close it:** the plan in `docs/harness/HANDOFF.md`: one open entry, a triage of the ledger's deferred minors with the owner, then a reviewer and an evaluator round until both come back clean.

## Phase 3: the Worker (not started)

- **What:** a new Cloudflare Worker that keeps credentials and pointers, never content: Google sign-in, the encrypted refresh token, the person's Bower folder id, short-lived Drive tokens for the app, and the tidy-up dispatch to the runner (`repository_dispatch` with a ticket).
- **The contract is written:** `docs/specs/2026-10-04-worker-contract.md`. Where the fake Worker and the contract disagree, the contract wins. It includes what phase 2 added: `POST /vault` answers `{ folderId, found }`; `DELETE /me` also forgets the folder pointer.
- **Must get right** (contract, "Two things the deployment must get right"): one Google OAuth client for the app and the runner with the full `drive` scope (Bower's `appProperties` are visible only to the client that wrote them); the Worker on the app's own site (the session cookie must not be third-party, or Safari on iPhone breaks).
- **Owes:** a real-Drive smoke test (full-text tokenising, resumable-upload resume, rename and modifiedTime behaviour); a product decision on a durable upload queue (failed uploads are forgotten after a reload today) and on offline reading.
- **How to start:** brainstorm with the owner (superpowers brainstorming), write the spec and the plan as phase 2 did, add the phase's entries to `harness/features.json`, then build test first. The old Worker (`/Users/deluisp/Projects/bower/api/`) is a reference for behaviour only.

## Phase 4: the agent (not started)

- **What:** the runner on GitHub Actions, in the operator's private instance repo: scripts before and after Claude, Claude returning operations (see "The three layers"), and the second brain's mechanics: PARA; three layers (immutable original, source note, compiled notes with *Current state* and *Timeline* citing sources); one-line `summary:` per note feeding `index.md`; `hot.md`; append-only `log.md`; tiered reading; the value gate; contradictions as callouts; one report with numbered yes/no questions asked again until answered; a manifest per run so a tidy-up can be undone; never writing ID numbers.
- **Owes the app** (already in the Worker contract, "What the Worker sends the runner"): `.bower/last-run.json` with the report (`filed`, `created`, `updated`, `setAside`, `questions`, `yourChanges`, and `requests` and `rulesWorded` when there were any); `questions.json`, `suggestions.json`, `requests.json`, `hashes.json`; `Rules.md` with typed rules worded and removed rules taken out; journal files archived (one record per `id`, every copy archived); `[[links]]` rewritten after renames and moves; `bowerNew` marks on what it filed, cleared from the run before.
- **Goal it is measured by:** a tidy-up much faster than today's ~5 minutes (no 53 KB rulebook, no tool loop, no whole-note output, no whole-folder download), with Claude's reach limited to the closed list of operations.
- **The owner's real second brain** (`/Users/deluisp/SecondBrain`) holds personal data: read it only for mechanics, never copy its content into this repo.
