# The file explorer: review, ideas and references (2026-09-28)

**For the owner, then the designer's next iteration.** Idea collection only: no boards, no spec, no issues yet. Written against `origin/main` 2910261 (end of the v3 rollout) and the live demo (`bower-demo.pages.dev`, same build as production). A second, read-only pass on the production app with the test account (the owner's go-ahead, 2026-09-28) adds findings 18 to 27.

## 1. Brief

- **Goal**: finding, opening and arranging things in the Bower folder is fast and obvious, on the phone first. The explorer is one of the product's pillars; today it is a chore.
- **Audience**: the person who uses Bower daily on a phone to look something up ("where is the lease?") and occasionally on a desktop to arrange things.
- **Piece**: this document: what exists, what hurts, ideas, references, open-source pointers, directions, questions.
- **Constraints**: Preact + Vite PWA, Drive read directly from the browser, the vault is the only state, the agent files and keeps `index.md`/`log.md`, free tiers, no jargon ("your notes", "Bower folder"), tokens from the v3 system.
- **Done when**: the owner picks a direction and answers the open questions in section 9; the designer then draws it.

**Design canvas** (23 boards, phone and desktop, 2026-09-28): https://claude.ai/artifact/Hqa8fUHvMgwURNtUgKutmZ. Where the canvas and this text disagree, the canvas wins.

## 1b. Owner decisions (2026-09-28)

| # | Question | Decision | What it changes |
|---|---|---|---|
| D1 | May the app move, rename and archive by itself? | **No. Only Bower arranges.** | Direction B is dropped. Arranging stays a request to Bower; the idea left is to make that request precise and fast (a folder picker that writes the request, then "Do it now", the instructions-only run from #344). No new Drive write paths, no `ARCHITECTURE.md` rule change. |
| D2 | Numeric prefixes | **Hidden everywhere, and more**: the PARA folders are a fixed, visual landmark. They use the colour code of the intro, keep a fixed order and place, and nothing (sort, filter, pins, counts, search) moves or restyles them. | New section 5b. The intro's colours become tokens. |
| D3 | New dependencies | **MiniSearch** and **TanStack Virtual**: yes. **PhotoSwipe**: no gallery. | A photo must still open and display properly (fit, zoom, full screen) without a gallery library. A grid view in the explorer, to preview from the list, is wanted. |
| D5 | PARA colours, Inbox included | **The designer decides** (section 5b, "The palette"). Fixed, easy to recognise. | Five colour pairs below, contrast checked. |
| D6 | File kinds | Owner's case: a spreadsheet shows only as "File"; nothing says it is a spreadsheet. **Open in Drive stays; the person must be told clearly what the thing is and where the real original is.** Rest to the designer. | Section 5c, "What a file is". |
| D7 | Phone: the folder menu (top-left) and the Notes tab both show the folder structure, as two different screens | **Explore and decide.** | Section 5e: one explorer on the phone, the Notes tab; the top-left folder menu goes. |
| D8 | Bower's note | The owner wants the v3 box back (board `Phone-Note`: the bird, "from the file, looked up, from what you told me", one tinted icon per line by origin). What shipped differs: `app/src/markdown/bower-note.ts` and the agent template (#371) colour each line by verdict (Fine, Check, Problem, ✅ ⚠️ ❌), and only for answers; since #368 a filed file gets no note, so the box almost never appears. | The design canvas (below) restores the origin colour code, keeps "Check" as a small word on a line that needs the person, and shows the box on a file's own screen when Bower has something to say about it. Agent side: a short companion note for documents where Bower found facts (a partial reversal of #368, an owner decision for the lead), origins in brackets per line as `What Bower used` already does. |
| D4 | What first | **Find first.** | Milestone order: find (search, files visible, sort and type chips, grid preview, photo viewer), then the one-explorer and desktop two-pane work. |

## 2. What exists today

| Surface | Where | What it shows | What it does |
|---|---|---|---|
| Notes tab tree | `components/tree.tsx`, `explorer.tsx` | Folders and **notes only**; counts per folder | Chevron expands; folder name opens the folder screen; Expand/Collapse all; pin via hover or long press |
| Folder menu (phone drawer) | `components/folder-menu.tsx` | Pinned, six top-level folders with meaning lines, their subfolders | Tap opens; hold opens the pin sheet; no sort, no filter |
| Desktop sidebar | `explorer.tsx` (sidebar variant) | Same tree in a short scrolling box under the nav | Same as the Notes tab tree, plus roving-tabindex keyboard |
| Folder screen | `routes/folder.tsx` | Subfolders, then notes and files together, **newest first, fixed** | Chips: Pin to Home, Ask Bower about it, Drive; More menu |
| File screen | `routes/file.tsx` | PDF, image, Google Doc as text; type, size, folder, age | Open in Drive, More menu; nothing else |
| Quick switcher | `components/switcher.tsx`, `switcher.ts` | Notes whose **path contains** the query, then Drive full-text hits, then four commands | Enter opens; no folders, no filters |
| More menu | `components/note-menu.tsx` | Ask Bower, Pin, Move to…, Open in Drive, Copy link, Edit | **Move to… does not move**: it opens the Bower box with a request that waits for the next tidy-up |

Under the hood: `drive.ts#listVault` walks every folder recursively (four listings in flight) on each load or refresh; the result is cached in IndexedDB and served stale-while-revalidate (`vault-store.tsx`). The index keeps Drive metadata only (no note text, no tags). The app never renames, moves, creates folders or deletes; only the agent does, on a run.

## 3. Walkthrough log (demo, 375 and 1280)

| # | Route | Viewport | Persona | Observation | Tag | Sev |
|---|---|---|---|---|---|---|
| 1 | `/notes` | 375 | new | The tree lists only notes. *Flat hunt* says **4** but shows 2 rows; the PDF and the photo are invisible here and in the sidebar. They are reachable only from the folder screen. | UX | P0 |
| 2 | switcher | 375 | expert | "lease" finds the lease PDF only through Drive full-text, shown with the **note icon**, the raw name `Lease agreement 2026.pdf`, under the heading "Notes", counted as "2 notes". | UX | P1 |
| 3 | switcher | 375 | expert | "kitchen" returns six notes but **not the folder** *Kitchen Refresh*. Folders cannot be jumped to by name. | UX | P1 |
| 4 | switcher | 375 | expert | "flat hnt" finds nothing: substring match only, no typo tolerance, no word-order tolerance. | UX | P1 |
| 5 | switcher | 375 | new | Result paths read `1-Projects/Kitchen Refresh`: numeric prefix and slash, while the folder screen heading strips the prefix (#431). Two naming systems. | UX | P2 |
| 6 | switcher | 375 | — | The bird sits on the top-right corner of the search field, over the Close button's area. | DESIGN | P2 |
| 7 | `/folder/…/Flat hunt` | 375 | — | Back label renders as "1.." next to the title; reproduced on production (finding 24). The label is the parent's name with its numeric prefix, cut. | BUG | P2 |
| 8 | `/folder/…` | 375 | expert | "Newest first" is a label, not a control. No sort by name, no filter by type, no grouping. | UX | P1 |
| 9 | `/folder/…` | 375 | new | Photos and PDFs show a generic type icon; no thumbnail. The folder is a text list even when it holds photos. | IDEA | P2 |
| 10 | `/file/…` | 375 | expert | From a file there is no next/previous in its folder, no pinch zoom, no share or download; the meta line says "70 bytes". | UX | P1 |
| 11 | More menu | code | expert | "Move to…" files a request; the move happens at the next tidy-up (minutes to days). No rename, new folder, new note here, archive, multi-select. | UX | P0 |
| 12 | `/notes` | 375 | new | A row has two meanings: the chevron (20 px wide) expands, the name navigates away. Easy to hit the wrong one (Fitts). | UX | P1 |
| 13 | `/notes` | 375 | — | *Clippings* has no meaning line and no count, unlike its siblings. | DESIGN | P2 |
| 14 | `/folder/…` | 1280 | expert | Desktop folder screen is one narrow column in the 980 px container; the sidebar tree is a small scroll box. No two-pane browsing, no preview beside the list, no drag and drop. | UX | P1 |
| 15 | Home vs `/notes` | 1280 | — | Home says "3 things in your inbox"; the tree says 0-Inbox **2** (likely the tree counting notes only). To verify. | BUG? | P2 |
| 16 | code | — | — | Every refresh re-walks the whole folder: one Drive call per folder. Fine for Alex's 30 notes; slow for a real vault of years. No virtualised rows. | IDEA | P1 |
| 17 | `/notes`, drawer, sidebar, folder | both | new | Four ways to browse with four behaviours (drawer: no sort; tree: expand; folder: flat list; switcher: search). The person has to learn each. | UX | P1 |

**Second pass: the real app** (production, test account, 375 and 1280, read-only: no tidy-up, no request, no edit). File names are left out on purpose.

| # | Route | Viewport | Persona | Observation | Tag | Sev |
|---|---|---|---|---|---|---|
| 18 | `/note/:id` from Recent, from a link in a note, from Previous/Next | 1280 | expert | The sidebar tree stays collapsed on its top-level folders. Nothing in it shows where the open note lives; only the right panel's "In this folder" marks it. Owner asked for the tree to open at the thing clicked. | UX | P1 |
| 19 | `/note/:id` then the Notes tab | 375 | expert | The Notes tab opens collapsed at the top, not at the note just read. The note screen has Back but no way into the tree at its location. | UX | P1 |
| 20 | `/note/:id` | both | expert | A link to the note's own original (a spreadsheet filed next to it) opens Google Drive in a new tab instead of the app's file screen, although the file is in the Bower folder. | UX | P1 |
| 21 | `/file/:id` (CSV) | 375 | new | "There is no preview for this file" for a CSV and a plain-text file, both trivial to show as a table or as text. | UX | P1 |
| 22 | `/file/:id` | 375 | new | The file screen offers "Want a note on it?" while Bower already wrote a note about this very file, in the same folder. The file does not know its note, and the note's link does not come back to the app. | UX | P1 |
| 23 | `/folder/…` | 375 | new | A note and the original it describes appear as two unrelated rows; CSV and text files show the generic note icon with the kind word "File". | UX | P2 |
| 24 | `/folder/2-Areas/…` | 375 | — | Back label cut to "2." (the parent's numeric prefix): second reproduction of #7, so it counts. | BUG | P2 |
| 25 | `/notes` | 375 | new | Health row reads "Yesterday · not checked yet": two statements that contradict each other. | BUG | P2 |
| 26 | `/` right after sign-in | 1280 | new | For a few seconds Home shows "Notes 0 in your notes" and "Health: No check yet" before the index arrives (zeros as fact; #322 covered the loading state, this path still shows them). Seen once. | BUG? | P2 |
| 27 | `/note/:id` | both | — | A note from Bower whose body starts with a context paragraph shows its title twice (page title, then the same H1 after the paragraph). | DESIGN | P2 |

**What works and should stay**: the stale-while-revalidate index (the tree opens instantly), the folder meaning lines, "filed by Bower" on each row, Pin to Home, the one More menu, the keyboard tree on desktop, Ask Bower about this folder, hidden Bower files by default.

## 4. Conclusions

**Three things that hurt most**
1. **Files are second-class.** The explorer is built around notes; PDFs, photos and Docs (now the main thing v3 files, since #368 ingests originals) are invisible in the tree, mislabelled in search and have a dead-end viewer. Oracle: Guidebook tour (the intro promises "your things, filed"), consistency (FEW HICCUPPS: the count says 4, the list shows 2).
2. **Nothing can be done directly.** Every arrangement goes through the agent and waits for a run. Oracle: Nielsen #3 (user control and freedom), #7 (flexibility and efficiency).
3. **Finding is literal.** Search needs the exact substring, ignores folders, mixes kinds, and cannot be narrowed. Oracle: Nielsen #6 (recognition over recall), Jakob's law (every file app has type/date filters and typo tolerance).

**Three cheapest wins (S each)**
1. Files in the tree and the sidebar with their type icon (the index already has them: `index.files`).
2. Switcher: folders and files as results, right icon and kind word, path shown as "Projects › Flat hunt", heading "Results" with "2 notes · 1 PDF".
3. Folder screen: sort control (Newest · Name · Type) remembered per folder, and type chips (All · Notes · PDFs · Photos · Docs) when the folder holds more than one kind.

**Ideas nobody asked for** are in section 5; the ones with most leverage: direct move/rename with undo (P0 #11), a "Search in this folder" scope, next/previous between files, and incremental sync with Drive's changes feed.

**What I would not change**: the PARA top level and its meaning lines, the agent as the one who files the inbox, the More menu as the single action entry point, pins, hiding Bower's own files.

## 5. Ideas

### How might we…

- **HMW-1** let a person reach any thing (note, file, folder) in under three taps or one search, without knowing where Bower put it?
- **HMW-2** let a person fix or arrange their things right now, without waiting for a tidy-up and without breaking what Bower keeps?
- **HMW-3** make one explorer that feels the same on the phone drawer, the Notes tab, the desktop sidebar and the folder screen?

### HMW-1: reach anything

1. Files in the tree with type icons; the count equals the rows.
2. One local search index over names, note titles, folder names and paths, with typo and prefix tolerance (MiniSearch or uFuzzy), cached in IndexedDB next to the vault index.
3. Result kinds: folders first when the query matches a folder name, then notes, then files; each with icon, kind word and a readable path.
4. Filter chips under the search field: Type (Notes, PDFs, Photos, Docs, Folders), Where (a top-level folder), When (Today, 7 days, 30 days, This year), Who (You, Bower). Borrowed from Google Drive's search chips.
5. Scoped search: on a folder screen the field reads "Search in Flat hunt"; one tap widens to everything.
6. "Everything" view: one flat list of every thing, newest first, with the same chips. The Recents idea from Apple Files, the smart-list idea from Notebook Navigator.
7. Saved searches as pins ("PDFs in Projects", "Added this week") shown in the drawer's Pinned group.
8. Date grouping in long lists: Today, Yesterday, This week, Earlier this month, by month.
9. Thumbnails for photos and PDF first pages from Drive's `thumbnailLink`, cached in the blob LRU; a grid toggle for folders that are mostly photos.
10. Recently opened (not recently changed) as the switcher's empty state, above recent searches.
11. Frontmatter tags and aliases in the index (read lazily for notes opened or searched), so "#flat" or an alias finds the note.
12. "Where did Bower put it?": from Activity, each filed row links to the file and its folder; the switcher's empty state offers "Filed in the last tidy-up".

### HMW-2: arrange now

> Dropped by D1 (only Bower arranges). Kept as the record of what was considered; ideas 8 and 9 and the folder-picker request in section 8 survive.

1. **Move** from the More menu opens a folder picker sheet (the same tree, folders only, with search); the move happens at once through Drive (`files.update` with `addParents`/`removeParents`, which keeps the file id), with an Undo toast.
2. **Rename** inline in the file and note header, with the same Undo.
3. **New folder here** and **New note here** on the folder screen.
4. **Archive** as one tap: move to `4-Archives/<same path>`. Never delete, as the vault rules say.
5. **Multi-select** (long press on phone, Shift/Cmd click on desktop) with Move, Archive, Pin, Ask Bower about these.
6. **Drag and drop** on desktop: rows onto tree folders, spring-loaded folders (Notebook Navigator, Finder).
7. Keep Bower's books straight: after a direct move the app appends a short "moved by you" line to a small queue file (for example `.bower/moves.md`) that the next run reads to update `index.md`, instead of the app writing `index.md` itself.
8. "Teach Bower" after a manual move: a one-line prompt "Always file things like this in Flat hunt?" that becomes a rule through the existing rule write path (#343). The move is instant, the learning is optional.
9. Keep "Ask Bower to move it" for fuzzy cases ("move everything about the boiler to Home").

### HMW-3: one explorer

1. One component, three presentations: the phone drawer, the Notes tab and the desktop sidebar render the same tree with the same row anatomy, counts and gestures.
2. Phone: drill-down lists (the folder screen) are the main way to browse; the tree becomes an overview. A sticky breadcrumb at the top where each segment is tappable and a long press on it lists siblings (a Finder path bar).
3. Row anatomy: the whole row expands or opens, never both; a separate "Open" affordance for folders in the tree, or expand on chevron with a 44 px target.
4. Desktop: two panes, tree on the left and the folder's list in the middle, the preview or note on the right (Notebook Navigator, Apple Files column view). The URL still follows the selection.
5. Remember expanded folders, scroll position and the last folder per tab across reloads.
6. File viewer: swipe or arrow keys for next/previous in the folder; pinch zoom and double tap for photos (PhotoSwipe); Share and Download through the Web Share API.
7. Keyboard on desktop: `/` search, `j`/`k` or arrows, Enter open, Backspace up a level, `m` move, `r` rename, `g i` Inbox.
8. Show folder names as people see them: strip the numeric prefix everywhere or nowhere (open question).

### 5b. The PARA folders as a fixed landmark (from D2)

Today the colour code exists only in the intro, as four hard-coded hex values in `app/src/intro.ts` (`PARA_COLORS`): Projects `#5fcfbc` (teal), Areas `#f0b64f` (amber), Resources `#93c5fd` (blue), Archive `#c4b5fd` (lavender). Inbox has none. The tree, the drawer, the sidebar and the folder screen draw every folder with the same generic folder icon, and show the numeric prefix in the tree while the folder screen strips it.

Ideas:

1. **Tokens first**: `--color-para-inbox`, `--color-para-projects`, `--color-para-areas`, `--color-para-resources`, `--color-para-archives`, each with a light and a dark value, plus an `-on` value for text or a letter drawn on top. The intro reads the same tokens, so the code stays one. The pastel values are for fills and marks; as text on the light theme they fail 4.5:1, so names stay in the text colour and the colour lives in the mark. Inbox gets its own colour (the brand teal is taken by Projects; a neutral slate or a warm grey is the candidate).
2. **The mark**: each PARA folder shows the intro's letter disc (I, P, A, R, A… or an icon per folder where two letters clash; the intro already solves it with a disc per case) in its colour, instead of the generic folder icon. Its subfolders inherit a thin stripe or a tinted folder icon in the parent's colour, so a note deep in Projects still reads as "Projects".
3. **Fixed order, fixed place**: Inbox, Projects, Areas, Resources, Archives, always in that order, at the top of the tree, the drawer and the sidebar; never sorted, never filtered away, never collapsed out of sight, never reordered by pins. Answers, Clippings and any folder the person created sit below a divider, in the neutral style.
4. **Names without prefixes**: "Inbox", "Projects", "Areas", "Resources", "Archives" everywhere: tree, drawer, sidebar, breadcrumbs, search results, the More menu header, Activity. The Drive folders keep their prefixes; the app maps them.
5. **Colour as the search and filter language**: a result's path starts with the coloured mark of its PARA folder; the "Where" chip in search uses the five marks; the folder screen's header takes a tint of its PARA colour.
6. **Home**: the Notes card or a row of five small PARA tiles with counts, the quickest jump into any of them (one tap from Home, Fitts).
7. **Accessibility**: colour never carries meaning alone (the name and the letter are always there); contrast checked on both themes for the mark and its letter; the mark is `aria-hidden`, the name is the accessible name.

Cost: S for tokens and the mark in the tree, drawer and sidebar (one shared `FolderMark` component); M with the inherited tint for subfolders and search results. Risk: a person who renamed a PARA folder in Drive (the app would need to find it by its prefix or position, not by the name).

**The palette (decided, D5).** The four PARA hues are the intro's, unchanged in the dark theme so the intro and the folders are one code; the light theme uses deeper versions of the same hues, because the pastels are invisible on the light background. Inbox gets coral: warm, "arriving", and the one hue left free by the intro that is not the danger red or the success green.

| Token | Folder | Mark | Dark fill | Light fill | Letter on the mark |
|---|---|---|---|---|---|
| `--color-para-inbox` | Inbox | tray icon | `#f4a28c` coral | `#b8492f` terracotta | dark `#0b1220` / light `#ffffff` |
| `--color-para-projects` | Projects | P | `#5fcfbc` teal | `#1f7a6d` | same rule |
| `--color-para-areas` | Areas | A | `#f0b64f` amber | `#9a6408` | same rule |
| `--color-para-resources` | Resources | R | `#93c5fd` blue | `#2f63b8` | same rule |
| `--color-para-archives` | Archives | A | `#c4b5fd` lilac | `#6b52b8` | same rule |

Contrast (WCAG 2.2): every mark against the page, the surface and the sidebar is at least 7.6:1 in dark and 4.35:1 in light (the non-text minimum is 3:1); the letter or icon on its mark is at least 9.3:1 in dark (dark ink) and 5.0:1 in light (white ink). Areas' light fill is 4.35:1 on the sidebar, so it is a mark colour, never a text colour there. Owner's ruling: Archives keeps a lilac "A" like the intro, so the marks read P A R A down the list; the two A folders are told apart by colour (amber and lilac also differ in lightness in both themes) and always by their names.

Rules that keep them fixed: the five marks appear only on these five folders and their descendants (a 3 px stripe or a tinted folder icon at 16 % of the colour); never on buttons, badges, alerts or charts; the Inbox coral never carries a count or a warning (the waiting count keeps the accent amber badge, as today). Subfolders inherit the tint; a person's own top-level folders, Answers and Clippings stay neutral below a divider (recommended; the five stay special).

Coral next to danger red: the dark danger (`#ef8a8a`) and the dark Inbox coral (`#f4a28c`) are close hues. They never meet, because danger is used only for delete links and error lines, and the Inbox mark always carries its tray icon and its name.

### 5c. Seeing files without leaving the list (from D3)

1. **Grid view** as a toggle on the folder screen (List · Grid), remembered per folder, defaulting to Grid when most of the folder is photos. Tiles carry Drive's `thumbnailLink` for photos, PDFs and Docs; notes show their first lines as a text tile (Notebook Navigator's preview idea).
2. **Preview from the grid**: a tap opens the thing; a long press (or the space bar on desktop, like Quick Look) shows a larger preview sheet with the title, the folder, "filed by", and Open. Nothing is downloaded until it is opened.
3. **A proper photo view without a gallery library**: the file screen shows the photo fitted to the screen, a tap switches to full screen on a black background, pinch zoom and pan come from the browser (`touch-action: pinch-zoom` on the image, the native full-screen API), double-tap zooms to 2×, and Escape or a swipe down closes. Next and previous in the folder as buttons (and arrow keys), not a carousel.
4. **PDFs**: the first page as the thumbnail, the viewer as today, plus a page count in the meta line.
5. **Meta line in people's words**: "Photo · taken 12 Sep · 2.4 MB" rather than "Photo · 70 bytes" (the demo fixture's size is also worth a realistic value).

Cost: M for the grid with thumbnails (a new tile component, thumbnail URL refresh when it expires, the blob cache for tiles); S for the photo view with native zoom; S for next/previous. TanStack Virtual keeps a long grid smooth.

**What a file is (D6).** The owner's case, traced in the code and the live app: the spreadsheet in the Finance folder is stored as a CSV (`text/csv`, 3 KB). `app/src/drive.ts#exportPlanFor` turns a Google Sheet picked from Drive into a CSV of its **first sheet only**; an uploaded Excel file (`.xlsx`) is copied as is. Either way the app then says nothing useful: `vault-index.ts#fileKind` knows PDFs, photos, Google Docs, Sheets and Slides, and calls everything else "File" (CSV, Excel, Word, PowerPoint, text, ZIP); `fileTitle` removes the extension, so ".csv" or ".xlsx" never shows either; the file screen says "There is no preview for this file"; and nothing records that the real spreadsheet is elsewhere in Drive. Whether the owner's original was a Google Sheet or an Excel file uploaded to Drive could not be checked from the app; the CSV in the folder points to the first.

1. **A kind for every common file**, word and icon: Excel spreadsheet (`.xlsx`, `.xls`), Spreadsheet (CSV) (`.csv`), Word document (`.docx`, `.doc`), PowerPoint (`.pptx`), OpenDocument text or sheet, Text (`.txt`), Markdown, ZIP archive, Email (`.eml`), Web page (`.html`), Audio, Video; "File" only for the truly unknown. The kind comes from the MIME type first and the extension second. A spreadsheet icon (grid) and a document icon (lines) join the icon set.
2. **The kind is always visible**: in the folder row ("Excel spreadsheet · filed by Bower"), on the file screen's meta line, in search results and in the grid tile's corner badge (XLS, CSV, DOC, PDF).
3. **Say when Bower kept a copy**: a file the app exported on Add carries its source in Drive `appProperties` (`bowerSource=<id>`, `bowerSourceKind=sheet`), the same mechanism the instruction notes already use. The file screen then says, in one line above the preview: "A copy of your Google Sheet, first sheet only, saved as a table." with two links: **Open the original in Drive** (the Sheet) and **Open this copy in Drive**. Without that property (an old copy), it says "A table (CSV)" and offers Open in Drive, as today.
4. **Preview what is cheap**: CSV as a scrollable table (first 200 rows, "Showing 200 of 1 340 rows"), text and Markdown as text, Excel through Drive's own preview frame (`/file/d/<id>/preview`, already allowed by the CSP's `frame-src` for Docs), Word and PowerPoint the same way. Only when nothing works: "No preview here. Open it in Drive to see it." with the button, not a link in a sentence.
5. **Add says it up front**: when a Google Sheet is picked, the Added queue row reads "From your Drive · saved as a table, first sheet only" (it says "saved as a table" today) so the loss of the other sheets is not a surprise.
6. **Bower's note and its original find each other** (finding 22): the file screen shows "Bower's note on this" (a row to the note) instead of "Want a note on it?", and the note's link to its original opens the app's file screen, not Drive.

Cost: S for 1 and 2 (a lookup table and two icons); S for 5; M for 3 (the property on export, reading it on the file screen); M for 4 (a CSV table component, the Drive preview frame); M for 6 (reuses the catalogue parse in `vault-index.ts#parseCatalogueFiles` and the note's `Source` property).

### 5d. The tree follows what you open (owner request, 2026-09-28)

**Requirement from the owner**: when a person opens anything through a link (Recent, a pinned tile, a link inside a note, Previous/Next, search, Activity, a deep link), the folder tree on the left opens at that thing: its ancestors expand, its row is highlighted and scrolled into view. VS Code calls it "reveal in explorer" with auto-reveal on; Obsidian has "Reveal active file" (a command, off by default); Notebook Navigator follows the active file.

Ideas, from the smallest:

1. **Auto-reveal on desktop** (sidebar present, 900 px and up): on every route change to `/note/:id`, `/file/:id` or `/folder/:path`, expand the ancestors of the target, mark its row `aria-current="page"`, and scroll it into view with `block: 'nearest'` (no jump when it is already visible). The person's other expanded folders stay as they were (reveal adds, never collapses).
2. **Files are rows too** (section 5, HMW-1 idea 1): without files in the tree, opening a PDF can only reveal its folder. With them, the PDF's own row lights up.
3. **Phone**: the tree is not on screen while reading, so reveal happens when it appears. Opening the folder menu or the Notes tab from a note starts there: ancestors open, the note's row highlighted and centred. A "Show in folders" row in the More menu does the same on demand.
4. **Folder screens** reveal the folder itself and highlight it; the breadcrumb and the tree then agree.
5. **Quiet motion**: expand without animation when the reveal is automatic (it happens on every navigation); a short highlight fade on the revealed row, none under `prefers-reduced-motion`.
6. **A setting only if needed**: Obsidian users asked for both behaviours; start with auto-reveal on, no setting, and watch for complaints.
7. **Keep the tree's own state separate**: what the person expanded by hand is remembered per device (idea from HMW-3); auto-reveal adds to it and a "Collapse all" still clears it.
8. **Links inside notes stay in the app**: a link to a file that lives in the Bower folder opens `/file/:id` (and reveals it) instead of Google Drive; Drive stays one tap away in the file's More menu. A note and its original link to each other (findings 20, 22, 23): the file screen shows "Bower's note on this" instead of "Want a note on it?", and the folder screen groups the pair.

Cost: S for 1, 4, 5 and 7 (the tree already holds expanded state and a roving focus; `navigation.ts` knows every path's ancestors); S for 3 on the folder menu, M on the Notes tab (it needs a scroll target that survives the tab switch); 8 is M (the renderer maps Drive file URLs whose id is in the vault index to `/file/:id`; the note-original pairing needs the catalogue in `index.md` or the note's `Source` property, both already parsed). Risk: a very deep path in a tall tree; with TanStack Virtual, scroll to the row by index rather than by DOM node.

### 5e. One explorer on the phone: the folder menu and the Notes tab (D7)

**What is there** (production, 375, 2026-09-28): two screens show the folder structure, and they disagree.

| | Folder menu (top-left, every tab) | Notes tab |
|---|---|---|
| Title | "Your folders" | "Notes" |
| Opens as | A modal panel over the page, 320 px | A full tab |
| Search | Opens the switcher | Opens the switcher |
| Pinned | Yes, on top | No |
| Top-level folders | The six known ones only: **Clippings and any folder the person made are missing** | Every folder |
| Notes and files | No, folders only | Notes (files missing, finding 1) |
| Expanded state | Its own (Projects was open here, closed in the tab) | Its own |
| Health, hidden-files line | No | Yes |
| Expand/collapse all | No | Yes |
| Footer | "The full tree with search lives on the Notes tab." | — |

The app's own footer admits the duplication. On the Notes tab the menu button opens a second, smaller copy of the tree on top of the first. Oracles: consistency (Nielsen #4), Hick's law (two routes to the same place, with different contents), FEW HICCUPPS "Comparable products" and Material's navigation guidance (a drawer and a bottom bar for the same destinations are not combined; the bottom bar wins on phones). NN/g's studies show hidden navigation (the menu behind an icon) is found about half as often as visible navigation, so of the two, the tab is the one people find.

**Options**

| Option | What changes | For | Against | Cost |
|---|---|---|---|---|
| **A. The Notes tab is the explorer (recommended)** | The top-left menu button goes on the phone. The Notes tab takes the drawer's good parts: Pinned on top, the five PARA landmarks with their meaning lines, then the other folders, then the tree's notes and files. Tapping the Notes tab while reading a note opens it revealed at that note (5d); tapping it again while on it scrolls to the top and collapses to the landmarks (the iOS "tap the active tab" habit). | One place, visible, one state; the bar keeps four tabs; frees the top-left corner for Back only | Changes a v3 decision (#319, Phone-Drawer board); from inside a deep note, the tree is one tab tap plus a reveal, not an overlay | S to remove, M to merge Pinned and the landmarks into the tab |
| B. The folder menu is the explorer | The Notes tab goes; the bar becomes Home · Add · Bower; the menu becomes the full tree (the Obsidian mobile pattern) | Tree reachable over any screen without losing it | Hidden navigation, found half as often; a hamburger for the app's main pillar | M |
| C. Keep both, one component | Same component, same state, same contents in the tab and the overlay | No structure change | Still two routes to the same thing; the question "which one do I use?" stays | M |

**Decision taken as the expert (D7): A.** The explorer is a pillar, so it gets a tab, not a menu. What the menu did well moves into the tab: Pinned first, one tap to any top-level folder, the meaning lines. A "Show in folders" row in every More menu covers "where does this live?" from anywhere. The desktop keeps its sidebar, which is the same component in its wide form; above 900 px there is no Notes tab duplication because the sidebar is always visible.

**The Notes tab after the change, top to bottom** (for the boards): search field (opens the switcher, scoped when coming from a folder); Pinned (only when something is pinned); the five PARA landmarks (mark, name without prefix, meaning line, count, chevron), fixed order; a divider; Answers, Clippings and the person's own top-level folders, neutral; the Health row; the hidden-files line. Expanded state shared with the desktop sidebar's and remembered per device.

**Name of the tab**: it holds files, not only notes. "Notes" stays for now (the copy rules say "your notes"); "Folders" is the alternative if the grid and the file kinds make files the bigger half. Open for the owner, low stakes.

### 5f. What Bower reads from a file: details (owner request, 2026-09-28)

The owner's pre-Bower vault shows what a good read looks like: a rental listing note with about 25 frontmatter properties (address, rent per week and month, rooms, parking, laundry, lease, bond, agency, listing date, rent against the suburb median, commute, days on the market, a fit score, related notes) and a body with a verdict, a fit table, next steps and questions. Obsidian shows them as a collapsible Properties block. Today Bower's rulebook (#368) files originals without a note and extracts nothing.

**Agent side (proposal for the lead, needs the owner's yes because it partly reverses #368):**

1. **Kinds with a field list** in the rulebook: rental listing, job offer, receipt or invoice, bill or renewal, contract or lease, booking or ticket, recipe, product manual, payslip, medical letter, article; plus a generic fallback (date, who, what, amount). Each kind names its fields, their type (text, number, money with a currency, date, link, note link) and which three or four are the key facts.
2. **Frontmatter as the store**, readable in Obsidian: `kind: rental-listing` and one property per field, snake_case with the unit in the key only where it helps (`rent_month: 2150`, `currency: GBP`). "Not stated" is never a value: missing fields go to `not_stated: [pets, bills_included, agency_fee]`, which the app shows as questions to ask.
3. **Where each value came from**: `bower_origins: {rent_vs_area: web, commute_bike_min: you, fit: you}`; any field not listed is from the file. The app draws the same origin squares as Bower's note.
4. **When**: on filing, for kinds on the list, Bower writes the short companion note (Bower's note on top, the details in frontmatter, a short body). Photos and unknown kinds get no note unless asked. A rule can switch a kind off ("Don't write notes for receipts").
5. **What it unlocks** (app side): the key-facts strip on a note; the Details block, grouped and labelled in people's words; a folder of the same kind as a Compare table or cards, sortable and filterable by any field (Obsidian Bases does the same from the same frontmatter, so the folder also works in Obsidian); later, Home can show dates coming up (renewals, available from, reply by) and money by area. Ask Bower works better with typed fields.

Boards: `Phone-Note-Details`, `Phone-Note-Details-Open`, `Phone-Folder-Compare`, `Desktop-Compare`. Cost: M in the app (a details renderer with a label map per kind, a humanised fallback for unknown keys, the compare view); M to L on the agent (kinds in the rulebook, a `bower_rules_version` bump, smoke tests per kind).

### 5g. Long or mixed documents: more than one Bower's note

1. **The top box stays short**: at most three lines, the gist (what it is, what matters, what to do). Facts move to Details, so the box does not grow with the document.
2. **Bower on a section**: when a section has its own conclusion, Bower adds a smaller box at the start of that section, one per section at most, only where it has something to say. A contents strip under the top box marks those sections with the bird. The person can fold them.
3. **Long originals** (a 42-page PDF): Bower's note on the file screen adds **Where to look**, page links to the parts that matter.
4. **Markdown that also works in Obsidian**: section notes are Obsidian callouts, `> [!bower]- Bower on this section`, each line ending with its origin in brackets, as `What Bower used` already does. Obsidian renders them as foldable callouts; the app renders them as the box. The top box can move to the same callout form (`> [!bower] Bower's note`), a rulebook bump.

Boards: `Phone-Note-Long`, `Phone-File-PDF-Long`.

### 5h. Formats: what Bower reads, what the app shows, what is only kept

Board `System-Formats` holds the table. In short: Bower reads text, CSV, email, PDF, photos (JPEG, PNG, WebP, GIF), and Word, ODT, RTF, EPUB and web pages after the runner converts them; Google Docs, Sheets and Slides arrive as copies. Partly: iPhone photos (HEIC) need a JPEG copy made on the runner, and Excel and PowerPoint need a converter on the runner (today they are filed unread). Not read: audio, video, ZIP and anything else, which Bower files by name and date and says so. The app previews most of them through Drive's own preview (video and audio play from Drive). The person is told at Add time, in one sentence, for anything Bower will keep but not read, and the working sheet says which files were kept unread. Stated limits: over 50 MB or a PDF over 300 pages is filed by name only. Escalations: HEIC and Excel converters are new runner dependencies.

### 5i. Yours or Bower's: the origin filter and tag (owner request, 2026-09-28)

A folder screen gets a second control next to the kind filter: **All · Originals · By Bower**. "Originals" is everything the person added or wrote (files and their own notes); "By Bower" is everything Bower wrote (notes on a file, answers, context notes it kept), shown with each note's key facts so a folder can be skimmed without opening the originals (the owner's case: the parameterised summaries of job offers, not the offer PDFs). In "All", an original and Bower's note on it stay one row. A small "Bower" tag with the bird marks every row Bower wrote; originals carry only their kind, so the tag is the exception and stays quiet. The data exists: `file-origin.ts` already tells "filed by Bower" from "written by you" from the catalogue in `index.md` and the note's frontmatter. Cost S (a segmented control, a filter, the tag). Boards: `Phone-Folder-List`, `Phone-Folder-ByBower`.

The Compare tab (5f) now says what it is on the screen: "You saved four flat listings here. Bower read the same things from each one, so they line up side by side." It appears only when a folder holds two or more things of the same kind.

### 5j. A demo deck from the same screens

The canvas has a second page, "Demo deck": eleven 1920 × 1080 slides built from the real boards (no copies to drift), each with a headline, one paragraph, three numbered points and, where it helps, Alex's case. Order: the promise; five folders; search; a folder at a glance; Bower's note; details; compare; long documents; every file; desktop; "Your Drive, your files". Static, for showing someone; the canvas exports it. When the boards change, the generator rebuilds the slides.

### 5k. Key facts and Compare: who decides, and what it costs (owner question, 2026-09-28)

The owner asked whether key facts and Compare are automatic or asked for, and how hard they are. Board `System-Kinds` answers it; in short:

- **Automatic, but not improvised.** The rulebook carries a short list of kinds (rental listing, job offer, bill or renewal, receipt, payslip, contract or lease, booking or ticket, recipe). For a document of a listed kind, Bower writes that kind's fields into the note's frontmatter during the same tidy-up. The key facts are the first four fields of the kind, fixed in the list, the same for every listing; Bower never picks them on the fly. A document that matches no kind gets Bower's note only, no strip and no Compare.
- **The person's context adds "for you" fields.** About me (the CV added at sign-up, the answers to the three questions, the rules) lets Bower add fields like the bike time to the office or a fit score against the budget, marked "from what you told me". Web lookups (routes, area averages) only when the person turned on "Let Bower look things up on the web" (#374).
- **The person can change a kind in words** ("For job offers, also note the pension"): it becomes a rule, through the existing rule write path (#343), and applies from the next tidy-up.
- **Compare needs no AI.** The app groups the notes of one folder by their `kind` property; two or more of the same kind show a Compare tab whose columns are the kind's fields. It is sorting and filtering in the browser over properties already written, instant and offline.
- **Cost and risk.** Agent: one more instruction per matching file inside the run that already reads it (extraction into a fixed field list is a routine task for the model); a rulebook bump; smoke tests per kind. App: a frontmatter renderer with a label map per kind (the app already parses frontmatter for pins and the rules version) and one Compare view (M). Risk: a wrong value; mitigated by the origin mark on every field, "Not in the listing" instead of guesses, the weekly health check flagging fields of the wrong type, and the person editing any property.
- **Viability across documents**: the kinds table on `System-Kinds` lists the key facts per kind and where Compare is useful; photos, articles and anything unlisted stay without a strip.

### 5l. The whole story, for the demo deck

A row "The whole story: Alex looks for a flat" (boards `Flow-01` to `Flow-08`) draws the flow the owner asked for: About me built from the CV and three questions; Add with four listings, a link, a photo and a "What is this?" sentence with a "from now on"; Is that everything?; the working sheet; Home done; the Bower box with a question in her words and Do it now; the answer that joins her office (CV), her bike (what she said) and the routes (web); the rule kept at once. The demo deck page now tells that story in eighteen slides, then the explorer features, and ends with "Your Drive, your files".

Owner questions this raises for later: whether About me should be built from a CV or LinkedIn at sign-up (an onboarding change, and a privacy line in the copy), and whether the demo deck should replace the interactive demo as the sales door or sit beside it.

### 5m. Key facts from one to four (owner request)

At most four; the strip shows only the facts Bower found, in the kind's order, and never an empty box. One fact is a single line (value and label); two are halves; three, thirds; four, quarters (two rows of two below 340 px). Values stay on one line, labels at most 14 characters. The same facts appear inline in folder rows ("£2,150 · 2 bed · 1 Nov"), as Compare columns and in the desktop About panel. Board `System-KeyFacts`, with a receipt (1), a Cycle to Work agreement (2), an offer letter (3) and a listing (4).

### 5n. New, and Just filed (owner request)

The owner's pain: after a tidy-up, the things added are "somewhere", renamed and moved by Bower, and the person cannot remember what they were or where they went.

- **Just filed**: one list per tidy-up of every item the person added: its old name ("was IMG_4471.jpg"), its new name, the folder it went to (with the PARA mark), key facts if Bower wrote a note, and a "Set aside" group for what Bower kept but could not read. "Earlier tidy-ups" opens the last 20. Reached from a row at the top of the Notes tab ("Just filed · 6"), from Home's Last tidy-up card and bubble, and from the Done sheet. Activity (#345) stays as the full history in the Bower tab; Just filed is its first card made findable.
- **New**: a small "New" tag on everything from the last tidy-up the person has not opened yet, on its row, and a count on its folder ("Flat hunt · 5 new"). Cleared by opening the thing or by "Mark all seen".
- **Technical**: the data exists. The run report already lists every processed item with its new path and kind (#571: `.bower/last-run.json`, and the Worker keeps the last 20 run records per user). "New" is that list minus the ids opened on this device, kept in IndexedDB (no server change). Across devices it would need a small seen-list in the Worker (optional, later). Old names come from the Activity lines ("renamed from"). Cost S for New, M for Just filed. Boards `Phone-Notes-New`, `Phone-JustFiled`.

### 5o. Add and Home: what changes and why

Boards `Why-Add` and `Why-Home` put today's screen next to the proposal, with the reasons. Add: the three doors become one row of three buttons (the same 48 px targets, the queue visible without scrolling); the link field stays; each item shows its kind and, for a kind Bower only keeps, says so; What is this? sits right above one primary button that carries the count ("Tidy up 5 things"). Nothing that exists today is removed. Home after a tidy-up: the bubble says how many were filed and links to Just filed (today it opens Activity in another tab); the Last tidy-up card counts what is new; Recent rows carry New, the Bower tag and key facts.

### 5p. The story and the demo deck, corrected (owner rulings)

- **Onboarding never asks for a CV, an ID or LinkedIn.** Two general questions, both optional ("What should I help with first?", "Anything I should always keep in mind?"), and a tip that Bower learns from what the person chooses to add. Board `Flow-01-Welcome`.
- **The point of the story is that nobody asked.** Months before the flat hunt, Alex added her offer letter (office address) and her Cycle to Work agreement (she cycles). When she adds the listings with three words ("Flats for November"), Bower times each flat by bike to her office on its own, and the line says it came "from your notes" and names both notes. A new origin, "from your notes" (lilac square), joins "from the file", "looked up" and "from what you told me". Boards `Flow-02-Earlier`, `Flow-06-Dots`; the deck adds a "How" slide with the three papers and the one line.
- **The deck shows why Bower, not what every file explorer does**: search, folders, grid and desktop slides are gone. Twelve slides: the promise; two questions; everyday papers; the flat hunt; nothing lost (Just filed); Bower joined the dots; how; the facts lined up; a question in her words; Bower suggests a rule (the existing Suggested group, #342), Alex decides; honest about sources; yours.
- **Agent requirement this creates**: when filing, Bower checks new items against the details it already wrote in the person's notes (an address, a habit) and may add a "for you" field, citing the notes it used. It stays inside the vault; no hidden memory.

### Speed and scale (enabler for all three)

- Incremental sync with Drive's changes feed (`changes.getStartPageToken` then `changes.list`) instead of the full recursive walk on every refresh; a full walk only on first load or when the token expires.
- Virtualised rows past a few hundred (TanStack Virtual's framework-free core works with Preact).
- Prefetch the first screen of notes when a folder is opened; thumbnails lazy-loaded.

## 6. Benchmark

| Feature | Bower today | Obsidian core explorer | Notebook Navigator (Obsidian plugin) | Google Drive | Apple Files |
|---|---|---|---|---|---|
| Files other than notes in the tree | missing | has | has, with thumbnails | has | has |
| Two panes (tree + list) | missing | missing | has | partial (web) | has (column view) |
| Sort per folder | missing | partial (global) | has, per folder | has | has |
| Filter by type or date | missing | missing | has | has (chips) | partial |
| Fuzzy search | missing | has (switcher) | has | partial | partial |
| Folders as search results | missing | partial | has | has | has |
| Search scoped to a folder | missing | partial | has | has | has |
| Thumbnails / grid | missing | missing | has | has | has |
| Move, rename, new folder in place | missing (via agent) | has | has, multi-select | has | has |
| Drag and drop | missing | has | has | has | has |
| Undo after a change | missing | partial | partial | has | partial |
| Pinned things | has | partial (bookmarks) | has (shortcuts) | has (starred) | has (favourites) |
| Recent | has (changed) | partial | has | has | has |
| Meaning of each top folder | **better** | missing | missing | missing | missing |
| Who put it there | **better** | missing | missing | partial (owner) | missing |
| "Ask about this folder" | **better** | missing | missing | partial (Gemini) | missing |
| Big-vault speed | partial (full walk) | has | has (100k+ notes, virtualised) | has | has |

What to borrow: Notebook Navigator's list pane (previews, thumbnails, date groups, per-folder sort, shortcuts); Drive's search chips and bottom-sheet filters on mobile; Apple Files' path bar, Recents and column view; Finder's spring-loaded folders. What not to borrow: Notebook Navigator's settings surface (dozens of options, profiles, templates) and Drive's storage-management features. Patterns only; no assets, copy or brand.

## 7. Open-source pointers (for the lead; no dependency enters without the owner)

| Need | Candidate | Licence | Size / fit | Note |
|---|---|---|---|---|
| Local fuzzy + prefix search, serialisable index | [MiniSearch](https://github.com/lucaong/minisearch) | MIT | ~7 kB gz, no deps, index snapshot to IndexedDB | Best fit: names, titles, paths, tags in one index |
| Fast fuzzy match for the switcher only | [uFuzzy](https://github.com/leeoniya/uFuzzy) | MIT | ~4 kB, no deps | Names and paths only; no full-text |
| Virtualised rows | [TanStack Virtual](https://tanstack.com/virtual) (`@tanstack/virtual-core`) | MIT | Framework-free core, Preact adapter is a few lines | Used by Notebook Navigator for 100k+ notes |
| Accessible tree with multi-select, drag and drop, rename | [headless-tree](https://github.com/lukasbach/headless-tree) | MIT (to confirm in the repo) | Headless core plus a React adapter; Preact via `preact/compat` | Only if we rebuild the tree; ours already has roving tabindex |
| Same, all-in-one | [react-arborist](https://github.com/brimdata/react-arborist) | MIT | React-only, opinionated rendering | Heavier; likely not worth it |
| Photo viewer with swipe and pinch zoom | [PhotoSwipe v5](https://github.com/dimsemenov/PhotoSwipe) | MIT | Vanilla JS, lazy-loaded chunk | For the file viewer's gallery |
| Reference implementation of the whole pattern | [Notebook Navigator](https://github.com/johansan/notebook-navigator) | **GPL-3.0** | Read for ideas only | Do not copy code into Bower |
| Incremental sync | [Drive changes API](https://developers.google.com/workspace/drive/api/guides/manage-changes) | Google API | No dependency | `changes.list` needs the full `drive` scope Bower already has |

## 8. Directions

| Direction | What it is | User value | Brand fit | Cost | Risk | Reach |
|---|---|---|---|---|---|---|
| **A. Find first** | Files in the tree; one local fuzzy index over folders, notes and files; chips; scoped search; readable paths; next/previous in the viewer | High: the daily "where is it" | High | M (one dependency) | Low | Every visit |
| **B. Arrange now** | Direct move, rename, new folder, archive, multi-select, drag and drop, undo; the moves queue file for the agent | High for the tidy person, medium for the chaos person | Medium: shifts "Bower files for you" towards "you file too" | L (Drive writes, `index.md` consistency, conflicts with a run in flight) | Medium | Weekly |
| **C. One explorer** | Same tree everywhere; phone drill-down with a path bar; desktop two panes with preview | Medium-high: less to learn | High | L (layout rework on the v3 shell) | Medium (touches M24 layout) | Every visit |

**Chosen (D4)**: A, extended with the PARA landmark (5b) and the grid and photo view (5c), as the next iteration. Then C: the one explorer, the phone path bar, desktop two panes. **B is dropped (D1)**; what survives of it is a better request: "Move to…" opens a folder picker (the same tree, folders only, PARA marks), writes a precise request ("Move *Lease agreement 2026* to Projects › Flat hunt") and offers "Do it now" through the instructions-only run.

## 9. Open questions for the owner

Answered on 2026-09-28: see section 1b (D1 to D7). Still open, low stakes, the recommendation is taken unless the owner says otherwise:

1. **The Notes tab's name**: "Notes" (recommended for now) or "Folders".
2. **Desktop two panes** (direction C): replace the single-column folder screen above 1200 px, or keep the v3 one-container rule. Not needed until after the find iteration.

## 10. Escalations the lead will meet

- Two new runtime dependencies approved by the owner (D3): MiniSearch and TanStack Virtual; each PR states its one-line reason.
- `thumbnailLink` images: CSP `img-src` already widened for Drive thumbnails in #350; thumbnail URLs are short-lived and need a refresh strategy.
- The changes feed needs a stored page token per device (IndexedDB) and a fallback full walk.
- PARA colours move from hex constants in `app/src/intro.ts` to theme tokens with light and dark values; the intro must keep its look.
- A PARA folder renamed in Drive: the app must recognise the five folders by prefix or position, and fall back to neutral if it cannot.
- Removing the phone folder menu reverses a v3 decision (#319, the Phone-Drawer board, the Help-Q-Folder sheet and the tour's first sheet, which points at "the menu, top-left"); the boards, the help sheets and the tour copy change with it.
- A source pointer on exported copies (`appProperties` on the copy) is a new write at Add time; the Drive preview frame for Office files relies on the existing `frame-src` allowance.

## Sources

- [Notebook Navigator (GitHub)](https://github.com/johansan/notebook-navigator), [notebooknavigator.com](https://notebooknavigator.com/)
- [Obsidian forum: mobile back navigation from Notebook Navigator](https://forum.obsidian.md/t/mobile-navigating-back-from-note-opened-using-notebook-navigator-opens-file-view/110893), [Obsidian forum: file explorer hotkeys](https://forum.obsidian.md/t/file-explorer-navigation-hotkeys/23178)
- [Android Police: Google Drive advanced search filters on Android](https://www.androidpolice.com/google-drive-advanced-search-filters-first-look/), [Android Police: Drive filter chips in the search bar](https://www.androidpolice.com/google-drive-web-filter-chips-in-search-bar/), [9to5Google: persistent search filters](https://9to5google.com/2023/03/30/google-drive-search-filters/)
- [iOS Hacker: Files app icon, list and column views](https://ioshacker.com/how-to/how-to-switch-between-icon-list-and-column-views-in-files-app), [AppleInsider: Inside Files](https://appleinsider.com/inside/ipados-26/tips/inside-files---how-to-manage-files-like-a-pro-on-iphone-ipad-and-apple-vision-pro)
- [NN/g: Breadcrumbs, 11 guidelines](https://www.nngroup.com/articles/breadcrumbs/), [NN/g: Mobile subnavigation](https://www.nngroup.com/articles/mobile-subnavigation/)
- [uFuzzy](https://github.com/leeoniya/uFuzzy), [MiniSearch](https://github.com/lucaong/minisearch), [fuzzy search benchmarks](https://github.com/zoubingwu/bench-fuzzy-search)
- [headless-tree](https://github.com/lukasbach/headless-tree), [react-arborist](https://github.com/brimdata/react-arborist)
- [PhotoSwipe](https://github.com/dimsemenov/PhotoSwipe)
- [Material 3: navigation drawer guidelines](https://m3.material.io/components/navigation-drawer/guidelines), [Material 3: navigation bar guidelines](https://m3.material.io/components/navigation-bar/guidelines), [Material 2: navigation drawer](https://m2.material.io/components/navigation-drawer)
- [NN/g: Hamburger menus and hidden navigation hurt UX metrics](https://www.nngroup.com/articles/hamburger-menus/), [NN/g: Beyond the hamburger, mobile](https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/)
- [Drive API: retrieve changes](https://developers.google.com/workspace/drive/api/guides/manage-changes)

## 11. Ledger: everything asked in this thread, and where it is

| # | Owner ask or finding | Status | Where |
|---|---|---|---|
| 1 | The explorer is a chore; make it excellent | Report and canvas | Sections 2–8; canvas |
| 2 | Files invisible in the tree; counts disagree | Designed | 5, HMW-1 idea 1; `Main`, `Phone-Notes-Revealed` |
| 3 | Search: files, folders, typos, filters | Designed | `Phone-Search*`, `Desktop-Search` |
| 4 | The app moving files itself | **Decided no** (D1): Bower moves, via a folder picker, now or next tidy-up | `Phone-Move-Picker` |
| 5 | PARA and Inbox fixed, coloured, recognisable; Archives a lilac A | Designed | 5b; `System-Folders` |
| 6 | Short meaning lines under the five folders | Kept everywhere, desktop too | `Main`, desktop boards |
| 7 | Collapse / expand all on the Notes tab; no sort button | Designed (restored) | `Main`, `Phone-Notes-Revealed`, `Phone-Notes-Loading`, `Phone-Notes-Light` |
| 8 | The tree opens at what you clicked | Designed | 5d; `Phone-Notes-Revealed`, `Desktop-Note` |
| 9 | Phone: folder menu and Notes tab duplicate | **Decided**: Notes tab only (D7), reverses #319 | 5e |
| 10 | Grid view and preview from the list; photos viewed properly without a gallery library | Designed | 5c; `Phone-Folder-Grid`, `Phone-Folder-QuickLook`, `Phone-Photo-Full` |
| 11 | Say what a file is (the spreadsheet case), copies link to originals | Designed | 5c; `Phone-File-Sheet`, `Phone-File-Excel` |
| 12 | Formats: what Bower reads, shows, only keeps (video, audio) | Designed | 5h; `System-Formats`, `Phone-File-Video` |
| 13 | Bower's note as the v3 board drew it (origin colours) | Designed; code drifted (#371) | D8; `Phone-Note-Bower` |
| 14 | Long or mixed documents: more than one Bower's note | Designed | 5g; `Phone-Note-Long`, `Phone-File-PDF-Long` |
| 15 | Rich properties like the old Obsidian vault | Designed | 5f; `Phone-Note-Details*` |
| 16 | Key facts and Compare: default or asked, how hard | Explained | 5k; `System-Kinds` |
| 17 | Filter Originals / By Bower, and a tag | Designed | 5i; `Phone-Folder-List`, `Phone-Folder-ByBower` |
| 18 | Demo deck: why Bower, not generic explorer features | Rebuilt, 12 slides | 5p; canvas page "Demo deck" |
| 19 | The whole flow, and Bower joining the dots unasked | Rebuilt: no CV at sign-up; earlier papers; the dots | 5p; `Flow-01` … `Flow-08` |
| 22 | Key facts that fit one to four | Designed | 5m; `System-KeyFacts` |
| 23 | New tag, and a list of what was just filed and where | Designed | 5n; `Phone-Notes-New`, `Phone-JustFiled` |
| 24 | Explain what changes on Add and Home, and why | Designed | 5o; `Why-Add`, `Why-Home` |
| 25 | Onboarding never asks for a CV | **Decided** by the owner | 5p |
| 20 | Real-app bugs: back label "1..", Health "Yesterday · not checked yet", zeros after sign-in, title twice | Found | Findings 7, 24–27 |
| 21 | MiniSearch, TanStack Virtual approved; PhotoSwipe not | Decided (D3) | Section 7 |

**Still open for the owner** (explained with options in the chat of 2026-09-28): companion note per kind (partly reverses #368); callouts for Bower's note; HEIC and Excel converters on the runner; the Notes tab's name; desktop two panes; the demo deck's role next to the interactive demo; #560 (a moved file leaves a copy); New across devices. Decided: no CV at sign-up.

**Next step**: done; see section 12 and the implementation spec. The technical lead turns it into milestones and issues.

## 12. Final round (2026-09-28): owner answers and the hand-off

- **Decisions**: companion note per kind, yes; callouts, yes; HEIC and Excel converters, not for now (kept, not read); the tab stays "Notes"; desktop panes at 1200 px and up; the interactive demo is frozen, the deck is kept for later and not built; moves through Drive keep the id and leave no duplicate (#560); "New" per device; sign-up never asks for a CV, ID or LinkedIn (the existing four-question interview stays).
- **Moves are booked by a script, not by AI**: Bower decides where a thing goes; the runner performs the move in Drive, rewrites `index.md` and links, and appends to `log.md`; every run also reconciles `index.md` with moves the person made in Drive or Obsidian.
- **System files**: Google Drive for desktop writes `desktop.ini` in every folder (and Office and macOS leave their own files); the owner's old vault shows the agent already moved one out of an inbox. The app, the runner's rclone filters and the rulebook now ignore them everywhere.
- **The owner's old vault** (read with permission; nothing personal carried over) confirmed: per-project hub notes with a tracker sorted by fit and a status per row (Compare), a scoring rubric, and answers that end with what to check and what to ask (now in the story's answer and in R-AG-6).
- **Deck**: what Bower is, what it does, why it is yours (only your Drive, the app keeps nothing, works with Obsidian), why it is different (it assumes from what you already gave it, and shows its working), then Alex's case; the false "never assumes" line is gone.
- **Desktop**: `Desktop-Folder`, `Desktop-JustFiled`, `Desktop-Note-Details`, `Desktop-Add` added.
- **Hand-off**: the implementation spec is `2026-09-28-explorer-v4-spec.md`; the boards are copied to `docs/design/v4/boards/` with a README. Nothing is committed.
