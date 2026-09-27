# Bower v3: the test, the design, the plan (28 September 2026)

**For the technical lead.** This is the whole handover in one file: what the test of the live app and the demo found (Part A), what the code looks like after today's merges (Part B), the v3 design decision by decision with the boards that show them (Part C), what has to change behind the screens in the agent, the vault, the Worker and the runner (Part D), and the milestones and issues to open, with acceptance criteria (Part E). Nothing discussed with the owner is left out on purpose; if something here is not on a board, the text here is the spec, and if a board and this text disagree, the board wins.

**The boards.** 67 screens, saved as `docs/design/v3/boards/*.dc.html` (open any of them in a browser; the links between screens work) with `canvas.json` for the layout and titles, and `docs/design/v3/README.md` as the map. The first board, **Brief**, is the decision record on one page. The earlier 58-board set under `docs/design/screens/` is superseded where the two differ.

**Ground rules that do not change** (from `CLAUDE.md`): no personal data anywhere (`you@example.com`, `Alex`, `FOLDER_ID`); no secrets; English everywhere; UI copy without jargon; one issue, one PR, the lead merges; docs travel with the code.

---

# Part A. The test of 28 September: findings and the fix plan

**What was tested.** `main` at `5b816a6` (every M15 to M17 issue merged, the demo build, the hardening). The real instance, signed in as the test account, in the built-in browser at 1280, 768 and 375 px: Home, the drawer, the quick switcher, a note and its More menu, a folder, Add, Tell Bower, Settings, Health, the What is Bower intro. The public demo (`bower-demo.pages.dev`) at 1280 and 375 px: Home with the tour, Add, Settings, a note that does not exist, the intro. Reference: the 58 boards under `docs/design/screens/` and spec §14.

**Second pass, with the owner's OK:** desktop at 1024, 1200, 1440 and 1920 px; pin and unpin from the note menu and the Home Edit mode; a link saved from Add; one file copied with From your Drive (the Google Picker); a question sent from Tell Bower; a real run; the push switch; sign out, the sign-in screen, Terms, the first-visit intro, and the Google account chooser and consent screens on the way back in. Not done: a file upload through the file input (the test browser cannot fill file inputs) and the long-press pin in the drawer.

Severity: **P0** breaks the product promise or blocks a flow; **P1** a person notices every day; **P2** polish.

## 1. Things that do not work

| # | Where | What happens | Sev |
| --- | --- | --- | --- |
| 1.1 | Every screen, real instance | The toast **"Nothing new to process · See"** sits at the bottom of every screen, on every route, for the whole session, over the bottom nav's content on the phone. It is the last run's result message; the toast never expires and reappears on navigation. The pill shows **"Done ✓"** for the same reason, hours after the run. The design: the toast lingers seconds, the pill returns to "Tidy up" once the sheet is dismissed. | P0 |
| 1.2 | Health | The three figures read **0 notes · 0 to fix · 0 broken links** while the report lists four findings and the folder holds six notes: the runner's report has no `notes` / `findings` / `brokenLinks` frontmatter, and `summarise()` turns the missing keys into zeros without saying so. Either the runner writes the keys (#173) or the screen counts the findings it renders and says "n notes" from the index. | P0 |
| 1.3 | Health | The findings render as **raw Markdown**: `**Domain tag convention…**`, backticks, `(a) … (b) …` in one grey paragraph. The bird says "your notes are in good shape" while four `**Missing note**` blocks follow. Findings must go through the same renderer as a note, or the report must be written as one finding per list item with a title. | P0 |
| 1.4 | Home, real instance | **"Good evening"** with no name: the Worker's `/me` does not carry the Google profile name, so `greetingFor` drops it. The demo shows "Good evening, Alex". Real people get the cold version. | P1 |
| 1.5 | Home and Recent | Recent shows **`<Note name>.md`**: the `.md` extension on every row, and the full path `2-Areas/<Area>/<Sub-area>/<Note name>.md · today` under it. Design and Pinned tiles strip the extension and show the folder only. Same in the demo (`Tomato seedlings.md`). | P1 |
| 1.6 | Note not found | Opening a note id that does not exist shows one bare sentence, "This note is not in your Bower folder.", no bird, no "Search for it" or "Go home". `Phone-NotFound.dc.html` was designed and #143 implemented a Not found route, but the note screen's own missing state bypasses it. | P1 |
| 1.7 | Add | A lone **"Add to Bower"** button under the amber card, with nothing selected and no file field near it. It is the upload queue's submit (#262), rendered even when the queue is empty. Disabled-looking, unlabeled for what it adds. Hide it until there is something queued, or make it the drop zone's action. | P1 |
| 1.8 | Quick switcher | a five-letter fragment of a note's name returned **"No notes contain …"** although two notes carry the word in their file name and one in its path: the switcher only searches Drive full text (a debounced network call with a 2-character minimum) and does not match the index's names first. On the phone the dialog also covers the whole top bar. | P1 |
| 1.9 | Folder screen | `1-Projects` shows "2 notes · 1 folder", then **"Nothing here yet"** with an Add button and the bird: the count includes the subfolder's notes but the list only shows direct children. Either say "2 notes in <Subfolder>" or show nothing-here only when the whole subtree is empty. | P1 |
| 1.10 | Intro (`/welcome`) | The sort strip is a static row of chips; the "window onto your Drive" is two text columns. The boards show the jumble-to-columns animation and the app/Drive reveal. `intro.css` has one entrance animation per block and nothing loops. This is the first thing a visitor sees. | P1 |
| 1.11 | Tell Bower, desktop Home | The inline composer on Home and `/tell` render **two birds** on one screen (the greeting bird and the composer's), plus a third in the "Last one" card: #206 covered the wordmark and the sidebar, not the composer. | P2 |
| 1.12 | Settings, desktop | "Ping me when it's done · **Notifications on this phone**" on a 1280 px screen. The hint should say "on this device". | P2 |
| 1.13 | Settings | "Runs Bower on your own Anthropic billing instead of **the person who runs it**." reads as if the person is billed; the sentence wants "instead of the operator's". Same block: the key field's Save and Clear sit enabled with an empty field. | P2 |

## 2. Where the app does not match the design

| # | Where | Design | App | Sev |
| --- | --- | --- | --- | --- |
| 2.1 | Home, phone | `Phone-Home.dc.html`: the bird at 88 px sits under the greeting's baseline; "Good evening, Alex" is one line at 24 px; the bubble hangs from the greeting with a tail. | The greeting is set at the desktop size (34 px), wraps to two lines on 375 px ("Good evening," / "Alex" in the demo), the bird's box is a rounded card next to it and the bubble is a plain box. On the demo the bird and the two-line greeting collide. | P1 |
| 2.2 | Home | Recent rows: note icon, name in 16 px semibold, folder · time in 13 px muted, one row per note with a divider. | Rows are blue underlined links (the default link colour) with the full path under them; no icon, no row height. It looks like a directory listing. | P1 |
| 2.3 | Home | Pinned: two-column tiles with the folder icon in amber. | One tile at full width, folder icon in grey. With one pin it should still be a half-width tile. | P2 |
| 2.4 | Home, desktop | Four cards: Inbox, Answers, Health, Notes; the Health card says "Checked today" or "New"; the sentence "Runs every Sunday" under it. | As designed, except the Health card says "Checked today" while the report is dated 27 Sep and Health itself says "<day> <month>'s check" (a locale-formatted date next to English). | P2 |
| 2.5 | Top bar, phone | Menu, wordmark or title, Tidy up at the edge (#204). | As designed. The note bar shows back + the folder name truncated at 14 characters with the pill at 40 %: the back label should give way first (`min-width:0` and a smaller max). | P2 |
| 2.6 | Drawer | "Your notes" title, sort, collapse, close; the search field opens the switcher; a Health row; the tree; the hidden-files footer; the account row. | As designed; the field is now "Filter your notes" and filters in place (#212). The Health row sits alone above the tree without a section label, which reads like a folder called Health. | P2 |
| 2.7 | Note, phone | Back, Tidy up, More; title 28 px; tags and properties in one muted row; Bower's note as a callout with the mark; linked mentions; previous / next. | The note repeats its title as an H1 inside the body (the same words twice, 32 px and 30 px); properties are three rows; no "Bower's note" callout (the agent's note is in the body as plain text); the "Add to this note" append form sits between the body and the siblings and takes 180 px of every note. | P1 |
| 2.8 | Note, desktop | About panel from 1200 px: Outline, Linked mentions, In this folder. | Outline and In this folder are there; no Linked mentions (#150, phase 2, fine); the panel is present at 1280. | P2 |
| 2.9 | Add | Drop zone with the bird peeking, Files · Photo · From your Drive in one row, the link field, the queue, the amber card. | As designed on the phone, except the stray "Add to Bower" button (1.7). Desktop: the three buttons are two (no Photo) and the zone is a full-width dashed box with 60 px of empty space above the text. | P2 |
| 2.10 | Tell Bower | The bird sings only while typing (`p-sing` on focus with text); the composer is at the bottom of the screen on the phone with the feed above. | The bird sits idle next to the composer at all times; the composer is under the chips, in the top third of the phone screen, and the feed (empty) leaves 60 % of the screen dark. | P1 |
| 2.11 | Settings | Account card with an initial disc; sections Tidying up, Look, Advanced; "Sign out" as a secondary button and "Delete my account (your Drive folder stays)" as a red text link at the very bottom. | Delete is a **full-width filled red button**, the most prominent control on the screen, above the version line. Sign out and Sign out everywhere are two outlined buttons of equal weight. "Reconnect Google" is a link in the account card without saying when it is needed. | P1 |
| 2.12 | Health | The bird Done with a bubble summarising date and count; three figures; one card per finding with an icon and a title line; "Ask Bower to fix these". | Layout matches; content does not (1.2, 1.3). The bubble says "<day> <month>'s check" (`toLocaleDateString` in the browser's locale inside an English sentence). | P1 |
| 2.13 | Intro | Four pages, the sort-strip animation, six verb cards, the Drive reveal, the PARA cards; on desktop a 760 px panel with arrows. | Structure as designed; pages 1 and 3 lost their animations (1.10); the desktop panel has no wordmark or bird in the header, so the first screen of the product shows no brand at all. Page 4's "Sign in with Google" is shown to a signed-in person who opened it from Settings (it should read Done). | P1 |
| 2.14 | Folder | Folder icon in amber at 34 px, name, "n notes · m folders", chips, Folders, Notes newest first with first line and time, Bower's note at the bottom. | As designed except the empty state (1.9) and the chips wrapping to two rows on the phone (Pinned / Ask Bower / Open in Drive at 15 px do not fit 343 px; the design had 13 px chips). | P2 |
| 2.15 | Note menu | Pin to Home, Ask Bower about this note, Open in Drive, Copy link, Edit the text; the hint under Edit. | As designed, both sheet and popover. Good. | – |
| 2.16 | Demo | `Demo-*` boards were never drawn; the demo reuses the app screens with a banner. | The banner "These are sample notes. Nothing here is real. Show me around" takes 64 px under the bar on every screen, on top of the tour's own card; the tour's first step covers the sidebar Add item while the banner says Show me around above it: two invitations at once. | P2 |

## 3. Bad UX or design, independent of the boards

| # | Where | Problem | Sev |
| --- | --- | --- | --- |
| 3.1 | Everywhere | The pill is the only trigger, but its label carries three unrelated states in one control: "Tidy up (3)", "Tidying up…", "Done ✓", "Failed", "Limit reached". After a run it stays "Done ✓" until something resets it (1.1), so the primary action reads as unavailable. Done, Failed and Limit belong in the sheet and the toast, the pill should say "Tidy up" again within seconds. | P0 |
| 3.2 | Home, real instance | With an empty inbox the whole top half is dead: bird, "All tidy.", a search field, two cards saying 0 and 1. Nothing invites the next action. The bubble should carry the next step ("Add something and I'll file it", with a link), and the Inbox card should be a link to Add when empty. | P1 |
| 3.3 | Recent | Two rows with the same dated file name in different folders, and dated file names as titles: the list shows file names, not note titles. Notes carry a title in frontmatter or a first heading; Recent, Pinned and the switcher should show that, with the file name as the fallback. | P1 |
| 3.4 | Note | The append form ("Add to this note", a textarea and an Add button) is on every note by default. Appending is a rare action; it should live under the More menu or collapse to one row ("Add a paragraph…"). | P1 |
| 3.5 | Note, phone | Reading measure: body text at 16 px runs edge to edge with 16 px margins and 1.5 line height; headings at 24 px inside the body compete with the 30 px title. The design's `.prose` uses 17 px / 1.6 and 20 px headings. | P2 |
| 3.6 | Drawer, phone | The tree's rows show a count on the right for every folder (0, 2, 3, 0, 0, 1, 0): four zeros in a seven-row list. Show the count only when it is above zero. | P2 |
| 3.7 | Switcher, phone | Opens as a full-height sheet from 12 px under the top; the commands list (Tidy up, Add, Tell, Switch theme) is shown before any result, so the first screen is four commands and "No notes contain…". Commands should follow results, not precede them. | P2 |
| 3.8 | Settings | Three sign-out-like controls (Sign out, Sign out everywhere, Delete) in a row at the bottom. "Sign out everywhere" is a security feature; put it under Advanced with a sentence, keep Sign out alone. | P2 |
| 3.9 | Health | "Ask Bower to fix these" is a full-width teal button at the bottom of a list that says nothing is wrong (1.3). And the 0 · 0 · 0 figures under a "good shape" bubble contradict the four findings below. Until the report carries counts, drop the figures. | P1 |
| 3.10 | Intro, desktop | Skip is a 13 px link at the top right of an empty 1280 px page, the dots at the far left; the panel floats with no header. Add the wordmark to the header, centre the dots under the panel (as the board does), make Skip a button-sized target. | P2 |
| 3.11 | Tablet 768 | The content column is capped and centred as specified, but the bottom nav spans the full width with four items 190 px apart and the top bar's menu button sits 24 px from the edge while the content starts at 64 px. Align the bar's padding with the content column. | P2 |
| 3.12 | Demo | The demo signs you in as Alex with `/login` redirecting to Home, so the "Run your own Bower" screen is only reachable from the tour's last step and the intro's last page; a visitor who skips the tour never meets it. Put "Run your own Bower" in the banner ("Nothing here is real · Run your own") and in Settings' account card. | P1 |
| 3.13 | Demo | Every disabled control says "Not in the demo: run your own Bower to use this." three times on Settings alone. One sentence at the top of the section, not per control. | P2 |
| 3.14 | Demo, phone | The tour's first coach mark opens over Home with the bird overlapping the Recent heading and the card covering the search field; on the phone the highlighted target (the Add tab) is 60 px below the card. Fine on desktop. | P2 |

## 4. What matches and works

The top bar order and the drawer (#204), the soft palette (#205), no bird in the wordmark (#206), the four-page intro's structure and its Settings entry (#207), Add without the auto tidy-up and with the amber card (#208), dot-folders hidden and the footer wording (#209), the More menu on both sizes (#210), the 640 px column at 768 (#211), `/health` (#212), the Folder screen's shape (#214), Pinned on Home and in the sidebar with the Edit mode (#216), "From your Drive" on Add and the conversion sentence (#217, #218). The demo banner, the tour with demo copy and the disabled actions (#193, #195) all render.

## 5. Fix plan

Order by what a person hits first. Part E says which of these became M18 issues, which are done, and which are absorbed by the v3 milestones.

1. **Run state and the pill** (1.1, 3.1). `run-store.tsx`: `done` returns to `idle` after the sheet is dismissed or 8 s, whichever first; the toast has a lifetime (6 s, dismissible) and is not re-mounted on route change; the message is kept for the sheet only. P0.
2. **Health counts and rendering** (1.2, 1.3, 2.12, 3.9). Runner writes `notes`, `findings`, `brokenLinks` in the report frontmatter (#173); the app renders each finding through the note renderer with the first line as the title; the figures are hidden when the frontmatter lacks them; dates through one English formatter. P0.
3. **Titles, not file names** (1.5, 2.2, 3.3). One `noteTitle(file, text?)` helper: frontmatter `title`, else the first `# ` heading from the cached text, else the file name without `.md`. Recent, Pinned, switcher, the note header and the folder list use it; Recent rows get the designed row (icon, title, folder · time). P1.
4. **Home that invites** (1.4, 2.1, 2.3, 3.2). Greeting at the phone size with the name from `/me` (the Worker stores the Google profile's given name at sign-in, one KV field); the bubble carries the next step when the inbox is empty; Pinned tiles half width. P1.
5. **Note screen** (1.6, 2.7, 3.4, 3.5). Missing note → the Not found route; no duplicate H1 (the renderer drops a first heading equal to the title); properties in one row; Bower's note as the callout when the body carries the agent's block; the append form behind the More menu; `.prose` sizes from the design. P1.
6. **Switcher** (1.8, 3.7). Match index names and paths first, synchronously; Drive full text second; results before commands. P1.
7. **Tell Bower** (2.10, 1.11). The composer docked at the bottom on the phone, the feed above it; the bird sings on focus with text and is otherwise absent from the composer; one bird on desktop Home. P1.
8. **Settings** (2.11, 1.12, 1.13, 3.8). Delete as a red text link at the bottom with the "your Drive folder stays" sentence; Sign out alone as a button; Sign out everywhere under Advanced; copy fixes; Save disabled while the key field is empty. P1.
9. **Intro animations and header** (1.10, 2.13, 3.10). Port the sort strip and the Drive reveal from the boards as CSS loops (transform and opacity, reduced-motion holds the resting frame); wordmark in the desktop header; Done instead of Sign in when opened from Settings. P1.
10. **Add** (1.7, 2.9). The queue's submit only with a queue; Photo on desktop where the device has a camera, otherwise hidden; the zone's height from its content. P2.
11. **Folder and drawer polish** (1.9, 2.14, 3.6). Empty state only for an empty subtree; 13 px chips; counts above zero only; a "Your notes" label above the tree in the drawer. P2.
12. **Demo** (2.16, 3.12, 3.13, 3.14). "Run your own" in the banner and the account card; one not-in-the-demo sentence per section; the tour's phone placement. P1 for 3.12, P2 for the rest.
13. **Tablet bar alignment** (3.11). P2.
14. **Desktop container** (6.1.1, 6.1.4, 6.1.5, 6.1.6). Home, the header and the note with its About panel inside one centred container (980 px, 1200 with the panel); the Tell column gets a minimum width or drops under Recent below 1100 px. P1.
15. **Tell waits like Add** (6.2.5, 6.2.7). Sending creates the note and updates the pill count; no run; the bubble on Home knows about a running or a waiting run. P0.
16. **Toasts and the sheet** (6.2.2, 6.2.6, 6.2.9). One toast component with a lifetime; the sheet opens once per run; a loading state on Home instead of zeros. P1 (folds into item 1).
17. **Add refreshes the index** (6.2.3). After a save or a copy the vault index re-lists the inbox so the pill, the card and Recent agree. P1.
18. **Picker scope** (6.2.4). Open on My Drive, hide the Bower folder, never show dot-folders or `Processed`. P1.
19. **`/login` never redirects to the intro** (6.3.2); Terms and Privacy back links go to the sign-in when signed out (6.3.4). P1.
20. **Names for controls** (6.2.10). `aria-label` on the menu button, the More button, the Settings rows and the switches; text in the sidebar folder links. P1.
22. **A run that fails or never reports** (6.2.11). Runner: retry the status report with backoff and write the outcome into the vault (the log) so the app can read it without the Worker; Worker: a run whose GitHub job has finished is `done` or `failed` by the job's conclusion, not by the callback alone, and a sign-in never invalidates a credential a run is using. App: the sheet says what happened in people's words and offers Try again; the pill returns to "Tidy up" once the sheet is dismissed; the vault index is re-listed when a run ends, fails or goes stale; the Home bubble says a run failed and links to the sheet. P0.
21. **OAuth verification or `drive.file`** (6.3.6, 6.3.7). The owner's decision; the code side of `drive.file` is the Picker path that already exists. P0.

## 6. Second pass: desktop sizes, real actions, sign-in

### 6.1 Desktop responsive

| # | Width | What happens | Sev |
| --- | --- | --- | --- |
| 6.1.1 | 1024 | Home: the Tell Bower column is squeezed to about 230 px; the composer's placeholder is cut and the **send button is clipped by the viewport edge**. The four cards are 150 px wide with "things Bower answered" wrapping to three lines. | P1 |
| 6.1.2 | 1024 | Note: no About panel (correct, under 1200) but the body runs the full remaining width with the append form under it. Fine. | – |
| 6.1.3 | 1200 | Note: About panel present, text measure about 620 px. Fine. The "Nothing new to process" toast sits over the body's last line. | P2 |
| 6.1.4 | 1920 | Home has **no maximum width**: the four cards stretch to about 380 px each across 1600 px, Recent and Tell Bower are two columns 900 px apart, the toast floats in the middle of nothing. The design caps the content at 980 px centred. | P1 |
| 6.1.5 | 1920 | Note: the text column (720 px) hugs the **left** edge of the content area while the About panel is pinned to the **right** edge of the viewport, 900 px away from the text it describes. The panel should sit next to the measure, both centred in the remaining width. | P1 |
| 6.1.6 | all | The desktop header keeps the pill at the far right; at 1920 the breadcrumb is 1400 px from it. Cap the header row to the same container as the content. | P2 |

### 6.2 Real actions

| # | Action | Result | Sev |
| --- | --- | --- | --- |
| 6.2.1 | Pin a note from the More menu | Works: the toast "Pinned to Home", the tile on Home (two columns once there are two pins) and the sidebar row. The pinned note and the pinned folder shared a name and differed only by a grey icon; the note tile's second line shows the folder, which helps. | – |
| 6.2.2 | Unpin from Home > Edit | Works, but the toast reads **"Unpinned"** and stays on screen for the rest of the session like the run toast (1.1): the toast component never expires. | P1 |
| 6.2.3 | Save a link on Add | Works: "Link - example.org 2026-09-27 2032.md · Added to your inbox". The queue row's title is the raw file name Bower gave it, with the date and a four-digit time; the pill and the Inbox card do **not** update until a reload (the vault index is not refreshed after an add). The Save button greys out afterwards while the field is empty, which reads as broken. | P1 |
| 6.2.4 | From your Drive | The Picker opens (Google's light UI over the dark app; unavoidable). Its first view, "Google Drive", is a flat grid of **every folder in the account including the Bower folder's own subfolders**, `Processed` and `.claude`, mixed with the person's private folders; the "My Drive" tab shows the Bower folder as a pickable folder. #217 asked to exclude it. Picking a `.txt` worked: "Copied from your Drive · the original stays where it was". | P1 |
| 6.2.5 | Tell Bower > Send | The note is created and **a run starts by itself**: the working sheet pops up before the sent bubble is readable. Add fills the inbox and waits; Tell fills the inbox and runs. Two doors, two behaviours, and the one that runs is the one people will use for small questions. Either both wait for the pill, or the sent bubble says "I'll answer on the next tidy-up" and the pill shows the count. | P0 |
| 6.2.6 | The working sheet | On desktop it is a popover at the top right that **re-opens on every route change** and shows "Started just now" again each time (it did settle to "Started 3 min ago" later). It covers the sent bubble on Tell and the Health card on Home. Design: a sheet that opens once when the run starts and stays closed once dismissed. | P1 |
| 6.2.7 | Home during a run | The bubble says **"3 new things in your inbox. Shall I tidy up?"** while the pill says "Tidying up…" and the sheet is open. The bubble must know about the run ("Tidying up 3 things, back in a few minutes"). | P1 |
| 6.2.8 | Push switch | "Notifications were not turned on" in red under the switch, no explanation (the test browser blocks the permission prompt). The sentence should say what to do ("Allow notifications for this site in the browser and try again"). Not verifiable further here. | P2 |
| 6.2.9 | Right after sign-in | Home renders with **0 · 0 · No check yet · 0 notes · "Nothing here yet"** for two seconds while the folder loads, then the real numbers. An empty state shown as fact during loading. A loading state (the bird Looking, dimmed cards) until the index arrives. | P1 |
| 6.2.11 | The runs | Two runs, both **finished the agent's work and both ended as "Failed" or "Tidying up…" in the app**. Run A (started by Tell at 18:34 UTC) processed the three inbox items, changed ten files in the working copy, then the copy back to Drive failed at "sync up (copy only)" and nothing landed; the app showed the pill **"Failed"** with no toast, the Home bubble still asking "Shall I tidy up?", the sheet saying "Something went wrong · sync up: copy failed" (an internal step name) and **no way to run again**: the pill only reopens the sheet, the sheet has no Try again; only the switcher command still starts a run. Run B (started from the switcher at 18:43) synced two files up, the answer note appeared under Answers, then its final status call got **HTTP 401** ("report done failed: API unreachable") and the Worker kept the run as `running`: fifteen minutes later the app still said "Tidying up… · Started 9 min ago", the Inbox card 3, the Answers card 1, while the Folder screen already listed the new answer (it lists live, Home reads the stale index). Both failures coincided with the sign-out and the re-consent made between 18:38 and 18:42. Run A's Drive access token was most likely invalidated by the new consent. Run B reports with the fixed instance key (`BOWER_API_KEY`), and its first report at 18:44 was accepted, so the 401 on the last one is the Worker's decision: something the sign-in path rewrote (the user or vault record the report handler checks) no longer matched. To investigate in `api/src`; a run must survive a sign-in either way. Either way the app has no recovery: no refresh of the index when a run ends or fails, no Try again, and `stale` only after its own timeout. | P0 |
| 6.2.10 | Accessibility (read from the tree) | The menu button, two Settings rows ("Show me around again", "What is Bower") and the note's More button on the phone have **no accessible name**; both switches are named "on" instead of their label; the sidebar has links to `/folder/…` with no text (icon-only rows read as empty links). | P1 |

### 6.3 Sign out, sign in, first visit

| # | Where | What happens | Sev |
| --- | --- | --- | --- |
| 6.3.1 | Sign out | Lands on `/login`: the bird at 64 px on nothing, the wordmark, one line, the button, the invited-only paragraph, Privacy · Terms · What is Bower?. All of it in the **top 40 % of a 1280 × 757 viewport**, the rest empty; the design centres the block and puts the bird on a ground line at 96 px with the Hello animation. On the phone it is fine. | P2 |
| 6.3.2 | `/login` on a first visit | With the intro flag cleared, **`/login` itself redirects to `/welcome`**: a person who follows a sign-in link, or reloads the sign-in page, gets the four-page intro until they press Skip. Only `/` should redirect; `/login` is the way out. | P1 |
| 6.3.3 | `/welcome` | Reaching the last page or pressing Skip sets the flag; simply visiting does not. Fine. | – |
| 6.3.4 | Terms | Reads well; long, with the operator's responsibilities and the third-party services. The "Back" link at the top goes to the previous page, which after a sign-out is Settings (now signed out). It should go to the sign-in. | P2 |
| 6.3.5 | Google account chooser | Shows the new bird mark next to "Bower". Good. | – |
| 6.3.6 | **Google: "This app isn't verified"** | After choosing the account, Google shows the red-triangle warning "Google hasn't verified this app… you shouldn't use it until the developer verifies it", names the operator's personal Gmail address as the developer, and hides the way forward under "Advanced > Go to Bower (unsafe)". A second warning box follows on the consent screen. The consent screen was published but the app has **not passed OAuth verification** for the `drive` scope; every new person meets this, and the docs promise "sign in with Google". Either complete verification (privacy policy, demo video, the restricted-scope justification, a developer address on the domain) or move to `drive.file` plus the Picker, which needs no verification and matches "Bower only sees its own folder". | P0 |
| 6.3.7 | Consent | Asks for the full Drive scope ("see, edit, create and delete all of your Google Drive files") while the app tells people it only reads its own folder. The two claims contradict on the one screen a cautious person reads. | P0 |

## 7. Still needs a hand from the owner

- **A file upload through the file input** (photo or PDF from the device): the test browser cannot fill file inputs. The link and the Drive copy took the same queue, so only the picker-less path is unverified.
- **A Google Doc through From your Drive**: only a plain text file was copied; the Docs to Markdown export is unverified.
- **The drawer long press**, and the frontmatter diff in Drive after a pin (the app said it wrote; the file was not opened).
- **Push** on a real phone: the test browser refuses the permission.
- **OAuth verification** (6.3.6): the owner's Google Cloud console, not the code.

---

# Part B. The app as it stands on 28 September (main at `bf11984`)

Read this before opening issues: today's merges changed the ground the v3 work lands on.

## B.1 What merged since the test (5b816a6 → bf11984)

| PR | What it changed | Effect on the v3 plan |
| --- | --- | --- |
| #285 | Playwright end-to-end tests against the demo build (`app/e2e/`), README screenshots as a by-product | Every v3 screen gets an e2e assertion in the same harness; screenshots regenerate from it. |
| #286 | Run tickets: the runner no longer holds `BOWER_API_KEY` for every vault; each run gets a one-run ticket (`api/src/run-ticket.ts`) | Fix item 22 (a run that never reports) builds on tickets, not on the old key. |
| #293 | First-run interview (`components/interview.tsx`, `interview.ts`): four questions after Building, before Start with what you have; writes `About-Me.md` and `Rules.md`; replayable from Settings | The intro (M20) sits *before* sign-in; the interview stays where it is, between Building and the Drive step. The tour follows. |
| #295 | Memory hygiene: what the agent may learn; the lint checks `Rules.md` (contradictions, 200-line cap) | The grouped Rules screen (M22) reads the same file; the cap stays. |
| #296 | Proposals: `Answers/Bower - Proposals.md`, Accept / Dismiss in Health (`routes/health.tsx`, `proposals.ts`); Accept appends to `Rules.md` through Drive | v3 moves Accept / Dismiss to the Bower tab as the **Suggested** group of Rules; Health keeps a one-line pointer. The app already writes `Rules.md`: the v3 "rule kept at once" path reuses it. |
| #297, #300, #303, #294 | Switcher aria fix, Add refreshes the inbox count, demo tour copy | Fix items 17 and part of 20 are done. |
| #301 | Share-target errors surface | The "share to Bower from any app" door (M21) is the same service-worker path. |
| #302 | "This was misfiled" on a note; repeated corrections become proposals | Stays in the v3 More menu under the same words. |

## B.2 What exists, by area

**App (`app/src`).** Routes: `/` Home, `/login` (the demo swaps in Run your own), `/not-invited`, `/privacy`, `/terms`, `/note/:id`, `/folder/:path*`, `/add`, `/tell`, `/search`, `/settings`, `/health`, `/lint`, `/onboarding` (welcome · folder · building · interview · drive), `/welcome` (the four-page intro). Shell: drawer with the tree, quick switcher, pill "Tidy up (n)" in the bar, pins (Home section, sidebar, note menu, long press), theme toggle in the bar, tour after onboarding (four steps, demo copy in the demo). Demo (`app/src/demo/`): an in-memory API and a fixture vault ("Alex") behind `VITE_DEMO`; **the demo run is already scripted** (`demo/server.ts`: queued 1.5 s, running, one item per step, done at 8 s, canned replies) and never calls a model; Drive and push are disabled with a sentence.

**Worker (`api/src`).** Google sign-in with the full `drive` scope (`google.ts` explains why `drive.file` was rejected: it only sees files the app created), sessions, `/process` dispatching the GitHub workflow with a run ticket, `/status`, push, settings (own API key), admin, the vault template served to new folders, `bower_rules_version` in the template.

**Agent (`agent/`).** `run.sh` (hardened: allow-list of tools, `BOWER_ALLOW_WEB=1` per instance turns WebSearch/WebFetch on, `BOWER_MAX_CHANGES`, secrets scrubbed, quarantine pre-scan), `prompts/ingest.md`, `prompts/lint.md`, workflows `ingest.yml` and `lint.yml`, the red-team corpus. The Ingest workflow in `vault-template/CLAUDE.md` still **writes a summary note for everything** and moves the original next to it or to `Processed/`.

**Vault.** `CLAUDE.md` (Bower's, versioned), `Rules.md` (the user's: rules from instruction notes and accepted proposals), `About-Me.md` (interview + Ingest step 7), `index.md`, `log.md`, `Answers/`, `Answers/Bower - Proposals.md`, `Lint Report.md`, `0-Inbox/Processed/`, `0-Inbox/Quarantine/`, `Clippings/`.

## B.3 What the last look at production showed (28 Sep, evening)

Same shell as the test: Home with the four cards and Tell Bower below (A rule / A task / A question), file names with `.md` in Recent, the health report rendered as raw Markdown with `**bold**` and `0 · 0 · 0` counters, "Update Bower's rules (v1 → v6)" and "Tell Bower about yourself again" now in Settings, "What is Bower: the four-page intro, again". The demo opens straight on Home with the tour over it: no intro before it. Nothing from Part A has regressed; nothing from Part A beyond items 17 and 20 is fixed.

# Part C. The v3 design, decision by decision

The screens are the contract. They live in two places, the same files:

- **The canvas** (the lead's private review board, the owner has the link): "Bower v3 Screens", 67 boards in six rows, Version 6 of 28 Sep.
- **The repo**: `docs/design/v3/boards/*.dc.html`, 67 self-contained HTML files, one per board, plus `canvas.json` (the layout and each board's title). Open any file in a browser; the prototype links between boards work from the file system. `docs/design/v3/README.md` lists them by row.

The first board, **Brief**, is the decision record in one page. Everything below expands it. Where a sentence here and a board disagree, the board wins; say so in the PR.

## C.1 Principles (the why behind every issue)

1. **Bower only files, by default.** What you add lands in its PARA folder as it is: a PDF stays a PDF, next to the notes of its project, sensibly named. No summary note, no duplicate, no analysis, no translation, unless you asked: in the "What is this?" box when you added it, with a rule, or in the Bower tab. Web clips and links become notes because the clip *is* the content. This is the single biggest change from today's agent (Part D).
2. **For people who are not technical.** No jargon anywhere ("your notes", "your Bower folder", "tidy up"; never "vault", "ingest", "run", "index", "frontmatter", "sync"). Nothing shown as a file name with an extension. Every screen carries its own explanation behind a "?" and one example at the point of use.
3. **Examples everywhere.** The intro, the empty states, the composer's tip, the Ideas screen and the help sheets all carry concrete sentences a person can copy: "From now on, receipts go under Finance, named by shop and date", "Make a document that analyses the job offers I have saved", "How much did I spend on the kitchen this year?".
4. **One bird per screen.** The wordmark in the bar is text. The bird is the mascot next to the greeting, in a sheet, or in an empty state, never twice on one screen.
5. **The demo is the sales door.** It shows exactly the same app, with sample notes, the same intro and tour, and a recorded tidy-up. The model never runs in the demo.
6. **Adding is cheap, tidying costs.** Add fills the inbox and nothing else. Tidy up is one deliberate tap, confirmed, after the whole pile is in.
7. **Originals are visible.** A folder lists files and notes together, with who put each there. Nothing is hidden except Bower's own files and dot-folders.

## C.2 Shell and navigation (boards: Phone-Home, Phone-Drawer, Desktop-Home, Brief)

- **Four tabs** at the bottom on the phone, in this order: **Home · Notes · Add · Bower**. Icons: house, folder, plus, speech bubble. The active tab is teal with `aria-current="page"`.
- **The top bar of every tab**: left, the **folder menu** button (three lines, `aria-label="Your folders"`); the title; right, **"?"** (`aria-label="About this screen"`) and the **avatar** (initial in a teal circle, opens Settings). Screens reached from a tab (a note, a folder, Ideas, Health) show **Back** instead of the menu button.
- **The folder menu** (Phone-Drawer) slides from the left over a dimmed page, 320 px wide: "Your folders" and Close; a search row ("Search or jump to anything", opens the switcher); **Pinned** (the pinned notes and folders); **Folders** (the tree: 0-Inbox, 1-Projects, 2-Areas, 3-Resources, 4-Archives, Answers, each with its one-line meaning and count, projects expandable); a footer line "Tap a folder to open it. Long-press to pin it to Home. The full tree with search lives on the Notes tab." No sort options. The Notes tab keeps the full tree with search and the Health row; the menu is the shortcut from any tab.
- **No pill in the bar.** Tidy up lives on the Inbox card (Home) and on the Add tab. The bar never shows a running state; Home does.
- **Theme** (Match my device / Light / Dark) lives only in Settings. No toggle in the bar.
- **No Tell Bower on Home.** Home is: greeting with the bird, the Inbox card, the Last tidy-up card, Pinned, Recent. Asking lives on the Bower tab.
- **Loading state**: until the folder index arrives, the bird is Looking and the cards are dimmed with no numbers; never zeros shown as fact.
- **Offline**: the offline banner stays as it is, without a bird; the big bird next to the greeting is the sad one.

## C.3 First visit (boards: Intro-1 … Intro-9, Intro-InApp, Login, Onb-*, Help-Home/Notes/Add/Bower, Help-Q-*)

**Before sign-in, on the first visit only**, `/` shows **What is Bower**: nine pages in a horizontal swipe (dots at the top, **Skip** top-right to the sign-in, **Next** bottom-right, **Sign in with Google** on the last page). Reloading `/login` never shows it (Part A, 6.3.2). The nine pages, with the animation each one carries (all CSS loops, `prefers-reduced-motion` stops them, every page complete at rest):

| # | Title | What is on it |
| --- | --- | --- |
| 1 | Drop it. Bower puts it away. | The bird sorting a strip of cards into four coloured folders (the "sort strip" animation from the earlier canvas, revised: cards fly to their folder and the bird bows). One paragraph: photos, PDFs, links, screenshots; you tap once. |
| 2 | Where does it go? | The four PARA folders with their one-line meaning; cards flying into them; two "why" cards: "Bower reasoned it" and "You told it" (the rule example). |
| 3 | Ask, and it does more | The six verbs (Reads, Looks up, Writes, Remembers, Connects, Answers), each with one line; three example sentences to copy. |
| 4 | A window onto your Drive | The Drive window with the curtain animation: your folder as it is in Drive; the three "no"s: not an editor, not storage, not a place where your things are locked in; opens in Obsidian or any app. |
| 5 | A project: the flat hunt | Three acts in one page: you add the pile and Bower files it (the mini tree with the filing animation); you ask ("Which one should I visit first?"); you get the note with its conclusions box and the remembered rule. |
| 6 | An area: money | Same three acts: receipts filed under Finance by shop and date; "How much did I spend on the kitchen?"; the table and the rule "from now on…". |
| 7 | A resource: recipes | Clips become notes; "What can I cook with what is in the fridge?"; the answer links the recipes. |
| 8 | The archive: the finished trip | A project ends; Bower archives it when told; nothing is deleted; the archive is searchable. |
| 9 | What will you start with? | Three doors (a project, a pile of receipts, a folder in your Drive) and **Sign in with Google**; "Only people who were invited can sign in". |

**From Settings**, "What is Bower" opens the same nine pages with **Close** (X) instead of Skip and **Done** on the last page (Intro-InApp).

**Sign-in** (Login): the bird on a ground line at 96 px with the Hello animation, the wordmark, one line, the Google button, the invited-only sentence, then **Privacy · Terms · What is Bower?**. On desktop the block is centred vertically in the viewport.

**First run after sign-in** stays as it is (Welcome · Where things live · Building · the interview · Start with what you have), then the **tour**: four sheets in a row, one per tab, each anchored over its tab with the tab highlighted, **Tour · 1 of 4**, Skip, **Next: Notes** … **Let's go**. The same four sheets, without the step counter and with **Show me around** and **Ideas** buttons, are what the **"?"** opens on each tab (Help-Q-*). A fifth sheet explains a folder screen. The content of each sheet is in `HELP_ROWS` on the boards: Home (the menu, Inbox, Last tidy-up, Pinned, Recent), Notes (four folders, files and notes together, search, hidden), Add (the doors, What is this?, Tidy up), Bower (the box, Rules, Requests, Activity), Folder (the line at the top, rows, Ask Bower about it). Every help sheet ends with the link "What is Bower, from the start".

## C.4 Home in its states (boards: Phone-Home, -Empty, -Running, -Done, -Failed, -Pins; Desktop-Home)

| State | The bird | The bubble | The Inbox card | The Last tidy-up card |
| --- | --- | --- | --- | --- |
| Waiting (n in inbox) | Idle | "3 new things in your inbox. Ready when you are." | **3** waiting to be filed · **Tidy up** button | "4 filed · 1 answered · 2 h ago", tap for Activity |
| Empty (first day) | Happy | "Nothing here yet. Add a few things, or a whole pile, then tidy up once." + three example chips | 0 · "Nothing waiting. Add something." (tap goes to Add) | "No tidy-up yet" |
| Running | Tidying (animated) | "Tidying up 3 things. Back in a few minutes; I'll say when it's done." | 3 · "Tidying up…" (button disabled, no chip in the bar) | unchanged |
| Done | Dance, once | "Done: 3 filed, 1 answered. Have a look." (link to Activity) | 0 | "3 filed · 1 answered · just now" |
| Failed | Confused | "It didn't finish; your things are still in the inbox. Try again?" (link opens the failure sheet) | 3 · **Try again** | unchanged |
| Editing pins | Idle | – | – | – (the Pinned grid shows an X on every tile) |

Greeting: "Good morning / afternoon / evening, {given name}" from the Google profile; without a name, "Good evening" alone. Pinned: two columns of tiles (folder or note, with its folder as the second line). Recent: five rows with the type icon (PDF red, image blue, note grey, Google Doc blue, folder amber, answer purple, link teal), title (never a file name), folder path, relative time; "All" opens Notes.

## C.5 Notes, folders, files (boards: Phone-Notes, Phone-Folder, Phone-Folder-Project, Phone-File, Phone-Note, Phone-Note-Menu, Phone-Switcher, Phone-Health, Desktop-Notes, Desktop-Note)

- **Notes tab**: search row; the tree (six roots with meaning and count; projects expand); at the bottom the **Health check** row ("Sunday · 2 small things to fix") and the hidden-files line ("Bower's own files and dot-folders are hidden · Show"). The only bar button is Expand/Collapse all. No sorting.
- **A root folder** (Phone-Folder): the line at the top says what the folder is for ("Things with an end date. Bower files here whatever has a deadline; when it is done, it goes to the archive."); then its subfolders and files.
- **A project folder** (Phone-Folder-Project): files and notes together, newest first, each row with the type icon, the title, and **who put it there** ("filed by Bower", "your note", "Bower wrote it when you asked", "from your Drive, as Markdown"). A chip **Ask Bower about this folder** opens the Bower tab with the folder named.
- **A file** (Phone-File): preview (PDF first page, image, or a Google Doc as text), the folder, when and by whom, **Open in Drive**, and the More menu.
- **A note Bower wrote when asked** (Phone-Note): the title; under it **"A note from Bower"**: a boxed block with the conclusions, one row per conclusion, colour-coded (green: fine / amber: check / red: problem) with a short label; then the body; then **"What Bower used"**: the files and notes it read, as links, with the origin of each fact (from the file, looked up on the web, reasoned). The properties (folder, tags, dates) are behind **About** (a panel on desktop, a sheet on the phone). No duplicate H1. A missing note shows Not found.
- **The More menu** (Phone-Note-Menu, one menu for note, file and folder): Pin to Home, Ask Bower about this, This was misfiled, Open in Drive, Copy link, Edit the text (notes only).
- **Search** (Phone-Switcher): names and paths first, synchronously; full text second; commands last.
- **Health check** (Phone-Health): explained on the screen: "Every Sunday Bower reads through your notes and lists what it would fix: broken links, notes without a home, things that contradict each other. It never changes anything here; you decide." Then the counts (notes, to fix, broken links, from the report's frontmatter), the findings as rendered Markdown, and the one-line pointer to Suggested rules on the Bower tab.

## C.6 Add and the tidy-up (boards: Phone-Add, Phone-Drive-Picker, Phone-Tidy-Confirm, Phone-Working, Phone-Working-Failed, Desktop-Add)

- **Phone: a list of doors, no drop square.** Three rows: **Take a photo** ("A receipt, a sign, a page of a book"), **Choose files** ("Photos, PDFs, screenshots, voice memos"), **From your Drive** ("Copies a file in; the original stays put"); then **Or paste a link** with Save; then the line "Or share to Bower from any app: it lands here too." Desktop keeps the drop zone (Desktop-Add) with Choose files and From your Drive.
- **Added · n**: the queue, each row with the type icon, the name as the person will see it (the original file name is fine here, it is theirs), the state ("In your inbox", "From your Drive · saved as Markdown", a percentage while copying).
- **What is this? (optional)**: one text box under the queue, placeholder "Just filing is fine. Or tell Bower what to do with these: "Job offers: pull out salary, location and deadline, and add them to a table". Say "from now on" and it becomes a rule." The text applies to this batch (Part D, D.2). Adding never starts a run.
- **The hint**: "**3 things waiting.** Add the whole pile first: a tidy-up takes a few minutes and uses one run of your plan, so once is better than five times." with the **Tidy up** button.
- **Tidy up → "Is that everything?"** (Phone-Tidy-Confirm): a sheet with the Looking bird, the count and the cost in plain words ("3 things in the inbox. A tidy-up takes a few minutes and uses one run of your plan, so once is better than five times."), **Yes, tidy up** and **Add more first**. **No "Don't ask again"**: always asked, one tap. The same sheet opens from the Inbox card and from "Do it now" on a request.
- **The working sheet** (Phone-Working) opens once when the run starts and never reopens by itself: the bird tidying between "Inbox" and the destination folders, "2 of 3 filed · Started 1 min ago", a progress bar, "Usually three to five minutes. Close this and keep going; Home will say when it is done.", the rows as they are filed ("Lease agreement 2026 → Flat hunt").
- **Failure** (Phone-Working-Failed): the confused bird, one sentence in people's words ("Google Drive stopped answering half way through copying things back."), **"Nothing was lost: your 3 things are still in the inbox, untouched."**, a hint, **Try again**, Not now. The sheet never shows a step name.
- **From your Drive** (Phone-Drive-Picker): the Google Picker opens on My Drive, the Bower folder is not listed, nor `Processed`, nor dot-folders; the footer says "Docs become Markdown, Sheets a table, Slides a PDF. Everything else is copied as it is." and **Add 2 to the inbox**.

## C.7 The Bower tab (boards: Phone-Bower, Phone-Rule-Menu, Phone-Bower-Requests, Phone-Bower-Activity, Phone-Bower-Empty, Phone-Ideas, Desktop-Bower)

- **The box** at the top of the tab: one text area, placeholder "Tell Bower what to do, or ask it something", Send. **No selector** (Rule / Task / Question is gone). Under the box a "?" tip: "**Say it as you would to a person.** Bower works out whether it is a rule, a job or a question." with three rotating examples (the `EXAMPLES` list on the board) and the link **More ideas** (Phone-Ideas). No text next to the Send button.
- **Three segments** under the box: **Rules · Requests · Activity**.
- **Rules**: the explanation **always on top**, never at the bottom: "**Rules are yours and start at once.** Bower files its own way (PARA) for anything you have not said anything about. Tap a rule to change it, pause it, remove it, or apply it to what is already filed." Then **groups by topic with a count** (Finance 27, Flat hunt 4, Job hunt 3, Everything else 2), collapsed except the first; a group opens to its rules, each with its date. A **Suggested** group at the top when Bower has open proposals, each with Accept and Dismiss (moved here from Health). A paused rule shows a "Paused" chip.
- **A rule, tapped** (Phone-Rule-Menu): a sheet with the rule's text and four rows: **Change it** (opens the box prefilled), **Apply to what is already filed** (a job: "Go through what is filed and apply this rule"), **Pause** / **Resume**, **Remove**.
- **Requests**: every sentence you sent, newest first, with a state chip: **Waiting · job** / **Waiting · question** ("goes with the next tidy-up", with **Do it now**, Edit, Remove), **Tidying up**, **Answered** (link "Read the answer"), **Rule kept** (link "In your rules"). A rule sentence is kept at once (D.2) and appears as Rule kept immediately.
- **Activity**: one card per tidy-up ("Today, 18:51 · 3 min"), the rows "what went where" with the type icon and the destination, renamed things named, questions with "read it", and **Set aside** rows for anything quarantined or not converted, in people's words.
- **First time** (Phone-Bower-Empty): the bird, "Nothing yet. Try one of these:", three example chips, the same "?" tip.
- **Ideas** (Phone-Ideas): grouped examples (Home and money, Work, Health, Learning, Travel), each a sentence to copy with one line on what happens; a Copy button per row fills the box.
- **The old `/tell` route** redirects to the Bower tab. The tell composer component is retired; the conversation feed is not kept (history is Requests + Activity).

## C.8 Settings (boards: Phone-Settings, Desktop-Settings)

One centred column, in this order: the account (avatar, name, the Google account line, Drive folder with **Open in Drive**, **Reconnect Google**); **Tidying up** (Ping me when it's done; Notifications on this phone; **Let Bower look things up on the web** with the line "Off, Bower only reads what you gave it. On, it may search the web to fill in what a document leaves out."); **Look** (Match my device / Light / Dark); **Bower** (Update Bower's rules when a newer rulebook exists; Tell Bower about yourself again; Show me around again; What is Bower; Show Bower's own files); **Advanced** (Use my own Claude API key); **Sign out**; **Sign out everywhere**; **Delete my Bower account** as a red text link at the bottom with "your Drive folder stays". Footer: version, Source code, Privacy · Terms.

## C.9 Desktop (boards: Desktop-Home, -Notes, -Note, -Add, -Bower, -Settings, -Responsive)

- **One container**: content is 980 px wide, centred; 1200 px on the note screen when the About panel is open (the panel sits next to the measure, not on the viewport edge). The header row uses the same container. The rule on the Desktop-Responsive board: *if anything touches the right edge at 1920, it is a bug.*
- **Sidebar** (left, 260 px): the wordmark, the search row, Pinned, the tree, the Health row; **one button, collapse**; no sort menu. The Add entry shows a **bubble with the count** waiting ("3").
- **Breakpoints**: 600 (phone layout ends), 900 (sidebar appears), 1200 (the About panel; the Bower tab's three columns), no change above. Drawn at 1024, 1280 and 1920 on the board.
- **Home**: the greeting row; **four cards in one row, equal width, aligned on one grid**; Pinned as tiles; Recent in two columns. No Tell column.
- **The Bower tab**: three columns, Rules · Requests · Activity, **the same header height and the same top line**, the box spanning above them.
- **Settings**: one centred column (the board is the reference for every single-column page).
- **Add**: the drop zone with the bird peeking, the queue and What is this? on the left, the link field and the hint on the right.

## C.10 The demo (boards: Demo-Intro, Demo-Home, Demo-Add, Demo-Tidy-Confirm, Demo-Working, Demo-RunYourOwn, Demo-Desktop-Home)

- **The same first visit as the app**: the nine intro pages with the banner on top and **Try the demo** where the app says Sign in with Google; then the four-sheet tour with the demo copy ("These are Alex's things, a sample."); "?" opens the same sheets.
- **The banner** on every screen: "This is a demo, not the real thing: sample notes, nothing saved · **Run your own**".
- **Tidy up in the demo never runs the model.** The confirmation sheet carries an extra amber line: "Demo: what follows is a recording. Nothing is sent to Claude, nothing is saved." The working sheet says "**A recording.** In the demo the bird plays back a real run in twenty seconds; nothing is sent to Claude, nothing costs anything." The playback is the scripted run that already exists in `demo/server.ts`.
- **From your Drive** and push are greyed with one line each ("Not in the demo. Run your own Bower to use it."). Everything else works in the page and vanishes on reload.
- **Run your own Bower**: the dancing bird, three rows (one folder in your Drive; your own keys; about an hour), **Read the runbook on GitHub**, "What is Bower, in nine screens".

## C.11 Copy and accessibility rules (apply to every issue)

- Titles, never file names: frontmatter `title`, else the first heading, else the file name without its extension. Extensions never appear except in the Add queue.
- Every icon-only control has an `aria-label`; every switch is named by its label; every link has text; sheets trap focus and close on Escape; the tab bar is a `nav` with `aria-current`.
- Contrast 4.5:1 for text; states differ by lightness and a label, never by hue alone (the conclusions box uses green/amber/red **and** a word).
- Copy in English, short sentences, no jargon; numbers as digits; relative times ("2 h ago", "yesterday").
- Animations: CSS only, loop or play once, `prefers-reduced-motion` stops them, every screen complete at rest.

# Part D. What changes behind the screens: agent, vault, Worker, runner

The design only works if the agent and the runner change with it. These are the decisions; the issues in Part E name the files.

## D.1 File only, by default (the Ingest workflow)

Today `CLAUDE.md` Ingest writes a summary note for every item and moves the original next to it or into `0-Inbox/Processed/`. v3:

1. Read the item enough to know what it is (a receipt, a lease, a photo of a sign, a job offer).
2. Decide the PARA destination; create the project or area folder and its hub note if needed (as today).
3. **Move the original into that folder** with a sensible name when the original's name says nothing (`IMG_4471.jpg` → `Arlington Road, window sign.jpg`; a name that already means something is kept). No summary note, no converted copy, no analysis, no translation.
4. Add one line to the folder's hub note (a link to the file with a five-word description) and one row to `index.md` (files are indexed too, with their type, so the app's search and Recent see them).
5. `log.md`: one line per file, "filed → folder, renamed from …" when renamed.
6. **Exceptions that still produce a note**: a web clip or a saved link (the clip is the content: it becomes a note as today, original into `Processed/`); an item with a **What is this?** context (D.2) that asks for something; a **rule** that asks for something ("receipts: one note per month with the totals"); a **document converted from DOCX/ODT/HTML/EPUB/RTF** (the converted `.md` is filed next to the original, both in the folder, nothing in `Processed/`).
7. `0-Inbox/Processed/` keeps only instruction notes, raw clips and unconvertible items. Everything else lives where it belongs.
8. `About-Me.md` step 7 stays (something lasting about the owner), but never from a file that was only filed.
9. Duplicates: the same file again (same name and size, or the same URL) is moved to `Processed/` and logged, as today.

The five-line run report stays; `Created` counts notes, a new `Filed: <n> files` line counts moves.

## D.2 Context and rules, without a selector

- **What is this? (Add)**: the app writes one instruction note per batch, `0-Inbox/Bower - <date> <time> Context.md`, frontmatter `tags: [instruction]`, `via: app`, `kind: context`, body: the person's text and the list of file names it applies to. The runner lists it as app-written (the existing allow-list). The agent handles it before the files: the files named in it are filed **and** get what the text asks (a table, a summary, a translation); a sentence starting "from now on", "always", "every time" also becomes a rule (D.3).
- **The Bower tab box**: no selector. The app writes an instruction note as today (`Bower - <date> <time> <title>.md`, `kind: request`) and the agent decides rule / job / question in the Instructions workflow, as it already does. Two shortcuts the app takes without a run, both by plain pattern on the sentence: a sentence that starts with **"From now on"**, **"Always"**, **"Never"** or **"Every time"** is a rule: the app appends it to `Rules.md` (the same write path Accept uses today) under the right topic heading and shows **Rule kept** at once; a sentence ending in **"?"** is a question. Everything else waits for a run as a job. The agent, when it meets a rule sentence in a request note the app did not shortcut, does what it does today (writes `Rules.md` from the Instructions workflow).
- **Do it now** on a waiting request starts a run with **scope `instructions`**: the workflow input `scope=instructions` makes the runner process only instruction notes and leave the rest of the inbox untouched (cheaper, faster; the same `run.sh`, one flag). Tidy up runs with the default scope (everything).
- **Apply to what is already filed** writes a job note: "Apply this rule to what is already filed: <rule>". The agent goes through the folders the rule names and moves or renames; logs every move.

## D.3 `Rules.md` with a shape the app can read

- Topic headings `## <Topic>` (Finance, Flat hunt, Everything else); one rule per bullet `- <text> (owner's request, YYYY-MM-DD)`; a paused rule is `- ~~<text>~~ (paused YYYY-MM-DD)` and the agent ignores struck-through rules; the agent is told this shape in `CLAUDE.md` and the interview and Accept write the same shape. `app/src/rulebook.ts` (or a new `rules.ts`) parses groups, counts, dates and the paused flag; the Rules screen writes back through Drive (change, pause, resume, remove) with the same optimistic write-and-refresh Accept uses.
- The 200-line cap and the lint contradiction check stay (#295).
- **Suggested** = the open proposals of `Answers/Bower - Proposals.md`, shown as a group on the Rules screen; Accept and Dismiss as today (#296); Health keeps a one-line pointer.

## D.4 A note from Bower (the conclusions box)

When the agent writes a note because it was asked (a question, a job, a context), the note starts with a fenced block the app renders as the box:

```
---
title: Which flat should I visit first?
type: answer
---
## Bower's note
- ✅ Arlington Road is 10 % under the area average.
- ⚠️ The Kingsland Road listing leaves out the deposit.
- ❌ The Camden lease asks for five weeks' deposit, above the legal cap.

## Why
…

## What Bower used
- [[Lease agreement 2026.pdf]] (from the file)
- Camden Town average rent (looked up on the web)
- Bike time to the office (reasoned from your calendar note)
```

The app renders `## Bower's note` as the box, each bullet's leading ✅ / ⚠️ / ❌ as the colour and the word (Fine / Check / Problem), and `## What Bower used` as the sources list with the origin in brackets. The markers are the only allowed ones; the template in `CLAUDE.md` says so.

## D.5 Runs that survive, and report

- The runner reports through the run ticket (#286). Add: **retry the final report** three times with backoff; **write the outcome** (`done` / `failed`, counts, one sentence for people) into `log.md` and into a small `.bower/last-run.json` in the vault so the app can read it from Drive when the Worker never heard back; the Worker marks a run `done`/`failed` from the **GitHub job conclusion** (it already knows the run id) when the callback is missing after the job ended; a sign-in or a re-consent **never invalidates a ticket or a Drive token a run is using** (tokens for runs are minted per run and are not the session's).
- **Failure copy**: the runner classifies the failure into a handful of people-facing reasons (Drive stopped answering; the run took too long; Claude was unavailable; the folder changed underneath) and the app shows that sentence, never a step name.
- **Web lookup**: `BOWER_ALLOW_WEB` stays the instance-level switch; a **per-user** switch in Settings ("Let Bower look things up on the web") is stored by the Worker with the user's settings and passed as a workflow input `allow_web=1`; `run.sh` turns the tools on only when both the instance and the user allow it. Off by default.
- **Instructions-only scope**: workflow input `scope`, `run.sh` skips `Clippings/` and non-instruction inbox files when `scope=instructions`.

## D.6 The demo

Already scripted, no model: keep it that way and **make it a test**: an e2e assertion that the demo build makes no request to any host but its own. Add the intro and the tour before Home (same code as the app, banner on top, "Try the demo" button), the "recording" copy on the confirmation and working sheets, and the greyed Drive and push rows with their sentence.

## D.7 Google OAuth (the owner's decision, blocks nothing else)

Either **complete verification** for the `drive` scope (privacy policy URL, the demo video, the scope justification, a developer address on the domain; the unverified-app warning and the "see, edit, create and delete all of your Drive files" sentence are what every new person meets today), or **move to `drive.file` plus the Picker** (no verification, the consent says "files you open with this app", but every file in the folder must then be created or picked through the app, which the runner's Drive copy today is not). The v3 plan assumes the scope stays `drive` and verification is completed; the sign-in copy already says Bower can copy from the rest of your Drive (#247).

# Part E. Milestones and issues to open

For the technical lead. Nine milestones, 74 issues. Each issue below is written to be pasted as the issue body: a one-paragraph *why*, the boards, the acceptance criteria, what it depends on. Labels follow the repo's scheme (`area:app|api|agent|docs`, `type:feature|fix|chore|spike`, `size:S|M|L`, `priority:P0|P1|P2`). One issue, one PR; the PR's "Left out" section names what the board shows and the PR did not do.

**Order.** M18 first (bugs people hit today). M26 (the agent) can start at once and runs in parallel with M19; M21 and M22 need M26's context note and `Rules.md` shape. M20 needs M19's shell. M23 needs M19. M24 after M19 to M23 land (it aligns them). M25 last (it packages everything for the demo). Owner items are not issues.

**What the fix plan of Part A became.** Items 1, 2, 3, 5, 6, 8, 11, 13, 16, 18, 19, 20, 22 are M18 issues. Items 17 and the aria half of 20 are done (#300, #297). Items 4, 7, 9, 10, 12, 14, 15 are absorbed by v3 milestones (M19 Home, M22 Bower tab, M20 intro, M21 Add, M25 demo, M24 desktop) and are not opened twice. Item 21 is the owner's.

---

## M18 · After the test: fixes that survive v3

| # | Title | Labels | Boards |
| --- | --- | --- | --- |
| 18.1 | Run state: `done` returns to idle, toasts expire, the sheet opens once per run | app, fix, M, P0 | Phone-Working, Phone-Home-Done |
| 18.2 | Health check: counts from the report's frontmatter and the findings rendered as Markdown | app, agent, fix, M, P0 | Phone-Health |
| 18.3 | Titles, not file names: one `noteTitle` helper for Recent, the tree, the switcher, the note | app, fix, S, P1 | Phone-Home |
| 18.4 | Note screen: Not found for a missing note, no duplicate heading, properties behind About | app, fix, S, P1 | Phone-Note, Desktop-Note |
| 18.5 | Switcher: names and paths first and synchronously, full text second, commands last | app, fix, S, P1 | Phone-Switcher |
| 18.6 | Settings: Delete as a red text link at the bottom, Sign out a plain button, sections in the v3 order | app, fix, S, P1 | Phone-Settings |
| 18.7 | Folder and drawer polish: empty state only for an empty subtree, 13 px chips, counts above zero only | app, fix, S, P2 | Phone-Folder |
| 18.8 | Tablet bar alignment at 768 | app, fix, S, P2 | – |
| 18.9 | Picker scope: open on My Drive, never list the Bower folder, `Processed` or dot-folders | app, fix, S, P1 | Phone-Drive-Picker |
| 18.10 | `/login` never redirects to the intro; Terms and Privacy back links go to the sign-in when signed out | app, fix, S, P1 | Login |
| 18.11 | Names for the remaining controls: the Settings rows, both switches, the sidebar folder links | app, fix, S, P1 | – |
| 18.12 | A run that fails or never reports: retry the report, outcome in the vault, job conclusion as the fallback, tokens survive a sign-in | api, agent, fix, L, P0 | Phone-Working-Failed |
| 18.13 | Failure sheet in people's words with Try again; the Inbox card offers Try again after a failure | app, fix, S, P0 | Phone-Working-Failed, Phone-Home-Failed |

Acceptance criteria, per issue:

- **18.1** `run-store.tsx`: `done` → `idle` when the sheet is dismissed or after 8 s; one `Toast` component with a 6 s lifetime and a Close; the working sheet opens once per run id and never on a route change; `stale` after the Worker's timeout re-lists the index. Tests: the store transitions; an e2e on the demo that the sheet does not reopen when navigating Home → Add → Home during a run.
- **18.2** Lint writes `notes`, `findings`, `brokenLinks` into `Lint Report.md` frontmatter (`prompts/lint.md` + a check in `run.sh`); the app reads them, renders the body with the note renderer, and shows "Your notes are in good shape" only when `findings` is 0. Health explains itself in one paragraph (C.5 text).
- **18.3** frontmatter `title` → first `# ` heading from cached text → file name without extension; used by Recent, Pinned, the tree, the switcher, the note header, Activity. Unit tests on the helper.
- **18.4** `/note/<missing>` renders the Not found route; the renderer drops a first heading equal to the title; folder, tags, dates live in About (panel ≥1200, sheet below).
- **18.5** as the title; results appear before any Drive request completes; unit test on the ranking.
- **18.6** the order in C.8, the copy "your Drive folder stays", the web-lookup switch row present but disabled until 26.7 lands (says "Soon").
- **18.7** as the title.
- **18.8** the bar's title and buttons on one baseline at 768; screenshot in the e2e.
- **18.9** the Picker's view is My Drive; a `setParent`/`ViewId` filter excludes the Bower folder id (the app knows it) and any `.`-prefixed or `Processed` folder; the copied file's row says "Copied from your Drive · the original stays where it was".
- **18.10** only `/` redirects to `/welcome` on a first visit; `/login` never; Terms and Privacy "Back" go to `/login` when there is no session.
- **18.11** every control listed in Part A 6.2.10 has a name; the axe run in the e2e reports zero "button-name"/"link-name" violations.
- **18.12** Part D, D.5 first bullet; Worker tests for the job-conclusion fallback; a bash test that the runner writes `.bower/last-run.json` and retries the report.
- **18.13** the sheet shows the classified reason (D.5), "Nothing was lost: your n things are still in the inbox, untouched.", Try again (starts a run), Not now; the Inbox card shows Try again while the last run is `failed`; the Home bubble says it (C.4 Failed).

---

## M19 · v3 shell: tabs, bars, the folder menu, Home

| # | Title | Labels | Boards |
| --- | --- | --- | --- |
| 19.1 | Four tabs at the bottom: Home · Notes · Add · Bower; `/tell` redirects to the Bower tab | app, feature, M, P0 | Phone-Home, Brief |
| 19.2 | The top bar of every tab: folder menu, title, "?", avatar; Back on inner screens | app, feature, M, P0 | Phone-Home, Phone-Note |
| 19.3 | The folder menu: pinned things, the tree, search, one tap to any folder | app, feature, M, P0 | Phone-Drawer |
| 19.4 | Remove the pill: Tidy up on the Inbox card and on Add | app, feature, S, P0 | Phone-Home, Phone-Add |
| 19.5 | Home in its six states: the bubble, the bird, the cards | app, feature, M, P0 | Phone-Home-* |
| 19.6 | Home loading state: no zeros as fact | app, fix, S, P1 | Phone-Home |
| 19.7 | Greeting with the given name from the Google profile | app, api, feature, S, P1 | Phone-Home |
| 19.8 | Theme lives in Settings only; no toggle in the bar | app, feature, S, P1 | Phone-Settings |
| 19.9 | Offline: the banner without a bird, the sad bird next to the greeting | app, fix, S, P2 | Phone-Home |
| 19.10 | Desktop sidebar: collapse only, no sort, the Add bubble with the waiting count | app, feature, S, P1 | Desktop-Home |

- **19.1** the `nav` with `aria-current`; teal active tab; the four routes; `/tell` → `/bower` (301 in the SPA); the old Tell composer stays only until 22.1 replaces it. E2e: the tabs exist on the phone size and are hidden ≥900.
- **19.2** `bar()` as on the boards: menu (`aria-label="Your folders"`) · title · "?" (`About this screen`, opens the tab's help sheet, 20.4) · avatar (Settings). Inner screens (note, file, folder, Ideas, Health, Not found) show Back. The wordmark is text only; the bird is never in the bar.
- **19.3** the drawer as C.2: search row, Pinned, Folders (the tree with meanings and counts), the footer line, long-press pins (reuse `use-long-press.ts`), focus trap, Escape closes, 320 px, dims the page.
- **19.4** the pill component is deleted; `ProcessButton` moves to the Inbox card ("Tidy up") and Add's hint; both open the confirmation (21.5). The bar shows nothing during a run.
- **19.5** the table in C.4 verbatim: bubble text, bird pose, card text and button per state; Done plays the dance once; Failed links to the failure sheet. E2e on the demo through the scripted run: waiting → running → done texts.
- **19.6** until the index resolves: Looking bird, cards dimmed with no numbers, Recent skeleton rows.
- **19.7** the Worker stores `given_name` from the Google profile at sign-in and returns it from `/me`; the app greets with it; without one, "Good evening" alone.
- **19.8** as the title; `theme.ts` unchanged, the control moves.
- **19.9** as the title.
- **19.10** the sidebar as C.9: one collapse button, no sort, the count bubble on Add updates with the index.

---

## M20 · v3 first visit: the intro, the tour, the help sheets

| # | Title | Labels | Boards |
| --- | --- | --- | --- |
| 20.1 | What is Bower: nine swipeable pages before the sign-in, Skip, Next, Sign in | app, feature, L, P0 | Intro-1 … Intro-9 |
| 20.2 | The intro's animations: the sort strip, the flying cards, the Drive curtain, the filing tree | app, feature, M, P1 | Intro-1, -2, -4, -5 |
| 20.3 | What is Bower from Settings: the same pages with Close and Done | app, feature, S, P1 | Intro-InApp |
| 20.4 | Help sheets: one per tab plus Folder, opened by "?"; the tour is the same four sheets in a row | app, feature, M, P0 | Help-*, Help-Q-* |
| 20.5 | Sign-in screen: centred block, the bird on its ground line, Privacy · Terms · What is Bower? | app, feature, S, P1 | Login |
| 20.6 | Ideas: the screen of examples, grouped, each copyable into the box | app, feature, S, P1 | Phone-Ideas |

- **20.1** nine pages as the table in C.3, horizontal scroll-snap with dots, Skip top-right to `/login`, Next bottom-right, page 9 with Sign in with Google and the invited-only line; the flag is set on Skip or on reaching page 9; only `/` on a first visit shows it (18.10). Every page complete at rest, text from the boards. E2e: nine pages, Skip lands on the sign-in.
- **20.2** CSS loops as the boards draw them (transform/opacity), `prefers-reduced-motion` stops them; no JS timers; the filing tree on pages 5 to 8 reuses one component.
- **20.3** the Settings row "What is Bower" opens the nine pages with X (Close) and Done; the copy "The four-page intro, again" becomes "The whole story, in nine screens".
- **20.4** `HELP_ROWS` from the boards as data; the sheet component with the bird, "About this screen", the rows, Show me around + Ideas, "What is Bower, from the start"; in tour mode: "Tour · n of 4", Skip, Next: <tab> … Let's go, anchored over the highlighted tab; the tour runs once after onboarding and again from Settings; the demo uses the same sheets with its copy. Replaces `components/tour.tsx`.
- **20.5** as C.3; desktop centres the block vertically; phone unchanged.
- **20.6** the `IDEAS` groups from the board; Copy fills the Bower tab box and navigates to it.

---

## M21 · v3 Add and the tidy-up

| # | Title | Labels | Boards |
| --- | --- | --- | --- |
| 21.1 | Add on the phone: three doors, the link field, the share line; the drop zone only on desktop | app, feature, M, P0 | Phone-Add, Desktop-Add |
| 21.2 | The Added queue: type icon, the person's file name, the state, no Tidy up until the pile is in | app, feature, S, P1 | Phone-Add |
| 21.3 | What is this?: the context box, written as one context note per batch | app, feature, M, P0 | Phone-Add |
| 21.4 | The hint: "Add the whole pile first", with the count and the Tidy up button | app, feature, S, P1 | Phone-Add |
| 21.5 | Is that everything?: the confirmation sheet before every tidy-up | app, feature, S, P0 | Phone-Tidy-Confirm |
| 21.6 | The working sheet: opens once, the bird between Inbox and the folders, the rows as they land | app, feature, M, P1 | Phone-Working |
| 21.7 | Take a photo: the camera door on devices with a camera, hidden otherwise | app, feature, S, P2 | Phone-Add |

- **21.1** the rows in C.6 with their hint lines and icons; Choose files opens the file input; From your Drive opens the Picker; the link field with Save (enabled only with a value); the share line; desktop keeps the drop zone with the peeking bird. E2e: the three rows exist on the phone, the drop zone on desktop.
- **21.2** rows as C.6; the Save button never greys after a save; the queue survives navigation within the session.
- **21.3** Part D, D.2 first bullet: the note's frontmatter and body; the box is optional and cleared after the tidy-up starts; a "from now on" sentence in the box also goes to `Rules.md` (22.2). Unit test on the note text; the runner allow-list already covers app-written notes.
- **21.4** copy from C.6; the count comes from the index (already refreshed after an add, #300).
- **21.5** the sheet as C.6: Looking bird, count and cost sentence, Yes tidy up, Add more first; **no "Don't ask again"**; opened by the Inbox card, Add's hint and Do it now (22.5).
- **21.6** as C.6; the rows come from the run's progress (`run-progress.ts`); "Started n min ago" from the run's start; Close leaves it closed for the run.
- **21.7** `capture` input on touch devices with a camera; hidden elsewhere.

---

## M22 · v3 the Bower tab: rules, requests, activity

| # | Title | Labels | Boards |
| --- | --- | --- | --- |
| 22.1 | The Bower tab: the box without a selector, the "?" tip with examples, three segments | app, feature, M, P0 | Phone-Bower, Phone-Bower-Empty |
| 22.2 | Rules the app can read and write: `Rules.md` in topic groups, paused rules, the parser | app, agent, feature, M, P0 | Phone-Bower |
| 22.3 | Rules screen: explanation on top, groups with counts, Suggested from proposals, a rule's menu | app, feature, M, P0 | Phone-Bower, Phone-Rule-Menu |
| 22.4 | Rule kept at once: a "from now on" sentence goes to `Rules.md` without a run | app, feature, S, P1 | Phone-Bower-Requests |
| 22.5 | Requests: states, Do it now (an instructions-only run), Edit, Remove | app, api, feature, M, P0 | Phone-Bower-Requests |
| 22.6 | Activity: one card per tidy-up, what went where, set aside, in people's words | app, agent, feature, M, P1 | Phone-Bower-Activity |
| 22.7 | Proposals move from Health to the Suggested group; Health keeps a pointer | app, fix, S, P1 | Phone-Health |
| 22.8 | Retire the Tell composer and the conversation feed | app, chore, S, P2 | – |

- **22.1** one text area, Send, the tip with the `EXAMPLES` rotation and More ideas; segments Rules · Requests · Activity; first-time state with three chips. No Rule/Task/Question control anywhere.
- **22.2** Part D, D.3: the shape, `CLAUDE.md` and the interview and Accept write it; `rules.ts` parses groups, counts, dates, paused; write-backs (change, pause, resume, remove) through Drive with the optimistic refresh Accept uses; unit tests on parse and serialise round-trips; the agent ignores struck-through rules (a line in `CLAUDE.md`, a red-team case).
- **22.3** the explanation text always above the list; groups collapsed except the first; the paused chip; Suggested on top with Accept/Dismiss; the tapped-rule sheet with Change it (prefills the box), Apply to what is already filed (writes the job note), Pause/Resume, Remove.
- **22.4** the pattern in D.2 (starts with From now on / Always / Never / Every time); the app appends under the topic it guesses from the first noun or under "Everything else"; Requests shows Rule kept with "In your rules".
- **22.5** the states in C.7 from the instruction notes in `0-Inbox/` (waiting), the run in flight, `Answers/` (answered), `Rules.md` (kept); Do it now dispatches `/process` with `scope=instructions` (26.6) and opens the confirmation (21.5) with the count of requests instead of files; Edit opens the box prefilled and rewrites the note; Remove deletes the note from the inbox.
- **22.6** the runner's report (18.12) and `log.md` give the rows; renamed things show the new name; quarantined or unconverted items show as "Set aside: <reason in people's words>"; the last card is what Home's Last tidy-up links to.
- **22.7** as the title.
- **22.8** `tell-composer.tsx`, `routes/tell.tsx`, `tell.ts` feed parts removed; the instruction-note writer stays (shared by 21.3, 22.4, 22.5, the misfiled row).

---

## M23 · v3 notes, folders, files

| # | Title | Labels | Boards |
| --- | --- | --- | --- |
| 23.1 | A root folder explained: the line at the top, subfolders, files | app, feature, S, P1 | Phone-Folder |
| 23.2 | A project folder: files and notes together, newest first, who put each there | app, feature, M, P0 | Phone-Folder-Project, Desktop-Notes |
| 23.3 | A file, previewed: PDF, image, Google Doc as text; Open in Drive; the More menu | app, feature, M, P1 | Phone-File |
| 23.4 | A note from Bower: the conclusions box and What Bower used | app, agent, feature, M, P0 | Phone-Note, Desktop-Note |
| 23.5 | One More menu for note, file and folder, with Ask Bower about this | app, feature, S, P1 | Phone-Note-Menu |
| 23.6 | Notes tab: the tree, the Health row, the hidden-files line, no sort | app, feature, S, P1 | Phone-Notes |
| 23.7 | Ask Bower about this folder: the chip that opens the box with the folder named | app, feature, S, P2 | Phone-Folder-Project |

- **23.1** the meaning line per root from one table in the app (the same words as the drawer and the intro); counts; Bower's own files hidden.
- **23.2** `vault-index.ts` lists non-Markdown files (already there for pins?) with type and modified time; the origin line from `index.md`'s row or the file's `appProperties` ("filed by Bower", "your note", "from your Drive"); e2e on the demo fixture with a PDF and a photo.
- **23.3** `/file/:id` (or the note route by type): PDF first page through Drive's thumbnail link, images inline, Google Docs as exported text; Open in Drive; the More menu (23.5).
- **23.4** Part D, D.4 rendering: the box with three colours and words, the sources list; the note renderer recognises the two headings; unit test on the transform; the template in `CLAUDE.md` (26.4) produces it.
- **23.5** Pin to Home, Ask Bower about this (opens the box with the name), This was misfiled (#302), Open in Drive, Copy link, Edit the text (notes only); one component, three callers.
- **23.6** as C.5; the sort control is removed; the Health row and the hidden line at the bottom.
- **23.7** as the title.

---

## M24 · v3 desktop: one container, four breakpoints

| # | Title | Labels | Boards |
| --- | --- | --- | --- |
| 24.1 | One centred container: 980 px, 1200 with the About panel, the header row included | app, fix, M, P0 | Desktop-Responsive |
| 24.2 | Home on desktop: four equal cards on one grid, Pinned tiles, Recent in two columns, no Tell | app, feature, S, P0 | Desktop-Home |
| 24.3 | The Bower tab in three aligned columns above 1200 | app, feature, M, P1 | Desktop-Bower |
| 24.4 | The note and its About panel next to the measure | app, fix, S, P1 | Desktop-Note |
| 24.5 | Breakpoints 600 · 900 · 1200 and nothing above; Playwright screenshots at 1024, 1280, 1440, 1920 | app, chore, S, P1 | Desktop-Responsive |
| 24.6 | Settings and every single-column page share the Settings column | app, fix, S, P2 | Desktop-Settings |

- **24.1** `layout.tsx`: one `main` container `max-width: 980px; margin: 0 auto`, 1200 when the panel is open; the header inside it; the toast anchored to the container. The rule from the board is a Playwright assertion: at 1920 no element's right edge is within 40 px of the viewport's.
- **24.2** the grid as C.9; the Tell column is gone with 22.8.
- **24.3** three columns with one header height; the box spans the top; below 1200 the segments as on the phone.
- **24.4** the text column and the panel are one flex row centred in the container.
- **24.5** the breakpoints (#211 has 600/900/1200: verify, remove any others); screenshots in `app/e2e/` at the four widths for Home, a note, Add, the Bower tab, Settings.
- **24.6** as the title.

---

## M25 · v3 demo: the sales door

| # | Title | Labels | Boards |
| --- | --- | --- | --- |
| 25.1 | The demo's first visit: the nine intro pages with the banner and Try the demo, then the tour | app, feature, M, P0 | Demo-Intro |
| 25.2 | The banner on every screen: "This is a demo, not the real thing: sample notes, nothing saved · Run your own" | app, fix, S, P1 | Demo-Home |
| 25.3 | Tidy up in the demo is a recording: the confirmation's amber line, the working sheet's copy, the scripted run | app, feature, S, P0 | Demo-Tidy-Confirm, Demo-Working |
| 25.4 | Drive and push greyed with one sentence each; Add's doors in the demo | app, fix, S, P1 | Demo-Add |
| 25.5 | The demo never talks to anyone: an e2e that fails on any request to another host | app, chore, S, P0 | – |
| 25.6 | Run your own Bower: the screen and the runbook link; "What is Bower, in nine screens" | app, docs, feature, S, P1 | Demo-RunYourOwn |
| 25.7 | Fixture "Alex" with originals: a PDF, a photo, a Google Doc, a note from Bower with its box | app, chore, S, P1 | Demo-Home |

- **25.1** same components as 20.1 and 20.4 with the demo copy; the first visit flag in the demo is per browser as in the app.
- **25.2** one string, one component (`demo-banner.tsx`), the link to `/login` (Run your own).
- **25.3** the sheets from 21.5 and 21.6 with the demo lines from C.10; the scripted run (`demo/server.ts`) unchanged; Home's states play through it.
- **25.4** as C.10.
- **25.5** Playwright: route interception records every request; any host other than the page's fails the test; runs in CI on the demo build.
- **25.6** as C.10; the runbook link is the repo's `docs/runbook.md`.
- **25.7** the fixture gains the files the boards show so the folder screens and the note box have something to render.

---

## M26 · Agent v6: file only, context, runs

| # | Title | Labels | Boards |
| --- | --- | --- | --- |
| 26.1 | Ingest files only by default: originals into their PARA folder, no summary note | agent, feature, L, P0 | Brief |
| 26.2 | Sensible names for originals that have none; `index.md` lists files | agent, feature, M, P1 | Phone-Folder-Project |
| 26.3 | Context notes: What is this? applies to its batch; "from now on" inside it becomes a rule | agent, feature, M, P0 | Phone-Add |
| 26.4 | A note from Bower: the template with Bower's note, Why, What Bower used and the three markers | agent, feature, S, P0 | Phone-Note |
| 26.5 | Apply a rule to what is already filed: the job, the moves, the log | agent, feature, S, P1 | Phone-Rule-Menu |
| 26.6 | Instructions-only runs: workflow input `scope`, `run.sh` skips the rest of the inbox | agent, api, feature, M, P1 | Phone-Bower-Requests |
| 26.7 | Web lookup per user: the Settings switch, the Worker setting, the workflow input, `run.sh` | agent, api, app, feature, M, P1 | Phone-Settings |
| 26.8 | Failure reasons for people: the runner classifies, the Worker stores, the app shows | agent, api, app, feature, M, P0 | Phone-Working-Failed |
| 26.9 | `Rules.md` shape in `CLAUDE.md`: topic headings, paused rules ignored; red-team case | agent, feature, S, P0 | – |
| 26.10 | Runbook, vault template and README: file-only filing, originals next to notes, the web switch | docs, chore, S, P1 | – |

- **26.1** Part D, D.1 steps 1 to 9 in `vault-template/CLAUDE.md` Ingest and `agent/prompts/ingest.md`; the exceptions list; `Processed/` only for instruction notes, raw clips, unconvertible items; the report's new `Filed:` line; `bower_rules_version` bumped; the "Update Bower's rules" path carries existing vaults; smoke test fixtures updated; a red-team case that a filed PDF's text never becomes a rule.
- **26.2** the naming rule (keep a meaningful name; otherwise `<what it is>, <where or who>.<ext>` from the content), max 60 characters, never the person's name in a file name; `index.md` rows for files with type and folder; the app's search reads them.
- **26.3** D.2 first bullet in the Instructions workflow: `kind: context`, the named files, the batch semantics, the rule extraction; smoke test with a context note and two files.
- **26.4** D.4 template in `CLAUDE.md` and the Query workflow; only ✅ ⚠️ ❌; sources with origin.
- **26.5** the job note text, the walk over the rule's folders, `Correction:`-style log lines for each move.
- **26.6** `ingest.yml` input `scope` (default `all`), the Worker passes it from `/process?scope=instructions`, `run.sh` filters; a bash test.
- **26.7** D.5 web bullet; default off; the Settings row (18.6) enabled; docs.
- **26.8** D.5 failure copy: a small enum in the runner's report (`drive_unavailable`, `timeout`, `model_unavailable`, `vault_changed`, `unknown`), the Worker stores it on the run, the app maps it to the sentence.
- **26.9** as the title; the agent never edits a struck-through rule.
- **26.10** every user-visible change above in `docs/runbook.md`, `vault-template/README.md`, the root README's "how it works" step (filing, not summarising).

---

## Owner items (not issues)

1. **Google OAuth verification** for the `drive` scope, or the `drive.file` decision (Part D, D.7). Blocks nothing in the code; blocks every new person at the consent screen.
2. **Push on a real phone** (install to home screen, allow, run once).
3. **A file upload through the file input** on a phone (a photo and a PDF).
4. **A Google Doc through From your Drive** (the Docs → Markdown export).
5. **The canvas link** for whoever reviews the boards: the repo copy under `docs/design/v3/boards/` is the same content.

## Suggested labels, sizes and models for the implementing agents

Small (S) issues: any model; medium (M): the default; large (L: 18.12, 20.1, 26.1): the strongest available, with the board and Part D pasted into the issue. Every PR runs `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and, for app issues, the Playwright suite on the demo build; screenshots from the suite go into the PR when a board is involved.
