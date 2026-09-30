# PLAN.md

Resume point for the tech lead: v6, the redesign of every screen (milestones M47 to M51). The v5 plan (M34 to M46, shipped on 30 Sep 2026) is in this file's git history.

## Sources

- The boards: the owner's private canvas "Bower v5: current vs fixed" (v124), one tab per screen, phone 375 and desktop 1280, current versus proposed. Link and board paths are in every issue.
- The written design: the owner's private document "Final design decisions" with two tabs. "Final design decisions" holds rules G-1 to G-24, the per-screen decisions and the change log. "UI implementation spec" holds the requirement IDs, the components and the screens, and starts with the "Owner review, 30 Sep 2026" block that overrides the rest.
- A local snapshot for the agents, kept outside the repo because the boards contain personal data: `C:/Users/delui/Proyectos/bower-design-v6/` (boards, renders, spec, decisions, canon K-1 to K-35).
- Tie-break in every issue: Owner review > board > canon > spec > decisions.

GitHub issues #902 to #923 are the source of truth for detail. This file holds the order, the process and the state.

## Process (owner's ruling, 30 Sep 2026)

1. Every change is built and checked on the **local** demo (`pnpm -C app build:demo`, or `pnpm -C app dev` with `VITE_DEMO=1`). The demo is never deployed publicly.
2. Each PR, before merge: CI green; then a designer subagent and an app-tester subagent compare the PR on the local demo with its boards and the written design, and both must report OK. The lead reads the diff and merges (squash).
3. The demo fixture (I-0) is the data contract. The real Worker, runner and rulebook are changed only in M51, after the design gate (M50) and the owner's sign-off.
4. Production (the owner's instance) is deployed once, at the end of M51, after every milestone is done and approved.
5. Every subagent runs on Opus 5.5 at medium effort. At most five run at once. Each owns a disjoint set of files per wave (hot files are listed in each issue).
6. CI does not deploy: merges to `main` only run checks (the Worker step is a dry run).

## State (30 Sep 2026)

- Plan created. No development dispatched yet.
- Milestones M18 and M34 to M46 closed (all issues done).

## Milestones

- **M47 · v6 demo world and foundations.** Contains: CI speed (#902), the demo account rebuilt to the boards' world and data contract (#903), dark tokens and primitives (#904), and one source of truth for names, kinds, dates, counts and the file icon (#905). Source: plan-final M47 and Revision 2; spec §2, §3.5, §3.16, §5; canon K-31. Relation: starts at once. Done when the local demo shows Alex's Housing Search Australia › Moonee Ponds with "Listings" and "Projects · 7 things", every token and primitive exists with the light theme unchanged, and the helpers are unit-tested.
- **M48 · v6 shared components on the demo.** Contains: the shell (#906), overlays, ⋯ and the Help template (#907), lists and Bower's note box (#908), one explorer (#909), and the one text box with the mic (#910). Source: spec §3 with the Owner review block; plan-review §3. Relation: needs M47; #910 starts after #907 and #909 merge. Done when every shared component matches its boards at 375 and 1280 on the local demo, including the six Composer state boards in the Bower tab.
- **M49 · v6 screens on the demo.** Contains: folder views (#911), Compare and per-folder statuses (#916), note and file (#912), Home and Just filed (#913), Add and the tidy-up run (#914), the Bower tab (#915), Search and Settings (#917), intro (#918), then every Help text and the tour (#919). Source: spec §4 and each screen's boards; plan-review §6. Relation: needs M48; #916 after #911; #919 last. Done when every screen's boards have a matching screen on the local demo at 375 and 1280, each PR carrying the screenshots next to its boards.
- **M50 · v6 design gate.** Contains: the designer and app-tester walk of the whole local demo against all 209 boards and the fixes (#920), then the owner's sign-off. Source: plan-final Revision 2 point 3; spec §1.2, §1.4, §8. Relation: after M49; blocks M51. Done when both reviews report OK on `main`'s demo and the owner signs off.
- **M51 · v6 real data under the new UI.** Contains: Bower choosing statuses per folder (#921), the remaining real contracts and real-browser dictation (#922), the docs (#923), and the production deploy as the last step. Source: plan-final Revision 2 point 4; decisions E-7; spec §5. Relation: after M50's sign-off; last. Done when a signed-in person on production (the owner's instance) sees the v6 app with their own data, Compare shows the folder's own status list, and the docs describe it.

## Issues

Wave = order in the dependency graph. Budget = the agent's own ceiling (tool calls / minutes).

| Issue | Key | Title | Milestone | Wave | Depends on | Budget | Status |
|---|---|---|---|---|---|---|---|
| #902 | I-00 | CI in under three minutes: shard the end-to-end tests, fix the three flaky ones, skip heavy jobs on docs-only changes | M47 | 0 | — | 70 / 90 min | pending |
| #903 | I-0 | Demo account that matches the boards: Alex, Housing Search Australia › Moonee Ponds › Listings, Job Search Australia › Applications, Areas › Visa & Immigration, run history and per-folder status lists | M47 | 0 | — (merge after #902, see decisions) | 90 / 90 min | pending |
| #904 | I-1 | Design foundations: dark tokens, icons, buttons, chips, cards and stat tile, badges, labels, segmented control, the round button, states and hit areas, bird sizes | M47 | 0 | — | 110 / 120 min | pending |
| #905 | I-2 | One source of truth for names, kinds, dates, counts, who filed what, and the file icon | M47 | 0 | — | 80 / 80 min | pending |
| #906 | I-3 | App shell: phone top bar, tab bar with "Folders", avatar, desktop sidebar frame and nav, PageHeader, breadcrumbs with parents only | M48 | 1 | #904, #905 | 90 / 90 min | pending |
| #907 | I-4 | Overlays, the ⋯ menu and the Help template: side panel 440, sheets that hug, popover 320, one centred dialog, toast, destructive confirm | M48 | 1 | #904 | 110 / 120 min | pending |
| #908 | I-5 | Lists and Bower's note box: one list row, grid tile, folder card, loading, empty and error states, and the note box that folds | M48 | 1 | #904, #905 | 90 / 90 min | pending |
| #909 | I-6 | One explorer in three hosts: desktop sidebar contents, phone drawer with edge swipe, the Folders tab, and the Move to… picker | M48 | 1 | #904, #905 | 120 / 120 min | pending |
| #910 | I-7 | The one text box: Composer with the round mic in every state, the search field with the same box and mic, the Ask sheet, Rename and Add a paragraph | M48 | 1b | #904, #905, #907, #909 | 120 / 120 min | pending |
| #911 | I-8a | Folder views: project folder, list, grid and folder of folders, with segments, Filter & sort, the desktop preview column and folder cards | M49 | 2a | #906, #907, #908, #909, #910 | 120 / 120 min | pending |
| #912 | I-9 | Note and file pages: one header with (i) and ⋯, About this note or file as a phone sheet and a desktop column, the file tip, and the n of N footer | M49 | 2a | #906, #907, #908, #909, #910 | 100 / 100 min | pending |
| #913 | I-10 | Home and Just filed: greeting, bird and bubble, stat tiles, Pinned and Edit pinned, Recent, the latest run and earlier tidy-ups | M49 | 2a | #906, #907, #908, #909, #910 | 100 / 100 min | pending |
| #914 | I-11 | Add and the tidy-up run: new pile, doors, pile rows, Paste a link, waiting piles, the confirm, the running sheet, the run chip and the Done sheet | M49 | 2a | #906, #907, #908, #909, #910 | 120 / 120 min | pending |
| #915 | I-12 | Bower tab: the page around the text box, the bird that listens only while dictating, Things you can ask, Rules, Requests and Activity, and a rule opened | M49 | 2a | #906, #907, #908, #909, #910 | 90 / 90 min | pending |
| #916 | I-8b | Compare and status: phone cards, desktop table, sort, Columns, and a status select that reads the folder's own status list | M49 | 2b | #903, #911 (and M48) | 90 / 90 min | pending |
| #917 | I-13 | Search and Settings: the Search screen (also from Home and from a tag), and Settings with Look as a segmented control and the key box as a text box with the mic | M49 | 2b | #906, #907, #908, #909, #910 | 90 / 90 min | pending |
| #918 | I-14b | Intro: five pages with the real text box and note box as pictures, 40 px heroes, the bird's pose per page | M49 | 2b | #908, #910 (and M48) | 50 / 60 min | pending |
| #919 | I-14a | Every Help text and the tour: one Help per screen in the approved words, tap on the phone and click on desktop, and a tour that uses the same words | M49 | 3 | #911, #916, #912, #913, #914, #915, #917, #918 | 90 / 90 min | pending |
| #920 | I-15a | Design gate: walk the local demo against every board, fix the differences, one element one look, accessible names audit | M50 | 4 | all of M49 | 120 / 120 min (revise from findings) | pending |
| #921 | I-8c | Bower chooses the status list for each folder: rulebook version, the agent writes it in the hub note, the runner checks it, the app reads it on real data | M51 | 5 | #920 (owner sign-off), #916 | 80 / 90 min | pending |
| #922 | I-16 | Real data under the new UI: run start time, who filed a file, Drive ids, one title per file, search index fields, and dictation on real browsers | M51 | 5 | #920 (owner sign-off) | 90 / 100 min | pending |
| #923 | I-15b | Docs for v6 and the production release: ARCHITECTURE, runbook, brand, README screenshots, changelog, then deploy production | M51 | 6 | #921, #922 | 60 / 70 min | pending |

## Waves

- 0: I-00 (CI first), I-1, I-2; then I-0 after I-00.
- 1: I-3, I-4, I-5, I-6. 1b: I-7 after I-4 and I-6.
- 2a: I-8a, I-9, I-10, I-11, I-12. 2b: I-8b (after I-8a), I-13, I-14b.
- 3: I-14a (every Help text and the tour).
- 4: I-15a design gate, then the owner's sign-off.
- 5: I-8c, I-16. 6: I-15b docs, then the production deploy (lead, with the owner's yes).

## Decisions taken for this plan

E-3 Folders (labels only; route `/notes`, kind "Notes" unchanged). E-4 overridden: every text box and search field has the microphone; blocked dictation shows it crossed out. E-5 "new" per device. E-6 no "Try asking" card. E-7 statuses chosen by Bower per folder (hub note `statuses:`, kind list as fallback). E-8 Health check tile on desktop Home only. E-9 no "Done · 1 filed" pill, no sidebar "Just filed". E-10, E-11 ⋯ on Home and Add as drawn. E-12 demo subfolder "Listings". E-13 the sparkle stays. E-14 the tree. E-15 the spec's new copy approved. E-16 the spec's order replaces the review-tab waves. E-17 the root crumb reveals the tree. Light theme: unchanged.
