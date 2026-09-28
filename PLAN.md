# PLAN.md

Resume point for the tech lead: the v3 redesign (milestones M18–M26) from the 2026-09-28 design handover (`docs/superpowers/plans/2026-09-28-app-test-findings.md`, boards in `docs/design/v3/boards/`), plus the tester rounds that followed (`docs/testing/`). The lead regenerates it at every milestone change; GitHub issues and PRs are the source of truth for detail.

## State (2026-09-28, end of day)

Every v3 milestone is closed except M18 (the owner's #427 and the round-5 leftovers #555–#558) and M26 (#560, an owner decision on deleting the old copy of a moved file). Production (Worker, Pages app, demo, the bower-home runner) is at main 2bc2031. Owner items: OAuth verification or `drive.file`; Cloudflare JavaScript Detections off (#427); `GITHUB_TOKEN` in bower-home with `actions: read` (#490); the vault's `CLAUDE.md` update to v12 through the app; remove the seed-phrase-looking test file from the test inbox; #560; Dependabot #473/#474.

## Milestones

| # | Milestone | Open | Closed | State |
|---|---|---|---|---|
| 19 | M18 · After the test: fixes that survive v3 | 5 | 53 | open |
| 20 | M19 · v3 shell: tabs, bars, the folder menu, Home | 0 | 10 | closed |
| 21 | M20 · v3 first visit: the intro, the tour, the help sheets | 0 | 6 | closed |
| 22 | M21 · v3 Add and the tidy-up | 0 | 8 | closed |
| 23 | M22 · v3 the Bower tab: rules, requests, activity | 0 | 11 | closed |
| 24 | M23 · v3 notes, folders, files | 0 | 10 | closed |
| 25 | M24 · v3 desktop: one container, four breakpoints | 0 | 6 | closed |
| 26 | M25 · v3 demo: the sales door | 0 | 12 | open |
| 27 | M26 · Agent v6: file only, context, runs | 1 | 10 | open |

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
| #315 | A run that fails or never reports: retry the report, outcome in the vault, job conclusion as the fallback, tokens survive a sign-in | M18 | closed | #490 |
| #316 | Failure sheet in people's words with Try again; the Inbox card offers Try again after a failure | M18 | closed | #525 |
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
| #345 | Activity: one card per tidy-up, what went where, set aside, in people's words | M22 | closed | #571 |
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
| #356 | Home on desktop: four equal cards on one grid, Pinned tiles, Recent in two columns, no Tell | M24 | closed | #463 |
| #357 | The Bower tab in three aligned columns above 1200 | M24 | closed | #466 |
| #358 | The note and its About panel next to the measure | M24 | closed | #468 |
| #359 | Breakpoints 600 · 900 · 1200 and nothing above; Playwright screenshots at 1024, 1280, 1440, 1920 | M24 | closed | #472 |
| #360 | Settings and every single-column page share the Settings column | M24 | closed | #475 |
| #361 | The demo's first visit: the nine intro pages with the banner and Try the demo, then the tour | M25 | closed | #478 |
| #362 | The banner on every screen: "This is a demo, not the real thing: sample notes, nothing saved · Run your own" | M25 | closed | #477 |
| #363 | Tidy up in the demo is a recording: the confirmation's amber line, the working sheet's copy, the scripted run | M25 | closed | #484 |
| #364 | Drive and push greyed with one sentence each; Add's doors in the demo | M25 | closed | #486 |
| #365 | The demo never talks to anyone: an e2e that fails on any request to another host | M25 | closed | #488 |
| #366 | Run your own Bower: the screen and the runbook link; "What is Bower, in nine screens" | M25 | closed | #480 |
| #367 | Fixture "Alex" with originals: a PDF, a photo, a Google Doc, a note from Bower with its box | M25 | closed | #487 |
| #368 | Ingest files only by default: originals into their PARA folder, no summary note | M26 | closed | #482 |
| #369 | Sensible names for originals that have none; `index.md` lists files | M26 | closed | #516 |
| #370 | Context notes: What is this? applies to its batch; "from now on" inside it becomes a rule | M26 | closed | #541 |
| #371 | A note from Bower: the template with Bower's note, Why, What Bower used and the three markers | M26 | closed | #528 |
| #372 | Apply a rule to what is already filed: the job, the moves, the log | M26 | closed | #559 |
| #373 | Instructions-only runs: workflow input `scope`, `run.sh` skips the rest of the inbox | M26 | closed | #479 |
| #374 | Web lookup per user: the Settings switch, the Worker setting, the workflow input, `run.sh` | M26 | closed | #483 |
| #375 | Failure reasons for people: the runner classifies, the Worker stores, the app shows | M26 | closed | #485 |
| #376 | `Rules.md` shape in `CLAUDE.md`: topic headings, paused rules ignored; red-team case | M26 | closed | #548 |
| #377 | Runbook, vault template and README: file-only filing, originals next to notes, the web switch | M26 | closed | #563 |
| #420 | Home bubble's Tidy up link says "[object PointerEvent] things are waiting" | M18 | closed | #432 |
| #421 | Add: saving a link, or the leftover "Add to Bower" button, jumps to Home | M18 | closed | #437 |
| #422 | Desktop sidebar: the waiting count bubble is on Home, not on Add | M18 | closed | #438 |
| #423 | Previous/next links under a note show Bower's own files and file names | M18 | closed | #448 |
| #424 | Root folder says "9 notes in Half Marathon" when the notes are in three subfolders | M18 | closed | #449 |
| #425 | Folder counts leave out files: the menu says 0-Inbox 1 while the folder holds a file and a note | M18 | closed | #455 |
| #426 | Note bar on the phone: back label and title both cut to a few letters, two More buttons | M18 | closed | #462 |
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
| #457 | Folder screen: subfolder rows count files too, like the menu, the tree and the sidebar | M18 | closed | #467 |
| #464 | Project folder tip suggests comparing flats in every project folder | M18 | closed | #470 |
| #465 | Requests: an answered request shows its first six words, not the sentence sent | M18 | closed | #476 |
| #481 | chore(app): drop the unused VITE_ABOUT_URL plumbing, a stale test name, and ignore test fixtures in Prettier | M25 | closed | #538 |
| #489 | Demo copy per the boards: the confirmation sentence, the Add door subtitles, the demo hint sentence, the fixture's pinned tiles | M25 | closed | #535 |
| #491 | A request sent while a tidy-up is running is lost: no Waiting row, gone after the run | M18 | closed | #522 |
| #492 | fix(app): the Health findings parser splits on the first colon and on a bold title across lines | M18 | closed | #518 |
| #493 | fix(app): Add still lists the added items after the run, and Save keeps the link so a second press duplicates it | M18 | closed | #517 |
| #494 | Demo: the tour replays on every load because tourSeenAt lives in the in-memory Worker | M25 | closed | #520 |
| #495 | fix(app): /search?q= lands on Home with nothing; the quick switcher never opens | M18 | closed | #519 |
| #496 | fix(app): the three Health mentions disagree, and the Health wording ("Sep 27's check", "good shape" with an Urgent finding) | M18 | closed | #524 |
| #497 | fix(app): the working sheet dismissed with Escape reopens on reload and after sending a request | M18 | closed | #530 |
| #498 | fix(app): the Last tidy-up card blanks to "No tidy-up yet" while a run is in progress | M18 | closed | #531 |
| #499 | fix(app): only the last "From now on" sentence in a What is this? box becomes a rule | M18 | closed | #547 |
| #500 | Home greeting on the phone: one line at 24 px with the bird beside it, as the Phone-Home board | M18 | closed | #533 |
| #501 | Do it now confirmation: its own copy about requests, not the tidy-up's pile of files | M22 | closed | #549 |
| #502 | Folder rows: "Note · in this folder" says nothing, and a root folder's subfolder rows show "0 things" | M18 | closed | #523 |
| #503 | fix(app): note body type is 16 px; C.5 says 17 px / 1.6 on the phone | M18 | closed | #536 |
| #504 | Not found: the board's screen for an unknown folder and any unknown URL | M18 | closed | #527 |
| #505 | After "Yes, tidy up" show the working sheet at once in a Starting state | M18 | closed | #521 |
| #506 | The Done sheet stays until dismissed, and its count agrees with Home | M18 | closed | #526 |
| #507 | Bower box: a one-line confirmation under the box after Send (kept, already in your rules, will go with this tidy-up) | M22 | closed | #546 |
| #508 | Add queue: a pasted link shows its URL or page title, not Bower's file name; the What is this? placeholder fits its box | M18 | closed | #542 |
| #509 | Demo intro page 8: rewrite the designer's note as a sentence; a scroll cue on the desktop panel | M25 | closed | #532 |
| #510 | fix(app): a tap during a sheet's slide-up lands on the page behind it and dismisses it | M18 | closed | #534 |
| #511 | accessibility: Ideas' nine "Copy" links get distinct names, the Rules group header separates the count from the name, bubble spacing | M18 | closed | #544 |
| #512 | chore(app): the Settings version line carries the short commit at build time | M18 | closed | #540 |
| #513 | chore(app): one relative-time helper with one rounding and one ticking for the card, the sheet and the rows | M18 | closed | #537 |
| #514 | Investigate: a clipboard write fired on a synthetic click on a bottom-nav link in the demo | M18 | closed |  |
| #529 | fix(app): the Bower's note renderer accepts the fourth origin "(from what you told me)", and the Add hint and confirmation count like Home | M18 | closed | #543 |
| #539 | Demo: the fixture's folder pin never shows on a cold visit because pinned hydration stops at 12 fetches | M25 | closed | #545 |
| #551 | Home greeting is cut at 375 px even with a short name | M18 | closed | #561 |
| #552 | Bower box says "Will go with this tidy-up" but the request waits for the next one | M18 | closed | #562 |
| #553 | Bower box confirmations are not announced to screen readers | M18 | closed | #566 |
| #554 | Quick switcher results show the note's frontmatter and Markdown marks | M18 | closed | #568 |
| #555 | Demo: Drive links on folders and files open Google Drive URLs that do not exist | M18 | open |  |
| #556 | Demo: the sidebar's Sign out works and empties the folder list | M18 | open |  |
| #557 | A filed link is shown by its generated file name after the tidy-up | M18 | open |  |
| #558 | Rules from a What is this? box keep "From now on," and sort after Everything else | M18 | open |  |
| #560 | Decision: a file the agent moves out of a PARA folder leaves its old copy in Drive ("Never delete" vs. a duplicate) | M26 | open |  |
| #564 | Home reads .bower/last-run.json when the Worker never heard the run's outcome | M22 | closed | #569 |

## Rules of the road

- One issue, one branch (`feat|fix|docs|chore/<n>-<slug>` from `main`), one PR; squash merge; the lead reviews every diff.
- Merge one PR at a time after `gh pr update-branch` and a fresh green CI (`ci`, `sanitize`, `supply-chain`, `e2e`); wait while GitHub reports mergeability as unknown.
- Conflict hotspots: `app/e2e/flows.e2e.ts`, `app/src/run-store.tsx`, `app/src/routes/bower.tsx`, `app/src/routes/home.tsx`, `app/src/routes/folder.tsx`, `agent/run.sh`, `agent/test/smoke.sh`, `vault-template/CLAUDE.md` (one `bower_rules_version` bump per PR, strictly serial). Agents rebase; the lead never resolves conflicts by hand.
- Subagents: a budget in the prompt, a commit per acceptance criterion, a wip commit on any stop, no `git stash` (one list for all worktrees), run `pnpm -C app test` directly (never through a pipe that hides the exit code), verify `gh pr list --head` before reporting.
- Never remove a worktree before its PR is merged and the agent has reported. Deploy order: Worker, then runner, then app.
