# PLAN.md

Resume point for the tech lead: v5, runs, notes, folders and Bower on screen (milestones M34 to M46). It comes from the 2026-09-29 design hand-off, spec `docs/superpowers/plans/2026-09-29-runs-notes-folders-spec.md` (PR #727, at 0dd037c). The boards are the private canvas "Bower v5: runs, notes, folders"; when a board and the spec disagree, the board wins.

GitHub issues #728 to #799 are the source of truth for detail. This file holds the order, the process and the state. The v4 plan (M27 to M33) is in this file's git history (#622).

## State (2026-09-29, evening)

Dispatched on the owner's OK. The owner gave the lead full control: merges, production deploys at the batch points (Worker, then runner, then app), the #789 measurement run and applying rulebooks v21 and v22 on the instance, and escalations (decided on zero cost and security, reported at the end).

- Specs #727, PLAN #800 and the README #801 are merged; production is at main 905ed7d.
- Up to ten agents at once: eight developers, one designer and one app-tester. The designer and the tester review what lands against the boards and the spec, walk the demo locally per batch and production read-only after each deploy, and report findings to the lead, who files them as issues.
- Issues that are small, disjoint and in the same area are bundled into one PR (one branch, "Closes" per issue) to save CI and review rounds. The rounds below are the dependency order, not a limit of three slots.
- Merged (29 Sep, night): #728, #729, #733–#736, #738–#753, #755–#759, #761–#763, #767, #772, #775, #779, #782–#784, and the review fixes #811, #825, #826, #837 (e2e green again), #833 (startup budget 170 KB, follow-up #834).
- In flight: #730, #732 (opus), #754, #760, #764, #768, #773, #847. Lead state (prompts, rulings, merge helpers, QA walk harness) lives in the lead session's scratchpad.
- New issues from reviews: #811, #825, #826, #834, #837, #847. PRs are merged only when the e2e job is green, or fails only where main already fails.

## Milestones

| Milestone | What | Issues | Needs |
|---|---|---|---|
| M34 · v5 contracts | Worker and runner report fields, hold-back and Finish, text copies and PDFs, rulebook v21, push copy and limit, tokens, test kit | #728–#735 | Starts at once |
| M35 · v5 missing folder | Worker pointer rules and `vault_missing`, runner check, recovery screens, offline and caches | #736–#739 | M34 Worker and runner |
| M36 · v5 primitives | Overlay and its queue, layout slots, hint/info-pop/header-action, RunOutcome, isBowerWritten, inbox count, send to Bower, money period, Bower v9 and new poses, the mark, the presence store | #740–#750 | M34 |
| M37 · v5 after a tidy-up | The bar and chip, the sheet, confirm, Home, Just filed, Requests | #751–#756 | M36 |
| M38 · v5 Bower's notes | The note box, the header and Made from, pager and About, text copies | #757–#760 | M36 |
| M39 · v5 folders | Folder order, Filter & sort, the sidebar, Compare, Rename, two-line titles | #761–#766 | M36 |
| M40 · v5 uploads, then piles | Durable queue, upload chip, pile store, Add as piles, piles everywhere | #767–#771 | M34 (#730), M36 |
| M41 · v5 overlays, tour, help, hints | Four migration groups, the tour with Bower pointing, hints, the overlay e2e | #772–#778 | M36, M37 |
| M42 · v5 dictation | The button, five boxes with Listening, language and privacy | #779–#781 | M36; M37 and M40 for mounting |
| M43 · v5 Bower on screen | Ledge, bar bird, reading, placement, settle and nap, the room gate | #782–#787 | M37, M38, M40, M41, M42 |
| M44 · v5 how Bower thinks | Runner History lines and disagree/next, the turn measurement, rulebook v22, what a run means, verdict, history, front page, richer Compare | #788–#795 | M34 deployed; M37, M38, M39 |
| M45 · v5 intro and Learn Bower | Five true pages, Learn Bower | #796–#797 | Truth guard: M34, M37, M44 |
| M46 · v5 ship | Docs, deploy, walk every board | #798–#799 | All |

## Issues

Wave = depth in the dependency graph. Budgets are the agent's own ceilings.

| Key | Issue | Milestone | Title | Model | Wave | Depends on | Budget | Status |
|---|---|---|---|---|---|---|---|---|
| C1 | #728 | M34 | Worker: the run report carries created, updated, left and phase, capped and validated, with shared fixture builders | opus/high | 1 | - | 70 tool calls / 60 minutes | merged |
| C2 | #729 | M34 | Runner: report created, updated, left and phase, on failed runs too, and write them to last-run.json | opus/high | 2 | #728 | 80 tool calls / 70 minutes | merged |
| C3 | #730 | M34 | Runner: hold back late files and pile notes, and finish a partly done tidy-up without writing notes twice | opus/high | 3 | #729 | 70 tool calls / 60 minutes | merged |
| C4 | #731 | M34 | Runner: append the full text to a document's text copy, convert text PDFs with pdftotext, audit note names | sonnet/high | 4 | #730 | 60 tool calls / 50 minutes | merged |
| C5 | #732 | M34 | Rulebook v21: by: bower, Bower's note on every generated note, text copies, rule changes, names, piles, rename, Finish | opus/high | 3 | #729 | 60 tool calls / 50 minutes | merged |
| C6 | #733 | M34 | Worker: push body in the four counts, and a default daily limit of 100 runs | sonnet/medium | 2 | #728 | 35 tool calls / 30 minutes | merged |
| C7 | #734 | M34 | Tokens for v5: scrim, warn, danger and success tints, updated, stacking order, sheet radius, sidebar width, accent line | sonnet/medium | 1 | - | 40 tool calls / 35 minutes | merged |
| C8 | #735 | M34 | Test kit for v5: motion helper, demo fixture states, shared matchMedia and SpeechRecognition stubs | sonnet/high | 2 | #728 | 50 tool calls / 40 minutes | merged |
| V1 | #736 | M35 | Worker: create over a dead folder pointer, refuse a trashed folder, mark a missing vault, vault_missing everywhere | opus/high | 2 | #728 | 70 tool calls / 60 minutes | merged |
| V2 | #737 | M35 | Runner: check the Bower folder before sync down and sync up, fail with vault_missing and upload nothing | sonnet/high | 5 | #731 #736 | 50 tool calls / 45 minutes | merged |
| V3 | #738 | M35 | App: check the Bower folder, route a missing, trashed or unreachable one to the recovery screens | sonnet/high | 3 | #736 | 65 tool calls / 55 minutes | merged |
| V4 | #739 | M35 | App: offline is never missing; caches keyed by folder, other tabs follow a re-point, the folder name from Drive | sonnet/high | 4 | #738 | 55 tool calls / 45 minutes | merged |
| P1 | #740 | M36 | Overlay and its queue: one modal at a time, scrim, inert page, scroll lock, focus trap | opus/high | 2 | #734 | 70 tool calls / 60 minutes | merged |
| P2 | #741 | M36 | Layout slots for v5: the tidy-up bar, upload chip, breadcrumb, OverlayHost, sidebar width and the ledge | sonnet/high | 3 | #740 | 55 tool calls / 45 minutes | merged |
| P3 | #742 | M36 | Hint, info-pop and header-action components | sonnet/medium | 2 | #734 | 40 tool calls / 35 minutes | merged |
| P4 | #743 | M36 | RunOutcome: one run result, runSentence, cleanQuote and run-summary | sonnet/high | 2 | #728 | 50 tool calls / 40 minutes | merged |
| P5 | #744 | M36 | One rule for "By Bower": isBowerWritten everywhere | sonnet/medium | 1 | - | 35 tool calls / 30 minutes | merged |
| P6 | #745 | M36 | inbox-count.ts: the single source of the inbox number, things and requests apart | sonnet/medium | 1 | - | 35 tool calls / 30 minutes | merged |
| P7 | #746 | M36 | Send to Bower: one sheet for Rename, Move, Ask and suggestion chips, and one "Just this, now" helper | sonnet/high | 3 | #740 | 60 tool calls / 50 minutes | merged |
| P8 | #747 | M36 | Money keeps its period and a score tile leads the key facts | sonnet/medium | 1 | - | 35 tool calls / 30 minutes | merged |
| P9 | #748 | M36 | Bower v9 and four new poses: listening, pointing, reading, perched, and the hop-turn | sonnet/high | 3 | #735 | 60 tool calls / 50 minutes | merged |
| P10 | #749 | M36 | The still mark under 40 px, with size guards | sonnet/medium | 4 | #748 | 40 tool calls / 35 minutes | merged |
| P11 | #750 | M36 | One animated Bower per screen: the presence store, one Home greeting, pause off screen | sonnet/high | 5 | #749 | 55 tool calls / 45 minutes | merged |
| R1 | #751 | M37 | The tidy-up bar on phones and the chip on desktop, in four states, on every screen but Home | sonnet/high | 4 | #741 #743 | 60 tool calls / 50 minutes | merged |
| R2 | #752 | M37 | The tidy-up sheet on Overlay: steps, Partly done with Finish, rows with Needs you first | sonnet/high | 5 | #751 #740 | 65 tool calls / 55 minutes | merged |
| R3 | #753 | M37 | Is that everything? on Overlay, labelled, with one count that never flashes 0 | sonnet/medium | 3 | #740 #745 | 35 tool calls / 30 minutes | merged |
| R4 | #754 | M37 | Home after a tidy-up: the greeting carries the run, one counts line, no done toast | sonnet/high | 6 | #751 #743 #745 #750 #739 | 55 tool calls / 45 minutes | merged |
| R5 | #755 | M37 | Just filed as a table: what Bower did, now called, where it is, what changed, with earlier tidy-ups | sonnet/high | 3 | #743 | 60 tool calls / 50 minutes | merged |
| R6 | #756 | M37 | Requests never vanish: waiting, running, done and did-not-finish rows, Activity on RunOutcome | sonnet/high | 4 | #743 #746 | 60 tool calls / 50 minutes | merged |
| N1 | #757 | M38 | Bower's note box: summary, key facts once, details, what to check, folding and the rule-change line | sonnet/high | 5 | #744 #747 #749 | 70 tool calls / 60 minutes | merged |
| N2 | #758 | M38 | A note Bower wrote: kind row, status, Made from that folds, the folder's name on the back button | sonnet/high | 6 | #742 #757 | 60 tool calls / 50 minutes | merged |
| N3 | #759 | M38 | Note pager after the body, the About panel without key facts, 44 px small controls | sonnet/medium | 7 | #758 | 40 tool calls / 35 minutes | merged |
| N4 | #760 | M38 | The text copy of a document: its original's name, Made from, Bower's note, then the document | sonnet/medium | 8 | #759 #735 | 40 tool calls / 35 minutes | merged |
| F1 | #761 | M39 | Folder view in one list: header, header actions, filters with an (i), subfolders first, the path once on desktop | sonnet/high | 4 | #741 #742 #746 #744 | 65 tool calls / 55 minutes | merged |
| F2 | #762 | M39 | Phone folders: one Filter & sort button, scores read out, "Where" and "No date" | sonnet/medium | 5 | #761 #740 | 40 tool calls / 35 minutes | merged |
| F3 | #763 | M39 | A resizable sidebar and tree rows named by their item | sonnet/high | 4 | #741 | 55 tool calls / 45 minutes | merged |
| F4 | #764 | M39 | Compare: a Sort sheet on phones, Your score, extra number columns, values that wrap | sonnet/high | 6 | #762 #740 #747 | 60 tool calls / 50 minutes | merged |
| F5 | #765 | M39 | Rename… in More: validated, waits for the tidy-up, and shows on the thing until then | sonnet/high | 9 | #746 #756 #761 #760 #732 | 55 tool calls / 45 minutes | merged |
| F6 | #766 | M39 | Phone lists wrap titles to two lines | sonnet/low | 7 | #763 #764 #754 | 25 tool calls / 20 minutes | merged |
| U1 | #767 | M40 | Durable upload queue: IndexedDB copies, Drive resumable sessions, one tab, per user | opus/high | 3 | #735 | 75 tool calls / 65 minutes | merged |
| U2 | #768 | M40 | Upload chip, resume after a reload, sign out with uploads unfinished | sonnet/high | 6 | #767 #741 #752 | 60 tool calls / 50 minutes | merged |
| U3 | #769 | M40 | Piles: each pile is a context note in the inbox from its first file, flushed before a tidy-up | opus/high | 4 | #767 #730 | 70 tool calls / 60 minutes | merged |
| U4 | #770 | M40 | Add as piles: the new pile card, waiting piles, Added from elsewhere, one sticky Tidy up | sonnet/high | 7 | #769 #768 #740 #745 | 70 tool calls / 60 minutes | merged |
| U5 | #771 | M40 | Piles everywhere after a tidy-up: grouped by pile, Remove this pile, the two-pile e2e | sonnet/high | 8 | #770 #752 #753 #755 | 55 tool calls / 45 minutes | merged |
| O1 | #772 | M41 | Sheets on Overlay: pin, rule, folder picker and Move | sonnet/medium | 3 | #740 | 50 tool calls / 40 minutes | merged |
| O2 | #773 | M41 | Help on Overlay: a right panel on desktop with Tips on this screen, and the push prompt queued | sonnet/high | 5 | #740 #742 #751 | 50 tool calls / 40 minutes | merged |
| O3 | #774 | M41 | Menu and viewers on Overlay: note menu, quick look, photo viewer | sonnet/medium | 10 | #740 #765 | 50 tool calls / 40 minutes | merged |
| O4 | #775 | M41 | The switcher on Overlay | sonnet/medium | 3 | #740 | 40 tool calls / 35 minutes | merged |
| O5 | #776 | M41 | The tour as a modal where Bower points at the tab, with Back and Skip | sonnet/high | 6 | #773 #748 #750 | 60 tool calls / 50 minutes | merged |
| O6 | #777 | M41 | Every tip becomes a Hint, one per screen, and suggestion chips open the send-to-Bower sheet | sonnet/medium | 7 | #742 #746 #754 #764 #756 | 50 tool calls / 40 minutes | merged |
| O7 | #778 | M41 | e2e: with any overlay open, the page behind takes no tap and does not scroll | sonnet/medium | 11 | #772 #773 #774 #775 #776 #752 #753 #764 #770 | 40 tool calls / 35 minutes | merged |
| D1 | #779 | M42 | The dictate button: ready, asking, listening, blocked, not available | sonnet/high | 3 | #735 #742 | 55 tool calls / 45 minutes | merged |
| D2 | #780 | M42 | Dictation in the five writing boxes, with Bower listening while the microphone is on | sonnet/medium | 9 | #779 #771 #756 #748 | 50 tool calls / 40 minutes | merged |
| D3 | #781 | M42 | Dictation language in Settings, and the Privacy page says where the audio goes | sonnet/medium | 7 | #779 #768 | 35 tool calls / 30 minutes | merged |
| B1 | #782 | M43 | Bower's ledge at the foot of the desktop sidebar: perched at rest, flying during a run | sonnet/medium | 6 | #741 #750 #751 #763 | 40 tool calls / 35 minutes | merged |
| B2 | #783 | M43 | Bower inside the phone tidy-up bar: flying, done once, confused | sonnet/medium | 6 | #751 #750 | 35 tool calls / 30 minutes | merged |
| B3 | #784 | M43 | Bower reads inside Bower's note while "Just this, now" writes it | sonnet/medium | 6 | #757 #756 #748 | 40 tool calls / 35 minutes | merged |
| B4 | #785 | M43 | Bower in place: asleep in empty folders and the inbox, peeking by search and the drop zone, with room | sonnet/medium | 10 | #762 #777 #780 #775 | 40 tool calls / 35 minutes | merged |
| B5 | #786 | M43 | Bower settles after 10 seconds, reacts to what happens, and naps when tapped | sonnet/high | 11 | #782 #783 #785 #754 | 55 tool calls / 45 minutes | merged |
| B6 | #787 | M43 | e2e gate: nothing clips Bower on any route or state, at 375 and 1280 | sonnet/high | 12 | #784 #786 #778 #771 #738 | 60 tool calls / 50 minutes | pending |
| T1 | #788 | M44 | Runner: write the mechanical History lines, and report disagreements and next steps | opus/high | 6 | #737 #728 | 75 tool calls / 65 minutes | merged |
| T2 | #789 | M44 | Spike: measure a 10-item pile's turns and set DEFAULT_MAX_TURNS for rulebook v22 | sonnet/medium | 7 | #788 #732 | 30 tool calls / 60 minutes | pending |
| T3 | #790 | M44 | Rulebook v22: how Bower thinks, verdicts, Reference, Next steps, History, apply_link and made_for | opus/high | 8 | #789 | 60 tool calls / 50 minutes | pending |
| T4 | #791 | M44 | Things that disagree and Next for you on the sheet, Just filed and Activity | sonnet/medium | 9 | #788 #771 #777 | 40 tool calls / 35 minutes | merged |
| T5 | #792 | M44 | Verdict and Apply first, and "Made for it" on a note | sonnet/high | 9 | #790 #784 #760 | 50 tool calls / 40 minutes | pending |
| T6 | #793 | M44 | History in each note: a status change appends one dated line | sonnet/medium | 9 | #760 #777 | 35 tool calls / 30 minutes | merged |
| T7 | #794 | M44 | Project front page: Next steps to tick, Best so far, Reference | sonnet/high | 11 | #790 #785 #764 | 55 tool calls / 45 minutes | pending |
| T8 | #795 | M44 | Compare: choose columns, Made for it and Apply columns, Copy as table | sonnet/high | 10 | #792 #793 | 50 tool calls / 40 minutes | pending |
| I1 | #796 | M45 | The intro in five true pages: resumable by URL, focus on the heading, Back on phones | sonnet/high | 10 | #731 #732 #751 #756 #790 #791 #749 #735 | 65 tool calls / 55 minutes | pending |
| I2 | #797 | M45 | Learn Bower: a public page with how it works and six examples, reachable from sign-in, Settings and help | sonnet/high | 11 | #796 #739 #781 #776 | 60 tool calls / 50 minutes | pending |
| Z1 | #798 | M46 | Docs for v5: ARCHITECTURE, runbook, README and brand describe runs, piles, uploads, recovery and Bower on screen | sonnet/medium | 13 | #787 #795 #797 #794 | 35 tool calls / 30 minutes | pending |
| Z2 | #799 | M46 | Deploy v5 and walk every v5 board on the phone and the desktop in production | sonnet/medium | 14 | #798 | 120 tool calls / 90 minutes | pending |
## Dispatch queue

Superseded on dispatch: up to eight developers run at once, filling any issue whose dependencies are merged; the rounds keep the dependency order and the hotspot rule.

- A round starts when its issues' dependencies are merged, not when the whole previous round is done.
- Issues that share a hotspot file never run at the same time.
- Every issue in a round has its dependencies in earlier rounds.

| Round | Slot A | Slot B | Slot C | Batch point |
|---|---|---|---|---|
| R1 | C7 #734 | P5 #744 | C1 #728 | |
| R2 | P8 #747 | P6 #745 | C2 #729 | |
| R3 | P1 #740 | P4 #743 | C3 #730 | |
| R4 | P3 #742 | C8 #735 | C4 #731 | |
| R5 | P2 #741 | P9 #748 | C5 #732 | |
| R6 | P7 #746 | P10 #749 | C6 #733 | |
| R7 | R1 #751 | P11 #750 | V1 #736 | |
| R8 | R3 #753 | R5 #755 | V2 #737 | Batch deploy 1: Worker (#728, #733, #736), then runner (#729–#731, #737), then app. The owner applies rulebook v21 (#732). |
| R9 | V3 #738 | R6 #756 | U1 #767 | |
| R10 | V4 #739 | R2 #752 | N1 #757 | |
| R11 | R4 #754 | F1 #761 | U3 #769 | |
| R12 | F3 #763 | F2 #762 | U2 #768 | |
| R13 | O1 #772 | O4 #775 | T1 #788 | |
| R14 | D1 #779 | N2 #758 | U4 #770 | Batch deploy 2: Worker and runner (#788), then app (M35–M37). Tester smoke walk of the run story. |
| R15 | O2 #773 | F4 #764 | T2 #789 | T2 is the owner's measurement run on the instance (fictional files). |
| R16 | N3 #759 | B1 #782 | B2 #783 | |
| R17 | O5 #776 | N4 #760 | U5 #771 | |
| R18 | F6 #766 | O6 #777 | T3 #790 | |
| R19 | D3 #781 | F5 #765 | D2 #780 | |
| R20 | B3 #784 | O3 #774 | T4 #791 | |
| R21 | B4 #785 | T5 #792 | T6 #793 | Batch deploy 3: runner, then app. The owner applies rulebook v22 (#790). |
| R22 | O7 #778 | T7 #794 | T8 #795 | |
| R23 | B5 #786 | I1 #796 | | |
| R24 | B6 #787 | I2 #797 | | |
| R25 | | | Z1 #798 | Batch deploy 4: Worker, runner, app (everything). |
| R26 | | | Z2 #799 | Tester walk of every board, then fixes. |

**Critical paths:**

- Agent chain: #728 → #729 → #730 → #731 → #737 → #788 → #789 (owner) → #790. Every `agent/run.sh` issue is serial.
- UI chain: #740 → #741 → #751 → #752 → #768 → #770 → #771 → #780 → #785 → #786 → #787.
- Rulebook bumps: v21 in #732, v22 in #790 (D35).

## Process

As for v4:

- **Agents test narrowly.** While working, an agent runs typecheck, the unit tests of the files it touches and its own new e2e file (`app/e2e/v5-*.e2e.ts`). It runs the full `pnpm lint && pnpm typecheck && pnpm test` once before the PR. `pnpm build` and the full e2e suite run in CI.
- **Agents do not wait for CI.** They open the PR and report; the lead watches CI.
- **The lead reviews and merges in batches, one squash at a time.** After a batch: one CI run on main plus one local `pnpm -C app e2e`. If main breaks, revert the offending squash and reopen its issue; never fix forward.
- **Local re-runs** only for security-relevant diffs (#736, the runner chain, #767), resumed branches and reported deviations.
- **Deploys and tester walks** happen at batch points only, in the order Worker, runner, app.
- **Tests first** (spec §7c): contracts, then primitives, then screens. Test infrastructure lands in the milestone that first needs it:
  - #728: fixture builders;
  - #735: `motion.ts`, demo states, browser stubs;
  - #750: presence reset;
  - #767: fake resumable Drive;
  - #787: `bird-room.ts` and `bird-screens.ts`;
  - #736: failure-reason parity;
  - #757: `BOOKKEEPING_KEYS` parity.

## Rules of the road

**Hotspots** (one in-flight issue at a time):

| File | Issues, in order |
|---|---|
| `app/src/components/layout.tsx`, `layout.css` | #741 only; others use `shell-slots.ts` |
| `routes/home.tsx` | #739 (offline hint), #750, #754, #777, #785, #786 |
| `routes/note.tsx` | #744, #758, #759, #760, #765, #793 |
| `routes/folder.tsx` | #749, #761, #762, #785, #794 |
| `routes/add.tsx` | #770, #771, #780, #785 |
| `routes/bower.tsx` | #756, #777, #780 |
| `components/compare.tsx` and `compare.ts` | #762, #764, #777, #793, #795 |
| `components/key-facts.tsx` | #747, #757, #792 |
| `components/details.tsx` | #757 only |
| `components/bird.tsx`, `bird.css` | #748, #749, #750, #786 |
| `components/bower-note-box.tsx` | #757, #784, #792 |
| `components/help-sheet.tsx` | #773, #776, #797 |
| `app/src/session.tsx` | #738, #739, #797 |
| `app/src/demo/fixture.ts` | #735, #760 |
| `agent/run.sh` | #729, #730, #731, #737, #788, #789 |
| `vault-template/CLAUDE.md` | #732, #790 |
| `api/src/runner.ts` | #728, #736, #788 |
| `api/src/types.ts` | #728, #736 |
| `app/src/kinds.ts` | #747, #790 |

**Working rules:**

- No new app dependency. poppler-utils in the runner job is owner-approved (R-AG-9).
- Commit per acceptance criterion, a `wip:` commit on stop, no `git stash`, rebase on main before the PR. Never use `gh pr merge --delete-branch` while a worktree uses the branch.
- Commit identity: `Pablo de Luis <deluispablo@users.noreply.github.com>`. Squash subject "<issue title> (#PR)", body `Closes #N`.
- Personal data: none in code, tests, fixtures or PRs. Use `you@example.com`, `FOLDER_ID`, `Alex`.

## Lead rulings the owner may override

- **Verdict, Apply and the rest of 6.18 move to M44.** R-VERDICT (#792), R-HIST-1 (#793), R-FRONT (#794) and R-CMP-7 to 9 (#795) sit with rulebook v22, because R-VERDICT-2's parity test needs `apply_link` in the v22 rulebook. Spec §8 item 11 had placed them with the notes group.
- **R-MEAN-1 is a runner and Worker issue after the contracts** (#788, with the History lines of R-RUNNER-9), since the agent writes `checks.txt` only under v22.
- **R-OVL-2's four groups:**
  - sheets: pin, rule, folder picker and Move (#772); the tidy confirm moved with R-CONF in #753;
  - dialogs: help and the push prompt (#773);
  - menu and viewers (#774);
  - the switcher (#775).
  - The Rename and Sort overlays are built on Overlay in #765 and #764.
- **Touch targets (spec §5)** are assigned to the issue that owns each control:
  - fold toggle: #757;
  - outline links: #759;
  - path rows: #761;
  - tree rows: #763;
  - Compare selects: #764;
  - suggestion chips: #777.
- **The accent-line sweep** across focus rings, the spinner and the progress bar is in the tokens issue (#734), in round 1, before any screen work.
- **Sidebar logo:** R-SIDE adds no logo, so there is no sidebar-logo bird.

## Spec text still inconsistent (the issues follow the decisions)

- §7 ("bump once for all of these"), R-AG-11 ("One bump with R-AG-1 to R-AG-10") and §6.20 ("R-AG-1 to R-AG-11 in one bump") contradict D35. The issues follow D35: two bumps.
- Appendix A has no CSS for the mark (`.b.mark`, which must also hide `bl` and `ir`), the still classes `s-point`, `s-read` and `s-perch`, or `settled`. #748, #749 and #786 derive them from the held key frames.
- R-SIDE-2's text still says "inline in `layout.tsx`… before first paint". T15 chose the first-render read, and #741 follows T15.

## Coverage

- Every requirement id of the spec is named in at least one issue (189 ids, checked by script on 2026-09-29): R-RUN, R-CHIP, R-SHEET, R-CONF, R-HOME, R-JUST, R-REQ, R-OVL, R-NOTE, R-INS, R-KF, R-FOLD, R-SIDE, R-CMP, R-MORE, R-ASK, R-HINT, R-ADD, R-PILE, R-UPL, R-DICT, R-FRONT, R-VERDICT, R-HIST, R-MEAN, R-INTRO, R-LEARN, R-VAULT, R-BIRD, R-RUNNER, R-AG and R-INBOX-1.
- R-BIRD-7 is absorbed by #796.
- Both spikes are issues: the rclone 404 behaviour is the first criterion of #737; the turn measurement is #789.

## Owner items

- The OK to dispatch.
- #789: the measurement run on the instance.
- The deploys, and applying rulebook v21 and v22.
