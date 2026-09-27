# App redesign: look, feel, mascot and first run

Date: 2026-09-27. Status: approved in review, not yet built.
Canvas with every screen and the animated mascot: https://claude.ai/artifact/P6YfjCY6M6shYfodTMVHB5 (private; ask the lead for access).

## 1. Goal

Make the app feel like Obsidian: quiet dark surfaces, a real file explorer, a quick switcher, reading-first notes. Keep the bowerbird as the brand and turn it into a mascot with a character that appears on every screen, explains the app the first time, and reacts to what the user does. Design every route, phone first, with the user experience as the deciding factor.

Everything in this document is approved by the lead. Sections 12 and 13 list what is deliberately left for later.

## 2. Non-goals (this round)

- Editing notes in the app. Reading only, as today.
- Linked mentions (backlinks) need a wikilink index the app does not have; the screens show the section, the first implementation may omit it. Phase 2.
- Per-message status in Tell Bower ("Answered", "Rule kept") needs the runner to report per instruction note. Phase 2; the screen shows the layout with what the app already knows ("Sent", "Tidying up").
- Tabs on desktop, graph view, plugins. Not planned.

## 3. Visual system

### 3.1 Surfaces and colour

Dark is the hero theme; light stays fully supported. The theme follows the system unless the user picks one in Settings (unchanged).

| Token | Role | Dark | Light |
| --- | --- | --- | --- |
| `--color-sidebar` (new) | Explorer, bottom nav, drawer | `#070c16` | `#f5f7fa` |
| `--color-bg` | Page | `#0b1220` | `#ffffff` |
| `--color-surface` | Cards, inputs, sheets | `#162033` | `#f1f5f9` |
| `--color-surface-hover` (new) | Hover, active rows | `#1c2942` | `#e8edf3` |
| `--color-border` | Dividers | `#263349` | `#e2e8f0` |
| `--color-text` | Text | `#e6ebf2` | `#0b1220` |
| `--color-text-muted` | Secondary | `#94a3b8` | `#475569` |
| `--color-brand-tint` (new) | Selection, callouts, tag pills | `rgb(45 212 191 / .16)` | `rgb(45 212 191 / .16)` |

Accents (teal `#2dd4bf`, deep teal `#0f766e`, amber `#fbbf24`, success, danger) do not change. `--color-text` in dark moves from `#f1f5f9` to `#e6ebf2` (softer on long reads); headings keep `#f1f5f9`. Re-run `scripts/brand/contrast.py` and update the table in `docs/brand.md` in the same PR.

### 3.2 Type

Three self-hosted web fonts, subset to Latin, woff2, cached by the service worker with the shell:

- Poppins 600/700: page titles, section titles, the wordmark, the greeting.
- Source Sans 3 400/600: body, UI, notes.
- JetBrains Mono 400: paths, file names, keyboard hints.

Budget: under 120 KB total. `font-display: swap`; the system stack stays as fallback in `--font-sans`. No Google Fonts request in production (privacy).

### 3.3 Motion

Three durations, two easings, transform and opacity only:

| Token | Value | Use |
| --- | --- | --- |
| `--motion-fast` | 120 ms | Hover, press, focus ring |
| `--motion-base` | 200 ms | Panels, sheets, drawer, toasts |
| `--motion-bird` | 320 ms | The bird's entrances and reactions |

Ease-out for entrances, ease-in-out for loops. Under `prefers-reduced-motion: reduce` nothing loops: the bird holds a pose and one dot pulses where progress is shown (as `bower-working.tsx` does today).

### 3.4 Icons

Stroke icons, 1.75 px, round caps, 20 to 22 px, `currentColor`, inline SVG. No filled icons, no emoji. The set used in the canvas: home, plus, chat, sliders, search, folder, note, inbox, chevrons, heart, menu, close, check, external, camera, file, link, bell, send, clock, more, tag, calendar, moon, sun, warn, wifi, trash, key, user, drive, shield, sort, collapse, eye, eye-off.

### 3.5 Shape

Unchanged radii (6/10/16 px). Cards get a 1 px `--color-border`; sheets a 20 px top radius. Touch targets stay at 44 px.

## 4. The bird

### 4.1 Drawing

The mascot is the mark. One drawing (v8.2, approved 2026-09-28), `viewBox 0 0 100 100`, facing right, feet on y = 91: round body (teal) with a lighter belly; round head on a same-colour neck that stretches and turns; one big navy eye with two white highlights and a faint lighter cheek; an upper and a lower eyelid in head colour (lower lid up = happy, upper lid down = worried or sleepy); a pill-shaped amber beak with a darker jaw that opens; one long leaf-shaped dark-teal wing lying along the flank, hinged at the shoulder (a positive rotation lifts its tip; there is no far wing); three thin dark-teal tail feathers fanning back and up from the rump; two amber stick legs with flat pill feet. Every part pivots on its joint in drawing units (tail on the rump, head at the base of the neck, wing at the shoulder, legs under the belly) so no rotation can detach it. The exact paths are in `docs/design/gen.py` (`BIRD_CORE`, `SCENE`) and become the single source in `scripts/brand/build.py`, which regenerates `logo.svg`, both wordmarks and every icon from it. The wordmark keeps Poppins Bold outlines.

Rejected on the way and not to be revisited: a static twig in the beak, a crest or comb, a white pupil-less eye, two eyes, a fat egg body, a far wing (v1 to v7).

Rules: white, warm light, slate or navy behind it; never on teal, amber or a photo; never mirrored except when the animation turns it round; never outlined, shadowed, gradiented or recoloured. It only holds a twig, paper or gem while carrying one. Lockups, app icon, favicon sizes, the one-colour version and clear space are drawn in `docs/design/screens/Logo.dc.html`.

### 4.2 Rig

Groups with a fixed transform origin, so every state is CSS on the same markup:

| Group | Origin | Moves |
| --- | --- | --- |
| `rig` | feet | breathe, hop, squash on landing, strut, fly |
| `turn` | feet | faces left or right (`scaleX(-1)`) |
| `hd` head (eye, beak, cheek) | neck | turns up to 16 degrees, leans, tucks |
| `ey` eye | centre | blink, wink, dilate, look left or right |
| `jw` jaw | hinge | chirp, sing |
| `wg` wing | shoulder | flap, flutter, spread, shrug |
| `tl` tail | base | flick, wag, settle, stream in flight |
| `ft` feet | top | tuck in flight |

Props (twig, paper, gem, notes, question mark, z, sparkles, cloud) are separate elements, hidden unless a state shows them.

### 4.3 States

| State | Where | Motion | Plays |
| --- | --- | --- | --- |
| Looking | Every idle bird: header, explorer footer, greeting | Breath, blink, head turns up, down, back; whole bird turns round every 11 s; tail flick | Loop |
| Hello | Sign-in, first open of the day, end of the tour | Flies in flapping with feet tucked, lands with a squash, tail settles, looks at you, two chirps, one hop | Once |
| Shiny | Search box on focus, a file over the drop zone, a link pasted | Eye grows, leans in, wing flutters, tail wags, two bounces | Loop while focused |
| Singing | Tell Bower while typing and right after send | Head up, jaw keeps the beat, three notes float off, tail wags | Loop while typing |
| Tidying up | Button and sheet during a run | Ferries a paper then a twig from inbox to nest; the nest fills, folder names appear | Loop until the run ends |
| Show-off | Run finished, tour finished, first note ever filed | Strut, deep bow, wing spread, tail fanned, sparkles | Once, then Looking |
| Confused | Run failed, note not found, not invited, 404 | Head tilts both ways, wing shrug, question mark | Slow loop |
| Building | Folder creation on first run, long first loads | Twig in beak, hops between two walls of twigs that go up stick by stick | Loop until done |
| Asleep | Empty inbox, nothing sent yet | Head tucked, eye shut, slow breath, two z | Loop |
| Peeking | Behind the drop zone; behind the search box before typing | Only the top of the head shows, eye follows the caret, head pops up | Loop |
| Offline | Offline banner, note not on this device | Puffed, desaturated, cloud above, slow blink | Still |
| Done | Small wins: upload done, message sent, settings saved | One hop, wink, chirp | Once, 2 s |

Five static faces from the same dials (jaw, eye, head): happy, curious, worried, sleepy, proud. Used in copy callouts and the brand sheet.

### 4.4 Implementation

One component, `app/src/components/bird.tsx`: props `state` (the table above), `face` (optional static face), `size`, `flip`, `reducedMotion`. It renders the shared markup plus a class per state; all motion is in `app/src/styles/bird.css` (keyframes from `gen.py`). No JavaScript timers except one: "plays once" states end by `animationend` and fall back to Looking. The current `bower-working.tsx` scene is rebuilt on this component (the tray-to-nest loop becomes the Tidying up state with the scene props) and its unit tests move with it.

Every bird is `aria-hidden`; the text next to it carries the meaning.

## 5. Navigation and structure

### 5.1 Phone

- Top bar: mark + "Bower" (Looking), the action pill **Tidy up (n)**, menu button that opens the explorer drawer.
- Bottom nav: Home, Add, Tell, Settings. Health is not in the nav: the Home bubble mentions a new report and links to it, and the drawer has a Health row with the "New" badge.
- Explorer drawer (new screen, from the menu button): "Your notes" title, sort and collapse-all buttons, a filter field that opens the quick switcher, a Health row, the folder tree with per-folder counts, then the hidden-files footer (5.3), then the account footer with sign out.
- Quick switcher (replaces the top-bar search): a sheet under the top bar with one field, Notes results (name and folder, match highlighted, cached snippet when available) and Commands (Tidy up the inbox, Add a file, Tell Bower, Switch theme). Opens from the Home search pill, the drawer filter field, and Ctrl/Cmd K on desktop. Escape or the close button dismisses it.

### 5.2 Desktop (900 px and wider)

Three columns: explorer 264 px (mark, switcher button with `Ctrl K` hint, primary nav with Inbox and Health badges, "Your notes" tree with sort and collapse, hidden-files footer, bird status card, account), content, and on note screens a 280 px "About this note" panel (Outline from headings, Linked mentions when available, In this folder). The action pill and theme toggle sit in the content header with the breadcrumb.

### 5.3 Bower's own files are hidden

The explorer, Recent, search results and the quick switcher show only the user's notes. Hidden by default:

- `CLAUDE.md` (shown as "Rulebook"), `index.md` ("Catalogue"), `log.md` ("Journal"), `About-Me.md` ("About me"), `README.md`, `Lint Report.md` and older reports ("Health reports").
- Instruction notes: files named `Bower - *.md` anywhere.
- Folder notes `_*.md` and `.obsidian/` stay excluded as today.

A footer button in the explorer ("Bower's own files: hidden / shown") and a Settings › Advanced switch ("Show Bower's own files", off by default, stored in prefs as `showAppFiles`) reveal them as one extra group at the bottom of the tree, separated by a dashed line and labelled "app", with the friendly names above. Opening one shows an amber banner: "One of Bower's own files. It tells the bird how to file your notes. You can edit it in Drive." Health keeps its own screen; the report file is just also reachable here.

The rule lives in one pure function (`isAppFile(path, name)` in `vault-index.ts`) used by the index, Recent, search and the switcher, with unit tests.

## 6. Screens

All copy in English, "your notes" and "your Bower folder", never "vault". Every empty or error state is one sentence spoken by the bird plus the next step.

| Route | Screen | What changes |
| --- | --- | --- |
| `/login` | Sign in | Bird Hello on a ground line, wordmark, one-line promise, "Sign in with Google", note that only invited people can sign in and Bower touches one folder, Privacy link. |
| `/not-invited` | Not invited | Bird Confused. Says which address signed in, who to ask, "Try another account", "Sign out". |
| `/onboarding` | Welcome, Where your notes live, Building | See section 7. |
| `/` | Home | Greeting by time of day with the bird (Looking) and a speech bubble stating the situation ("Three new things in your inbox. Shall I tidy up?"), search pill, Inbox and Answers count cards, Recent list (name, folder, relative time), "Updated n min ago". Offline: banner card with the bird Offline, action pill disabled, bubble "No signal here. I'll keep an eye out." Done: bird Show-off, bubble with the result, toast with a link. Empty inbox: bird Asleep. |
| `/note/:id` | Note | Back link with the folder name, Open in Drive, more menu. Title, properties row (tags as pills, created date, source), body with the reading measure (720 px on desktop), "Bower's note" callout with the mark, wikilinks teal with a dotted underline, Linked mentions when available, previous and next in the folder. Desktop adds the About panel. |
| `/add` | Add | Drop zone with the bird Peeking over its top edge (Shiny when a file hovers), "Choose files" and "Photo", a paste-a-link field, the upload queue (done, in progress with a bar and the bird flying with a paper, waiting), the "Tidy up right after adding" switch. Share-target arrivals land in the queue as today. |
| `/tell` | Tell Bower | A conversation: the bird's opening line, sent instructions as right-aligned bubbles with a status line under each, the bird's replies with links when the app knows them (phase 2 for status beyond "Sent"), example chips, composer with the bird Singing while typing, send button. History button opens the sent list. |
| Tidying up (sheet) | Over any screen | Title, the tray-to-nest scene, "n of m filed" with a bar (or indeterminate), "Started n min ago", the reassurance that closing is fine, and the list of items filed so far with their destination folder when the runner reports it. The pill shows the bird flying and "Tidying up…". |
| `/settings` | Settings | Account card (name, email, Drive link). Tidying up: "Tidy up right after adding", "Ping me when it's done", "Weekly health check" (the scheduled lint; tidy up itself is never scheduled). Look: Match my device, Light, Dark. Advanced: own Claude API key, "Show me around again", "Show Bower's own files". Sign out. Delete my account with the note that the Drive folder stays. |
| `/lint` | Health check | Bird Done with a bubble summarising the report date and count, three figures (notes, to fix, broken links), the findings list, "Ask Bower to fix these" which opens Tell Bower with the report referenced. Open report in Drive. |
| `/privacy` | Privacy | Reading page, current copy restyled. |
| default | Not found | Bird Confused, "I can't find that note", "Search for it", "Go home". |
| Push prompt | Sheet | Bird Singing, "Want a ping when I'm done?", shown after the first Tidy up, not at sign-in. Yes / Not now. |

## 7. First run

Shown once per account. The Worker records `tourSeenAt` on the user (new field, set through the existing settings endpoint) and returns it in `/me`; the app shows the tour when it is absent and the account has a folder, and skips it otherwise. "Show me around again" in Settings replays it without touching the flag.

1. Welcome: bird Hello, "Hi, I'm Bower." (the bird is Bower; no separate name), promise, "Show me around" or "Skip the tour". Skipping still goes through step 2.
2. Where your notes live: bird asks "Where should I build the nest?"; two cards, "Make a new Bower folder" (recommended) and "Use a folder I already have" with a link field; note that the folder can be moved later.
3. Building your bower: while `POST /vault` runs, the bird Building raises two walls and the six folders appear as chips; a progress bar; "Continue" when done (failure: bird Confused with the existing error copy).
4. Tour, three coach marks on Home with the screen dimmed and the target highlighted with a pulsing ring: Add (bird Shiny on the tab, "Drop anything here."), Tidy up (pill highlighted, "Nothing happens until you tap; there is no schedule…", with the tray-to-nest scene), Tell (bird Singing, two examples). "Skip tour" on every step, "Let's go" on the last, which ends with the bird Show-off on Home.

The tour marks the flag when finished or skipped.

## 8. Rename: Process becomes Tidy up

| Old | New |
| --- | --- |
| Process / Process (n) | Tidy up / Tidy up (n) |
| Queued… / Working… | Tidying up… (both phases; the sheet tells them apart) |
| Done ✓ | Done ✓ (unchanged) |
| Failed / Limit reached | Failed / Limit reached (unchanged) |
| "Press Process in the top bar to file them." | "Tap Tidy up and I'll file them." |
| "Bower is on it." | "Tidying up." |
| Process automatically after adding | Tidy up right after adding |

Tidy up is always on demand. No screen or copy may suggest a schedule; the only scheduled job is the weekly health check, named as such.

## 9. Data and API

- Prefs (local): add `showAppFiles: boolean` (false). Keep the rest.
- Worker user record: add optional `tourSeenAt: string`; expose in `/me`; accept in the settings update. No new endpoint.
- Nothing else changes in the Worker, the agent or the vault template.

## 10. Accessibility and performance

- Every control is a real `button`, `a` or input with a label; icon-only buttons carry `aria-label`; coach marks and sheets are dialogs with focus trapped and Escape to close; the drawer is a dialog on phone and a landmark on desktop.
- Contrast: body text 4.5:1 on every surface, muted text included; re-run the contrast script.
- The bird costs no requests (inline SVG) and no layout (transform and opacity only). Shell JS budget unchanged; fonts under 120 KB and cached.
- Reduced motion honoured everywhere the bird moves.

## 11. Testing

- Pure functions unit-tested: `isAppFile`, the tour gating (`shouldShowTour(me, prefs)`), the bird's state resolver (which class list for which state, reduced motion), the quick switcher's result merge, the rename in `labelFor`.
- Handlers: settings update with `tourSeenAt` happy path and rejection of a non-ISO value.
- Smoke: Home renders the greeting and the pill; the explorer hides app files by default and shows them with the pref on. Hermetic, as always.

## 12. Delivery

One issue and one PR each, in this order; each PR updates `docs/runbook.md` or UI copy as the rules require.

1. Tokens, fonts, motion: `tokens.css`, self-hosted fonts, `docs/brand.md` palette and contrast tables.
2. The bird: `bird.tsx`, `bird.css`, `scripts/brand/build.py` from the new drawing, regenerated icons, `bower-working.tsx` rebuilt on it.
3. Rename Process to Tidy up across app copy and docs.
4. Layout: desktop three-column shell, phone top bar and bottom nav, explorer drawer with sort and collapse.
5. Hidden app files: `isAppFile`, pref, explorer footer, Settings switch, the "Bower's file" banner.
6. Quick switcher replacing the top-bar search.
7. Home, Not found, Not invited, Login with the bird and its bubbles.
8. Note screen: properties row, callout, About panel on desktop.
9. Add screen: drop zone, queue, link field.
10. Tell Bower as a conversation (phase 1: sent bubbles and the bird's opening line).
11. Tidying up sheet and the Done state.
12. Settings and Health restyled, push prompt moved after the first Tidy up.
13. First run: welcome, folder choice, building, tour, `tourSeenAt`.

Phase 2, separate specs: linked mentions index; per-instruction status from the runner.

## 13. Open points

None blocking. Two the lead may revisit while building:

- Whether the light theme needs its own pass of the explorer colours once real notes are on screen.
- The exact easing values, to be tuned in the browser against the canvas.

## 14. Revision of 28 September

An audit of `main` after M6 to M9 (the app at 375 and 1280 px, the canvases, the README) redrew every screen. The findings and their severity are on `docs/design/screens/Audit.dc.html`; the issues are milestones M15 to M17. The decisions, in one place:

- **Phone top bar**, every screen: the menu button first (the drawer slides in from the left), then the wordmark on Home or the screen title (Add, Tell Bower, Settings) or the back link (a note, a folder), then the `actions` slot, then **Tidy up at the right edge**. A note shows back, Tidy up, More. Section 5.1 is superseded on this point.
- **No shell** on the sign-in, Not invited, Privacy, Terms, the onboarding and the intro.
- **One bird per screen.** The wordmark is text alone (phone bar, sidebar, drawer footer, Settings). The bird stays on the sign-in, the Home greeting, the sheets, the tour, the drop zone and the Tell bubbles. Bars and cards use Idle, never Looking. Offline: the banner is text with the wifi icon; the greeting bird is the sad one.
- **What is Bower** (`Intro-1` to `Intro-4`): four swipeable pages before the sign-in on the first visit (Skip top right, Next per page, Sign in on the last), again from Settings › Advanced › What is Bower (Close, Done) and from a link on the sign-in. Sign-in links Privacy · Terms · What is Bower?.
- **Add fills the inbox, nothing more.** "Tidy up right after adding" is gone everywhere (`autoProcessOnAdd`). Add shows the amber card: add a pile, tap Tidy up once. The tour's Tidy up step says why. Section 6 row Add and the Settings row are superseded.
- **Add from your Drive** (`Phone-Add-Drive`, `Phone-Drive-Picker`, `Desktop-Add`, `Onb-Drive`): a third button on Add opens the Google Picker over the whole Drive (the app already holds that scope); picks are copied into the inbox, Docs, Sheets and Slides exported on the way (Markdown, CSV, PDF), originals untouched. The first run asks once, after Building: "Start with what you have".
- **Hidden folders**: every folder whose name starts with "." (`.obsidian`, `.claude`, `.trash`, whatever another editor adds), plus `Processed`. `.claude` appears as "Agent settings" only with Bower's own files shown. Section 5.3 extended.
- **Folder screen** `/folder/<path>` (`Phone-Folder`, `Desktop-Folder`): name, counts, chips (Pinned, Ask Bower, Open in Drive), subfolders, notes newest first. The Answers card, breadcrumb segments, the desktop tree and pinned folders open it. The `#folder=` hash goes.
- **Pins** (`Phone-Home`, `Phone-Home-Pins`, `Phone-Pin-Sheet`, `Desktop-Home`): a note is pinned by frontmatter `pinned: <ISO time>`; a folder through its folder note `_<Folder>.md`. Order is pin time, newest first, no manual reorder. Home shows a Pinned section above Recent, hidden while empty; the desktop sidebar a Pinned group. Entry points: the note menu, a long press on a drawer row, a hover pin on a tree row, the Folder chip. The agent keeps `pinned` as it is.
- **Note menu** (`Phone-Note-Menu`): one More button; Pin to Home, Ask Bower about this note, Open in Drive, Copy link, Edit the text (last, with a hint; hidden for Bower's own files). The header link and the Edit button go. Editing exists and is not advertised.
- **Palette**: the soft set (`Brand.dc.html`): dark sidebar #0b1120, page #111a2b, surface #1a2538, hover #233049, border #2c3a54, text #dfe5ee; teal #5fcfbc, deep teal #2f9c8d, amber #f0b64f, success #7ed3a1, danger #ef8a8a; warm light set. Section 3.1 is superseded by the sheet.
- **Breakpoints**: 600 (content column 640 px, centred), 900 (sidebar), 1200 (the About panel). `Tablet-Home` and `Tablet-Note` are the 768 px reference.
- **Redundancies removed**: the inbox count appears on the pill and the Home card only (no sidebar Inbox row, no sidebar status card); Open in Drive once; the static "Weekly health check" row replaced by a sentence on the Health card and screen; `/lint` becomes `/health`.
- **README**: how it works in seven steps (filing its own), "What the bird does with your files" with one case per PARA letter, "What Bower is not" including "Not the only way in" (Obsidian, Google Docs, a file manager on the same folder). `Site-Readme-Section.dc.html`.
