# Architecture

Bower is a **self-hosted personal knowledge agent**. An operator deploys one instance for their household; the people they allow sign in with Google and get a folder of Markdown notes in their own Drive that a Claude agent keeps organised. This file is the single source for the module map, the data flows and the policies. `CLAUDE.md` points here; do not duplicate it there.

## Layout

```
bower/
├── app/                        # Progressive web app (Vite + Preact + TypeScript)
│   ├── src/
│   │   ├── main.tsx, app.tsx   # bootstrap, routes
│   │   ├── api.ts              # typed client for the Worker (cookie session)
│   │   ├── drive.ts            # typed client for Google Drive (1 h token from the Worker)
│   │   ├── markdown/           # marked + wikilinks + frontmatter + sanitizer
│   │   ├── kinds.ts, formats.ts, vault-index.ts, …   # see "App modules (v4)"
│   │   ├── components/, routes/, styles/tokens.css
│   │   └── sw.ts               # service worker: shell cache, share target, push
│   ├── public/                 # icons, logo, manifest assets
│   └── .env.example            # VITE_API_URL
├── api/                        # Cloudflare Worker (Hono, KV, Web Crypto)
│   ├── src/
│   │   ├── index.ts            # routes
│   │   ├── env.ts              # Env contract + validation
│   │   ├── crypto.ts, session.ts, security.ts, store.ts, google.ts, github.ts, push.ts
│   │   └── template.generated.ts   # vault-template bundled at build time
│   ├── scripts/                # bundle-template.mjs, gen-vapid.mjs
│   ├── wrangler.toml, .dev.vars.example   # placeholders; the real deploy config is the git-ignored wrangler.local.toml
│   └── test/
├── agent/
│   ├── run.sh                  # sync down → reconcile → claude -p → moves → bookkeeping → copy up → file facts → status
│   ├── prompts/                # ingest.md, lint.md (short; rules live in the vault)
│   ├── workflows/              # ingest.yml, lint.yml: copied into the operator's instance repo
│   └── test/smoke.sh           # stubbed rclone/claude/curl
├── vault-template/             # CLAUDE.md rulebook, PARA folders, index.md, log.md, About-Me.md
├── docs/                       # runbook.md, decisions.md, brand.md, testing.md, security.md, privacy.md
├── scripts/                    # deploy.sh (one-shot deploy), new-instance.sh (instance repo), deploy-api.sh (Worker only), check-sanitized.sh
├── .github/                    # CI only (this repo never runs the agent)
├── README.md, ARCHITECTURE.md, CONTRIBUTING.md, CLAUDE.md, SECURITY.md, CODE_OF_CONDUCT.md, LICENSE
└── package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js
```

## Two repositories per deployment

| | This repository (public template) | The operator's instance (private, e.g. `bower-home`) |
| --- | --- | --- |
| Holds | Code, docs, vault template, workflow files | `.github/workflows/` copied from `agent/workflows/`, plus `agent/run.sh` and `agent/prompts/` (`scripts/new-instance.sh`) |
| Secrets | None, ever | `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` only (no Worker key, issue #292); variable `BOWER_API_URL` |
| GitHub Actions | CI only | Runs the agent; logs are private |
| Updated by | Pull requests here | `git pull` from here, then rerun `scripts/deploy.sh` |

Vault content never enters either repository.

## Components

| Component | Runs on | Responsibility | Never does |
| --- | --- | --- | --- |
| **App** | Cloudflare Pages, in the user's browser | Sign in; list and render the vault by reading Drive directly; search it from a local index; show what is new and what a tidy-up just filed; compare notes of one kind; upload to `0-Inbox/`; create `Bower - …md` instruction notes; append to and edit notes; call `/process`; show status and the working animation; push notifications | Store notes; write the notes the agent maintains; hold refresh tokens |
| **Worker** (`api/`) | Cloudflare Workers + KV | OAuth callback and allowlist; encrypted refresh tokens; vault provisioning from the template; `/process` with quota and single-active-run; `/status`; runner endpoints; push sending | Store content; watch Drive; run on a schedule |
| **Agent** (`agent/`) | GitHub Actions runner of the instance repo | `rclone` sync down with a 1 h token; `pandoc --sandbox` conversion of pending Office, HTML and EPUB files to Markdown; `claude -p` inside the vault, with its rulebook, `Rules.md` and `About-Me.md` as a system prompt and the run's context in the prompt; carry out the agent's filing sheet in the local copy; reconcile the moves the person made in Drive; `rclone moveto` in Drive for each file the agent moved (the file keeps its Drive id); index, link and log bookkeeping for those moves without AI; `rclone copy` up of only the files the agent added or changed (never deletes), then `rclone deletefile` only for the pending originals the move step did not move; file facts counted without AI; status report | Keep state; print vault content to logs; change rules without an instruction note |
| **Vault** | The user's Google Drive | The only state: notes, originals, rulebook, catalogue, journal | Leave the user's account |

## Data flows

```
User (browser) ── Sign in with Google ──▶ Worker ── stores encrypted refresh token, folder id
User (browser) ◀── 1 h Drive access token ── Worker
User (browser) ── POST /vault {mode: create|select} ──▶ Worker ── copies vault-template/ (or fills gaps in an existing folder) ──▶ Google Drive
User (browser) ── read vault / write 0-Inbox, Clippings / append to or edit a note ──▶ Google Drive
User (browser) ── POST /process ──▶ Worker ── repository_dispatch ingest {vault_id, ticket, scope, allow_web} ──▶ Instance repo (Actions)
Worker cron (Sundays 06:17 UTC; or POST /runner/lint/dispatch with ADMIN_KEY, by hand) ── runs inside the Worker ── repository_dispatch bower-lint {vault_id, ticket}, one per vault ──▶ Instance repo (Actions)
Runner ── GET /runner/vaults/:id (Bearer that run's ticket) ──▶ Worker ── 1 h Drive token, folder id, maxTurns, apiKey?, requestedAt
Runner ── rclone sync ↓, manifest, pandoc --sandbox, claude -p, rclone copy ↑ (files new or changed since the manifest only), rclone deletefile ↑ (processed originals only) ──▶ Google Drive
Runner ── .bower/last-run.json (the outcome and the paths of what was filed) + one log.md line (counts only) + .bower/paths.json + .bower/file-facts.json ──▶ Google Drive
Runner ── POST /runner/vaults/:id/status {state, counts, reason, processed[] with to and renamedFrom, setAside[], added} (Bearer that run's ticket; the final one tried three times) ──▶ Worker ── web push ──▶ User's devices
User (browser) ── GET /status ──▶ Worker ── a running run silent for 5 min: GET actions/runs/:runId ──▶ GitHub (the job's conclusion settles it)
User (browser) ── DELETE /me ──▶ Worker ── best-effort revoke at Google, deletes the user's KV data, clears the session cookie ──▶ (the Drive folder itself is never touched)
```

- **Sign-in**: Google OAuth (`openid email drive`) at `GET /auth/login` → `GET /auth/callback`; the Worker exchanges the code, stores the encrypted refresh token and issues the session cookie.
- **Vault provisioning**: `POST /vault` either copies `vault-template/` into a new `Bower` folder or fills in whatever an existing folder is missing (never overwrites a file already there); the folder id is stored, never its contents.
- **Add file**: the app writes straight to Drive with its own 1 h access token (`GET /drive/token`); the Worker is not on this path at all.
- **Append to a note**: the app reads the note, adds a paragraph at the end and writes it back (`files.update` media upload), checking `modifiedTime` just before the write and retrying once on a conflict. It never writes `CLAUDE.md`, `index.md`, `log.md` or `_*.md` folder notes, and writes no `log.md` line (that is the agent's job).
- **Edit a note**: the app reads the note's `modifiedTime`, then its text, when the editor opens; on Save it reads `modifiedTime` again and writes the whole text (`files.update` media upload) only if it is unchanged. Otherwise the user chooses: keep mine (overwrite), take theirs (drop the edit and reload) or open both (the current version in a new tab, the edit kept). Drive's own version history is the safety net. Same guard as append: never `CLAUDE.md`, `index.md`, `log.md` or `_*.md`.
- **Process/run**: `POST /process` dispatches one GitHub Actions run in the operator's instance repo, with a run ticket minted for that run of that vault and the run's scope (`all` for Tidy up; `instructions` for a request's Do it now, where the runner keeps only the instruction notes in `0-Inbox/` and leaves the rest of the inbox untouched in Drive); a request note written or edited after the run was asked for (its Drive `modifiedTime` later than the run's `requestedAt`) is left in `0-Inbox/` for the next tidy-up; the runner uses the ticket to fetch a fresh Drive token and to report, pulls, runs and pushes, all through the Worker, never through the browser. The weekly lint is dispatched the same way, one ticketed run per vault, by the Worker's own cron trigger (`scheduled` in `api/src/index.ts`, `[triggers] crons` in `api/wrangler.toml`), which runs the same function as `POST /runner/lint/dispatch` (admin key, for one vault by hand). No job in the instance repo asks for it.
- **Push**: the runner's status report triggers a web-push message straight from the Worker to the browser's push subscription; no third-party notification service.
- **Delete account**: `DELETE /me` revokes the Google grant (best effort — a user can always leave even if Google does not cooperate), deletes every KV key for that user (profile, quota counters, cached Drive token, push subscriptions, session generation), keeps only a `deleted:<id>` tombstone of the random id so the account can never come back, and clears the cookie. The Drive folder and its content are never touched; the user keeps their notes.

Trigger model: **button only**. The app calls `/process` when the user taps Tidy up (or its switcher command); Add and the Bower tab only put notes in the inbox, where they wait for that tap, like anything that arrived through Drive, Obsidian or another path. No cron for processing, no change watching, no state about "what is new" outside the vault itself. The one scheduled run is the weekly health check (`lint.yml`, Sundays): it checks the notes, makes only safe mechanical fixes and writes `Lint Report.md`.

## App modules (v4)

Each module's own header comment says what it holds; this table only says where things live. Most are pure, so they are unit tested without a browser.

| Module | What it does | Read by |
| --- | --- | --- |
| `app/src/kinds.ts` | The eight kinds of document Bower recognises, the fields each writes into a companion note's frontmatter, which are key facts, how Details groups them, the status values, how Compare uses the kind. The agent's rulebook states the same contract. | `note-meta.ts`, `compare.ts`, `key-facts.tsx`, `kind-badge.tsx` |
| `app/src/formats.ts` | The formats policy: per kind of file, whether Bower reads it, how the app shows it and what the person is told. | Add, the file screen, search, `just-filed.ts` |
| `app/src/vault-index.ts` | The in-memory index of the Bower folder. Hides dot-folders, `Processed/`, `_*.md` folder notes and system files (`SYSTEM_FILE_PATTERNS`, mirrored by the runner's rclone filter: change both together). | every screen |
| `app/src/search-index.ts`, `search.ts` | One MiniSearch index over every visible folder, note and file (name, path, kind word, and the text of notes already read), with typo tolerance from four letters. Kept in IndexedDB (`searchIndex` store, `cache.ts`). | the search screen and overlay |
| `app/src/seen.ts`, `use-new.ts` | "New" per device: the last tidy-up's `items[].to` minus what this device has opened. The set lives in the `seen` IndexedDB store and never leaves the device. | Home, the tree, folder rows |
| `app/src/just-filed.ts`, `routes/just-filed.tsx` | What a tidy-up filed: the old name, the new name, the folder; what was set aside and why. Falls back to Activity for a report without `to`. | Home, Notes, the working sheet |
| `app/src/compare.ts`, `components/compare.tsx` | Notes of one kind lined up from their frontmatter, without AI: columns, sort, filter chips. A table on the desktop, cards on the phone; receipts by month, bookings as a timeline. | the folder screen |
| `app/src/companion.ts` | Finds the note Bower wrote about a file: by its `original` field, by an `index.md` row naming both, by sharing the file's name. | the file screen, folder rows, Just filed |
| `app/src/note-meta.ts`, `folder-view.ts` | Lazy frontmatter for rows (cached in the `noteMeta` store by `modifiedTime`); the folder list's origin filter, pairs, sorts, kind filter and date groups. | the folder and Notes screens |
| `app/src/reveal.ts` | The tree follows what the person opens: the folders above a target, joined to the ones already open. | the tree, the explorer |
| `app/src/move-request.ts`, `more-menu.ts` | "Move to…" and the More menu. The app never moves a file itself: a move is an instruction note in the inbox, then an instructions-only run or the next tidy-up. | the note, file and folder screens |
| `app/src/file-facts.ts` | Reads `.bower/file-facts.json`: PDF pages, Excel sheets, ZIP entries. | the file screen's meta line |
| `app/src/last-run.ts` | Reads `.bower/last-run.json`, the run's own report: state, sentence, counts and, since report v2, `items`, `setAside` and `added`. | the run store, Home, Just filed |
| `app/src/components/virtual-list.tsx` | The TanStack Virtual adapter: the tree past 150 rows and long folder lists render only what is on screen. | the tree, the folder screen |
| `app/src/components/explorer.tsx`, `tree.tsx` | The one explorer, in three hosts since v6: the desktop sidebar, the phone drawer and the Folders tab (see App modules (v6)). | `layout.tsx`, `routes/notes.tsx` |

## v4 data flows

- **Search.** Everything runs on the device. When the vault index changes, `syncSearchIndex` adds, removes and updates entries in the MiniSearch index and saves it to IndexedDB; a note's text is added the first time it is read. A query never calls Drive or the Worker.
- **New.** After a tidy-up the run report (`GET /runs`, or `.bower/last-run.json` when the Worker never heard) lists `items[].to`; `useNew` looks them up in the vault index and drops the ids in the device's `seen` set. Opening a note or a file adds its id to that set. Nothing is sent anywhere.
- **Just filed.** `just-filed.ts` groups the last run's `items` by folder with each item's `renamedFrom`, then adds `setAside` (with its reason) and `added`. Entry points: Home's bubble, the Notes tab, the sidebar and the working sheet's Done state.
- **Compare.** The folder screen reads the frontmatter of its notes (`note-meta.ts`), asks `compare.ts` whether they share a kind that can be compared (`kinds.ts`) and renders the columns that kind defines. No Worker or runner call.
- **Companion notes.** For a listed kind of document the agent writes a note with the kind's frontmatter and an `original` field, plus a catalogue row in `index.md`. The file screen finds it with `companion.ts` and shows its key facts and Bower's note; the folder screen pairs the original with it.
- **A tidy-up, in order.** The runner syncs down; reconciles the moves the person made (`.bower/paths.json` against Drive ids); converts documents, pre-scans and sets aside; runs the agent; audits; moves in Drive each file the agent moved; books each move in `index.md`, the links and `log.md` without AI; copies up what was added or changed and deletes the pending originals the move step did not move; counts file facts (`.bower/file-facts.json`), writes `.bower/paths.json` and `.bower/last-run.json`; reports to the Worker. `docs/runbook.md` has the detail.

## App modules (v5)

Runs, piles, uploads, recovery and Bower on screen. Each module's own header comment says what it holds; this table only says where things live.

| Module | What it does | Read by |
| --- | --- | --- |
| `app/src/run-outcome.ts` | `RunOutcome`: the one result of a run. The Worker's `Run` and the runner's `.bower/last-run.json` both turn into it (state `running`, `done`, `partial` or `failed`, plus counts, `left`, `total`, `phase`). `runSentence(outcome, { now, voice })` is the only place result text is made; `voice: 'first'` is used only in Home's bubble, every other screen passes `'third'`. Pure: no Drive, no clock. | Home, the run chip, the working sheet, Activity, the Bower tab |
| `app/src/last-run.ts`, `run-store.tsx` | Reads `.bower/last-run.json` (now with `created`, `updated`, `left`) and keeps the run's state, the finished-run flag (`resultSeen`) and the demo run switch. | every run surface |
| `app/src/inbox-count.ts` | The one source of the inbox number: things (files and links) and requests counted apart, `loading` while the listing loads and never 0. Home's Inbox card, Add's hint and the "Is that everything?" dialog read it, so they cannot disagree. | Home, Add, the confirm sheet, the switcher |
| `app/src/pile-store.ts`, `pile-groups.ts` | Piles: the files and links added together, each a context note in `0-Inbox/` from its first attached file (`kind: context`, `pile: <id>`, an `## Applies to` list). One writer for the note, writes serialised and coalesced, guarded by the note's `modifiedTime`. `pile-groups.ts` groups the inbox rows "From your pile". | Add, the confirm sheet, the inbox |
| `app/src/upload-queue.ts`, `upload-names.ts` | The durable upload queue: each attached file is copied into IndexedDB (`uploads` store) and sent with Drive's resumable protocol, so switching tab never stops it and closing the app only pauses it. Per user, one tab holds the queue (`navigator.locks`). Over 200 MB, or when the copy fails, a file is sent from memory and says "Keep Bower open until this one is in." | Add, the upload chip, sign-out |
| `app/src/session.tsx` (`recheckFolder`), `vault-store.tsx` | The vault check: the app asks Drive about the Bower folder when it opens, when a tab is back after ten minutes, when a listing answers 404, and before Add, Tidy up and "Just this, now". The answer (`ok`, in the Bin, gone, no access; `unknown` never overrides what is known) sends the person to `/recover`. The Worker keeps `vault.missingAt` and `vault.setAt` on `/me`. | the layout, `/recover`, the run store |
| `app/src/overlay-queue.ts`, `components/overlay.tsx` (`OverlayHost`) | The overlay queue: one modal at a time. `open(entry)` answers `'shown'` or `'queued'`; priority (own overlays, then the tidy-up sheet, then the tour, then hints and toasts) only orders the waiting line and nothing is pushed aside. `OverlayHost` is mounted once in `layout.tsx` and portals into `document.body`; on phones every overlay is a bottom sheet with a grab bar. | menus, dialogs, sheets, the tour |
| `app/src/bird-presence.ts` | The presence store: a tiny external store that counts the birds on screen. `Bird` registers itself on mount when it is animated, at least 40 px and not perched; the phone run chip draws its bird only while no other bird is on screen (`useBirdRoom`); birds inside an overlay pass `overlay` so the others go still. Tests call `resetBirdPresence()`. | `Bird`, the run chip |
| `app/src/history.ts` | Parses and writes the `## History` bullets (`- 29 Sep · Status new → done, by you`) of a note; the runner and the rulebook write the same shape ("by Bower", "(your rule)"). | the note screen, made-from |

## v5 data flows

- **A run's result.** The runner writes `.bower/last-run.json` and reports to the Worker at each phase change (at most four running reports) and once at the end. The report carries `processed` and `items` (with `to`), `created`, `updated` (each with a one-line `what`, cut at 120), `left`, `setAside`, on a done run `disagree` (at most 5) and `next` (at most 3), and while running `phase`, `total`, `done` and `phaseAt`. The Worker caps the sum of `processed`, `created`, `updated`, `left` and `setAside` at 400 entries (each array is cut to 200 first). `run-outcome.ts` turns either source into a `RunOutcome`; every screen asks `runSentence` for its words.
- **A pile.** Add attaches a file: the queue copies it to IndexedDB and uploads it in the background, and the pile's note is written to `0-Inbox/` from the first file. The Add screen hands the pile to the tidy-up sheet (`setPileHandOff`, `followUploads`); a tidy-up sends the whole inbox, and the runner reads each pile note by its frontmatter. Removing a pile moves its files and note to Drive's Bin and is disabled while a run is in flight. A closed pile is pruned from the store once a run is done.
- **Uploads.** `uploadQueue().start(email)` runs after sign-in; the queue is keyed by the signed-in email because `/me` has no user id. On a reload it asks Drive how many bytes arrived and sends the rest; the copy is deleted only when Drive confirms the file. Sign-out, `DELETE /me` and "Forget this device" call `clearUploadQueue`, after the unfinished-uploads dialog.
- **Vault check.** `recheckFolder` reads the folder's own metadata from Drive. Trashed shows "Put it back", 404 shows "gone", a shared-drive or lost-access answer shows "can't open"; a 403 or 5xx from Drive is not "gone". The runner reports `vault_missing` when the folder is gone before it uploads anything, so a restored folder is never overwritten. See the runbook's "Your Bower folder was deleted".
- **Overlays and the bird.** Every overlay asks the queue to open; `OverlayHost` shows the one in front and restores focus to the opener when it closes. A bird inside an overlay registers as an overlay bird, which stills the others; under reduced motion a still pose replaces the animated one.

## App modules (v6)

v6 gives every screen the same parts: one text box, one round button, one list row, one file icon, one page header, four overlay placements and one explorer. Each part is the single source of its look and words; screens import it instead of drawing their own. `docs/brand.md` has the tokens and primitives.

### App shell (#906)

- `app/src/shell-routes.ts` names the second tab once (`FOLDERS_TAB_LABEL` "Folders", landmark `FOLDERS_LANDMARK` "Your folders"; the route stays `/notes`) and decides the frame per route: `topBarVariant` (`tab`, `inner`, `explorer`), `activeTab` (Just filed lights Home, Settings none) and `barHasAvatar` (not on Settings).
- `app/src/components/layout.tsx` draws the phone top bar (files button, back link, title slot, ⋯ slot, avatar button), the tab bar, and the desktop sidebar frame and nav. Every nav item is a stroke icon; Bower's is the speech bubble. The sidebar has no bird (the old ledge is gone; `components/bower-ledge.tsx` keeps only `useBirdRoom`, used by the phone run chip) and Add has no waiting-count badge. There is no "?" in the bar and no "Done · 1 filed" pill on desktop (E-9); Help lives in each screen's ⋯ menu.

### PageHeader (#906)

`components/page-header.tsx` (`PageHeader`) is the one page header, on every screen, so a name appears once: the desktop breadcrumb (parents only; a root folder's crumb reads "Your folders" and reveals the tree), the h1 (28 px on the phone, 32 px from 900 px; it wraps, never truncates) with (i) and ⋯ beside its first line, the meta line from `meta-line.ts`, an optional purpose line (a folder of folders) and an optional tabs row. `PageKind` is `screen`, `tab`, `folder`, `note` or `file`.

### One source for names, kinds, dates, counts and icons (#905)

- `app/src/meta-line.ts` (`metaLine`, `kindLabel`, `itemKind`, `shortDate`, `dayWords`, `sizeWords`) is the only source of kind words, dates and meta lines.
- `file-origin.ts#filedBy` says who put a file in its folder and when ("filed by Bower …", "added …"); `bower-written.ts#isBowerWritten` is the one rule for "Bower wrote this note".
- `components/file-icon.tsx` (`FileIcon`) is the only item icon: the still bird mark for anything Bower wrote; one document glyph (`IconDocument`) for every original, stroked in its root's colour (the kind word in the meta line tells a PDF from a photo); the folder outline in its root's colour for a subfolder; the PARA disc (`FolderMark`) for a root; muted for Answers, Clippings and anything outside the five roots. Four sizes: 16, 20, 28, 40.
- **A folder's own page** (K-31, `folder-view.ts#isFolderPage`): a note named after its own folder (`Moonee Ponds/Moonee Ponds.md`) is that folder's page, unless it says `by: person`. It is not listed in the folder and not counted; `siblings` (About's "In this folder", the n of N footer) skips it too.
- **Counts** (K-31, `folder-view.ts`): a page header counts the items directly in the folder (`folderCount`: Originals plus By Bower, subfolders counted as originals), so the meta line, Filter & sort's "Show n things" and the segments agree. A subfolder's row and card count everything inside it, the folders under it included, minus the folders' own pages (`subfolderThings`); a pinned folder's tile counts everything inside it too (`navigation.ts#folderCounts`).

### Overlays and the ⋯ menu (#907)

`components/overlay.tsx` has four placements: a phone sheet that hugs its content up to 90 % (every kind, on the phone), the 440 px side panel (`kind="sheet"`), the 320 px popover (`kind="menu"`) and one centred dialog (`kind="dialog"`, only the tidy-up confirm, Columns and `components/confirm.tsx`); `OverlayHeader` and `OVERLAY_CLOSE_LABELS` name every ✕. One overlay shows at a time (`overlay-queue.ts`, see v5).
`more-menu.ts` (`moreMenuGroups`) lists each ⋯ menu kind (`MenuKind`: folder, root, note, file, home, add, bower, notes, justFiled, settings, health) in the spec order; `components/note-menu.tsx` draws it and hides a Drive item whose id has not arrived.

### Lists, cards and Bower's note box (#908)

`components/list-row.tsx` (`ListRow`) is the one list row, `folder-grid.tsx#GridTile` the one tile and `folder-card.tsx` (`FolderCard`) the folder-of-folders card (the folder outline at 40 px, "<n> things · updated <when>", a "<n> new" badge and up to three things inside). With `onSelect` (desktop) one click selects, and a double click or Enter opens. `components/system-state.tsx` holds the skeleton (after 300 ms), the error line (`ERROR_COPY`) and the empty folder. `BowerNoteBox` folds per note (`foldedNotes` in `prefs.ts`) and takes `fold` for the preview column.

### The one text box, the round button and the search field (#910)

- `components/composer.tsx` (`Composer`) is every text box: mode `send` (with text, the arrow, named by its effect: Send, Put in the inbox, Rename) or `save` (keeps the mic and saves as you type, `SAVE_DEBOUNCE_MS` after the last key), one line or three (`rows: 1 | 3`; Enter commits in one line, Ctrl or ⌘ + Enter in three). `composerButton` and `composerLine` decide the one button and the one live line under the box.
- `components/round-button.tsx` (`RoundButton`) is that button, 40 px (32 in the desktop search field), always in the same place, in six states: `mic` (empty box), `asking` (permission prompt), `mic-off` (crossed out, dimmed), `arrow` (text typed in `send` mode), `stop` (dictating) and `spinner` (sending).
- Dictation runs on `useDictation` (`components/dictate-button.tsx`), the Web Speech state machine (`DictateState`: `ready | asking | listening | blocked | unavailable`, `nextDictateState`), with the language from Settings. Dictation off has two states, both with the crossed-out mic and their own line: `blocked` ("The microphone is blocked. You can allow it in your browser settings.") and `unavailable` ("Dictation is off in this browser. Type instead."). Offline has its own line too.
- `components/search-field.tsx` (`SearchField`) is the same box as a `trigger` (the explorer's search slot, which opens Search) or Search's own `input`. `openAsk` (`send-to-bower.tsx`), `openRename` (`rename-sheet.tsx`) and `AppendForm` are the Ask, Rename… and Add a paragraph… sheets around a `Composer`.

### One explorer, three hosts (#909)

- `components/tree.tsx` is the one tree, in three hosts: `sidebar` (desktop, rows 28 px), `drawer` and `page` (the phone drawer and the Folders tab, rows 40 px). No counts, badges or hidden-files footer; "Bower's own files" (the `showAppFiles` preference) is a group at the bottom of the tree. Answers and Clippings are rows under it.
- `components/explorer.tsx` builds each host around it (the search slot, Pinned, YOUR FOLDERS with Show the open item / Sort / Collapse all folders). The sidebar explorer also mounts the phone drawer `FoldersDrawer` (portalled to the body) and the left-edge swipe (`use-edge-swipe.ts`); `folders-drawer.ts` holds its open state (`openFoldersDrawer` for the top bar's files button).
- `reveal.ts#revealInFolders(path, id?)` opens the drawer on the phone or points the sidebar on desktop, then expands, scrolls to, selects and focuses the row. Used by "Show the open item", the Folders tab's `?reveal=` link and the root crumb.
- `components/folder-picker.tsx#openMoveTo` is Move to…: the same tree rows, folders only; "Move here" writes the request note and confirms with a toast with Undo.

### Compare and the folder's statuses (#916, #921)

`CompareSlot` (`routes/folder.tsx`) mounts `CompareView` (`components/compare.tsx`): phone cards with the Sort chip, the folder's quick filter and the `StatusSelect` (`components/status-select.tsx`); a desktop table sorted by a header click, with the Columns popover. `compare.ts#tableColumns` holds the boards' tables (flats, job offers; any other kind keeps its `compareFields`).

Statuses are chosen per folder (rulebook v23). `folder-statuses.ts#folderStatuses` reads `statuses: [..]` from the folder's hub note `<Folder>/<Folder>.md` (`hubNotePath`): a non-empty list of lower-case values of at most `MAX_STATUS_LENGTH` (24) characters, no duplicates. A missing or unusable list falls back to the kind's `statuses` (`kinds.ts`), and the console says why. `statusOptions` keeps a note's older value that is not in the list as the last option, so it stays choosable until it is changed. A change is written to the note's `status` (R-API-14).

**The hub-note contract.** The rulebook (`vault-template/CLAUDE.md`, v23) has Bower write the list when a project or area folder holds two or more notes of a kind with statuses: 3 to 10 values, lifecycle order, starting with `new`; it appends a value a note uses rather than dropping it. The runner (`agent/run.sh`, `check_hub_statuses`) removes the list from a hub note the run changed when it breaks those rules or lacks a status a note next to it uses, and says so in the run's summary. The app and the runner apply the same 24-character limit.

### The demo is the UI's data contract (#903, #922)

`app/src/demo/` (`index.ts` installs it; `fixture.ts` is Alex's folder, `server.ts` the pretend Worker and scripted run, `drive.ts` the in-memory Drive) feeds the app through the same `WorkerClient` and `DriveClient` the real build uses, with the shapes the boards draw: hub notes with `statuses:`, runs with `startedAt`, who filed what, Drive ids for the ⋯ menu. Where the demo and real data disagree, the demo is the contract and the real client follows it. `demo/load-switch.ts` adds two demo-only switches in session storage: `bower:demo:slow` (reads wait about 1.5 s, so the skeletons show) and `bower:demo:fail` (the next read fails once, so the error line and Try again show). The demo is built locally only (`pnpm -C app build:demo`); it is not deployed.

## v6 data flows

- **Run start time.** The Worker sets `run.startedAt` when a run first reports `running` (`api/src/runner.ts`) and returns it on `GET /status`; the demo's server does the same. `run-progress.ts#runStartTime` reads it (else `requestedAt`) and `startedLine` writes "Started 11:57 · it takes a few minutes" for the running sheet and Home.
- **Who filed.** `file-origin.ts#originOf` reads a file's origin (the `bowerOrigin` Drive app property, else its `index.md` row); `filedBy` turns it into "filed by Bower <when>" (the run's time when known, else Drive's created time) or "added <when>" for something you added or a file without an origin. The file page's About, the quick look, a note's properties and the meta line read it.
- **Statuses.** In a tidy-up the agent writes `statuses:` in the hub note and the runner checks every hub note the run changed, removing an unusable list. In the app, Compare reads the hub note with the folder's notes, `folderStatuses` gives the list (or the kind's), `statusOptions` adds the note's legacy value at the end, and a change writes the note's `status` in Drive. No Worker call.
- **Folder counts.** Telling a folder's own page apart needs its frontmatter (`note-meta.ts`), so the folder page reads its notes before it lists and counts them; the header counts what is directly in the folder, and each subfolder's card or row, and a pinned folder, count everything inside it.

## The tidy-up session (M52, M53)

Since M52 and M53 (spec `docs/superpowers/2026-10-01-session-speed-spec.md`), the agent decides and the runner does the bookkeeping. The agent gets everything it needs handed in, so it spends its turns on the items, not on reading Bower's own files.

### The session's inputs

`agent/run.sh` builds them after the pre-scan, with no AI, and logs only counts (`context:` and `rulebook:` lines):

- **The rulebook, out of the folder.** The runner moves the vault's `CLAUDE.md` out of the local copy for the session, so Claude Code does not load it whole as memory, and puts it back right after, before anything reads or copies the local copy (a `CLAUDE.md` written during the session is replaced). From rules v24 on, each `##` section of the rulebook may carry a load marker on the line after its heading (`<!-- load: ingest, instructions -->`). The run keeps the core (every section with no marker) and the sections marked for its modes: `ingest`, plus `instructions` when a request or a context note is pending, or `lint`. A rulebook with no marker (rules v23 or older) is kept whole.
- **The system prompt.** That cut rulebook, then `Rules.md`, then `About-Me.md`, each under a plain heading, written to a file in the work dir and passed with `--append-system-prompt-file`. It holds only text that does not change during the run, so the prompt cache keeps it across the session's turns.
- **The prompt.** `prompts/<mode>.md` with its placeholders filled in one pass (text a block inserts is never filled again): `{{TAGS}}`, the lines of `index.md`'s `## Tags`; `{{FOLDERS}}`, the folders with a hub note; `{{CORRECTIONS}}`, the `Correction:` lines of `log.md` counted per `<from folder> -> <to folder>` pair; `{{PENDING}}`, the pending list after the pre-scan; and `{{BACKFILL}}`, up to 50 `index.md` rows in the old form, oldest first. An ingest gets the first four, a lint the tags, the folders and the backfill. A part that cannot be built becomes `(not available)` and the run goes on.
- **stdin.** The filled prompt is written to the work dir and fed to `claude -p` on stdin, never as an argument, so a large folder's context never meets Linux's limit on one argument.

The model and the effort come from the runner too (`--model`, `--effort`; see the runbook's "Model and effort").

### The filing sheet (rules v25)

The agent no longer moves a pending original or edits hub lists, `index.md` rows or `## Tags`. It writes its decisions to `.bower/filing.tsv`, one TAB-separated line each, in the format the rulebook's **index.md and log.md** section gives:

- `file`: a pending path, a destination folder, a file name, tags and a description. The destination is an existing folder under a PARA folder, a new direct subfolder of one, or `0-Inbox/Processed`.
- `note`: a note the agent wrote at its final path, its original (or `-`), tags and a description.
- `tag`: a new tag and its meaning.

The runner removes any old sheet before the session and moves the new one out of the local copy right after it, so no copy up, the one after a failure included, ever takes it to Drive. After the session and before the audit, it reads the sheet and checks every line on its own, treating every field as hostile: paths stay inside the folder and out of hidden and protected places, a `file` line names a file on this run's pending list and overwrites nothing, a `note` line names a note this run wrote, tags and descriptions are in the v24 form. A line that fails is skipped and only counted. For each valid line, in the local copy only, it:

- moves the file (`mv -n`), creating a new subfolder and its hub note `<Folder>/<Folder>.md` when needed;
- adds the hub line `- [[<file name>]] <description>` to the hub note's list;
- adds the `index.md` row under the folder's section, the type derived from the extension;
- adds a new tag to `## Tags`.

Items sent to `0-Inbox/Processed` get no hub line and no row. The sheet adds no Drive write path: the existing pipeline does the rest. The audit checks every file the sheet wrote, the move phase finds each filed original by its content and moves it in Drive with `rclone moveto` (the file keeps its Drive id), and the bookkeeping writes the `Filed:` lines, the row check, the tag recount and the `## History` lines. The log gets `filing sheet: <n> filed, <n> notes booked, <n> tags, <n> lines skipped`, and skipped lines become a warning in the run's summary, with the count and no path.

### `index.md` rows and `## Tags` (rules v24)

Every row is `- [[<path>]] · <Type> · <#tag #tag> · <description> · <origin>`:

- the path from the top of the folder, with the extension;
- the type as the app names it (Note, PDF, Photo, Image, Spreadsheet, Document, Audio, Video, File);
- one to five tags;
- a description of at most 100 characters, with no `·` and no wikilink;
- the origin, `filed by Bower`.

A note row whose note has an original ends ` · [[<path of the original>]]`. `## Tags`, at the end of `index.md`, holds one line per tag in use, `- #<tag> · <meaning> · <count>`. Rows written before v24 have fewer fields; the app reads both, and the weekly lint completes up to 50 old rows per run. After every session the runner recounts the tags (`book_tags`) and counts the rows added or changed that are not in the v24 form (`check_rows`); a bad row is kept and becomes a warning in the summary.

### Who writes `log.md`

`log.md` is append-only, and each line has one writer:

| Lines | Written by |
| --- | --- |
| `Rule added/changed:`, `Correction:`, `Proposal:`, `Context:`, `Applied rule:` | The agent, as the rulebook's workflows give them |
| `Filed: <name> → <folder>` and `Moved: <old> → <new>` | The runner, for each move Drive did (`book_moves`) |
| `Moved by you: <old> → <new>` | The runner's reconcile, for a move the person made in Drive or Obsidian |
| `Tag added: #<tag>` | The runner, for each tag new in `## Tags` (`book_tags`) |
| The run's own line (counts only) | The runner, with `.bower/last-run.json` at the end of an ingest |

The agent never reads `log.md`: the past corrections come in the prompt. The app writes no `log.md` line.

## Credentials

| Credential | Owner | Stored | Used by | Never |
| --- | --- | --- | --- | --- |
| Google refresh token (scope `drive`) | The user | Worker KV, AES-GCM encrypted with `TOKEN_ENC_KEY` | Worker, to mint 1 h access tokens for the browser and the runner | Leaves the Worker |
| Session cookie | The user | Browser (HS256 signed, HttpOnly) | App → Worker | — |
| `bower_not_invited` cookie (a rejected sign-in's address, AES-GCM encrypted inside an HS256-signed token) | The person turned away | Browser (HttpOnly, Secure, SameSite=Lax), 5 minutes, cleared by the first `GET /me` | Worker → app's Not invited screen, via `GET /me` | Put the address in a URL, KV or logs |
| Claude token or API key | The operator (or a user with BYOK) | Instance repo secret (or encrypted in KV for BYOK) | Runner | Enters this repo or the Worker logs |
| Run ticket (32 random bytes) | The Worker, one per run | Its SHA-256 in Worker KV (`runticket:<id>`, `lintticket:<id>`); the ticket itself only in the `repository_dispatch` payload and the run's job | That run's job → Worker (`GET /runner/vaults/:id`, `POST /runner/vaults/:id/status`) | Work for another vault, another run, or after its run reports `done`/`failed` |
| GitHub fine-grained token (`contents: write` on the instance repo) | The operator | Worker secret | Worker, to dispatch | — |
| Google OAuth client | The operator | Google Cloud; id/secret as Worker secrets | Worker | — |
| `TOKEN_ENC_KEY`, `SESSION_SECRET`, `ADMIN_KEY`, VAPID key pair | The operator | Worker secrets, generated per instance | Worker (encrypt tokens, sign cookies, admin auth, push) | Leave the Worker |
| Push subscription (endpoint + keys) | The user | Worker KV, opt-in | Worker, to send a run's status | Carry note content |

Lifetimes: the Google refresh token lives until the user deletes their account or revokes access at Google; a Drive access token minted from it lives 1 h and is cached in KV until then; the session cookie lives 30 days or until sign-out; a run ticket lives until its run reports `done` or `failed`, and at most 47 min (the queued plus running stale windows, `RUN_TICKET_TTL_MS` in `api/src/process.ts`), and a newer run of the same kind on the same vault retires it; the GitHub token lives until the operator rotates it.

## Why not X

- **`drive.file` instead of full `drive` scope.** `drive.file` only sees files the app itself created, which would blind the app and the agent to notes written by Obsidian, Drive Desktop or the Drive mobile app — most of a real vault. Full `drive` scope is required to read and write the whole folder. The cost: the operator's OAuth client is published **unverified**, so Google shows a one-time warning and caps the client at 100 users; verification (a paid security assessment) is out of scope.
- **Cron or Drive-change watching instead of a button.** Polling on a schedule (an Apps Script trigger, or GitHub Actions cron) either needs an extra always-on account to maintain or burns Actions minutes every few minutes whether or not there is anything to do (roughly 2,900 minutes a month idle, against a free tier of 2,000). Drive push notifications need a channel renewed every 24 h and a public endpoint to receive them. A button that dispatches a run on demand needs none of that, and keeps "what changed" entirely inside the vault instead of in Worker state.
- **No server between Drive and the runner.** Everything here runs on Cloudflare's and GitHub's free tiers plus the operator's own Claude subscription; a VPS or a background worker process would cost money to run continuously and be one more thing to patch and monitor, for a system whose only job is to move files and call an agent on a button press.
- **No email-in.** Accepting notes by email (forward-to-ingest) would need a mail-receiving integration — a dedicated inbox, a parsing service, or Gmail API access on the operator's own account — another credential and another attack surface, for something a Drive upload or the app's Add screen and Bower tab already do. The inbox is `0-Inbox/`, a Drive folder, not a mailbox. Documented as an opt-in extension an operator could add themselves: `docs/extensions/email-in.md`.

See `docs/decisions.md` for the full record, including what else was tried in the prototype that came before this repository.

## Limits

| Limit | Value | Why |
| --- | --- | --- |
| Users per instance | 100 | Google's cap on an unverified OAuth client (see above); verification is out of scope |
| Drive access token lifetime | 1 h | Minted by the Worker from the refresh token on demand; never stored longer, cached in KV until it expires |
| One GitHub Actions run | 20 min (`timeout-minutes` in `agent/workflows/*.yml`) | Actions kills the job past this; `run.sh`'s own trap tries to report `failed` first, but a hard kill can pre-empt it |
| Stale-run unblock | 17 min for a `queued` run with no runner pickup, 30 min for a `running` run with no status report (`QUEUED_STALE_MS`, `RUNNING_STALE_MS` in `api/src/process.ts`) | The queued window is GitHub's 15 min limit for a job no machine picks up, plus 2, so a run GitHub has given up is failed soon after. The running window is longer than the 20 min run cap on purpose, so a normal run never gets pre-empted by its own staleness check; catches a runner that died without reporting |
| Rate limit | 30 requests in any 60 s on `GET /auth/callback` (per client IP, once the OAuth cookie verifies) and `POST /process` (per user, after the session check); in memory, no KV write (`RATE_LIMIT_PER_MINUTE`, `api/src/security.ts`) | Slows abuse of the two public entry points that cost something (a Google token exchange, a workflow dispatch) |
| Generic rate limit | 120 requests per client IP in any 60 s, across every cookie route; in memory, best-effort per isolate (`GENERIC_RATE_LIMIT_PER_MINUTE`, `api/src/security.ts`) | Caps any one client well above normal use (the busiest minute of Home plus Tidy up is about 16 calls) |
| Request body | 64 KB, JSON only on writes (`MAX_BODY_BYTES`, `api/src/security.ts`) | Every body the Worker accepts is a small JSON object; anything bigger or of another type is refused before parsing |
| Runs per user per day | 100 by default (`DAILY_RUN_LIMIT`, `api/src/env.ts`), operator-configurable | The runner spends the operator's Claude subscription; a soft cap keeps one user from exhausting it |

## Threat model

Full checklist and the CORS/CSRF/cookie mechanics: `docs/security.md`. This is the design-level version: what someone who controls each piece could do, and what stops them.

- **Someone who controls the Worker** (the operator, or an attacker who compromises it) can read every user's decrypted refresh token, mint Drive access tokens for any vault, and read or write anything in those vaults — the Worker is the one place that holds the key to decrypt tokens. It cannot read note content directly (KV never stores it), only whatever it chooses to fetch from Drive with a minted token. This is the household trust model: users are told the operator can do this (`docs/privacy.md`), not protected from it.
- **Someone who controls a runner job** (code execution inside an ingest or lint job: the agent itself, or a compromised download or package in the job) gets that one run's ticket, and with it, until the run reports `done` or `failed` (at most 47 min), one user's 1 h Drive access token and, if that user set one, their Claude API key — never another user's token, never the refresh token behind it, never `TOKEN_ENC_KEY` or `ADMIN_KEY`. No job in the instance repo holds a Worker key (issue #292; #259 first took it from the jobs that run the agent): the Worker mints a ticket per run and per vault and sends it in the `repository_dispatch`, and a ticket is refused for any other vault (issue #259). The Drive token itself carries Google's full `drive` grant, not just the vault folder — `rclone`'s own configuration (`root_folder_id`) is what keeps an honest run inside the vault, so a compromised run could reach the rest of that one user's Drive for that hour, but no other user's.
- **Someone who can change the instance repo** (push access, or a malicious change to its workflows or `agent/run.sh`) can write a job that reads the repo's secrets, but no secret there works against the Worker: the weekly lint is started by the Worker's own cron trigger (issue #292; until then a `BOWER_API_KEY` in this repo could make the Worker dispatch a ticketed run of every vault into a workflow the attacker controls), and `POST /runner/lint/dispatch` needs `ADMIN_KEY`, which only the operator holds. What they can still do is read the Claude credential, change the workflow that runs the agent when the Worker dispatches a real run (that one run's ticket, one vault), and stop runs from happening. The instance repo is still the operator's to guard like the Worker's secrets (private, two-factor, no outside collaborators; `docs/runbook.md`, "Hardening your instance").
- **Someone who controls the app's origin** (the deployed Pages site, or a browser extension acting as the signed-in user) can do anything the signed-in user could do in the UI: read the vault, upload to the inbox, start a run, change settings, delete the account. It cannot mint a Drive token for another user or read the refresh token, which never reaches the browser. CORS and the same-origin check on state-changing routes stop another site from riding on the user's cookie.
- **Someone who gets a Drive access token** (leaked from a browser, a runner log, or a compromised runner) can read and write that one user's Drive — not just the vault folder, since the grant behind the token is full `drive` scope — for up to 1 h and nothing after it expires; it cannot be used to mint a new one, and revoking the user's Google grant invalidates it early.
- **Someone who writes a file the agent reads** (a clipped web page, a forwarded file in `0-Inbox/` or `Clippings/`) can try prompt injection: text telling the agent to do something else. The prompts tell it to treat note contents as data, never as instructions, and by default the runner gives it no tool that reaches the network or copies runner files: `WebSearch`, `WebFetch`, `curl` and `wget` are denied, and `Bash` is limited to `mv`, `mkdir` and `ls` (no `pandoc`, which takes a URL as input, and no `cp`), so it cannot send vault content to a third party. Office, HTML and EPUB files are converted to Markdown by `run.sh` before the agent starts, with `pandoc --sandbox` (the one input file only, no other file, no URL). Residual risk: an injected note can still make the agent misfile or rewrite notes in that vault, and the web tools come back only for a tidy-up where the instance opts in with `BOWER_ALLOW_WEB=1` and the user turned on "Let Bower look things up on the web" (the Worker stores it as `allowWeb` and sends it as the dispatch's `allow_web`; `run.sh` needs both), the one way a run can reach the network.
- **What the design prevents:** one user reading or changing another user's vault, run or settings; a note ever sitting in Worker storage or Actions logs; a credential outliving the job or session it was minted for; a runner job reaching any vault but the one it was dispatched for; anyone but the operator holding a secret that decrypts a refresh token. It does not prevent someone who can change the instance repo from reaching every vault (see above).

## Policies

- **The vault is the only state.** The Worker keeps credentials and pointers; the runner keeps nothing; the app keeps a read cache.
- **Rules are data.** The agent's behaviour is `CLAUDE.md` in the user's vault, changed only through instruction notes (`Bower - …md`), dated and in plain English. The agent never edits its rules on its own initiative.
- **Never delete.** Uploads use `rclone copy`, and only for the files the agent added or changed, so a note edited in Drive during a run is not overwritten. The only remote deletions are targeted: each file that was pending in `0-Inbox/` or `Clippings/` at the start of a run and that the agent moved away, one `rclone deletefile` per path (a file already gone counts as done). Files added during a run are never touched, and Drive deletions go to the Trash. Processed originals move to `0-Inbox/Processed/`.
- **The app trashes only on the person's own action.** Removing a waiting request (its note) and "Remove this pile from the inbox" (the pile's files and its note) call `deleteFile` (`deleteFileHttp`), which only moves to Drive's Bin, so the person can put the files back. Removing a pile is disabled while a run is in flight (R-PILE-10), so the runner never loses a file it is reading.
- **Free to run.** Cloudflare Pages/Workers/KV free tiers, GitHub Actions free minutes of a private repo (2,000/month), the operator's existing Claude subscription. No servers, no database of content, no paid provider. A dependency or a service that breaks this needs a decision entry.
- **Least privilege.** One repo per token; one folder per Drive remote (`root_folder_id`); bearer keys compared in constant time; secrets only in Cloudflare/GitHub; nothing personal in this repository (CI gate).
- **Fail loud, fail safe.** Any runner error reports `failed`, leaves originals in the inbox, and the next Process retries. Stale runs unblock the button (see Limits).
- **Household trust model.** The operator can, in principle, read every vault of their instance. Users are people who trust the operator. This is documented to users in `docs/privacy.md`, not hidden.
- **Self-hosted, not hosted.** The Claude subscription is personal; an instance serves its operator's household. Guests bring their own API key (BYOK) if the operator allows it.

## Adding a new piece (checklist)

1. Does it keep the cost at zero and the vault as the only state? If not, open a decision in `docs/decisions.md` first.
2. Put it under the folder that owns it; add it to the layout above and to the components table.
3. Env vars and secrets go through `api/src/env.ts` and the runbook table in the same PR.
4. Tests hermetic; CI green; `CLAUDE.md` unchanged unless a rule changed.

## Related documents

- `docs/decisions.md`: why things are the way they are, including what was rejected.
- `docs/runbook.md`: deploy, operate, pause, tear down.
- `docs/testing.md`: the manual end-to-end checklist.
- `docs/security.md` and `docs/privacy.md`: the full security checklist and the user-facing privacy statement (also served by the app at `/privacy`, and linked from the Google OAuth consent screen).
