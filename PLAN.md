# PLAN.md

Resume point for the tech lead. v4, the explorer and what Bower reads (milestones M27–M33), from the 2026-09-28 design hand-off: spec `docs/superpowers/plans/2026-09-28-explorer-v4-spec.md`, boards `docs/design/v4/boards/` (the board wins over the text; the `Deck-*` boards are not built), ideas and owner answers `docs/superpowers/plans/2026-09-28-explorer-ideas.md` §11–12. GitHub issues are the source of truth for detail; this file holds the order, the process and the state. The v3 plan (M18–M26) is in this file's git history.

## State (2026-09-28)

Planned, not started: nothing is dispatched until the owner's OK. PR #576 (the design docs) is merged. M25 and M26 are closed; #560 moved to M29 and closes with #595; #556 closed as not planned (demo retired). Production is at main c7b4926 (app), Worker a6fd7396, runner 2bc2031; the published demo is still up until #585.

## Milestones

| Milestone | What | Needs |
|---|---|---|
| M27 · v4 foundations | Colours and marks, file kinds and formats, system files, kinds contract, data plumbing, the sample folder, New logic, copy fixes, demo retired | Starts at once |
| M28 · v4 find | Notes tab as the one explorer, files in the tree, reveal, virtual lists, MiniSearch search | M27 |
| M29 · Agent v7 | Moves by script (#560), bookkeeping, reconcile, report v2, callouts, kinds and companion notes, joining the dots | M27; serial inside |
| M30 · v4 seeing | Bower's note renderer, key facts and Details, note and file screens, photo viewer, More and Move, file facts | M27; Move needs M28's reveal |
| M31 · v4 folders | Folder list, grid, quick look, empty state, desktop panes, Compare | M28, M30 |
| M32 · v4 after a tidy-up | Just filed, Home after a run, Add, the working sheet | M29 report v2, M28, M31 |
| M33 · v4 ship | Docs, deploy, the tester's walk of every board | All |

## Issues

| Key | Issue | Milestone | Title | Model | Lane | Depends on | Budget | Status |
|---|---|---|---|---|---|---|---|---|
| F1 | #577 | M27 | Kinds contract: the eight document kinds, their fields, key facts, Details groups and statuses | opus/high | C | - | 60 tool calls / 45 minutes | pending |
| F2 | #578 | M27 | System files hidden everywhere, one file-kind table and the formats policy in the index | sonnet/high | B | - | 50 tool calls / 40 minutes | pending |
| F3 | #579 | M27 | Folder colours and marks: PARA tokens, FolderMark, FolderIcon, KindBadge, BowerTag, NewTag, origin squares | sonnet/medium | A | - | 45 tool calls / 35 minutes | pending |
| F4 | #580 | M27 | PARA landmarks in the logic: names without prefixes everywhere, fixed order, one count rule, the back label | sonnet/high | B | #578 | 60 tool calls / 45 minutes | pending |
| F5 | #581 | M29 | Runner and rulebook ignore system files: rclone filters both ways and a rulebook line | sonnet/high | C | #578 | 45 tool calls / 40 minutes | pending |
| F6 | #582 | M27 | Data plumbing for v4: thumbnails, media metadata, lazy note metadata, per-device stores | sonnet/high | B | - | 55 tool calls / 45 minutes | pending |
| F7 | #583 | M27 | The v4 sample folder: Alex's flat hunt, work papers and every file kind in the demo fixture and Drive stub | sonnet/high | B | #577 #578 #582 | 70 tool calls / 55 minutes | pending |
| F8 | #584 | M27 | Home and sign-up copy: one Health line, skeleton counts after sign-in, the interview's tip | sonnet/low | A | - | 30 tool calls / 25 minutes | pending |
| F9 | #585 | M27 | Retire the published demo: take bower-demo off Pages, remove its links and its deploy script | haiku/low | lead | - | 15 tool calls / 15 minutes | pending |
| N1 | #586 | M28 | Remove the phone folder menu: the Notes tab is the only explorer (reverses #319) | sonnet/medium | A | #580 | 40 tool calls / 35 minutes | pending |
| J1 | #587 | M27 | New per device: the seen set, the last run's new ids and a useNew hook every screen reads | sonnet/medium | B | #582 #583 | 35 tool calls / 30 minutes | pending |
| N2 | #588 | M28 | Tree v4: files as rows, the five landmarks with marks, 44 px chevrons, remembered expansion | sonnet/high | A | #578 #579 #580 #582 #583 #587 | 70 tool calls / 55 minutes | pending |
| N3 | #589 | M28 | The Notes tab and the desktop sidebar as the one explorer: Pinned, Your folders, first load, Expand all | sonnet/high | A | #586 #588 | 60 tool calls / 50 minutes | pending |
| N4 | #590 | M28 | Long lists: virtualise the tree past 150 rows with TanStack Virtual (adapter shared with folder lists) | sonnet/high | B | #588 | 55 tool calls / 45 minutes | pending |
| N5 | #591 | M28 | Reveal: the tree follows what you open, on the desktop sidebar and the phone's Notes tab | sonnet/high | A | #589 #590 | 55 tool calls / 45 minutes | pending |
| S1 | #592 | M28 | Search index: MiniSearch over every folder, note and file, with typo tolerance and display paths | sonnet/high | B | #578 #580 #582 #583 | 60 tool calls / 50 minutes | pending |
| S2 | #593 | M28 | Search on the phone: groups, chips, scope, before typing, no results, the bird out of the way | sonnet/high | B | #592 #579 | 60 tool calls / 50 minutes | pending |
| S3 | #594 | M28 | Desktop search: the two-column overlay with kind chips, scope and a preview of the highlighted result | sonnet/medium | B | #593 | 40 tool calls / 35 minutes | pending |
| G1 | #595 | M29 | Runner: a move keeps the file's Drive id and leaves no copy (server-side move; resolves #560) | opus/high | C | #581 | 80 tool calls / 70 minutes | pending |
| G2 | #596 | M29 | Runner books every move without AI: index.md rows, wikilinks and log.md lines | opus/high | C | #595 | 80 tool calls / 70 minutes | pending |
| G3 | #597 | M29 | Runner reconciles index.md with the Drive tree before every run (moves the person made) | opus/high | C | #596 | 70 tool calls / 60 minutes | pending |
| G4 | #598 | M29 | Run report v2: where each thing went, its old name, why it was set aside, what Bower added (runner and Worker) | opus/medium | C | #597 #583 | 75 tool calls / 65 minutes | pending |
| G5 | #599 | M29 | Rulebook: Bower's note as Obsidian callouts, every line with its origin, "Check" when it needs the person | sonnet/high | C | #598 | 35 tool calls / 30 minutes | pending |
| G6 | #600 | M29 | Rulebook: the eight kinds, companion notes for listed kinds, key facts and "Where to look" for long documents | opus/high | C | #599 #577 | 60 tool calls / 50 minutes | pending |
| G7 | #601 | M29 | Rulebook: joining the dots from the person's notes, answers that say what to check and ask, suggestions with a reason | sonnet/high | C | #600 | 40 tool calls / 35 minutes | pending |
| V1 | #602 | M30 | Bower's note renderer: callouts with origin squares, the legend, Check, Joined from, section notes, the Used line | opus/high | A | #579 #583 | 70 tool calls / 60 minutes | pending |
| V2 | #603 | M30 | Key facts and Details: KeyFacts in one to four cells, grouped Details with origins, Not in the listing, copy as questions | sonnet/high | B | #577 #579 #582 | 60 tool calls / 50 minutes | pending |
| V3 | #604 | M30 | File screens: the kind word, meta lines, CSV tables, Drive previews for Office and video, no-preview files | sonnet/high | A | #578 #579 #582 #583 | 65 tool calls / 55 minutes | pending |
| V4 | #605 | M30 | Photo viewer: fitted photo, full screen, native pinch, double tap 2×, zoom badge, next and previous | sonnet/high | B | #583 | 50 tool calls / 45 minutes | pending |
| V5 | #606 | M30 | File screen: Bower's note on the file, Where to look for long PDFs, the copies notice, previous and next, the photo viewer | sonnet/high | A | #602 #604 #605 #587 | 60 tool calls / 50 minutes | pending |
| V6 | #607 | M30 | Add from your Drive marks copies with their original, and Add says a Sheet is saved as a table | sonnet/medium | B | #582 | 30 tool calls / 25 minutes | pending |
| V7 | #608 | M30 | More menu and Move to…: Show in folders, and a folder picker that asks Bower to move it now or at the next tidy-up | sonnet/high | B | #591 #580 | 65 tool calls / 55 minutes | pending |
| V8 | #609 | M30 | Note screen: props line with the original, answers, previous and next, links to files open in the app, the title once, the About panel | sonnet/high | A | #602 #603 #587 | 65 tool calls / 55 minutes | pending |
| G8 | #610 | M30 | File facts the boards show and Drive does not: PDF pages, Excel sheets, what a ZIP holds | sonnet/high | C | #604 #598 | 50 tool calls / 45 minutes | pending |
| D1 | #611 | M31 | Folder screen: path bar, meta line, Originals and By Bower, sort, kind filter, date groups, rows, pairs | sonnet/high | A | #580 #582 #590 #603 #606 #587 | 70 tool calls / 60 minutes | pending |
| D2 | #612 | M31 | Compare: notes of the same kind side by side, cards on the phone, a sortable table on the desktop | sonnet/high | B | #577 #603 #583 | 70 tool calls / 60 minutes | pending |
| D3 | #613 | M31 | Folder grid with thumbnails, quick look, the empty state, and the Compare tab on the folder screen | sonnet/high | A | #611 #612 #608 | 65 tool calls / 55 minutes | pending |
| D4 | #614 | M31 | Desktop three panes at 1200 px and up: tree, folder, preview, and the keyboard shortcuts | sonnet/high | A | #613 #589 | 60 tool calls / 50 minutes | pending |
| D5 | #615 | M31 | Compare for receipts by month and bookings as a timeline | sonnet/medium | B | #612 | 40 tool calls / 35 minutes | pending |
| J2 | #616 | M32 | Just filed: what you added and where Bower put each thing, with its entry points in Notes, the sidebar and the Done sheet | sonnet/high | A | #587 #598 #589 #603 #606 | 65 tool calls / 55 minutes | pending |
| J3 | #617 | M32 | Home after a tidy-up: the bubble says what was filed and links to Just filed, Last tidy-up counts what is new, Recent shows key facts | sonnet/medium | B | #587 #616 #603 | 45 tool calls / 40 minutes | pending |
| J4 | #618 | M32 | Add: three doors in one row, a pile that says what each thing is, What is this? above one button that carries the count | sonnet/medium | A | #578 #579 #607 | 45 tool calls / 40 minutes | pending |
| J5 | #619 | M32 | Working sheet: each row says where it went, what Bower read and its old name, and items kept not read | sonnet/medium | B | #598 #577 #606 | 40 tool calls / 35 minutes | pending |
| Z1 | #620 | M33 | Docs for v4: ARCHITECTURE, runbook and README describe the explorer, the kinds, the formats, moves by script and the report | sonnet/medium | - | #616 #617 #618 #619 #614 #615 #601 #610 | 35 tool calls / 30 minutes | pending |
| Z2 | #621 | M33 | Walk every v4 board on the phone and the desktop in production and file what differs | sonnet/medium | - | #620 | 120 tool calls / 90 minutes | pending |

## Dispatch queue

At most three agents at once: two app slots (A, B) and the agent slot (C). A round starts when its issues' dependencies are merged, not when the previous round is fully done: a slot takes its next issue as soon as its PR is open and the next issue does not depend on it. Issues sharing a file never run at the same time (hotspots below).

| Round | Slot A | Slot B | Slot C | Batch point |
|---|---|---|---|---|
| R1 | F3 #579 | F2 #578 | F1 #577 | F9 (lead, after the owner's OK) |
| R2 | F4 #580 | F6 #582 | F5 #581 |  |
| R3 | F7 #583 | F8 #584 | G1 #595 |  |
| R4 | J1 #587 | N1 #586 | G2 #596 | Batch deploy 1: app (M27) and runner (F5, G1, G2). |
| R5 | S1 #592 | V2 #603 | G3 #597 |  |
| R6 | N2 #588 | V1 #602 | G4 #598 | Deploy: Worker then runner (G4). |
| R7 | N3 #589 | S2 #593 | G5 #599 |  |
| R8 | N4 #590 | V3 #604 | G6 #600 |  |
| R9 | N5 #591 | V4 #605 | G7 #601 | Batch deploy 2: app (M28) and runner (M29 rulebook v18). Tester smoke walk 1 (Find). |
| R10 | S3 #594 | V6 #607 | V8 #609 | Lane C is free from here and takes app issues. |
| R11 | V5 #606 | V7 #608 | D2 #612 |  |
| R12 | D1 #611 | J4 #618 | G8 #610 |  |
| R13 | D3 #613 | J5 #619 | D5 #615 |  |
| R14 | D4 #614 | J2 #616 |  |  |
| R15 | J3 #617 |  |  |  |
| R16 |  |  | Z1 #620 | Batch deploy 3: Worker, runner, app (everything). |
| R17 |  |  | Z2 #621 | Tester walk of every board (Z2), then fixes. |

Critical path: the agent chain F5 → G1 → G2 → G3 → G4 → G5 → G6 → G7 (one `bower_rules_version` bump per PR: v13 F5, v14 G2, v15 G4, v16 G5, v17 G6, v18 G7). Find comes first among the screens (D4).

## Process for speed (owner's request, 2026-09-28)

- **Agents test narrowly.** While working, an agent runs only typecheck, the unit tests of the files it touches and its own new e2e file (`app/e2e/v4-*.e2e.ts`); the full `pnpm lint && pnpm typecheck && pnpm test` once before the PR; `pnpm build` and the full e2e suite run in CI only. Never pipe tests through `tail`. New e2e tests go in per-issue files, not in `flows.e2e.ts`.
- **Agents do not wait for CI.** They open the PR and report; the lead watches CI.
- **The lead reviews and merges in batches.** When the two or three PRs of a round are open, the lead reads their diffs together and merges every green one directly (branch protection is not strict, so no `update-branch` and no second CI wait per PR). After a batch: one CI run on main plus one local `pnpm -C app e2e`; if main breaks, the offending squash is reverted and its issue reopened (never fix forward).
- **Local re-runs only where they pay:** security-relevant diffs (#602 renderer, the runner chain), resumed branches, reported deviations.
- **Deploys and tester walks per batch point, not per PR:** three deploys (after R4, R9, R16) in the order Worker, runner, app; two tester walks (Find after R9, everything in #621).
- **Budgets** are in each issue's Agent profile; an agent at its limit stops with a `wip:` commit and reports `timeout`; the lead resumes it from the branch.

## Rules of the road

- Hotspots (one in-flight issue at a time): `app/src/components/tree.tsx`, `explorer.tsx`, `layout.tsx` and `layout.css`, `routes/folder.tsx`, `routes/note.tsx`, `routes/file.tsx`, `routes/home.tsx`, `routes/add.tsx`, `components/switcher.tsx`, `app/src/demo/fixture.ts`, `app/e2e/flows.e2e.ts`, `agent/run.sh`, `agent/test/smoke.sh`, `vault-template/CLAUDE.md`, `pnpm-lock.yaml`.
- Two new dependencies approved by the owner (D3): MiniSearch (#592) and TanStack Virtual core (#590). No other.
- Commit per acceptance criterion, `wip:` commit on stop, no `git stash`, rebase on main before the PR, never `gh pr merge --delete-branch` while a worktree uses the branch.
- Commit identity `Pablo de Luis <deluispablo@users.noreply.github.com>`; squash subject "<issue title> (#PR)", body `Closes #N`.
- Deploy order Worker, runner, app. The owner applies each rulebook update from the app ("Update Bower's rules").

## Lead rulings the owner may override

- Excel files: the file screen says "Bower keeps it, not reads it; editing happens in Drive or Excel." instead of the board's "Bower reads it as it is" (D11 and `System-Formats` say Excel is kept, not read) (#578, #604).
- The search screen's empty state has four PARA chips, no Inbox, as `Phone-Search-Start` draws (the spec says five) (#593).
- Move to… never offers Inbox as a destination, as `Phone-Move-Picker` draws (#608).
- The CSV preview shows up to 200 rows with the board's line "Showing <shown> of <total> rows…"; the board's "5 of 24" is read as sample content (#604).
- The Compare status "Viewing Sat" comes from a listing's `viewing` date while its status is "to view"; the status list stays the owner's (#577).
- Answers and Clippings get meaning lines (owner's Q1 answer) although `Main` draws them without (#580).
- Additions so the boards are built exactly: file facts for pages, sheets and ZIP contents (#610, P2); Compare by month for receipts and as a timeline for bookings, from `System-Kinds` (#615, P2); the working sheet's rows from `Flow-04-Working` (#619).

## Coverage

Every requirement ID of the spec (R-SYS, R-NOTES, R-REVEAL, R-SEARCH, R-FOLDER, R-COMP, R-NOTE, R-FILE, R-PHOTO, R-MOVE, R-JUST, R-ADD, R-DESK, R-ONB, R-PERF, R-AG, R-RUN, R-API, R-DATA) and every non-deck board is named in at least one issue (checked by script on 2026-09-28). R-PERF-3 (Drive changes feed) is deferred by the owner (Q4). The deck (`Deck-*`) is not built (D14). Q5 (take the demo down) is #585.

## Owner items outside v4

#427 (Cloudflare JavaScript Detections), `GITHUB_TOKEN` with `actions: read` in the instance repo (#490), OAuth verification or `drive.file`, the rulebook update to v12 (then v13–v18 as they ship), Dependabot #473 and #474, stale stashes and worktree folders on the owner's machine.
