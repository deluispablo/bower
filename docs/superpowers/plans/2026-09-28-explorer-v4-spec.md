# Explorer v4: implementation spec (2026-09-28)

**For the technical lead.** This covers the v4 iteration: finding, seeing and understanding what is in the Bower folder, phone first and desktop. It replaces the phone folder menu (#319), changes the note and file screens (#350, #351), extends the agent's filing (#368, #371) and resolves #560. Boards: `docs/design/v4/boards/` (record) and the Design canvas https://claude.ai/artifact/Hqa8fUHvMgwURNtUgKutmZ (working copy). **The board wins over this text.** Written against `origin/main` 2910261; the demo and production were walked on 2026-09-28 (production with the test account, read-only). The ideas, the benchmark and the walkthrough log are in `2026-09-28-explorer-ideas.md` (same folder); this spec does not repeat them.

## 1. Brief and decisions

- **Goal**: a person finds anything in the Bower folder in one search or three taps, sees what each thing is and where it came from, and understands what Bower read and connected, without opening the original.
- **Audience**: people who use Bower daily on a phone to look things up, and sometimes on a desktop to review and compare.
- **Piece**: the screens listed in section 4, the system changes in section 5, the agent and runner changes in section 7.
- **Constraints**: Preact + Vite PWA, Drive read from the browser, the vault is the only state, the app never moves or renames (only Bower does), free tiers, UI copy in plain words ("your notes", "Bower folder"; never "vault"), no personal data.
- **Done when**: every acceptance criterion in section 6 passes, the four CI checks are green, and a tester walks the boards' flows on the phone and the desktop without a mismatch.

Decisions (owner, 2026-09-28; each one line with its why):

| # | Decision | Why |
|---|---|---|
| D1 | The app never moves, renames or deletes. "Move to…" is a request to Bower through a folder picker, done now (instructions-only run, #344) or with the next tidy-up. | Bower keeps `index.md`, `log.md` and links consistent; one writer. |
| D2 | Inbox and the four PARA folders are a fixed visual landmark: fixed order, fixed place, a coloured mark, no numeric prefix anywhere, a short meaning line. | The owner's pillar: recognisable at a glance. |
| D3 | New dependencies allowed: MiniSearch (MIT) and TanStack Virtual core (MIT). No PhotoSwipe. | Fuzzy search and long lists; native zoom is enough for photos. |
| D4 | Find first, then the one explorer and desktop panes. | Biggest daily pain. |
| D5 | Palette: Inbox coral with a tray icon; Projects teal P; Areas amber A; Resources blue R; Archives lilac A (P A R A reads down). | Owner's ruling; contrast checked (section 5). |
| D6 | Every file says what it is (kind word and badge); a copy says it is a copy and links to its original. | The owner's spreadsheet case. |
| D7 | Phone: the Notes tab is the only explorer; the top-left folder menu goes. | Two screens showed the same tree differently (#319 reversed). |
| D8 | Bower's note uses the origin colour code of the v3 board (from the file, from your notes, looked up, from what you told me); "Check" is a small word on a line that needs the person. | The owner's reference board; #371 drifted to verdict tones. |
| D9 | Bower writes a short companion note for documents of a listed kind (a partial reversal of #368); photos and unknown kinds get none unless asked. | Key facts, Details and Compare need it; "By Bower" hides it when unwanted. |
| D10 | Bower's notes use Obsidian callouts (`> [!bower]`). | Renders natively and folds in Obsidian. |
| D11 | No HEIC or Excel converters for now: those files are kept, not read. | Owner's call. |
| D12 | The tab keeps the name "Notes". | Copy rule; revisit if files dominate. |
| D13 | Desktop shows two or three panes at 1200 px and above (amends #355's one-column rule for the explorer and folder screens only). | Finder, Mail, Notebook Navigator pattern. |
| D14 | No further work on the interactive demo, and the published demo is taken down (Q5); the demo deck (canvas page "Demo deck") is kept for later and is not built. | Finish the real app first; nobody sees an old version. |
| D15 | Every move keeps the file's Drive id and leaves no duplicate (server-side move). Resolves #560. | No duplicates; links and "New" keep working. |
| D16 | "New" is kept per device. | No server change; sync later if needed. |
| D17 | Sign-up never asks for a CV, an ID or a LinkedIn profile. The existing four-question interview (#198) stays; a tip says Bower learns from what the person chooses to add. | Trust. |
| D18 | Operating-system and sync files (`desktop.ini`, `Thumbs.db`, `.DS_Store`, `Icon\r`, `~$*` and `.~lock.*` lock files, `.tmp.driveupload/`) are never shown, read, moved or listed. | Google Drive for desktop writes `desktop.ini` in every folder; the agent already moved one out of an inbox. |
| D19 | Bower decides moves; a script executes and books them: the runner moves in Drive, then updates `index.md` and appends to `log.md` without AI, and reconciles both with the real tree at every run. | Deterministic bookkeeping; AI only for the decision. |

## 2. Design review

The walkthrough log (findings 1–27) and conclusions are in `2026-09-28-explorer-ideas.md` §3–4. This spec fixes:

| Finding | What | Where fixed |
|---|---|---|
| 1 | Files missing from the tree; counts disagree | R-NOTES-3 |
| 2–5 | Search: files mislabelled, folders absent, no typo tolerance, raw paths | R-SEARCH-* |
| 6 | Bird over the search field | R-SEARCH-9 |
| 7, 24 | Back label cut to "1.." / "2." | R-SYS-6 |
| 8 | Fixed sort | R-FOLDER-3 |
| 9, 10 | No thumbnails; dead-end viewer | R-FOLDER-5, R-PHOTO-* |
| 11 | "Move to…" is slow and vague | R-MOVE-* |
| 12 | Two meanings per row, small chevron | R-NOTES-5 |
| 13 | Clippings without meaning line | R-NOTES-4 |
| 14 | Desktop single column | R-DESK-* |
| 15 | Home and tree inbox counts disagree | R-SYS-7 |
| 16 | Full walk on every refresh; no virtualisation | R-PERF-* |
| 17 | Four ways to browse | R-NOTES-1 |
| 18, 19 | The tree does not follow what you open | R-REVEAL-* |
| 20, 22, 23 | Note and original do not know each other; links go to Drive | R-FILE-8, R-NOTE-9, R-FOLDER-8 |
| 21 | CSV and text have no preview | R-FILE-5 |
| 25 | "Yesterday · not checked yet" | R-SYS-8 |
| 26 | Zeros as fact after sign-in | R-SYS-9 |
| 27 | Title shown twice | R-NOTE-10 |

## 3. Ideas and references

In `2026-09-28-explorer-ideas.md` §5–8: the HMWs, the idea list, the benchmark table (Obsidian, Notebook Navigator, Google Drive, Apple Files), the open-source pointers with licences and the scored directions. Pointers the lead will use: MiniSearch (MIT, ~7 kB, serialisable index), TanStack Virtual core (MIT), Obsidian callouts syntax, the Drive API "Retrieve changes" guide (optional, R-PERF-3). Notebook Navigator is GPL-3.0: ideas only, no code.

The owner's own pre-Bower vault (read with permission, nothing personal carried over) confirmed three patterns this spec keeps: a hub note per project with a tracker table sorted by a fit score and a status per row (new, inquired, inspected, applied…), which is what Compare shows; a rubric behind the fit score; and answers that end with what to check and what to ask.

## 4. Boards

All boards are new versus the current app unless marked "changed". Phone 390 × 844 (states noted), desktop 1440 × 900.

| Screen | Boards | States covered |
|---|---|---|
| Notes tab | `Main`, `Phone-Notes-Revealed`, `Phone-Notes-Loading`, `Phone-Notes-Light`, `Phone-Notes-New` | default, revealed at a note, first load, light theme, after a tidy-up |
| Search | `Phone-Search-Start`, `Phone-Search`, `Phone-Search-None`, `Desktop-Search` | empty query, results, no results, desktop with preview |
| Folder | `Phone-Folder-List`, `Phone-Folder-ByBower`, `Phone-Folder-Grid`, `Phone-Folder-QuickLook`, `Phone-Folder-Empty`, `Phone-Folder-Compare`, `Desktop-Folder`, `Desktop-Explorer`, `Desktop-Compare` | list, By Bower, grid, quick look, empty, compare |
| More menu, Move | `Phone-More`, `Phone-Move-Picker` | open, folder chosen |
| Note | `Phone-Note-Bower`, `Phone-Note-Details`, `Phone-Note-Details-Open`, `Phone-Note-Long`, `Desktop-Note`, `Desktop-Note-Details`, `Flow-06-Dots`, `Flow-07-Answer` | note with Bower's note, key facts folded, details open, long note, answer |
| File | `Phone-File-Photo`, `Phone-Photo-Full`, `Phone-File-Sheet`, `Phone-File-Excel`, `Phone-File-Video`, `Phone-File-NoPreview`, `Phone-File-PDF-Long` | photo, full screen zoomed, CSV copy, Office via Drive, video, no preview, long PDF |
| After a tidy-up | `Phone-JustFiled`, `Desktop-JustFiled`, `Flow-05-Home`, `Why-Home` | list with New, set aside, earlier tidy-ups |
| Add | `Flow-03-Add`, `Why-Add`, `Desktop-Add` | pile added, kept-not-read item |
| Working, sign-up, suggestion | `Flow-04-Working`, `Flow-01-Welcome`, `Flow-08-Suggest` | unchanged behaviour; copy and content examples |
| System | `System-Folders`, `System-Formats`, `System-Kinds`, `System-KeyFacts` | reference |
| Earlier papers (content example) | `Flow-02-Earlier` | a filed offer letter with three key facts, an agreement with two |
| Deck | `Deck-01` … `Deck-14` | not built (D14) |

## 5. System changes

### Tokens (`app/src/styles/tokens.css`)

| Token | Dark | Light | Ink on the mark (dark / light) | Contrast |
|---|---|---|---|---|
| `--color-para-inbox` | `#f4a28c` | `#b8492f` | `#0b1220` / `#ffffff` | mark vs page ≥ 7.6:1 dark, ≥ 4.54:1 light; ink ≥ 9.3:1 / 5.21:1 |
| `--color-para-projects` | `#5fcfbc` | `#1f7a6d` | same | ≥ 8.16:1 / 4.50:1; ink 9.93:1 / 5.17:1 |
| `--color-para-areas` | `#f0b64f` | `#9a6408` | same | ≥ 8.43:1 / 4.35:1 (mark only on the sidebar); ink 10.26:1 / 5.00:1 |
| `--color-para-resources` | `#93c5fd` | `#2f63b8` | same | ≥ 8.53:1 / 5.08:1; ink 10.38:1 / 5.84:1 |
| `--color-para-archives` | `#c4b5fd` | `#6b52b8` | same | ≥ 8.33:1 / 5.19:1; ink 10.14:1 / 5.96:1 |
| `--color-origin-file` | `rgba(95,207,188,.2)` on `#8fe0d2` | light: `rgba(39,128,116,.14)` on `#278074` | — | icon 3:1 minimum |
| `--color-origin-notes` | `rgba(196,181,253,.2)` on `#c4b5fd` | `rgba(107,82,184,.14)` on `#6b52b8` | — | — |
| `--color-origin-web` | `rgba(147,197,253,.2)` on `#93c5fd` | `rgba(47,99,184,.14)` on `#2f63b8` | — | — |
| `--color-origin-you` | `rgba(240,182,79,.2)` on `#f0b64f` | `rgba(154,100,8,.14)` on `#9a6408` | — | — |
| `--color-new` | `#5fcfbc` bg, `#0b1220` ink | `#278074` bg, `#ffffff` ink | — | ≥ 4.5:1 |

`app/src/intro.ts#PARA_COLORS` reads the same tokens (the intro keeps its look in dark; its Archive disc stays "A").

### Components

| Component | New / changed | Props and states |
|---|---|---|
| `FolderMark` | new | `kind: 'inbox'|'projects'|'areas'|'resources'|'archives'`, `size: 18|28|40`; disc with letter (or tray icon for Inbox); `aria-hidden`. |
| `FolderIcon` | new | outline folder icon tinted with the PARA colour of its top folder, grey for others. |
| `KindBadge` | new | `kind` from the kind table; 3–4 letter badge (PDF, JPG, CSV, XLS, DOC, ZIP, LINK, MP4). |
| `KeyFacts` | new | `facts: {value, label}[]` 1–4; layout 1 = line, 2 = halves, 3 = thirds, 4 = quarters (2 × 2 under 340 px); `inline` variant for rows. |
| `BowerNote` | changed (`markdown/bower-note.ts`) | renders `> [!bower]` callouts (top and per section), origin squares, optional "Check" word, legend line; keeps reading the v3 `## Bower's note` form. |
| `Details` | new | grouped properties with labels, origin squares, "Not in the listing" chips; collapsed by default. |
| `BowerTag` | new | bird + "Bower", marks items Bower wrote. |
| `NewTag` | new | "New", or "N new" on folders. |
| `Tree` | changed (`components/tree.tsx`) | files as rows, PARA landmarks, reveal, collapse/expand all, virtualised. |
| `Switcher` | changed (`components/switcher.tsx`) | MiniSearch results by kind, chips, scope, states. |
| `FolderView` | changed (`routes/folder.tsx`) | sort, kind filter, origin filter, list/grid, groups, quick look, compare tab. |
| `QuickLook` | new | bottom sheet (phone) / right pane (desktop). |
| `PhotoViewer` | new | fitted image, full screen, native pinch, double tap 2×, next/previous. |
| `TablePreview` | new | CSV table, first 200 rows. |
| `DrivePreview` | new | Drive `/file/d/<id>/preview` frame for Office files and video. |
| `FolderPicker` | new | the tree, folders only, with search; used by Move to…. |
| `JustFiled` | new | list per tidy-up; table on desktop. |
| Folder menu (`components/folder-menu.tsx`, `folder-menu.ts`) | removed on the phone | its Pinned and landmark rows move into the Notes tab. |

Motion: row highlight on reveal fades over 600 ms; none under `prefers-reduced-motion`. Sheets keep the existing slide (#510 fix stays).

## 6. Per screen

Requirement IDs are stable. Each block ends with acceptance criteria ready for an issue.

### 6.1 System-wide (R-SYS)

- **R-SYS-1** Tokens and `FolderMark`, `FolderIcon` as in §5.
- **R-SYS-2** PARA recognition: a top folder is Inbox or P/A/R/A when its name, without a leading `\d+-`, is one of Inbox, Projects, Areas, Resources, Archives (case-insensitive), or it has the prefix `0-` … `4-`. A renamed PARA folder that matches neither is shown neutral. Names never show the numeric prefix anywhere (tree, breadcrumb, search, More menu header, Activity, Just filed, back label).
- **R-SYS-3** Fixed order and place: Inbox, Projects, Areas, Resources, Archives, always first, never sorted, filtered away or reordered by pins; then a divider; then Answers, Clippings and any other top folder, neutral.
- **R-SYS-4** System files (D18) are hidden by `vault-index.ts#isHidden` at any depth: `desktop.ini`, `Thumbs.db`, `ehthumbs.db`, `.DS_Store`, `Icon\r`, `~$*`, `.~lock.*#`, anything under `.tmp.driveupload/` (already hidden as a dot-folder), case-insensitive. One exported list `SYSTEM_FILE_PATTERNS` shared by the app and documented for the runner.
- **R-SYS-5** File kinds (`vault-index.ts#fileKind`, `FILE_KIND_LABELS`): MIME first, extension second: Note, PDF, Photo, Image, Google Doc, Google Sheet, Google Slides, Excel spreadsheet (.xlsx .xls), Spreadsheet (CSV), Word document (.docx .doc), PowerPoint (.pptx .ppt), OpenDocument text or sheet, Text (.txt), Markdown, ZIP archive, Email (.eml), Web page (.html), Audio, Video, File (unknown only). Badge per kind.
- **R-SYS-6** Back label: the parent's display name (R-SYS-2), ellipsised only past the bar's width; never a lone prefix.
- **R-SYS-7** One count rule for a folder: notes plus files, system files and hidden files excluded, everywhere (Home, tree, folder header, Just filed).
- **R-SYS-8** Health row copy: "Checked yesterday · 3 small things to fix" or "Not checked yet"; never both.
- **R-SYS-9** After sign-in, until the index arrives, Home's counts show a skeleton, never "0" or "No check yet".
- **R-SYS-10** Formats policy (board `System-Formats`): what is read, shown, kept. HEIC and Excel are kept, not read (D11). The same table is the source of the Add notices (R-ADD-4) and the agent rule (R-AG-9).

Acceptance criteria:
- [ ] `tokens.css` has the ten tokens of §5 in both themes; `intro.ts` reads them; a unit test checks the contrast values listed.
- [ ] `FolderMark` renders P, A, R, A and the tray for the five folders; no other folder gets a mark (unit test on `navigation.ts`).
- [ ] No screen shows `0-`, `1-`, `2-`, `3-` or `4-` before a folder name (e2e over Notes, folder, search, More menu, Just filed).
- [ ] A folder containing `desktop.ini`, `Thumbs.db`, `.DS_Store`, `~$Report.docx` shows none of them and counts none (unit test on `buildVaultIndex` with a fixture).
- [ ] `fileKind` returns the table's word for each listed MIME and extension (unit test with one case per row).
- [ ] The phone back label on `/folder/2-Areas/Finance` reads "Areas" (e2e).
- [ ] The Health row never contains both a date and "not checked yet" (unit test on the copy helper).
- [ ] Home shows skeletons, not zeros, while the index loads (e2e with a delayed Drive stub).

### 6.2 Notes tab, the one explorer (R-NOTES) — boards `Main`, `Phone-Notes-Loading`, `Phone-Notes-Light`

- Route `/notes`; signed in. Phone and tablet (< 900 px). At 900 px and up the sidebar is the explorer (R-DESK).
- Layout top to bottom: bar ("Notes", Expand/Collapse all, "?", avatar); search field ("Search folders, notes and files", opens the switcher); "Just filed · N" row when the last tidy-up filed anything not yet seen (R-JUST-1); Pinned (only when something is pinned); "Your folders": the five landmarks (mark, name, meaning line, count, chevron); divider; other top folders (neutral icon, count, chevron); Health row; hidden-files line.
- **R-NOTES-1** The phone top-left folder menu is removed from every tab; the bar shows Back on inner screens and nothing on tab roots. `folder-menu.tsx` and its board are retired; Help-Q-Folder, the tour's first sheet and the Notes help sheet drop "the menu, top-left".
- **R-NOTES-2** Expand/Collapse all: one button in the bar; label "Expand all folders" when every folder is collapsed, otherwise "Collapse all folders"; no sort button.
- **R-NOTES-3** Files are rows in the tree, with their kind icon and badge; notes and files sorted by name inside a folder; folder counts equal the rows (R-SYS-7).
- **R-NOTES-4** Meaning lines for the five landmarks come from `folder-meanings.ts`; Answers and Clippings get their own line ("What Bower wrote back to you", "Pages you clipped, waiting to be read").
- **R-NOTES-5** Row anatomy: the chevron is a 44 × 44 target that expands in place; tapping the name opens the folder screen; a note or file row opens it. Holding a row opens the pin sheet (existing).
- **R-NOTES-6** Expanded state and scroll position are remembered per device (IndexedDB) and shared with the desktop sidebar on the same device.
- **R-NOTES-7** First load on a device: the five landmarks render at once with skeleton meaning and counts, and a status line "Reading your Bower folder for the first time on this phone. Next time it opens at once." (`role="status"`).
- **R-NOTES-8** Light theme uses the light token values (board `Phone-Notes-Light`).

Copy: `notes.search` "Search folders, notes and files"; `notes.expand` "Expand all folders"; `notes.collapse` "Collapse all folders"; `notes.first-load` as R-NOTES-7; `notes.yours` "Your folders"; `notes.pinned` "Pinned".

Accessibility: tree `role="tree"`, rows `treeitem` with `aria-expanded`, roving tabindex (existing); the chevron's name "Expand Projects" / "Collapse Projects"; marks `aria-hidden`.

Acceptance criteria:
- [ ] No phone screen renders the folder menu button; `components/folder-menu.tsx` is deleted and its tests removed; help sheets and tour copy updated (grep for "top-left" returns nothing in `app/src`).
- [ ] The Notes tab shows Pinned, the five landmarks in order, a divider, then other folders (e2e on the demo fixture).
- [ ] A PDF and a photo in Flat hunt appear as rows under it; Flat hunt's count equals its rows (e2e).
- [ ] The Expand/Collapse all button toggles its label and state (e2e).
- [ ] Chevron targets measure at least 44 × 44 (Playwright bounding box).
- [ ] Expanded folders survive a reload (e2e).

### 6.3 Reveal: the tree follows what you open (R-REVEAL) — boards `Phone-Notes-Revealed`, `Desktop-Note`

- **R-REVEAL-1** On every route change to `/note/:id`, `/file/:id` or `/folder/:path`, the target's ancestors are expanded (added to the remembered set, never collapsing others), its row gets `aria-current="page"` and a highlight, and it is scrolled into view with `block: 'nearest'`.
- **R-REVEAL-2** Desktop: the sidebar does this at once. Phone: the Notes tab does it when opened from a note, file or folder (the last opened target is kept in memory); tapping the Notes tab again while on it scrolls to the top.
- **R-REVEAL-3** More menu row "Show in folders" (new) opens the Notes tab revealed at the item (phone) or scrolls the sidebar to it (desktop).
- **R-REVEAL-4** With virtualised rows (R-PERF-2) the reveal scrolls by row index.

Acceptance criteria:
- [ ] Opening a note from Recent expands Projects › Flat hunt in the desktop sidebar and marks the note row current (e2e at 1280).
- [ ] From a note on the phone, tapping Notes shows the tree open at that note (e2e at 375).
- [ ] "Show in folders" exists in the More menu of a note, a file and a folder (unit test on `note-menu.tsx`).
- [ ] Reveal never collapses a folder the person had open (e2e).

### 6.4 Search (R-SEARCH) — boards `Phone-Search-Start`, `Phone-Search`, `Phone-Search-None`, `Desktop-Search`

- Route: the switcher overlay (existing), `/search?q=` deep link (existing, #495).
- **R-SEARCH-1** A MiniSearch index over every visible folder, note and file: name (display title for notes via `note-title.ts`), path (display names), kind, and, for notes read before, their text; prefix and fuzzy matching (edit distance 1 for terms of 4+ letters); stored in IndexedDB beside the vault index and rebuilt incrementally when the index changes.
- **R-SEARCH-2** Drive full-text (`searchFullText`) stays for text inside files and notes not yet read; its hits merge in after local hits.
- **R-SEARCH-3** Result groups in order: Folders, Notes, Files; each row: icon or thumbnail, `KindBadge`, title with matched letters highlighted, path line starting with the PARA mark ("Projects › Flat hunt"), kind word, a snippet for text hits.
- **R-SEARCH-4** Chips: All (with count), Folders, Notes, Files; "Any time" (Today, 7 days, 30 days, This year). On an empty query, chips for the five PARA folders scope the search.
- **R-SEARCH-5** Scope: opened from a folder screen, the field reads "Search in <folder>" with a clear chip; "Search everywhere" widens it.
- **R-SEARCH-6** Empty query shows: Opened lately (last 5 opened on this device), Filed in the last tidy-up (from the run report), Searched before (existing recent searches).
- **R-SEARCH-7** No results: "Nothing called “<query>”", "No folder, note or file has those words in its name or its text.", primary "Ask Bower where it is" (opens the Bower box prefilled "Where is <query>?"), link "Search all of <scope>" when scoped.
- **R-SEARCH-8** Commands stay last (existing), shown only when the query matches one.
- **R-SEARCH-9** The bird never overlaps the field or Close (it sits above the result list, or is hidden).
- **R-SEARCH-10** Desktop: a two-column overlay with the result list and a preview of the highlighted result; Tab moves into the chips; Enter opens.

Copy: `search.placeholder` "Search folders, notes and files"; `search.scope` "Search in {folder}"; `search.everywhere` "Search everywhere"; `search.none.title` "Nothing called “{query}”"; `search.none.body` as above; `search.none.ask` "Ask Bower where it is"; group headings "Folder(s)", "Notes", "Files", "Opened lately", "Filed in the last tidy-up", "Searched before".

Acceptance criteria:
- [ ] `flat hnt` finds the Flat hunt folder first (unit test on the search module with the demo fixture).
- [ ] `lease` returns the PDF under Files with the PDF badge and the kind word "PDF", not under Notes (unit test).
- [ ] `kitchen` returns the Kitchen Refresh folder in the Folders group (unit test).
- [ ] Paths never show numeric prefixes or `/` (unit test on the path formatter).
- [ ] The empty state lists the last tidy-up's items from the run report (unit test with a stubbed report).
- [ ] The no-results state offers "Ask Bower where it is" and it opens `/bower?text=` (e2e).
- [ ] Search from the Flat hunt screen is scoped and can be widened (e2e).
- [ ] MiniSearch is added with a one-line reason in the PR; bundle growth under 10 kB gzip (CI size check).

### 6.5 Folder screen (R-FOLDER) — boards `Phone-Folder-List`, `Phone-Folder-ByBower`, `Phone-Folder-Grid`, `Phone-Folder-QuickLook`, `Phone-Folder-Empty`, `Desktop-Folder`

- Route `/folder/:path*` (existing).
- Layout top to bottom: bar (Back to parent display name, More, "?", avatar); path bar with the PARA mark, each segment a link; meta line "7 things · 5 originals, 2 by Bower · Last filed yesterday"; origin filter (All · Originals N · By Bower N); tool row (Sort, Kind filter, List/Grid); date groups (Today, Yesterday, This week, Earlier this month, by month); rows or tiles; tip when useful.
- **R-FOLDER-1** Path bar: segments link to their folder; the current one is bold; the PARA mark leads.
- **R-FOLDER-2** Origin filter: "Originals" = anything the person added or wrote (files, their notes); "By Bower" = anything Bower wrote (from `file-origin.ts`: catalogue in `index.md`, `type: answer`, `bower` frontmatter, companion notes). Remembered per folder.
- **R-FOLDER-3** Sort: Newest first (default), Oldest first, Name, Kind; remembered per folder (IndexedDB).
- **R-FOLDER-4** Kind filter: All kinds, then only the kinds present, with counts.
- **R-FOLDER-5** List/Grid toggle, remembered per folder; Grid is the default when more than half of the folder is photos. Tiles: Drive `thumbnailLink` for photos, PDFs and Office files (refreshed when expired; cached in the blob LRU of `cache.ts`); notes show their first lines (or Bower's note lines) as text; the kind badge in a corner.
- **R-FOLDER-6** Rows: icon or thumbnail with `KindBadge`, title, one line: for Bower's notes the `BowerTag` and the key facts inline; for files the kind word and size or pages; for the person's notes "Note · written by you"; `NewTag` when unseen (R-JUST-3).
- **R-FOLDER-7** Pairs: an original and the companion note Bower wrote about it are one row in "All" (title from the note, badge from the original, opens the note); in "Originals" the original alone; in "By Bower" the note alone.
- **R-FOLDER-8** Quick look: holding a row or tile (phone) or Space (desktop) opens a preview sheet: preview, title, kind and size, path, "Filed by Bower <when>", Open (primary), Open in Drive.
- **R-FOLDER-9** Empty folder: bird, "Nothing in <folder> yet", "Add tickets, bookings or ideas and Bower files them here at the next tidy-up.", primary "Add something", link "Ask Bower to move things here" (opens the Move picker in request mode).
- **R-FOLDER-10** Desktop (≥ 1200 px): tree | folder (560 px) | preview of the selected item (Bower's note, key facts, first page); keyboard: arrows move, Space quick look, Enter open, Backspace up a folder.

Copy: `folder.meta` "{n} things · {o} originals, {b} by Bower · Last filed {when}"; `folder.filter.all` "All"; `folder.filter.orig` "Originals"; `folder.filter.bower` "By Bower"; `folder.sort.*` "Newest first", "Oldest first", "Name", "Kind"; `folder.kinds.all` "All kinds"; `folder.tip.pairs` "Bower marks what it wrote. An original and the note Bower wrote about it share one row."; empty-state strings as R-FOLDER-9; quick look "Open", "Open in Drive", "Filed by Bower {when}".

Data: the vault index (existing), `thumbnailLink` (new field in `listVault`'s `fields`), run report for New, companion-note pairing from `index.md` catalogue (`parseCatalogueFiles`) or the note's `source`/`original` property.

Edge cases: 0 items (R-FOLDER-9); 1 item; 500 items (virtualised, R-PERF-2); a pair whose original was moved elsewhere (show both separately); thumbnails offline (kind icon); long titles (two lines on tiles, one on rows).

Acceptance criteria:
- [ ] The origin filter's counts match the fixture (unit test on the filter).
- [ ] Sort, kind filter, origin filter and view survive a reload per folder (e2e).
- [ ] A folder of photos opens in Grid by default (e2e with a fixture).
- [ ] Tiles show thumbnails when online and the kind icon offline (e2e with the Drive stub).
- [ ] A PDF with its companion note shows as one row in All, two filtered views in Originals/By Bower (unit test).
- [ ] Holding a row opens quick look; Space does on desktop (e2e).
- [ ] The empty state has "Add something" and "Ask Bower to move things here" (e2e).
- [ ] At 1280 px the folder screen shows three panes and the keyboard shortcuts work (e2e).

### 6.6 Compare (R-COMP) — boards `Phone-Folder-Compare`, `Desktop-Compare`, `System-Kinds`

- **R-COMP-1** A folder whose notes include two or more with the same `kind` property shows a "Compare <n> <kind plural>" tab next to "Everything" (phone) or a "Compare" button (desktop). No AI: the app reads frontmatter.
- **R-COMP-2** Columns: the kind's fields in the kind's order (from the kind table the agent writes, R-AG-2), plus Status when present; phone shows cards with the first three facts and the fit; desktop a table.
- **R-COMP-3** Sort by any column (default: fit, then the first field); filter chips from numeric and date fields ("Under £2,300", "Free before 1 Dec"); faded rows for filtered-out items on phone, hidden on desktop with a count.
- **R-COMP-4** One line explains it: "You saved four flat listings here. Bower read the same things from each one, so they line up side by side."
- **R-COMP-5** A tip offers "Ask Bower about these <n>" (prefilled Bower box).
- **R-COMP-6** Status is editable from Compare (a select writing the `status` property through the existing note write path, `saveNoteText`), values from the kind (for listings: new, to view, viewed, applied, rejected).

Acceptance criteria:
- [ ] A folder with two notes of `kind: rental-listing` shows the Compare tab; with one it does not (unit test).
- [ ] Columns follow the kind's field order; sorting by rent orders the rows (unit test).
- [ ] Changing a status writes the note's frontmatter and survives a reload (e2e with the Drive stub).

### 6.7 Note (R-NOTE) — boards `Phone-Note-Bower`, `Phone-Note-Details`, `Phone-Note-Details-Open`, `Phone-Note-Long`, `Flow-06-Dots`, `Flow-07-Answer`, `Desktop-Note-Details`

- Layout top to bottom: bar; title; props line (BowerTag for Bower's notes, tags, date, "Original: <kind>, <pages>" linking to the file screen, PARA mark and folder); Bower's note box; "Joined from" chips when a line came from other notes; key facts; Details (collapsed); contents strip for long notes; body with section notes; previous/next in the folder ("1 of 5").
- **R-NOTE-1** Bower's note box (callout `> [!bower] Bower's note`): bird, title, legend "· from the file, your notes, looked up, you" (only the origins present), one row per line with its origin square (file teal, your notes lilac, looked up blue, what you told me amber) and icon; optional "Check" word at the end of a line. Colour never alone: each square has an icon and the legend names it.
- **R-NOTE-2** Still renders the v3 form (`## Bower's note` with ✅ ⚠️ ❌): ✅ → no word, ⚠️ → "Check", ❌ → "Problem"; origin from the trailing bracket as `What Bower used` does (`splitOrigin`).
- **R-NOTE-3** "Joined from" chips: for lines with origin "your notes", links to the notes named in the line's bracket (`(from your notes: [[Offer letter]], [[Cycle to Work agreement]])`).
- **R-NOTE-4** Key facts (`KeyFacts`): the note's kind's key fields found in frontmatter, 1–4, with a caption "Key facts for a <kind>".
- **R-NOTE-5** Details: collapsed block "Details · <kind> · <n> read by Bower"; open: groups from the kind table, label in plain words, value, origin square; "Not in the <kind>" chips from `not_stated`, with "Copy these as questions".
- **R-NOTE-6** Section notes: `> [!bower]- Bower on this section` callouts render as a smaller box at the start of their section, collapsible; a contents strip under the top box lists sections and marks those with a section note with the bird.
- **R-NOTE-7** Answers (`type: answer`): the question in a box above ("You asked, <date>"), Bower's note, then the body, which can end with "At the viewing, check" and "Ask the agent" style lists and a link to a checklist note.
- **R-NOTE-8** Previous/next walk the folder in its current sort, showing "n of m".
- **R-NOTE-9** Links inside a note to a file that is in the Bower folder (a Drive URL whose id is in the index, or a wikilink to a non-Markdown file) open `/file/:id`, not Drive.
- **R-NOTE-10** The page title is not repeated when the body's first heading equals it, even after a leading paragraph or callout.
- **R-NOTE-11** Desktop: key facts and Details move to the About panel (`Desktop-Note-Details`); the outline marks sections with Bower notes.

Copy: `note.bower.title` "Bower's note"; legend "· from the file, your notes, looked up, you"; `note.check` "Check"; `note.problem` "Problem"; `note.joined` "Joined from:"; `note.keyfacts.caption` "Key facts for a {kind}"; `note.details` "Details · {kind} · {n} read by Bower"; `note.notstated` "Not in the {kind}"; `note.copyq` "Copy these as questions"; `note.section` "Bower on this section"; `note.asked` "You asked, {date}"; `note.original` "Original: {kind}, {pages}".

Acceptance criteria:
- [ ] A note with a `> [!bower]` callout renders the box with four origins and their icons (unit test in `markdown/`).
- [ ] A v3 note with ✅ ⚠️ ❌ still renders, with "Check" and "Problem" words (unit test).
- [ ] "Joined from" chips link to the named notes (unit test).
- [ ] Key facts render 1, 2, 3 and 4 facts in the four layouts (unit test with snapshots at 390 px).
- [ ] Details is collapsed by default and shows groups, origins and "Not in the listing" chips when open (e2e).
- [ ] Section callouts render in place and fold; the contents strip marks them (unit test).
- [ ] A link to a vault file's Drive URL opens `/file/:id` (unit test on `markdown/embeds.ts`).
- [ ] The title is not shown twice on a note that starts with a paragraph and repeats the title as H1 (unit test).

### 6.8 File screens (R-FILE, R-PHOTO) — boards `Phone-File-*`, `Phone-Photo-Full`

- Layout: bar; title; meta line (`KindBadge` with the kind word, size, pages or duration, taken date for photos, the folder with its PARA mark linking to a revealed Notes tab); notice when needed; preview; Bower's note when there is a companion note; previous/next.
- **R-FILE-1** Kind word from R-SYS-5 always visible.
- **R-FILE-2** Copies: a file created by "Add from your Drive" as an export carries `appProperties.bowerSource=<source id>` and `bowerSourceKind=doc|sheet|slides`; its screen shows the notice "A copy of your Google <Kind> “<name>”. Bower keeps the first sheet only, as a table. The original, with all its sheets, stays where it was in your Drive." (sheet; doc and slides variants), with "Open the original" (primary) and "Open this copy in Drive". Without the property: kind "Spreadsheet (CSV)" and Open in Drive only.
- **R-FILE-3** Add (existing `add.tsx` driveStateText) says "From your Drive · saved as a table, first sheet only" for a Google Sheet.
- **R-FILE-4** Office files and video: `DrivePreview` (Drive's preview frame, already allowed by the CSP `frame-src`), labelled "Preview from Google Drive"; primary "Open in Drive to edit".
- **R-FILE-5** CSV: `TablePreview`, first 200 rows, "Showing 200 of <n> rows"; text and Markdown files: plain text.
- **R-FILE-6** Video and audio: plays from Drive; notice "Bower can't watch videos. It filed this one by its name and the date it was taken. Tell Bower what it shows and it will write that down with it." with "Say what it is" (opens the Bower box prefilled).
- **R-FILE-7** No preview (ZIP and unknown): the kind explained ("A ZIP archive holds other files packed together."), "It can't be shown here. Open it in Drive to see what is inside, or download it.", buttons Open in Drive and Download.
- **R-FILE-8** When a companion note exists, the file screen shows Bower's note (its first lines) and "Bower's note on this" linking to it; the "Want a note on it?" tip only when none exists.
- **R-FILE-9** Long PDF: when the companion note has a "Where to look" list (page links), it shows under Bower's note; a page link opens the PDF at that page.
- **R-PHOTO-1** Photos fit the screen; tap opens full screen (Fullscreen API with a black overlay fallback); pinch and pan are the browser's (`touch-action: pinch-zoom`); double tap toggles 2×; a zoom badge shows the factor; Escape, Close or swipe down closes.
- **R-PHOTO-2** Previous/next buttons and arrow keys walk the folder's photos and files; "2 of 5 in <folder>".

Copy: all quoted strings above, plus `file.meta.photo` "Taken {date} · {size}", `file.meta.pdf` "{pages} pages · {size}", `file.preview.drive` "Preview from Google Drive", `file.openedit` "Open in Drive to edit", `file.download` "Download", `file.saywhat` "Say what it is".

Acceptance criteria:
- [ ] Each kind in the kind table shows its word on the file screen (e2e over the fixture).
- [ ] An exported Sheet shows the copy notice and both links; one without the property shows none (unit test with the Drive stub).
- [ ] Add writes `bowerSource` and `bowerSourceKind` on exports (unit test on `drive.ts#copyOrExportIntoInbox`).
- [ ] A CSV renders as a table with the row count line (unit test).
- [ ] A video shows the player frame and the notice (e2e).
- [ ] A file with a companion note shows it and never "Want a note on it?" (e2e).
- [ ] Full-screen photo opens, zooms to 2× on double tap, closes on Escape (e2e).

### 6.9 More menu and Move (R-MOVE) — boards `Phone-More`, `Phone-Move-Picker`

- **R-MOVE-1** More menu rows (note, file, folder): Ask Bower about this, Show in folders (new), Pin to Home, Move to… ("Bower does it"), Open in Drive, Download (files), Copy link, Edit the text (notes), Cancel.
- **R-MOVE-2** Move to… opens `FolderPicker`: title "Move “<name>” to…", "Find a folder" search, the five landmarks and their folders, the current folder disabled, the chosen one checked.
- **R-MOVE-3** Footer: "Bower moves it and keeps its lists straight. Now takes a minute; otherwise it goes with the next tidy-up." with primary "Move it now" (writes a move request and starts an instructions-only run, #344) and "With the next tidy-up" (writes the request only).
- **R-MOVE-4** The request text is exact: "Move “<name>” (<path>) to <folder path>." The Requests list shows it; Just filed and Activity show the result.

Acceptance criteria:
- [ ] "Move it now" writes one request note and calls `POST /process {scope: 'instructions'}` (unit test with the API stub).
- [ ] The picker disables the current folder and offers every other visible folder (unit test).

### 6.10 After a tidy-up: Just filed and New (R-JUST) — boards `Phone-Notes-New`, `Phone-JustFiled`, `Desktop-JustFiled`, `Flow-05-Home`, `Why-Home`

- **R-JUST-1** "Just filed · N" row at the top of the Notes tab (and the desktop sidebar) while the last tidy-up has unseen items; opens `/just-filed` (new route).
- **R-JUST-2** `/just-filed`: one group per tidy-up (latest open, "Earlier tidy-ups" lists the last 20 from `GET /runs`); each row: kind, new name, "was “<old name>”" when renamed, "→ <PARA mark> <folder path>", key facts when Bower wrote a note, `NewTag`; a "Set aside" group for kept-not-read items with their reason and "Say what it is"; "Mark all seen". Desktop: a table (You added, Now called, Where it went, Bower's note).
- **R-JUST-3** New: an item is new when its id is in the last run's processed list and not in the device's seen set (IndexedDB); opening it, or "Mark all seen", adds it. Folders show "N new". Rows in Home Recent, folder screens, the tree and Just filed show the tag.
- **R-JUST-4** Home after a tidy-up: bubble "All tidy. <n> filed, and <what Bower added>. See where they went" (link to Just filed); Last tidy-up card "<when> · <n> filed · <m> new to you", opening Just filed; Recent rows with New, BowerTag and key facts.
- **R-JUST-5** The Done sheet (#506) gets "See where everything went" (Just filed).

Data: the run report's processed list extended with `to` (new path) and `renamedFrom` (R-RUN-4); Activity lines as a fallback for old runs.

Copy: `just.row` "Just filed · {n}"; `just.sub` "{when}'s tidy-up: see where everything went"; `just.intro` "What you added, and where Bower put each thing. New marks what you have not opened yet."; `just.was` "was “{name}”"; `just.aside` "Set aside · {n}"; `just.earlier` "Earlier tidy-ups"; `just.markall` "Mark all seen"; `home.done` "All tidy. {n} filed{extra}. See where they went".

Acceptance criteria:
- [ ] After a (stubbed) run with five items, the Notes tab shows "Just filed · 5" and the list shows old names, new names and folders (e2e).
- [ ] Opening an item removes its New tag; "Mark all seen" removes all (e2e).
- [ ] Home's bubble links to Just filed (e2e).
- [ ] With a run report without `to`, the list falls back to Activity lines (unit test).

### 6.11 Add (R-ADD) — boards `Flow-03-Add`, `Why-Add`, `Desktop-Add`

- **R-ADD-1** Phone: the doors become one row of three buttons (Photo when a camera exists, Files, Drive), 48 px tall; the link field stays (one line with Save); the share line moves to the Add help sheet.
- **R-ADD-2** The queue heading "In your inbox · N"; each item shows its name and kind badge.
- **R-ADD-3** What is this? stays between the queue and the button.
- **R-ADD-4** A kind Bower only keeps (R-SYS-10) shows on its row: "Kept, not read: Bower can't watch videos" (per kind).
- **R-ADD-5** One primary button at the bottom carrying the count, "Tidy up N things", replacing the separate hint and button; the "Is that everything?" sheet stays.
- **R-ADD-6** Desktop keeps the drop zone (v3), with Choose files and From your Drive inside it, the same queue, What is this? and the button.

Acceptance criteria:
- [ ] The three doors fit one row at 375 px with 48 px targets (e2e).
- [ ] A video in the queue shows its kept-not-read line (unit test).
- [ ] The button reads "Tidy up 5 things" with five items and opens the confirmation sheet (e2e).

### 6.12 Desktop (R-DESK) — boards `Desktop-Explorer`, `Desktop-Folder`, `Desktop-Note`, `Desktop-Note-Details`, `Desktop-Search`, `Desktop-Compare`, `Desktop-JustFiled`, `Desktop-Add`

- **R-DESK-1** Sidebar: search (Ctrl K), Home, Add, Bower, Just filed row, Pinned, "Your folders" with the five landmarks (mark, name, meaning line, count), divider, other folders; files as rows; New tags; reveal (R-REVEAL).
- **R-DESK-2** At ≥ 1200 px, folder screens use three panes (tree | folder | preview); below, the v3 single column (#355) stays.
- **R-DESK-3** Note screen keeps the About panel, which now holds key facts, Details, the original and the outline.
- **R-DESK-4** Keyboard: `/` or Ctrl K search, arrows move, Enter open, Space quick look, Backspace up a folder; shown in a hint line.

Acceptance criteria:
- [ ] At 1280 px, `/folder/1-Projects/Flat%20hunt` shows three panes and the preview follows the selected row (e2e).
- [ ] At 1100 px the single column layout remains (e2e).
- [ ] The sidebar shows meaning lines under the five landmarks (e2e).

### 6.13 Sign-up interview (R-ONB) — board `Flow-01-Welcome`

- **R-ONB-1** The existing four-question interview (#198) stays; no question asks for a document, an ID or a profile link, now or later.
- **R-ONB-2** A tip under the questions: "Bower learns from what you add over time: a contract, a bill, a letter. You never have to hand it anything; add what you want, when you want."

Acceptance criteria:
- [ ] The interview renders the tip; a grep test fails on "CV", "LinkedIn", "passport" in onboarding copy.

### 6.14 Performance (R-PERF)

- **R-PERF-1** The tree and folder lists virtualise past 150 rows with TanStack Virtual core (a small Preact adapter).
- **R-PERF-2** Reveal and keyboard focus work with virtualised rows (scroll to index).
- **R-PERF-3** Optional, later: incremental sync with Drive's changes feed (`changes.getStartPageToken`, `changes.list`) instead of the full walk; not required for v4.

Acceptance criteria:
- [ ] A 2,000-note fixture scrolls the tree without dropping below 50 fps in a Playwright trace (or renders fewer than 60 rows in the DOM).

## 7. Behind the screens (agent, runner, Worker)

### Agent and rulebook (`vault-template/CLAUDE.md`, `agent/prompts/ingest.md`)

- **R-AG-1** Kinds list in the rulebook: rental listing, job offer, bill or renewal, receipt, payslip, contract or agreement, booking or ticket, recipe; each with its fields (name, type: text, number, money with currency, date, link, note link), its key fields in order (at most four), its groups for Details, its status values, and its Compare use. Fallback: none.
- **R-AG-2** Companion note (D9): for a document of a listed kind, Bower writes one short note next to the original: frontmatter `kind`, the kind's fields, `original: [[<file>]]`, `bower_origins: {<field>: file|notes|web|you}` (file is the default and may be omitted), `not_stated: [<field>…]`, `status`; body: the Bower's note callout (at most three lines), then a short body. Photos and unlisted kinds: no note unless asked or a rule says so. A rule can switch a kind off.
- **R-AG-3** Callouts (D10): `> [!bower] Bower's note` for the top box; `> [!bower]- Bower on this section` at the start of a section, one per section at most, only with something to say; each line ends with its origin in brackets: `(from the file)`, `(from your notes: [[A]], [[B]])`, `(looked up)`, `(from what you told me)`; a line that needs the person ends with `— Check`.
- **R-AG-4** Joining the dots: before writing a companion note or an answer, Bower checks the new item against the details already in the person's notes (addresses, habits, dates, amounts) and adds "for you" fields or lines when they follow, naming the notes used. Web lookups only when "Let Bower look things up on the web" is on (#374).
- **R-AG-5** Long documents: the top box stays at three lines; facts go to properties; a PDF over 10 pages gets "Where to look" (page links) in the companion note.
- **R-AG-6** Answers end, when useful, with what to check and what to ask, built from `not_stated` and the documents' content, and may link a checklist note in Resources.
- **R-AG-7** Suggestions (existing proposals, #342/#346): Bower may suggest a rule when a request repeats, with its reason.
- **R-AG-8** The ✅ ⚠️ ❌ template of #371 is replaced by R-AG-3; `bower_rules_version` bumps once per PR, serially.
- **R-AG-9** System files (D18) are never read, filed, moved or listed; formats kept-not-read (R-SYS-10) are filed by name and date with a line in the run report's set-aside list.

### Runner (`agent/run.sh`, `agent/scan.sh`)

- **R-RUN-1** rclone filters exclude the system file patterns in both directions (download and upload), so they are never copied down, never uploaded and never deleted.
- **R-RUN-2** Moves (D15, D19, resolves #560): after the agent finishes, the runner detects moves by content (same checksum and size in `MANIFEST_BEFORE` and `MANIFEST_AFTER`, different path) and performs each as a server-side move (`rclone moveto vault:<old> vault:<new>`, which on Drive changes the parents and keeps the id; verify in a smoke test against the Drive stub, else `files.update` with `addParents`/`removeParents`), instead of uploading a copy. Only non-moved changed files are copied up. The existing "delete the pending original" step is then unnecessary for moved originals.
- **R-RUN-3** Bookkeeping without AI: for every move and rename it performed, the runner rewrites the file's row in `index.md` (path and name), rewrites wikilinks `[[old name]]` to `[[new name]]` in Markdown files when a name changed, and appends one `log.md` line per move (`- <date> · Moved: <old> → <new>`). The agent no longer edits `index.md` rows for moves itself.
- **R-RUN-4** The run report's processed list gains `to` (new path) and `renamedFrom` for each item, and the set-aside list gains `reason` (`kept-not-read`, `unconvertible`, `quarantined`); written to `.bower/last-run.json` and sent to the Worker.
- **R-RUN-5** Reconcile at every run (before the agent starts): list the tree with Drive ids; any `index.md` row whose file id now lives elsewhere (moved by the person in Drive or Obsidian) is rewritten to the new path, and a `log.md` line "Moved by you: <old> → <new>" is appended; rows for files that no longer exist are marked "(missing)" rather than deleted.

### Worker (`api/`)

- **R-API-1** `GET /runs` (#571) passes `to`, `renamedFrom` and set-aside `reason` through unchanged; no schema change beyond accepting the new fields.

### App data plumbing

- **R-DATA-1** `listVault` requests `thumbnailLink` and `appProperties`; CSP `img-src` already allows Drive thumbnails (#350).
- **R-DATA-2** Frontmatter reads for notes shown in a folder (kind, key fields, status, origins) are lazy and cached per note (IndexedDB), invalidated by `modifiedTime`.
- **R-DATA-3** Seen set and per-folder view settings live in IndexedDB under the existing cache database.

## 8. Order and dependencies

1. **Foundations** (parallel): R-SYS-1…10 (tokens, marks, kinds, system files, counts, copy bugs); R-RUN-1 and R-AG-9 (system files in the runner and rulebook). Nothing else depends on the agent yet.
2. **Find** (after 1): R-SEARCH (MiniSearch), R-NOTES (one explorer, files in the tree), R-REVEAL, R-PERF-1/2.
3. **Agent v7** (parallel with 2; serial within, one `bower_rules_version` bump per PR): R-AG-1/2 (kinds, companion notes), R-AG-3 (callouts), R-AG-4…7, R-RUN-2/3/5 (moves and bookkeeping), R-RUN-4 + R-API-1 (report fields). Deploy order: Worker, runner, app.
4. **Seeing** (after 1; the renderer after R-AG-3's format is fixed): R-NOTE, R-FILE, R-PHOTO, R-MOVE.
5. **Folder views and Compare** (after 2 and R-AG-2): R-FOLDER, R-COMP.
6. **After a tidy-up** (after R-RUN-4): R-JUST, R-ADD, R-ONB.
7. **Desktop** (alongside 4–6, each screen with its phone twin): R-DESK.

Conflict hotspots (from PLAN.md): `routes/folder.tsx`, `routes/home.tsx`, `run-store.tsx`, `app/e2e/flows.e2e.ts`, `agent/run.sh`, `agent/test/smoke.sh`, `vault-template/CLAUDE.md`.

## 9. Open questions

All answered by the owner on 2026-09-28; none left open.

| # | Question | Answer |
|---|---|---|
| Q1 | Meaning lines for Answers and Clippings | As proposed: "What Bower wrote back to you", "Pages you clipped, waiting to be read" (R-NOTES-4). |
| Q2 | Status values in Compare | A fixed list per kind in the rulebook (for listings: new, to view, viewed, applied, rejected), changeable by a rule in the person's words (R-COMP-6, R-AG-1). |
| Q3 | "New" across devices | Per device (D16). |
| Q4 | Incremental sync with Drive's changes feed | Later, when a real folder passes about 2,000 files; not in v4 (R-PERF-3). |
| Q5 | The published interactive demo | **Take it down** while it is not developed (D14). An owner or lead task: remove the demo's Pages deployment and any link to it in the app, the README and the runbook. The demo fixture stays in the code, because the e2e tests use it. The deck stays in the canvas for later. |

## 10. Completeness check

- [x] Every board is in section 4 and its elements are in the screen sections (deck excluded by D14).
- [x] Every state on the boards is listed; states with no board: offline (existing offline banner, no change), error loading a folder (existing error state, no change).
- [x] Every string is in a copy list or quoted in its requirement; every error or empty state has a next step.
- [x] Every interactive element has a name and a keyboard path (tree roving tabindex, sheets with focus traps, desktop shortcuts).
- [x] Every token used exists in §5 or in `tokens.css`.
- [x] Every element that needs data names its source and its empty or stale behaviour (thumbnails offline, report without `to`, pairs split when moved).
- [x] No L without an M: the three-pane desktop (L) falls back to the v3 single column below 1200 px; incremental sync is deferred.
- [x] Escalations in §7/§9: two new dependencies (approved), runner move logic and bookkeeping, rulebook bumps, report fields.
- [x] Every open-source pointer has a licence (MiniSearch MIT, TanStack Virtual MIT; Notebook Navigator GPL-3.0, ideas only).
- [x] Every acceptance criterion is checkable by a unit test, an e2e test or opening the app.
- [x] Contradictions: none known. The board `Flow-01-Welcome` shows the first two of the interview's four questions (1 of 4, 2 of 4), which agrees with R-ONB-1.
