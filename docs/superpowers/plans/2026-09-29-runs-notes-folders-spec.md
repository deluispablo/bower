# Runs, notes, folders: implementation spec (2026-09-29)

**For the technical lead.** This spec turns the design pass that followed test round 5 into requirements you can split into issues. It covers these parts of the round 5 report (`docs/testing/2026-09-29-round5-first-run-test-report.md`, untracked in the main checkout):

- section 9 groups 3, 5, 6 and 7;
- section 3;
- the owner's dictation idea.

It replaces nothing on main: the v4 boards and specs were removed in #726, so this was written from:

- the code at `905ed7d` (main, #726);
- the rulebook (`vault-template/CLAUDE.md`, `bower_rules_version: 20`, and `agent/prompts/`);
- the live instance at the build Settings reports.

**Boards.** Design canvas "Bower v5: runs, notes, folders", https://claude.ai/artifact/7tsURtgvEUuFrZQQWtZ7vx. It has 67 artboards on seven pages (Brief, System, Tidy-up results, Bower's notes, Folders and Compare, Add and dictation, Wireframes). It is private to the owner until they share it. The boards were not exported to the repo, because #726 removed boards from main. **Tie-break: the board wins over this text.**

**Verified in the live app** (29 Sep, signed in as the test user, read-only: no run, upload, edit or status change):

- Home, Just filed, Notes, the Job search and Applications folders, Compare on the phone, a job-offer note and a rental note at 375 and 1280;
- the Bower tab at 1280, and the desktop sidebar.

**Not verified live**: the "Tidying up" sheet in its states and Add with a picked file, because both need a real run or upload. Those designs come from the code and the report.

**Out of scope**, owned by the lead:

- security 4.1 and 4.2;
- performance 1.8;
- the backend P0s 1.1 and 1.9 (the runner's turn cap and its all-or-nothing behaviour);
- Files 1.4 and 1.5;
- rules 3.7 and splitting mixed messages;
- `Processed` 3.3.

This spec only asks the runner for the data the screens need (section 7).

## 1. Brief and decisions

- **Goal.** After every tidy-up a person knows at a glance, in the same words everywhere, what Bower created, changed, moved and could not do. The notes Bower writes say where they came from and what matters now. Folders, overlays and tips behave the same on every screen.
- **Audience.** The owner and the people they invite. That includes new users who read every label literally, and people who come back daily on a phone (375) and a laptop (1280).
- **Piece.** Boards at 375 and 1280 for every touched screen, wireframes of each layout, six system boards, and this spec.
- **Constraints.**
  - Bower's tokens and fonts; UI copy in plain English with no jargon (`CLAUDE.md`).
  - D1 still holds: the app never moves or renames anything itself; Bower does, now or at the next tidy-up.
  - The vault is the only state; no new runtime dependency; free tiers.
- **Done when.** Every finding listed above has a board and an R-ID here, and the lead can split this into issues without a question.

| # | Decision | Why |
|---|---|---|
| D1 | One run result with four counts: **filed**, **new notes**, **updated**, **needs you**. The same words and order on the chip, the tidy-up sheet, Home, Just filed and Requests. | Five screens now use four different vocabularies ("processed", "filed", "Nothing new to process", "Nothing new this time", "0 things"). Findings 1.11, 2.1, 2.2. |
| D2 | The app writes every result sentence from the counts. The agent's `added` clause is shown only as the bird's quote, cleaned (one full stop, no internal words). | Removes jargon and the double full stop at the source (2.2). |
| D3 | A run that wrote work and then failed is **Partly done** (amber) with one action, **Finish the tidy-up**. **Did not finish** (red) is only for a run that changed nothing. | 1.9: "Nothing was lost … before Bower could finish" hides work that exists. |
| D4 | Two overlay kinds only. A **modal** (a bottom sheet on phones; a 440 px right panel or a centred 440 px dialog on desktop) or the **non-blocking tidy-up chip**. One modal at a time; later ones wait in a queue. | 1.7 and the round 5 log (tour over the run card, two overlays at once). |
| D5 | The desktop floating run card is removed. The chip lives in the desktop top bar and docks above the tab bar on phones, and the page makes room for it. | 1.7, and the card covering Compare's columns at about 800 px. |
| D6 | Every note Bower writes opens with **Bower's insights**: summary (up to three lines with origins), key facts (1 to 4), what to check. Originals are never changed. | Owner ruling 3.4. |
| D7 | When a rule or a fact changes, Bower rewrites the insights box to the present. A blue "Updated … · what changed" line keeps one line of the past behind a disclosure. | 3.8: a note must read true top-down. |
| D8 | Key facts appear **once**, inside the insights box. The separate Key facts block, its caption and the desktop panel's copy go. | 3.14: key facts appear two or three times on one page. |
| D9 | A Bower note's header says what it was **made from**: the original file and the web page, as two buttons. | 1.13, 3.2, and the owner's ruling on 3.2. |
| D10 | "By Bower" has one rule. The rulebook writes `by: bower`, and the app uses a single `isBowerWritten()` for rows, filters, counts, preview and page. | 1.3: three rules disagree today. |
| D11 | Folder order: header, header actions, view switch, filters and sort, then **one list with folders first**. | 3.9, following Drive and Finder. |
| D12 | Desktop shows the path **once**, in the top bar. The in-content path bar goes on desktop and stays on phones only. | 3.13. |
| D13 | The sidebar is resizable (200 to 480 px) through a keyboard-reachable separator. Tree rows get the full name as tooltip and accessible name. | 3.12. |
| D14 | **Rename…** is in More and works like Move: Bower renames, now (an instructions-only run) or at the next tidy-up, and keeps the id and links. | 3.5 within D1. |
| D15 | Compare sorts on phones through a Sort sheet. A number a rule added (`score`) becomes a sortable **Your score** column and the first key fact. | 1.10. |
| D16 | Tips, suggestions and explanations are one `Hint` component. It sits next to what it explains, one per screen, and is dismissed for good on each device. Explanations at the end of lists become an (i) popover. | 3.11. |
| D17 | Add uploads a picked file at once, like a link. "What is this?" is a draft kept on the device until it is written as the context note. Leaving while an upload is in flight asks first. Every count on Add is the same number. | 1.2. |
| D18 | A microphone for dictation in every box where people write sentences, where the browser supports speech recognition. Where it does not, a one-time tip points to the keyboard's own microphone. | Owner idea (report section 6). |
| D19 | Bower note titles: at most 40 characters, most specific word first. Lists wrap a title to two lines on phones instead of cutting it at one. | 3.6. |

**Owner decisions still open:** Q1 and Q2 in section 9. Both have a recommended default, and the designs use it.

## 2. Design review

My own walkthrough (29 Sep, 375 and 1280, new and experienced personas), on top of the report. Tags: BUG, DESIGN, UX, A11Y, IDEA, WORKS. Severity is P0, P1 or P2.

| # | Route, viewport | Observation | Tag | Sev | Oracle |
|---|---|---|---|---|---|
| W1 | `/just-filed`, 375 | The latest group shows six bare names, then two raw log lines ("Moved: Inbox / Bower - … Context.md → Inbox / Processed / …"). "Earlier tidy-ups" lists a Do-it-now run as "0 things" and hides the two failed runs. | BUG | P1 | Report 2.1; copy rules |
| W2 | Bower tab › Activity, 1280 | The two failed runs that wrote notes say "Nothing new this time." Activity repeats the raw Moved lines. | BUG | P1 | Truth (Nielsen 1) |
| W3 | Bower tab › Requests | Only the rule is listed. The four jobs of the day (insights, profiles, apply the rule) have vanished, and none shows as done. | BUG | P1 | 1.11; recognition over recall |
| W4 | `/folder/…/Applications`, 375 | The four job offers read "Note · written by you". The CVs and cover letters read "answer to your question", though they were jobs. Titles are cut at one line ("Tailored cover letter for Senior Data Eng…"). | BUG | P1 | 1.3, 3.6 |
| W5 | Compare, 375 | Every card value is cut ("$150,000 – $1…", "Multiple state…"). "a year" sits under a range. The only control is "Default order", which does nothing. There is no score. | UX | P1 | 1.10 |
| W6 | Rental note, 375 and 1280 | "AUD n/week" over "a month". "Original:" is empty. Key facts appear three times at 1280: in the box, in the block, and in the About panel. The About panel's "Original" shows a raw `[[…]]` wikilink. | BUG | P1 | 1.12, 1.13, 3.14 |
| W7 | Job-offer note, 375 | Only two of the four key facts show (starts and reply by are empty). The score lives only in the box text. There is no link to the advert or the clip. The pager "← … 9 of 9" counts CVs and letters as offers. | UX | P1 | 3.2, 3.14 |
| W8 | Folder rows and tree, 375 and 1280 | Tree folder links have no accessible name (the name is in a child span, the link itself is empty in the accessibility tree). Rows concatenate name, "N new" and count. | A11Y | P1 | WCAG 4.1.2 |
| W9 | Folder header, 1280 | The path is shown twice (top bar and content). The pills are 4 px padded with underlined text. | DESIGN | P2 | 3.10, 3.13 |
| W10 | Folder, 1280 | The preview pane says "Filed by Bower today" for a row the list calls "written by you". | BUG | P2 | Consistency (Nielsen 4) |
| W11 | Phone top bar on a note | The back label is cut to one letter ("‹ A", "‹ M"). | UX | P2 | Recognition |
| W12 | Home, 1280 | Four cards with equal weight. "Last tidy-up · 6 filed" hides the notes written and updated. | UX | P2 | D1 |
| W13 | a rental area folder, 375 | A tap on one row opened a different note, once. Not reproduced, so it is not filed as a bug. Worth a look at virtual-list row keys when rows reorder after `noteMeta` loads. | RISK | — | — |
| W14 | Note page, both | The Bower's-note box, the origin squares and the legend read well, and the "Check" tag is clear. | WORKS | — | — |
| W15 | Folder keyboard, 1280 | Arrows, Space and Enter work as the hint says. | WORKS | — | — |

**Conclusions.**

- **The three things that hurt most:**
  1. After a run the app tells a different and often false story on each screen (W1 to W3, 1.9, 1.11). This is the product's key moment.
  2. Bower's own notes do not say what they are, where they came from, or what is current (W4, W6, W7, 3.8).
  3. Overlays and tips follow five different models (1.7, 3.11).
- **Cheapest wins:**
  - one `isBowerWritten()` plus `by: bower` (S + S);
  - the money period in key facts (S);
  - header buttons and a single desktop path (S).
- **Ideas nobody asked for:**
  - The tidy-up chip. It solves "Is it still going?" without covering content; borrowed from GitHub Actions' run status and Linear's inline sync state.
  - The **Partly done → Finish** path. It turns the worst moment of round 5 into one tap.
  - The Sort sheet with "Your score" first. The owner asked for the score; a rule-added number is the person's own measure.
- **What I would not change:** the Bower's-note box with origin squares, the folder keyboard model, the PARA marks, Compare's desktop table.

## 3. Ideas and references

**How might we …**

1. … let a person trust what a tidy-up did without reading a log? (goal)
2. … show a job that runs for minutes without blocking or hiding the app? (constraint)
3. … make a note Bower wrote feel like a colleague's brief rather than a file dump? (emotion)

**Ideas considered** (the chosen ones are marked ✓):

- ✓ A four-count summary, one component.
- A timeline of every file.
- An email-style digest.
- ✓ A chip that replaces the sheet.
- A progress ring on the Home tab.
- Push only.
- ✓ Partly done with Finish.
- Automatic retry.
- ✓ Steps as in CI.
- A live log.
- ✓ The insights box on every Bower note.
- A separate "Bower's view" tab.
- Side-by-side original and insights.
- ✓ Made-from buttons.
- An inline citation per fact.
- ✓ Key facts only in the box.
- ✓ Folders first in one list.
- A split tree and list on phones.
- ✓ A resizable sidebar.
- A collapsible rail.
- ✓ Rename through Bower.
- Rename in place.
- ✓ The Sort sheet.
- Swipe to sort.
- ✓ The Hint family.
- A coach-mark-only tour.
- ✓ Upload on pick.
- An offline queue in IndexedDB.
- ✓ The Web Speech mic.
- Record audio into the inbox.

**Benchmark: current app against references.**

| Feature | Bower today | Google Drive | Finder | Obsidian | Notion | GitHub Actions / Linear | Target |
|---|---|---|---|---|---|---|---|
| Folders first in the list | partial (separate block above filters) | has ("Folders on top") | has (sort option) | has | has | — | has |
| Sort and filter at the top | partial (under folders) | has | has | has | has | — | has |
| One path indicator | missing (twice on desktop) | has | has (path bar) | has (tab title) | has (breadcrumb) | — | has |
| Resizable sidebar | missing | has | has | has | has | — | has |
| Full name when truncated | missing | has (tooltip) | has | has | has | — | has |
| Rename | missing | has | has | has | has | — | has, through Bower |
| Long job: non-blocking status | partial (sheet stays over the page) | has (upload chip, bottom left) | — | — | — | has (run status in the header, Linear's sync badge) | has |
| Result summary with counts | missing | partial ("3 uploads complete") | — | — | — | has (per-step status, summary) | has |
| Partial failure named | missing | has ("2 failed", retry) | — | — | — | has (failed step, re-run failed jobs) | has |
| Source of a derived note | missing | — | — | partial (links) | partial (a "Created from" property) | — | has |

**References borrowed** (patterns only, no assets or copy):

- **GitHub Actions**: steps with status icons, and "re-run failed jobs", which became Finish the tidy-up.
- **Linear**: a small persistent sync or status indicator instead of a modal.
- **Google Drive**: the upload panel's per-file status and retry, and "Folders on top".
- **Finder** and **Obsidian**: a draggable sidebar edge.
- **Notion**: page properties at the top of a page for provenance.

**Open-source pointers.**

- None needed. Web Speech is a browser API.
- The sidebar resize is about 60 lines of pointer events.
- No dependency is proposed, so there is no licence question.

**Scored directions for the run result.**

| Direction | User value | Brand fit | Cost | Risk | Reach | Choice |
|---|---|---|---|---|---|---|
| A. Chip, sheet, one four-count model | high | high | M+M | low | every run | **chosen** |
| B. Push notification plus Home only | medium | medium | S | the tab stays unaware | people who allow push | lost: nobody sees it in the app |
| C. Full-page run view with a live log | medium | low (jargon) | L | logs leak internal words | every run | lost: too technical |

**Sources.**

- [GitHub job summaries](https://github.blog/news-insights/product-news/supercharging-github-actions-with-job-summaries/)
- [Drive: view and reorder files and folders](https://support.google.com/drive/answer/2375177)
- [Obsidian sidebar](https://help.obsidian.md/sidebar)
- [Web Speech API support](https://www.testmuai.com/learning-hub/speech-recognition-api-browser-support/)
- [WebKit speech notes](https://developer.apple.com/forums/thread/775699)

## 4. Boards

Canvas pages and artboards. Every screen × state below is **changed** against the current app unless marked.

| Page | Artboards | States covered |
|---|---|---|
| Brief | Brief (`Main`) | the brief and D1 to D19 |
| System | System-Overlays, System-Hints, System-RunResult, System-Insights, System-HeaderActions, Tour-375, Help-1280 | the overlay model and queue, the z and scrim tokens, the hint variants, chip states and counts, insights anatomy and the rule-change line, header buttons before and after, the tour as a modal, help as a right panel |
| Tidy-up results | Home-Running/Done/Partial ×375, ×1280; Confirm-Tidy ×2; RunSheet-Running/Done/Partial ×2; JustFiled ×2; Requests ×2 | running, done, partly done; confirm; run sheet on the phone and desktop panel; Just filed as a table; requests waiting, running, done, failed |
| Bower's notes | Note-JobOffer ×2, Note-Rental ×2, Note-Summary ×2, Note-RuleChanged ×2, Note-Converted-375 | a kind with score, a kind with a weekly price, a kind-less note, the rule change with "What changed" open (375), a converted document pointing to its insights |
| Folders and Compare | Folder-List ×2, Sidebar-Default-1280, Sidebar-Resize-1280, Compare-Cards-375, Compare-Sort-375, Compare-Table-1280, More-Rename-375, Rename ×2 | folder with a subfolder first, the suggestion hint, the resize handle idle and dragging with a tooltip, phone sort, desktop Score column, More with Rename, the Rename dialog |
| Add and dictation | Add-Uploading-375, Add-Dictating-375, Add-Leave-375, Add-Uploading-1280, Dictate-Bower-375, System-Dictate | uploading, in inbox, failed with retry, draft saved, leave warning, listening, first use, blocked, not available |
| Wireframes | Wire-* (16) | the grey structure of Home, run sheet, Just filed, Requests, job note, folder, Compare and Add at both widths |

**Unchanged and not drawn:**

- the Is-that-everything copy apart from the counts line;
- the note body renderer;
- the folder grid view;
- the file page (1.4 is out of scope).

**Breakpoints.** The boards show 375 and 1280. The 900 and 1200 breakpoints follow the existing rules:

- below 900: the phone layout;
- 900 to 1199: desktop with the sidebar, and the note's About panel hidden;
- 1200 and up: panes.

## 5. System changes

**Tokens**, added to `app/src/styles/tokens.css` and `docs/brand.md`, light / dark:

| Token | Light | Dark | Use | Contrast check |
|---|---|---|---|---|
| `--color-scrim` | `rgb(7 12 22 / .5)` | `rgb(5 9 18 / .62)` | every scrim (replaces 4 hard-coded values) | — |
| `--color-warn` | `#9a6408` | `#f0b64f` | Partly done, Needs you, Check | 5.0:1 on #faf9f6; 9.6:1 on #1a2538 |
| `--color-warn-bg` | `rgb(154 100 8 / .1)` | `rgb(240 182 79 / .12)` | warn boxes | text uses `--color-text` |
| `--color-danger-bg` | `rgb(225 32 32 / .08)` | `rgb(239 138 138 / .12)` | Did not finish | — |
| `--color-success-bg` | `rgb(45 130 80 / .1)` | `rgb(126 211 161 / .12)` | done steps, high score | — |
| `--color-updated` / `-bg` | `#2f63b8` / `.18` | `#93c5fd` / `.2` | the "Updated" tag and the rule-change line (the same values as `--color-origin-web`) | 5.6:1 and 8.9:1 |
| `--z-chip` `--z-toast` `--z-scrim` `--z-overlay` `--z-viewer` | 30, 35, 40, 41, 100 | same | the stacking order | — |
| `--radius-sheet` | 20px | same | the sheet's top corners (was hard-coded) | — |
| `--sidebar-width` | 264px default, clamp 200 to 480 | same | now a variable set from a preference | — |

The light `--color-danger` #e12020 fails 4.5:1 for small text on `--color-danger-bg`. For text on that background use `#c21b1b` (5.9:1), as the boards do. Escalation: this is a token value change the lead should confirm.

**New components** (`app/src/components/`):

- **`overlay.tsx`**. Props: `kind: 'sheet' | 'dialog' | 'menu'`, `labelledBy | label`, `onClose`, `children`, optional `desktopPlacement: 'right' | 'center' | 'anchor'`. It owns:
  - the scrim;
  - `inert` on the app root (`#app > .shell`);
  - body scroll lock;
  - `useFocusTrap`, Escape, and return focus;
  - the enter animation (transform and opacity, `--motion-base`; opacity only under `prefers-reduced-motion`).

  It renders through one `OverlayHost` mounted in `layout.tsx`. A module store `overlay-queue.ts` enforces one open overlay: `open(entry)` returns `'shown' | 'queued'`, and priority follows System-Overlays. Every existing overlay migrates onto it (R-OVL-2).
- **`run-chip.tsx`**. Props: `phase`, `summary` (from `RunOutcome`), `onOpen`. States: running, done, partly done, did not finish. It has `role="status"` and `aria-live="polite"`. It is a real `<button>` or link with the full sentence as its accessible name. Placement is by layout.
- **`run-summary.tsx`**. It renders `RunOutcome` in two sizes:
  - `stats`: four tiles, zeros greyed;
  - `inline`: "6 filed · 6 new · 2 updated · 1 needs you", zeros left out.
- **`hint.tsx`**. Props: `id` (the dismissal key), `variant: 'tip' | 'suggestion' | 'state'`, `icon`, `children`, `actions?`. Dismissal is kept in `localStorage` under `bower:hint:<id>` (per device, no sync). The `state` variant has no dismiss button.
- **`info-pop.tsx`**. An (i) button (44 px) with `aria-expanded`, opening a small popover (`role="dialog"`, non-modal, closes on Escape or outside tap).
- **`header-action.tsx`**. The button style on System-HeaderActions:
  - 44 px high, `0 14px` padding, 8 px gap, `--radius-md`, 1 px border, surface fill;
  - 14 px semibold label, 17 px icon, no underline;
  - `aria-pressed` when it toggles.
- **`dictate-button.tsx`**. It wraps a textarea. States: ready, asking, listening, blocked, not available. See R-DICT.
- **`insights-box.tsx`**. Replaces the top `.bower-note` rendering for the page. It takes the parsed callout lines, the key facts, the "What to check" items, `bowerUpdated`, `bowerChange` and `detailsCount`.
- **`made-from.tsx`**. Up to two source buttons, the original and the web page.

**Changed components:**

- `working-sheet.tsx` becomes the content of an Overlay sheet, and loses its fixed desktop card.
- `key-facts.tsx`:
  - it reads the period from the value (R-KF-1);
  - its caption is removed from the note page;
  - it accepts a leading score tile.
- `tree.tsx`: names and tooltips.
- `folder-items.tsx` and `folder.tsx`: order and header.
- `compare.tsx`: the Sort sheet and extra columns.
- `note.tsx`: the header, insights and pager.
- `about-panel.tsx`: no key facts.
- `add.tsx`: upload on pick and a draft.
- `bower.tsx`: request states.

**Motion.** The chip changes state with a 120 ms cross-fade. The spinner is replaced by a static icon under reduced motion. The sheet and panel use `--motion-base` and `--ease-out`.

## 6. Per screen

### 6.1 The run result model (`RunOutcome`) — R-RUN

- [ ] **R-RUN-1.** `app/src/run-outcome.ts` (new, pure) turns a `Run` (Worker) or a `LastRunOutcome` (`.bower/last-run.json`) into one `RunOutcome`:
  ```ts
  {
    state: 'running' | 'done' | 'partial' | 'failed';
    startedAt; finishedAt?;
    filed; created; updated; needsYou;
    items: OutcomeItem[];
    quote?: string;
    reason?;
  }
  ```
  - `OutcomeItem` is `{ action: 'new' | 'updated' | 'filed' | 'needs', title, path, from?, to?, note? }`.
  - `filed` counts `items[kind=file].to`.
  - `created` and `updated` come from the new runner fields (R-RUNNER-1).
  - `needsYou` = `setAside.length + left.length`.
  - `state` is `partial` when the run failed and `created + updated + filed > 0`.
  - The context note and instruction notes are never items or counts.
  - Unit tests: done, done with no filing but with updates (the 1.11 case), partial (the 1.9 case), failed with nothing, a recovered stale run from `last-run.json` with full items (R-RUNNER-2).
- [ ] **R-RUN-2.** `runSentence(outcome)` is the only source of result text. Copy table:

  | ID | State | Text |
  |---|---|---|
  | RUN-S1 | done | "Done {ago}: {inline counts}." Zeros are left out, in the order filed, new notes, updated, needs you. |
  | RUN-S2 | done, all zero | "Nothing new: the inbox was empty." |
  | RUN-S3 | partial | "I wrote {created} notes, then stopped before filing your {left} things." |
  | RUN-S4 | failed | "{reason sentence} Nothing changed; your {n} things are still in the inbox." |
  | RUN-S5 | running | "Tidying up {n} things. It takes a few minutes; you can keep adding." |

- [ ] **R-RUN-3.** `cleanQuote(added)`:
  - trims the text;
  - drops a trailing full stop;
  - caps it at 200 characters.

  The UI adds exactly one full stop. The copy rule "no internal words" is enforced in the rulebook (R-AG-6), not by filtering.
- [ ] **R-RUN-4.** Every result surface uses `RunOutcome`: the chip, the sheet, Home's bubble and card, Just filed, Activity cards, Requests' done rows, the done toast, and the push body (Worker, R-RUNNER-3). Grep test: no string "processed", "Nothing new to process" or "Nothing new this time" left in `app/src`.

### 6.2 Tidy-up chip — R-CHIP (boards Home-*, System-RunResult)

- **Route.** Every signed-in route. Hidden in onboarding and on `/welcome`.
- **Layout:**
  - **Phone:** fixed, 12 px from the sides, 8 px above the tab bar, 52 px high. The content area gets `padding-bottom: 60px` while the chip shows.
  - **Desktop (≥900):** inside the top bar, before help. It is a pill 36 px high in a 44 px target.
- **States and content:**

  | State | Phone text | Desktop text | Action | Accessible name |
  |---|---|---|---|---|
  | running | "**Tidying up 6 things** · 2 min" | "**Tidying up** 6 things · 2 min" | opens the sheet | "Tidying up 6 things, 2 minutes so far. Show progress" |
  | done | "**Done** · 6 filed, 6 new, 2 updated" + "See" | "**Done** 6 filed · 6 new · 2 updated" | opens the sheet | "Tidy-up done: … See what changed" |
  | partial | "**Partly done** · 5 still in your inbox" + "Finish" | same | opens the sheet | "Tidy-up partly done, 5 things still in your inbox. Finish it" |
  | failed | "**Did not finish** · nothing changed" | same | opens the sheet | "Tidy-up did not finish. Nothing changed. Show why" |

- **Lifetime:**
  - Running shows while the phase is queued or running.
  - Done, partial and failed stay until the sheet has been opened, or for 24 h.
  - The "seen" flag is kept per device (`bower:run-seen:<runKey>`).
- **Interactions.** Tap or Enter opens the tidy-up sheet (R-SHEET). There is no dismiss button: opening it is the acknowledgement.
- **Acceptance criteria:**
  - [ ] R-CHIP-1: `run-chip.tsx` renders the four states with the texts above; unit test per state.
  - [ ] R-CHIP-2: phone placement never covers content: the last list row stays fully visible when scrolled to the end (e2e at 375).
  - [ ] R-CHIP-3: desktop placement is in `layout.tsx`'s top bar; the old `.working-sheet` desktop card CSS (`bower-working.css` ≥900 block) is deleted.
  - [ ] R-CHIP-4: `role="status"`; the state change is announced once; the chip is a focusable control with the accessible name above.
  - [ ] R-CHIP-5: the chip hides on onboarding and the welcome routes.

### 6.3 Tidy-up sheet — R-SHEET (boards RunSheet-*)

- **Entry:**
  - "Yes, tidy up" opens it once, at the start of a run.
  - After that, only the chip opens it.
  - It never opens by itself while another overlay is open (queue, R-OVL-1).
- **Layout.** It is an Overlay `sheet`: a bottom sheet on phones (max 90% height, the content scrolls inside) and a right panel of 440 px on desktop.
- **Element inventory, top to bottom:**
  1. Status icon: spinner, check (success), warn triangle, or cross.
  2. h2 "Tidying up 6 things" / "Done" / "Partly done" / "Did not finish".
  3. Time line: "Started 13:52 · 2 min so far · usually 3 to 6 min", or "13:52 to 13:57 · 5 min".
  4. Close button (44 px, "Close").
  5. Running only: **steps**, four rows with a status icon, a name and a detail. The names are "Got your inbox", "Read {n} things", "Writing notes" ({k} of {n} when known), "Filing and saving to Drive". The data comes from R-RUNNER-4. Without phases, the steps collapse to one indeterminate row, "Working on it".
  6. Done and partial: `run-summary` stats (four tiles; "needs you" and "still in inbox" are amber when above 0).
  7. Done: the quote with the bird (RUN-quote), when `quote` is present.
  8. Partial: a warn box with RUN-S3, the link to the folder that holds the new notes, and "**Finish the tidy-up** files them without writing the notes again." Then the steps, with the failed one marked "stopped".
  9. The rows (done, and running once known): an icon (34 px); the name, wrapping to 2 lines, left-aligned, then ellipsis; the where-line with a PARA mark and a path; an action tag (New note, Updated, Filed, Needs you). This replaces the centred bubbles of 2.3. On the phone at most 4 rows, then "See everything".
  10. Actions:
      - Running: "Close".
      - Done: "See everything" (goes to `/just-filed?run=<key>`) and "Close".
      - Partial: "Finish the tidy-up" and "Not now".
      - Failed: "Try again" and "Not now".
  11. Running only: the note "You can close this. Bower carries on; the bar at the bottom shows how it goes." On desktop it reads "the chip at the top".
- **Interactions:**
  - "Finish the tidy-up" and "Try again" go straight to the confirm dialog with the counts filled in. This is two steps, not three (round 5 log J1).
  - Closing is optimistic, and the run continues.
- **Data.** `RunOutcome` from the run store. Polling stays as it is.
- **Accessibility:**
  - `role="dialog"`, `aria-modal`, labelled by the h2;
  - the stats are `role="list"`;
  - the steps are a list with state text for screen readers ("done", "in progress", "not started", "stopped").
- **Edge cases:**
  - Long names wrap to two lines.
  - Over 20 items: the phone shows 4, the desktop 8, then "See everything".
  - A run started on another device: the chip shows it, and the sheet does not open by itself.
  - Stale: "Did not finish" with the `unknown` reason.
- **Cost:** M, rebuilt on Overlay. Depends on R-RUNNER-1 and R-RUNNER-4 for the full content, and degrades without them.
- **Acceptance criteria:**
  - [ ] R-SHEET-1: `working-sheet.tsx` renders inside `Overlay kind="sheet"`: it has a scrim, the app behind is inert, and the page cannot scroll or be tapped (e2e: a tap on a Recent row behind does nothing).
  - [ ] R-SHEET-2: four states as on the boards, with the copy above.
  - [ ] R-SHEET-3: rows are left-aligned, wrap to 2 lines, and carry an action tag (fixes 2.3).
  - [ ] R-SHEET-4: Partial offers "Finish the tidy-up", which opens the confirm dialog directly.
  - [ ] R-SHEET-5: steps render from `phase` when present, and fall back to one indeterminate step otherwise.
  - [ ] R-SHEET-6: "See everything" links to Just filed for this run.

### 6.4 Is that everything? — R-CONF (boards Confirm-Tidy-*)

- **Changes:**
  - It is an Overlay dialog: a bottom sheet on the phone, centred at 440 on desktop.
  - The counts line uses one number: "6 things in your inbox" with the breakdown "4 files, 2 links · and 1 request".
  - It is labelled by its title (fixes the missing `aria-labelledby`).
- **Copy:**

  | ID | Text |
  |---|---|
  | CONF-1 | "Is that everything?" |
  | CONF-2 | "Tidy up now, or add the rest of the pile first." |
  | CONF-3 | "{n} things in your inbox" |
  | CONF-4 | "{files} files, {links} links · and {r} request(s)" |
  | CONF-5 | "A tidy-up takes a few minutes and uses one run of your Claude plan." |

  Buttons: "Yes, tidy up" and "Add more first".
- **Acceptance criteria:**
  - [ ] R-CONF-1: `tidy-confirm-sheet.tsx` is on Overlay, with `aria-labelledby` pointing at the title.
  - [ ] R-CONF-2: the count equals the Add button's count and Home's inbox count at the same moment (a shared `pendingCount`).
  - [ ] R-CONF-3: the count never flashes 0 while the listing loads; it shows a skeleton instead (report X1).

### 6.5 Home — R-HOME (boards Home-*)

- **Bubble:**
  - RUN-S1 to S5, then a link: "See what changed" to Just filed, or "Finish the tidy-up".
  - The quote (R-RUN-3), if present, is a second sentence in the bubble on done.
  - The bird pose follows the state (done: `p-done`; partial: `p-confused`).
- **Cards:**

  | Card | Running | Done | Partial |
  |---|---|---|---|
  | Inbox | "{n}" / "Being tidied up" | "0" / "Nothing waiting" | "{left}" / "Still waiting" |
  | Last tidy-up | "Tidy-up" / spinner "Running · 2 min" / "{n} things" | "Last tidy-up" / "{ago}" / inline counts | "Last tidy-up" / "Partly done" (warn) / "10 new · 5 still in inbox"; card border warn |

- **Fixes:**
  - "Last tidy-up" never says "No tidy-up yet" while `/runs` has entries (report N1).
  - Recent lists a just-uploaded file (report F6) by refreshing the listing after Add's upload.
- **Acceptance criteria:**
  - [ ] R-HOME-1: the bubble and card use `runSentence` and `run-summary inline`; no double full stop (unit test with `added` ending ".").
  - [ ] R-HOME-2: the partial state as on the board; the card links to the sheet.
  - [ ] R-HOME-3: the card never shows "No tidy-up yet" when `/runs` is non-empty.
  - [ ] R-HOME-4: the done toast is removed (the chip replaces it), which also removes the toast linking to Answers (inventory A2).

### 6.6 Just filed — R-JUST (boards JustFiled-*)

- **Route.** `/just-filed`, optional `?run=<runKey>` (default: latest).
- **Layout:**
  - Header: "Just filed", the line "What each tidy-up did: what is new, what changed, where things went.", and "Mark all seen" (desktop in the header, phone at the end).
  - A summary card: when ("Today, 13:57"), duration, state, `run-summary stats`.
  - **A table at every width.**
    - Desktop: a real `<table>` with the columns "What Bower did", "Now called", "You added", "Where it is", "Bower's note".
    - Phone: the same table with `role="table"` rows laid out as stacked cells (name; where-line; "from {old name}" or the change note), grouped by action: New notes, Updated, Filed, Needs you.
  - "Earlier tidy-ups": `<details>` per run with when, duration, state (Done, Partly done in warn, Did not finish in danger) and inline counts. Failed and partial runs are listed. A Do-it-now run reads "1 request · 4 new · 4 updated", never "0 things".
- **Rows:**
  - Moves of instruction and context notes into `Processed` are never listed (they are bookkeeping).
  - A link saved as a note lists the **note** (where it is now), not the raw link file in Processed (report F6).
  - "Needs you" rows carry the reason and "Tell Bower what it is" (to `/bower?text=About <name>: `).
- **Data:**
  - `RunOutcome.items` from `/runs` (and `last-run.json`).
  - `from` = `renamedFrom` or the inbox name.
  - `note` = a short change note from R-RUNNER-1 `updated[].what`, when present, else "—".
- **Acceptance criteria:**
  - [ ] R-JUST-1: no raw "Moved:" strings rendered anywhere in the app (grep test on `activity.ts` output); Processed moves are filtered out.
  - [ ] R-JUST-2: the table at 375 and 1280, rows grouped by action on the phone.
  - [ ] R-JUST-3: earlier runs include failed and partial ones with inline counts.
  - [ ] R-JUST-4: link items list the written note's location.
  - [ ] R-JUST-5: `?run=` selects a run; an unknown key falls back to the latest with no error.

### 6.7 Requests (Bower tab) — R-REQ (boards Requests-*, Dictate-Bower-375)

- **States:**

  | State | Icon | Chip | Meta | Action |
  |---|---|---|---|---|
  | waiting | empty circle | "Waiting" | "goes with the next tidy-up" | "Do it now" (secondary button, visible, not behind a tap) |
  | running | spinner | "Running" | "started 13:52" | — |
  | done | check | "Done" | "today, 13:26 · 4 new · 4 updated" | "See what came of it" (to Just filed `?run=`), or "Read the answer" for a question |
  | failed | cross | "Did not finish" | "today, 12:59 · nothing changed" | "Try again" |
  | rule kept | shield | "Rule kept" | "In your rules" | — (unchanged) |

- **Data.** A request is matched to the run that processed it through the run's `items[kind=request].path`, the instruction note's path. Done requests stay 30 days (runs history, max 20 runs; older ones drop out silently).
- **Box.** The Bower box gets the dictation button (R-DICT). "Do it now" moves out of the hidden row tap.
- **Acceptance criteria:**
  - [ ] R-REQ-1: a processed request shows as Done or Did not finish with its run's counts; it never vanishes (fixes 1.11, W3).
  - [ ] R-REQ-2: "Do it now" is visible on waiting rows when online and no run is in flight.
  - [ ] R-REQ-3: "See what came of it" opens Just filed for that run.
  - [ ] R-REQ-4: Activity cards use `RunOutcome` (counts, states, no raw Moved lines).

### 6.8 Overlays — R-OVL (System-Overlays, Tour-375, Help-1280)

- [ ] R-OVL-1: `overlay.tsx` and `overlay-queue.ts` as in section 5. Priority:
  1. the person's own overlays (menus, dialogs they opened);
  2. confirm and run sheet;
  3. the tour;
  4. hints and toasts, which never go over an overlay.

  Unit tests for the queue.
- [ ] R-OVL-2: migrate each overlay onto Overlay. Current state (inventory B): Tidy confirm, Help, Tour, PinSheet, RuleSheet, FolderPicker/Move, QuickLook, PhotoViewer (`kind` viewer, z 100), Switcher, NoteMenu (`kind` menu, `role="menu"`, still inert behind), and the new Rename and Sort. Each keeps its content; the scrim, trap, inert and scroll lock come from Overlay.
- [ ] R-OVL-3: the tour:
  - It becomes an Overlay dialog anchored above the lit tab, with a "Back" button added.
  - Escape or "Skip" ends it and shows the toast "Replay the tour any time from Settings." once.
  - It does not start while another overlay is open (queued).
  - On desktop, step 4's "Let's go" goes to `/bower` (report F8).
- [ ] R-OVL-4: help on desktop is a right panel (440). It lists "Tips on this screen" with each dismissed hint and a "Show again" button.
- [ ] R-OVL-5: `PushPrompt` shows only when no overlay is open and the chip is not in the done state (it is queued with priority 4).
- [ ] R-OVL-6: e2e: with any overlay open, a tap on the page behind does nothing and the page does not scroll (375 and 1280); Escape returns focus to the opener.

### 6.9 A note Bower wrote — R-NOTE, R-INS, R-KF (boards Note-*)

- **Route.** `/note/:id` where `isBowerWritten(meta)` (R-NOTE-1). Other notes keep today's page.
- **Layout.** Phone: one column, 16 px padding. Desktop: content up to 820 px, then the About panel of 300 px from 1200 px.
- **Element inventory, top to bottom:**
  1. **Top bar (phone)**: back to the folder, showing its full name up to the bar width. The back label is the folder name, not its first letter (W11). More.
  2. **Kind row**:
     - the kind chip (icon plus kind name, "Summary" for a kind-less note, "Word document, as text" for a converted document);
     - the `By Bower` tag;
     - the status select on the right, for kinds with statuses (uses `setFrontmatterValue`, like Compare).
  3. **h1**: the note's name, which R-AG-4 keeps at 40 characters or fewer. An optional subtitle is the frontmatter `title` when it is longer than the name.
  4. **Meta line**: folder link with its PARA mark · "Filed {date}" or "Written {date}".
  5. **Made from** (`made-from.tsx`), caption "Made from":
     - the original: an icon, the name ("Canal Street listing (clip)"), and "your clip" / "the original" / "Word document";
     - the web page: a globe, the host, and "advert" / "job advert" / "web page".
     - Each is a 40 px button. The original opens `/file/:id` or `/note/:id`; the web page opens in a new tab with `rel="noopener"`.
     - Resolved from `original` **by path first**, then by name in the same folder, then by `companion.ts` logic (the same function as the folder pairing), and from `source` when it is a URL.
     - A missing target shows the name as plain text with "not found".
  6. **Bower's insights** (`insights-box.tsx`, R-INS):
     - head: bird, "Bower's insights", the origin legend (only the origins used);
     - the rule-change line (R-INS-3);
     - **Summary**: the callout lines with origin squares and "Check";
     - **Key facts**: 1 to 4 tiles (4 across on desktop, 2 on the phone) and the button "All {n} details" opening Details in place;
     - **What to check**: items from `not_stated` (a kind) or the note's `## What to check` / `## Before you apply, check` section, with "Copy as questions for the {who}" (the agent, the employer, …).
  7. **Body**: the rest of the note. The top callout, the key-facts caption and the separate KeyFacts block are not rendered again.
  8. **Pager**: at the very end, after the body, separated by a rule. "‹ {prev}" · "{i} of {n} {kind plural}" · "{next} ›". It counts notes **of the same kind** in the folder, or all notes when the note has no kind. Desktop keys `[` and `]`.
  9. **About panel (desktop ≥1200)**: Original, Web page, Folder, Tags, Outline, In this folder. **No key facts.** It uses the names from `note-titles`, never a raw `[[…]]`.
- **States:**
  - loading (header skeleton, box skeleton);
  - no box yet (a note written before the rulebook change): today's rendering, plus a hint "Bower adds its insights next time it touches this note";
  - no key facts: the Key facts section is hidden;
  - rule changed: the blue line, with "What changed" open showing "Before today" and the reason (Note-RuleChanged-375);
  - converted document: no box; a `state` hint "This is the text of your Word document … Bower's insights are in {summary note}", with "Made from" listing the original and the summary note.
- **Copy:**

  | ID | Text |
  |---|---|
  | NOTE-1 | "Made from" |
  | NOTE-2 | "your clip" |
  | NOTE-3 | "the original" |
  | NOTE-4 | "advert" |
  | NOTE-5 | "not found" |
  | INS-1 | "Bower's insights" |
  | INS-2 | "Summary" |
  | INS-3 | "Key facts" |
  | INS-4 | "What to check" |
  | INS-5 | "All {n} details" |
  | INS-6 | "Copy as questions for the {who}" |
  | INS-7 | "Updated {date} · {change}" |
  | INS-8 | "What changed" / "Hide" |
  | INS-9 | "Before today" |
  | INS-10 | "Bower adds its insights next time it touches this note." |
  | NOTE-6 | "This is the text of your {format}, so you can search and read it here. Bower's insights are in {note}." |

- **Acceptance criteria:**
  - [ ] R-NOTE-1: `isBowerWritten(meta, file)` in `app/src/bower-written.ts`. A note is Bower's when any of these holds: `by: bower`, `type: answer`, `kind`, `original`, `bower_origins`, or the body starts with a `[!bower]` callout (legacy). `folder-view.ts` `writtenByBower`, `note.tsx` `isBowerNote`, the quick-look line and the counts all call it. Unit tests; the folder counts for the round 5 folders match the page tags.
  - [ ] R-NOTE-2: the header order as above; the status select writes `status`.
  - [ ] R-NOTE-3: Made from resolves `original` by path, then name in folder, then `companion.ts`; `source` URLs are rendered; a wikilink in `original` is never shown raw (fixes 1.13, W6).
  - [ ] R-NOTE-4: the pager moves after the body and counts the same kind (fixes 3.14 pager).
  - [ ] R-NOTE-5: the About panel drops Key facts and shows resolved names.
  - [ ] R-NOTE-6: phone lists wrap titles to two lines (`-webkit-line-clamp: 2`) in the folder list, Recent, Compare cards and the tree's phone view.
  - [ ] R-INS-1: `insights-box.tsx` replaces the top-box rendering on the note page; the file page's `BowerNote` uses the same component.
  - [ ] R-INS-2: key facts are rendered only in the box; the caption "Key facts for a … set in your rules" is removed (fixes 3.14).
  - [ ] R-INS-3: `bower_updated` (a date) and `bower_change` (one line) in the frontmatter render the blue line; `bower_before` (one line) fills "Before today". All three are absent means no line.
  - [ ] R-INS-4: "What to check" reads `not_stated` or the named section; the copy button copies one question per line.
  - [ ] R-KF-1: money values keep their period. When the value contains a period ("a week", "/week", "per week", "pw", "a month", "/month", "pcm", "a year", "/year", "per annum"), the tile shows the amount as the value and the normalised period ("a week", "a month", "a year") as the label. Otherwise the kind's `factLabel`. Unit tests with "£340 a week", "AUD 350/week", "£1,450 pcm" and "£72,000". Fixes 1.12.
  - [ ] R-KF-2: a numeric rule field named `score` or `fit` (0 to 100) becomes the first key-fact tile as a pill ("79", "your score"). It is green at 70 and up, amber from 50 to 69, grey below 50.

### 6.10 Folder view — R-FOLD (boards Folder-List-*, Wire-Folder-*)

- **Element order, top to bottom:**
  1. Phone top bar: back, folder name, More.
  2. Header: the PARA mark (28), h1 (24 on the phone, 30 on desktop), and the meta line "7 things · last filed today".
  3. Header actions (`header-action.tsx`): "Pin to Home" / "Pinned", "Ask Bower about it", and on desktop "Open in Drive" (on the phone it moves to More).
  4. Suggestion hint (R-HINT): "Ask Bower about this folder, for example:" plus two chips that fill the Bower box. Shown until dismissed.
  5. View switch, when comparable: segmented "List" / "Compare {n} {plural}" (`role="tablist"`).
  6. Filters and tools:
     - All / Originals {n} / By Bower {n}, with an (i) info-pop "By Bower is what Bower wrote…";
     - Sort (a button opening a Dialog on the phone, a select-like button on desktop);
     - Kind;
     - List/Grid.
     - Phone: two rows. Desktop: one row.
     - When a filter is not All, a `state` hint shows: "Showing only By Bower. Show all".
  7. **One list**: subfolders first (the same row component, a folder icon in the PARA colour, "{n} things", chevron), then files and notes grouped by date when sorted by date. The "Folders" label and its block are removed.
  8. Desktop key hint.
  9. Nothing after the list: the old bottom tips move to 4 and 6.
- **Removed:**
  - `.folder-tip` at the bottom;
  - `.folder-list-tip`;
  - the "Folders" h2;
  - the in-content `PathBar` at ≥900 (D12).
- **Acceptance criteria:**
  - [ ] R-FOLD-1: the order as above at 375 and 1280; subfolders are rows of the list (`role="list"` shared) and are counted in "{n} things".
  - [ ] R-FOLD-2: header actions use `header-action.tsx` (44 px, 14 px sideways padding, no underline); the same component on note and file headers (fixes 3.10).
  - [ ] R-FOLD-3: `PathBar` hidden at ≥900; the top bar breadcrumb shows the full path including the current item, the current one with `aria-current="page"`; the accessibility tree lists each ancestor once (fixes 3.13).
  - [ ] R-FOLD-4: the filter explanation is an info-pop next to the segmented control; the state hint shows while a filter other than All is active (fixes the remembered-filter surprise, log N2).
  - [ ] R-FOLD-5: rows' accessible names are the item's name. Counts and "New" go to `aria-describedby` (W8).

### 6.11 Sidebar — R-SIDE (boards Sidebar-*)

- [ ] R-SIDE-1: a separator on the sidebar's right edge:
  - 10 px hit area; a 2 px line in brand colour on hover and drag; a 36 px knob on hover or focus;
  - `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow`, `aria-valuemin="200"`, `aria-valuemax="480"`, `tabindex="0"`;
  - Left and Right arrows move 16 px, Home and End jump to min and max;
  - double-click or Enter resets to 264.
- [ ] R-SIDE-2: the width is kept in `localStorage` `bower:pref:sidebarWidth`, applied as `--sidebar-width` before first paint (inline in `layout.tsx`), and clamped so the main column stays at least 560 px.
- [ ] R-SIDE-3: tree links carry the item's name as their accessible name and `title` (tooltip); counts and "New" are in `aria-describedby` (fixes 3.12, W8).
- [ ] R-SIDE-4: pointer drag uses pointer capture and `requestAnimationFrame`, with no layout thrash; the tree does not re-render on each move (CSS variable only).
- Cost S. Risk: the virtualised tree must re-measure its width on resize; TanStack Virtual measures height only, so no change is expected.

### 6.12 Compare — R-CMP (boards Compare-*)

- **Phone:**
  - The toolbar holds a "Sort: {field}, {direction}" button (full width) and "Filter".
  - Sort opens a Dialog (`Compare-Sort-375`):
    - radio list: Your score (when present, subtitle "added by your rule"), then the kind's compare fields in order, Status, Name;
    - segmented "High first" / "Low first" (for text fields "A to Z" / "Z to A"; for dates "Soonest first" / "Latest first");
    - button "Show {n} {plural}".
  - The "Default order" chip is removed.
- **Cards:**
  - title (2 lines) plus the score pill;
  - three key-fact tiles that wrap (no ellipsis on values; values wrap to 2 lines);
  - "Status: {status}".
- **Desktop.** Columns: the title, **Your score** (when present) then the kind's compare fields, then Status. The header shows `aria-sort`. The sort choice persists per folder in `viewSettings` (like the column order).
- **Extra fields.** Frontmatter keys that are numbers and present in at least half the notes, and are not in `BOOKKEEPING_KEYS` or the kind's fields, become columns after the kind's fields, labelled by `humaniseKey`. `score` gets the label "Your score" and is placed first.
- **Acceptance criteria:**
  - [ ] R-CMP-1: the phone Sort dialog with the options above; sorting changes the card order (e2e).
  - [ ] R-CMP-2: `score` and `fit` columns and the phone pill; sortable (fixes 1.10).
  - [ ] R-CMP-3: extra numeric fields as columns (unit test in `compare.ts`).
  - [ ] R-CMP-4: the sort persists per folder; "Default order" is removed.
  - [ ] R-CMP-5: phone card values wrap instead of being cut (W5).

### 6.13 More and Rename — R-MORE (boards More-Rename-375, Rename-*)

- More gets "Rename…" after "Pin to Home", with the hint "Bower does it", for notes, files and folders. It is not shown for Bower's own files (`isAppFile`) or the five PARA roots.
- **Rename dialog:**
  - the field "New name", prefilled, with the extension shown locked after the field (".md", ".pdf");
  - the radiogroup "Now" (subtitle "A short run on its own; uses one run of your plan") / "With the next tidy-up" (subtitle "Free; happens next time you tidy up");
  - the buttons "Rename" and "Cancel".
- **Validation:**
  - empty → "Give it a name.";
  - the same name → "That is already its name.";
  - a name taken in the folder → "Something in this folder already has that name.";
  - characters `/ \ : * ? " < > |` → "Names can't contain / \ : * ? " < > |".
- **Effect.** The app writes an instruction note like Move (`move-request.ts`), with the title "Rename {old} to {new}" and the frontmatter `op: rename`, `target_id`, `new_name`. "Now" dispatches an instructions-only run. The runner renames through `rclone moveto` (keeping the id) and rewrites the links (the existing bookkeeping, #595).
- **Acceptance criteria:**
  - [ ] R-MORE-1: the menu item and dialog as on the boards; validation messages.
  - [ ] R-MORE-2: `rename-request.ts` writes the instruction note; unit test for its content.
  - [ ] R-MORE-3: the rulebook handles `op: rename` instructions (R-AG-7); the runner books the rename (existing path).
  - [ ] R-MORE-4: after "Now", the chip shows the run; after it, the note's name updates and its old links still open it.

### 6.14 Hints — R-HINT (System-Hints)

- [ ] R-HINT-1: `hint.tsx` with three variants (tip, suggestion, state) and one look:
  - surface fill, 1 px border (a brand-tinted border for suggestion, dashed for state), 12 px radius;
  - 15 px text, 20 px icon;
  - a 44 px dismiss button with the accessible name "Dismiss this tip".
- [ ] R-HINT-2: every existing tip migrates:
  - `.home-tip`: a tip on Home's empty state;
  - `.folder-tip`: a suggestion under Ask Bower, with chips;
  - `.folder-list-tip`: an info-pop;
  - `a.compare-ask`: a suggestion under the Compare switch;
  - `.activity-tip`: a tip at the top of Activity;
  - `.rules-tip`: a tip;
  - `.file-tip`: a tip;
  - the Bower tab's "Things you can ask" stays a disclosure, with the hint look.
- [ ] R-HINT-3: at most one tip or suggestion per screen (the first undismissed one in document order); state hints are exempt.
- [ ] R-HINT-4: dismissed ids are listed in help's "Tips on this screen" with "Show again".
- [ ] R-HINT-5: suggestion chips fill the Bower box (`/bower?text=`) and never send.

### 6.15 Add — R-ADD (boards Add-*)

- **Changes:**
  - **Upload on pick.** Files from Files, Photo, drop and the share target start uploading at once. This is the same `runQueue` path links use.
  - The "Tidy up" button no longer uploads.
  - **Row states**:
    - "Uploading · {pct}%", with a progress bar (`role="progressbar"`);
    - "In your inbox", with a check; a kept-not-read line when the format policy says so;
    - "Could not upload. Check your connection.", with "Retry".
  - **Counts.** The h2 reads "In your inbox · {n}", where n is the files actually in `0-Inbox` and `Clippings` (`pendingCount`, the same number Home and Confirm show). The right side reads "{u} uploading · {f} failed" (zeros left out). The button reads "Tidy up {n} things"; while uploads are in flight, the line under it reads "The file still uploading joins them when it is done."
  - **"What is this?"**:
    - always shown when n > 0 or the queue is non-empty (after a reload too, fixes the report's "no way left to say what they are");
    - its text is kept in `localStorage` `bower:add:context` on each input (debounced 300 ms), with the line "Saved on this device. Bower reads it with these things at the next tidy-up.";
    - written as the context note on leaving Add, on sign-out, and on "Yes, tidy up" (as today);
    - cleared from storage only after the note is written;
    - `<label for>` fixes its accessible name.
  - **Leaving:**
    - When an upload is in flight and the person taps another tab or signs out, a Dialog (`role="alertdialog"`) asks: "1 file is still uploading" / "Orchard Row listing.pdf is at 64%. If you leave now it stops, and you add it again later. What you wrote in "What is this?" is kept." / "Stay" / "Leave anyway".
    - `beforeunload` is set while uploads are in flight.
  - The "Waiting" state is removed.
- **Acceptance criteria:**
  - [ ] R-ADD-1: picked, dropped and shared files upload at once; the e2e check from report 1.2 (pick, reload) finds the file in the inbox.
  - [ ] R-ADD-2: one count, the same on Add, Home and Confirm (unit test on `pendingCount` use; e2e with a link and a file).
  - [ ] R-ADD-3: the "What is this?" draft survives reload and sign-out, and is written as the context note on leaving Add (fixes the missing #335 note).
  - [ ] R-ADD-4: the leave dialog and `beforeunload` only while uploads are in flight.
  - [ ] R-ADD-5: the Settings sign-out asks the same when uploads are in flight.

### 6.16 Dictation — R-DICT (boards Add-Dictating-375, Dictate-Bower-375, System-Dictate)

- **Where:**
  - the Bower box (`bower.tsx`);
  - "What is this?" (`add.tsx`);
  - Add a paragraph (`append-form.tsx`);
  - Edit the text (`note-editor.tsx`);
  - the interview's "Or say it your way" text inputs (`interview.tsx`).
  - **Never** in URL, search, folder-find, password or API-key fields.
- **Detection.** `window.SpeechRecognition ?? window.webkitSpeechRecognition`. Absent: no button. On a touch device, a `tip` hint is shown once per device: "Long text? Use the microphone key on your phone's keyboard to dictate."
- **Button.** Inside the box, bottom right, 44 px. The box gets 56 px of right padding. `aria-pressed`. The accessible name is "Dictate" or "Stop dictating".
- **States:**

  | State | Visual | Text | Live region |
  |---|---|---|---|
  | ready | mic icon, muted | — | — |
  | asking (first use) | mic highlighted | hint: "Allow the microphone when your browser asks. Bower never keeps the sound." | — |
  | listening | brand-filled square stop icon, 4 px focus ring; box border brand | status line: "Listening in English (UK) · Change"; interim words in muted colour at the cursor | `role="status"`: "Listening" / "Stopped" |
  | blocked | mic muted | "The microphone is blocked. Allow it in your browser's site settings, then tap the mic again." (danger, `role="alert"`) | — |
  | not available | no button | the one-time tip | — |

- **Behaviour:**
  - `continuous = true`, `interimResults = true`;
  - final results are inserted at the cursor (or the end) with a leading space when needed;
  - it stops on the tap, after 3 s of silence (`onspeechend`), on blur, or on leaving the route.
  - The language is `navigator.language` by default. "Change" opens a small menu of the recognizer's usual languages, and the choice is kept in `bower:pref:dictationLang`. Many people write in more than one language; Settings gets the same control.
  - Reduced motion: the ring is static.
- **Cost:** M. No dependency.
- **Risks:**
  - Chrome sends audio to Google's speech service (Q2).
  - Safari needs the page to be in the foreground.
  - Support on iPhone browsers varies; that is why feature detection comes first.
- **Acceptance criteria:**
  - [ ] R-DICT-1: `dictate-button.tsx` with the states above; unit tests with a mocked `SpeechRecognition`.
  - [ ] R-DICT-2: mounted in the five places listed and in no other.
  - [ ] R-DICT-3: the language preference in Settings ("Dictation language: Match my device") and in the status line.
  - [ ] R-DICT-4: the Privacy page and `docs/privacy.md` state where the audio goes when the browser's recognizer is online (after Q2).

## 7. Behind the screens

- **R-RUNNER-1 (runner and Worker).** The status report and `.bower/last-run.json` gain:
  - `created[]`: paths added this run that are not a move destination;
  - `updated[]`: paths that existed before and changed, each `{ path, what? }`;
  - `left[]`: pending inbox paths still there at the end.

  `run.sh` already has what it needs: `MANIFEST_BEFORE` plus `CHANGED_FILE` (created = changed and not in before, minus `MOVES_FILE` destinations; updated = changed and in before). `what` is an optional one line per updated note that the agent writes to `.bower/updated.txt` (`<path><TAB><what>`), read and removed like `added.txt`.

  Sent **on failed runs too**, with whatever `copy_changed_up` actually uploaded (the upload list, not the intent). The Worker validates them like `processed` (paths, length caps, max 200) and stores them on `Run`. Serves R-RUN-1 and D3. Cost M.
- **R-RUNNER-2.** `last-run.json` carries the same `items`, `created`, `updated`, `left`, `setAside` and `added` as the report, so a recovered stale run is complete (inventory A1 gap 4). Cost S.
- **R-RUNNER-3 (Worker).** The push body uses the four counts: "Done: 6 filed, 6 new notes, 2 updated" / "Partly done: 5 still in your inbox" / "Did not finish: nothing changed". Cost S.
- **R-RUNNER-4.** A `phase` field on running reports: `queued`, `reading`, `writing`, `saving`, plus `total` and `done` counts when known. `run.sh` reports `reading` after conversion, `writing` when the agent starts, and `saving` before copy up. A `done` count while writing needs the agent to report progress. That is out of scope, so the step shows "Writing notes" without "k of n" unless it is cheap. Cost S to M.
- **R-RUNNER-5.** A run is `partial` when it failed and `created + updated + items.to > 0`. The Worker keeps `state: failed`, and the app derives partial (no API change beyond the new arrays).

**Rulebook** (`vault-template/CLAUDE.md`; bump `bower_rules_version` once for all of these; the prompts in `agent/prompts/ingest.md` point to the new rules):

- **R-AG-1.** Every note Bower writes carries `by: bower` in its frontmatter: companion notes, answers, job results, summaries, converted documents' `.md`, and hub and project notes Bower creates. Serves R-NOTE-1.
- **R-AG-2.** Every note Bower **generates** (not a converted `.md`, not a hub note that only lists) opens with the `> [!bower] Bower's note` box. This extends "A note from Bower" beyond listed kinds and asked-for notes, per the owner's ruling (3.4):
  - Kind-less notes (a CV summary, a profile note) also carry a `facts:` block map of at most 6 `label: value` pairs, where the first four are key facts;
  - and a `## What to check` section when there is something to check.
  - The rule "No summary note … unless" stays for **originals**: an original of no listed kind is still only filed. What changes is that any note Bower does write has insights. **Open:** whether a document of no listed kind (a CV) gets a summary note by default; see Q1.
- **R-AG-3.** When Bower changes a note it wrote because a rule or a fact changed, it rewrites the box and the key facts to the present, then sets:
  - `bower_updated: YYYY-MM-DD`;
  - `bower_change: <one line, the owner's words>`;
  - `bower_before: <one line, what the box said before>`.

  It never appends "later" paragraphs that contradict the top. Serves D7 and 3.8.
- **R-AG-4.** Note names Bower chooses are at most 40 characters, most specific first ("CV · Data Lead, Northwind", "Job fit ratings"), with no generic prefix ("Tailored …", "Rate the …"). The long description may go in `title:`. Serves 3.6.
- **R-AG-5.**
  - A web clip's note keeps `source: <URL>` whenever the clip has one, and `original: "[[<path of the raw clip>]]"` with its folder path, even when the clip goes to `Processed`.
  - A note's name never equals the base name of its original (already a rule; the runner's audit should flag a violation).
  - Serves 1.13, 3.2.
- **R-AG-6.**
  - Money fields are written with their period when the source states one ("£340 a week", "£1,450 a month").
  - `added.txt` is plain words for the owner with no internal words (index, hub, orphaned, crashed, run, frontmatter), in the first person, with no final full stop.
  - Serves 1.12, 2.2.
- **R-AG-7.** Instructions with `op: rename` rename the target keeping its id, and the runner books it like a move.

**App modules touched:**

- `run-store.tsx` (outcome, chip, no toast);
- `last-run.ts`;
- `api.ts` (`Run` fields);
- `just-filed.ts`, `activity.ts`, `bower-tab.ts` (requests matched to runs);
- `kinds.ts` and `key-facts.tsx` (periods, score);
- `folder-view.ts`;
- `companion.ts` (shared resolver);
- `note.tsx`, `about-panel.tsx`;
- `compare.ts`, `compare.tsx`;
- `add.tsx`, `add-queue-store.ts`, `add-context.ts`;
- `more-menu.ts`, `note-menu.tsx`;
- `tree.tsx`, `layout.tsx`;
- `tour-store.ts`, `help-sheet.tsx`.

## 8. Order and dependencies

1. **Contracts first:**
   - R-RUNNER-1, R-RUNNER-2 and R-RUNNER-4, with the Worker validation and `api.ts` types;
   - the rulebook bump R-AG-1 to R-AG-7, as one PR;
   - the tokens (section 5).
2. **Primitives, in parallel:**
   - Overlay and the queue (R-OVL-1);
   - `hint.tsx` and `info-pop.tsx`;
   - `header-action.tsx`;
   - `run-outcome.ts` and `run-summary.tsx`;
   - `bower-written.ts`;
   - the money period (R-KF-1).
3. **Run screens:** chip, sheet, confirm, Home, Just filed, Requests, Activity. They need 1 and 2 and degrade when the new runner fields are absent.
4. **Notes:** made-from, insights box, pager, About panel, titles wrap. They need `bower-written` and the rulebook for new notes; old notes keep working.
5. **Folders:**
   - order, header, a single path, the sidebar resize;
   - Compare sort and score;
   - Rename (needs R-AG-7).
6. **Add** (upload on pick, draft, leave), then **dictation** (after Q2).
7. **Migration of every remaining overlay** onto Overlay (R-OVL-2), the tour and help (R-OVL-3, R-OVL-4).

Groups 3 to 6 can run in parallel once 1 and 2 have landed. The rulebook bump and the runner change deploy in the usual order: Worker, then runner, then app.

## 9. Open questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Should a document of **no listed kind** (a CV, a profile, a letter) get a summary note with insights by default? The owner ruled that every note Bower **generates** has insights; round 5 shows a CV got none because nothing was generated. | (a) yes, every document gets a short summary note (more notes, more runs of the plan); (b) only when asked or when a rule says so, but the first run after onboarding offers it ("Want a summary of your CV?"); (c) add "CV" and "profile" as listed kinds | **(b)** plus **(c)** for CV: a CV is recurring and has stable fields. (a) doubles note count for receipts-like clutter. |
| Q2 | Dictation sends audio to the browser vendor's speech service (Chrome: Google; Safari: Apple, on device where available). Is that acceptable, with a Privacy line? | (a) yes, with a Privacy line and the first-use hint; (b) only where on-device recognition is available (too little support today); (c) no mic, only the keyboard tip | **(a)**. The person chooses to tap the mic, nothing is kept by Bower, and the Privacy page says so. |
| Q3 | The light `--color-danger` fails 4.5:1 for small text on its new tinted background. | darken to `#c21b1b` for text; keep #e12020 for fills | Darken for text only. |

## 10. Completeness check

- [x] Every artboard is in section 4, and every element on the changed boards is in an inventory (sections 6.2 to 6.16).
- [x] Every state a person can meet has a board or an explicit "no visual change" (running, done, partial, failed; waiting, running, done, failed requests; upload states; dictation states; rule change; converted document). **Gap:** "Did not finish" on the run sheet has no board of its own. It is the partial layout with the danger colour, and the text is in 6.3.
- [x] Every string is in a copy table or quoted in its requirement; every error has its next step.
- [x] Every interactive element has an accessible name and a keyboard path (the separator, chip, sort dialog, dictate button, hints' dismiss, info-pop).
- [x] Every token used exists in `tokens.css` or in section 5.
- [x] Every element that needs data names its source and its empty and stale behaviour (RunOutcome without the new runner fields degrades to today's counts; missing `original` shows "not found"; no box shows the hint).
- [x] Every L has an M alternative: there is no L. The largest items are the runner fields (M) and the Overlay migration (M, done incrementally).
- [x] Every escalation is in section 7 or 9: rulebook bump; runner and Worker fields; the token value change (Q3); the privacy of dictation (Q2); the summary-by-default policy (Q1). There are no new dependencies, OAuth scopes or secrets.
- [x] Every open-source pointer has a licence: there are none.
- [x] Every acceptance criterion can be checked by a test or by opening the app.
- [x] Nothing in the boards contradicts this text. Known simplifications on the boards: the Requests desktop board shows the chip in the running state, while the list shows one running request. Board data (names, amounts) is fictional.
