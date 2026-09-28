# PLAN.md

Resume point for the tech lead: the v3 redesign (milestones M18–M26) from the 2026-09-28 design handover (`docs/superpowers/plans/2026-09-28-app-test-findings.md`, boards in `docs/design/v3/boards/`). The lead updates it at every milestone change; GitHub issues and PRs are the source of truth for detail.

## Order

M18 fixes and the M19 shell first, then M20–M23 (UI), M24 desktop, M25 demo, and last M26 agent plus the technical items of M18. Owner items (OAuth verification, push on a real phone, mobile testing, Cloudflare JavaScript Detections #427) at the end.

## Milestones

| # | Milestone | Open | Closed | State |
|---|---|---|---|---|
| 19 | M18 · After the test: fixes that survive v3 | 7 | 22 | open |
| 20 | M19 · v3 shell: tabs, bars, the folder menu, Home | 0 | 10 | closed |
| 21 | M20 · v3 first visit: the intro, the tour, the help sheets | 0 | 6 | closed |
| 22 | M21 · v3 Add and the tidy-up | 0 | 8 | closed |
| 23 | M22 · v3 the Bower tab: rules, requests, activity | 1 | 7 | open |
| 24 | M23 · v3 notes, folders, files | 0 | 10 | closed |
| 25 | M24 · v3 desktop: one container, four breakpoints | 5 | 1 | open |
| 26 | M25 · v3 demo: the sales door | 7 | 0 | open |
| 27 | M26 · Agent v6: file only, context, runs | 10 | 0 | open |

## Issues

| Issue | Title | Milestone | State | PR |
|---|---|---|---|---|
| #304 | Run state: `done` returns to idle, toasts expire, the sheet opens once per run | M18 | closed | #385 |
| #305 | Health check: counts from the report's frontmatter and the findings rendered as Markdown | M18 | closed | #392 |
| #306 | Titles, not file names: one `noteTitle` helper for Recent, the tree, the switcher, the note | M18 | closed | #380 |
| #307 | Note screen: Not found for a missing note, no duplicate heading, properties behind About | M18 | closed | #382 |
| #308 | Switcher: names and paths first and synchronously, full text second, commands last | M18 | closed | #381 |
| #309 | Settings: Delete as a red text link at the bottom, Sign out a plain button, sections in the v3 order | M18 | closed | #379 |
| #310 | Folder and drawer polish: empty state only for an empty subtree, 13 px chips, counts above zero only | M18 | closed | #393 |
| #311 | Tablet bar alignment at 768 | M18 | closed | #387 |
| #312 | Picker scope: open on My Drive, never accept the Bower folder, `Processed` or dot-folders | M18 | closed | #403 |
| #313 | `/login` never redirects to the intro; Terms and Privacy back links go to the sign-in when signed out | M18 | closed | #383 |
| #314 | Names for the remaining controls: the Settings rows, both switches, the sidebar folder links | M18 | closed | #386 |
| #315 | A run that fails or never reports: retry the report, outcome in the vault, job conclusion as the fallback, tokens survive a sign-in | M18 | open |  |
| #316 | Failure sheet in people's words with Try again; the Inbox card offers Try again after a failure | M18 | open |  |
| #317 | Four tabs at the bottom: Home · Notes · Add · Bower; `/tell` redirects to the Bower tab | M19 | closed | #384 |
| #318 | The top bar of every tab: folder menu, title, "?", avatar; Back on inner screens | M19 | closed | #389 |
| #319 | The folder menu: pinned things, the tree, search, one tap to any folder | M19 | closed | #397 |
| #320 | Remove the pill: Tidy up on the Inbox card and on Add | M19 | closed | #394 |
| #321 | Home in its six states: the bubble, the bird, the cards | M19 | closed | #401 |
| #322 | Home loading state: no zeros as fact | M19 | closed | #413 |
| #323 | Greeting with the given name from the Google profile | M19 | closed | #418 |
| #324 | Theme lives in Settings only; no toggle in the bar | M19 | closed | #395 |
| #325 | Offline: the banner without a bird, the sad bird next to the greeting | M19 | closed | #415 |
| #326 | Desktop sidebar: collapse only, no sort, the Add bubble with the waiting count | M19 | closed | #411 |
| #327 | What is Bower: nine swipeable pages before the sign-in, Skip, Next, Sign in | M20 | closed | #390 |
| #328 | The intro's animations: the sort strip, the flying cards, the Drive curtain, the filing tree | M20 | closed | #399 |
| #329 | What is Bower from Settings: the same pages with Close and Done | M20 | closed | #398 |
| #330 | Help sheets: one per tab plus Folder, opened by "?"; the tour is the same four sheets in a row | M20 | closed | #396 |
| #331 | Sign-in screen: centred block, the bird on its ground line, Privacy · Terms · What is Bower? | M20 | closed | #388 |
| #332 | Ideas: the screen of examples, grouped, each copyable into the box | M20 | closed | #414 |
| #333 | Add on the phone: three doors, the link field, the share line; the drop zone only on desktop | M21 | closed | #404 |
| #334 | The Added queue: type icon, the person's file name, the state, no Tidy up until the pile is in | M21 | closed | #405 |
| #335 | What is this?: the context box, written as one context note per batch | M21 | closed | #434 |
| #336 | The hint: "Add the whole pile first", with the count and the Tidy up button | M21 | closed | #419 |
| #337 | Is that everything?: the confirmation sheet before every tidy-up | M21 | closed | #410 |
| #338 | The working sheet: opens once, the bird between Inbox and the folders, the rows as they land | M21 | closed | #409 |
| #339 | Take a photo: the camera door on devices with a camera, hidden otherwise | M21 | closed | #406 |
| #340 | The Bower tab: the box without a selector, the "?" tip with examples, three segments | M22 | closed | #402 |
| #341 | Rules the app can read and write: `Rules.md` in topic groups, paused rules, the parser | M22 | closed | #412 |
| #342 | Rules screen: explanation on top, groups with counts, Suggested from proposals, a rule's menu | M22 | closed | #428 |
| #343 | Rule kept at once: a "from now on" sentence goes to `Rules.md` without a run | M22 | closed | #436 |
| #344 | Requests: states, Do it now (an instructions-only run), Edit, Remove | M22 | closed | #452 |
| #345 | Activity: one card per tidy-up, what went where, set aside, in people's words | M22 | open |  |
| #346 | Proposals move from Health to the Suggested group; Health keeps a pointer | M22 | closed | #417 |
| #347 | Retire the Tell composer and the conversation feed | M22 | closed | #429 |
| #348 | A root folder explained: the line at the top, subfolders, files | M23 | closed | #430 |
| #349 | A project folder: files and notes together, newest first, who put each there | M23 | closed | #400 |
| #350 | A file, previewed: PDF, image, Google Doc as text; Open in Drive; the More menu | M23 | closed | #408 |
| #351 | A note from Bower: the conclusions box and What Bower used | M23 | closed | #407 |
| #352 | One More menu for note, file and folder, with Ask Bower about this | M23 | closed | #439 |
| #353 | Notes tab: the tree, the Health row, the hidden-files line, no sort | M23 | closed | #416 |
| #354 | Ask Bower about this folder: the chip that opens the box with the folder named | M23 | closed | #451 |
| #355 | One centred container: 980 px, 1200 with the About panel, the header row included | M24 | closed | #459 |
| #356 | Home on desktop: four equal cards on one grid, Pinned tiles, Recent in two columns, no Tell | M24 | open |  |
| #357 | The Bower tab in three aligned columns above 1200 | M24 | open |  |
| #358 | The note and its About panel next to the measure | M24 | open |  |
| #359 | Breakpoints 600 · 900 · 1200 and nothing above; Playwright screenshots at 1024, 1280, 1440, 1920 | M24 | open |  |
| #360 | Settings and every single-column page share the Settings column | M24 | open |  |
| #361 | The demo's first visit: the nine intro pages with the banner and Try the demo, then the tour | M25 | open |  |
| #362 | The banner on every screen: "This is a demo, not the real thing: sample notes, nothing saved · Run your own" | M25 | open |  |
| #363 | Tidy up in the demo is a recording: the confirmation's amber line, the working sheet's copy, the scripted run | M25 | open |  |
| #364 | Drive and push greyed with one sentence each; Add's doors in the demo | M25 | open |  |
| #365 | The demo never talks to anyone: an e2e that fails on any request to another host | M25 | open |  |
| #366 | Run your own Bower: the screen and the runbook link; "What is Bower, in nine screens" | M25 | open |  |
| #367 | Fixture "Alex" with originals: a PDF, a photo, a Google Doc, a note from Bower with its box | M25 | open |  |
| #368 | Ingest files only by default: originals into their PARA folder, no summary note | M26 | open |  |
| #369 | Sensible names for originals that have none; `index.md` lists files | M26 | open |  |
| #370 | Context notes: What is this? applies to its batch; "from now on" inside it becomes a rule | M26 | open |  |
| #371 | A note from Bower: the template with Bower's note, Why, What Bower used and the three markers | M26 | open |  |
| #372 | Apply a rule to what is already filed: the job, the moves, the log | M26 | open |  |
| #373 | Instructions-only runs: workflow input `scope`, `run.sh` skips the rest of the inbox | M26 | open |  |
| #374 | Web lookup per user: the Settings switch, the Worker setting, the workflow input, `run.sh` | M26 | open |  |
| #375 | Failure reasons for people: the runner classifies, the Worker stores, the app shows | M26 | open |  |
| #376 | `Rules.md` shape in `CLAUDE.md`: topic headings, paused rules ignored; red-team case | M26 | open |  |
| #377 | Runbook, vault template and README: file-only filing, originals next to notes, the web switch | M26 | open |  |
| #420 | Home bubble's Tidy up link says "[object PointerEvent] things are waiting" | M18 | closed | #432 |
| #421 | Add: saving a link, or the leftover "Add to Bower" button, jumps to Home | M18 | closed | #437 |
| #422 | Desktop sidebar: the waiting count bubble is on Home, not on Add | M18 | closed | #438 |
| #423 | Previous/next links under a note show Bower's own files and file names | M18 | closed | #448 |
| #424 | Root folder says "9 notes in Half Marathon" when the notes are in three subfolders | M18 | closed | #449 |
| #425 | Folder counts leave out files: the menu says 0-Inbox 1 while the folder holds a file and a note | M18 | closed | #455 |
| #426 | Note bar on the phone: back label and title both cut to a few letters, two More buttons | M18 | open |  |
| #427 | Production console: Cloudflare's injected challenge script is blocked by the app's CSP on every page | M18 | open |  |
| #431 | Root folder screen: heading without the numeric prefix, the subfolder second line, the friendlier meta line | M23 | closed | #442 |
| #433 | Notes tab: the search row opens the quick switcher, as the Phone-Notes board links it | M23 | closed | #441 |
| #435 | What is this?: a "From now on" sentence also goes to Rules.md through the rule write path | M21 | closed | #440 |
| #443 | Rules: pausing and resuming a rule replaces the date it was said on with today | M18 | closed | #450 |
| #444 | Demo tidy-up answers the What is this? note as a question: a Context answer and one question too many | M18 | closed | #460 |
| #445 | Demo's fallback answer still sends people to the Tell Bower screen | M18 | closed | #454 |
| #446 | What is this? shows as "Context" in Requests and the working sheet, not the words the person wrote | M18 | closed | #461 |
| #447 | Home's Health card says "Checked today" when the last check was Sunday | M18 | closed | #456 |
| #453 | Project folder screen: the Drive chip reads "Drive" and the tip at the end, as the Phone-Folder-Project board draws | M23 | closed | #458 |
| #457 | Folder screen: subfolder rows count files too, like the menu, the tree and the sidebar | M18 | open |  |
| #464 | Project folder tip suggests comparing flats in every project folder | M18 | open |  |
| #465 | Requests: an answered request shows its first six words, not the sentence sent | M18 | open |  |

## Rules of the road

- One issue, one branch (`feat|fix|docs|chore/<n>-<slug>` from `main`), one PR; squash merge; the lead reviews every diff.
- Merge one PR at a time after `gh pr update-branch` and a fresh green CI (`ci`, `sanitize`, `supply-chain`, `e2e`).
- Conflict hotspots: `app/e2e/flows.e2e.ts`, `app/src/components/layout.tsx`, `app/src/routes/home.tsx`, `app/src/routes/bower.tsx`, `app/src/routes/folder.tsx`, `app/src/components/icons.tsx`. Agents rebase; the lead never resolves conflicts by hand.
- Never `git stash` (one list for all worktrees). Never remove a worktree before its PR is merged and the agent has reported.
- Flaky bash test harness: #391.
