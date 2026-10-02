# PLAN.md

Resume point for the tech lead: M55, fixes from the production test of 2 Oct 2026. M52–M54 (faster tidy-up, filing sheet, start-up screen) shipped to production on 2 Oct 2026 from `main` 545496b7; their plan is in this file's git history.

## Source

- The production test report of 2 Oct 2026 (held by the lead, not committed: it was written from the owner's real documents). Finding IDs (1.1, 4.3, …) in the issues refer to it.
- Designer and tech-lead verdicts on the findings, folded into the issues.
- Owner rulings, 2 Oct 2026:
  - effort: high only for real instructions, medium for a run whose only reason is a context note, low otherwise;
  - an answer about a file stays in `Answers/`, and the file shows the question with a link to its answer;
  - "your Claude plan" becomes "the Claude plan this Bower runs on".

## Process

1. Every subagent runs on Opus 5.5 at medium effort, at most five at once, in its own worktree, and owns a disjoint set of files per wave.
2. Each PR: CI green; the lead reads the diff and merges (squash). PRs that change `agent/run.sh` (#995, #1000) get a reviewer subagent first.
3. After #1000 merges, the lead runs the benchmark (`agent/bench/run-bench.sh m55`) and compares with the M52 final numbers.
4. Production only with the owner's yes, at the end: Worker, runner (`scripts/new-instance.sh`), app (Pages); then the owner applies rules v26 in Settings.

## Milestone

**M55 · Fixes from the production test** (GitHub milestone 56). Done when a fresh account can add a pile with long-named files, a link and a question, tidy up, and see every item filed with the truth in Just filed, Requests and Home, while signing out in one tab ends Drive access in the others.

## Issues

Budget = the agent's own ceiling (tool calls / minutes).

| Issue | Title | Wave | Depends on | Owns | Budget | Status |
|---|---|---|---|---|---|---|
| #994 | Security: signing out in one tab leaves the other tabs reading Drive | 1 | — | session and Drive token code in `app/src`, settings sign-out, security notes | 90 / 90 | merged (#1008) |
| #995 | fix(agent): the filing sheet files long names instead of refusing them forever | 1 | — | `agent/run.sh`, `agent/test/filing.test.sh` | 120 / 120 | merged (#1006) |
| #996 | Rules v26: answers tied to their file, kept names of any length, unreadable links | 1 | — | `vault-template/CLAUDE.md`, `api/src/template.generated.ts`, `app/src/rulebook-retired.ts`, rulebook tests, `agent/test/smoke.sh`, `docs/changelog.md` | 90 / 90 | merged (#1005) |
| #997 | fix(app): Just filed and Requests tell what really happened | 1 | — | `run-outcome.ts`, `just-filed.*`, `bower-tab.ts`, Requests in `routes/bower.tsx`, Bower box confirmation | 120 / 120 | merged (#1011) |
| #998 | fix(app): one name and one count for every item, on every screen | 1 | — | `navigation.ts`, pinned, quick switcher, folder items, `routes/add.tsx`, `add-queue-store.ts`, `shell-routes.ts` | 100 / 100 | merged (#1010) |
| #999 | fix(app): onboarding questions keep what the person picks | 1 (next free slot) | — | `routes/onboarding.tsx`, `components/interview.tsx`, `interview.ts` | 90 / 90 | merged (#1009) |
| #1000 | fix(agent): medium effort for piles with a line, truthful run report, failure reasons | 2 | #995 | `agent/run.sh`, agent tests (not smoke), workflows (effort var), `api/src/process.ts`, `api/src/status.ts`, runbook, ARCHITECTURE | 120 / 120 | merged (#1016) |
| #1001 | fix(app): no stale inbox after a run, one run clock, the running run in Activity | 2 | — | `run-store.tsx`, `vault-store.tsx` (refresh state), `routes/home.tsx`, `home.ts`, `activity-panel.tsx`, run chip/bar/sheet, `run-progress.ts` | 100 / 100 | merged (#1015) |
| #1002 | fix(app): Compare sorts by Fit; note time, pin toast and tables | 2 | — | `compare.ts`, `note-menu.tsx`, about panel / meta formatter, note table CSS | 80 / 80 | merged (#1012) |
| #1003 | A file shows the questions asked about it, linked to their answers | 2 | #996, #998 | `routes/file.tsx`, `routes/note.tsx`, new component, `send-to-bower.tsx`, `hint.tsx` card state | 90 / 90 | merged (#1013) |
| #1004 | Polish from the production test: dictation, accessibility, copy, previews | 2 | — | Composer, add file inputs, learn, delete/login banner, not-invited, system-state, health, search no-results, preview pane, `file-preview.ts`, tour bird, plan copy | 120 / 120 | merged (#1014) |

## Waves

- Wave 1: #994, #995, #996, #997, #998 at once; #999 when the first one finishes.
- Wave 2: #1000 after #995; #1001, #1002, #1004 as slots free; #1003 after #996 and #998.
- Shared files: `agent/run.sh` (#995 then #1000); `agent/test/smoke.sh` only #996; `home.tsx` only #1001; `file.tsx` only #1003; the quick switcher: #998 owns it, #1004 touches only its no-results view after #998 merges.

## State (2 Oct 2026)

- M55 planned; issues #994–#1004 created.
- Wave 1 dispatched 2 Oct 2026: #994 (fix/994-signout-other-tabs), #995 (fix/995-sheet-long-names), #996 (feat/996-rules-v26), #997 (fix/997-run-report-truth), #998 (fix/998-names-and-counts), all in-progress. #996 merged as #1005. #999 dispatched (fix/999-onboarding-questions).
- #994 merged as #1008. #1001 dispatched (fix/1001-run-state). Follow-up #1007 (hub-name clash) filed for the backlog; #1000 got AC7 (name clashes).
- #999 PR #1009 in review. #998 timed out with all AC done; resumed with the folder-header count added. #1002 dispatched (fix/1002-compare-note-polish).
- #998 merged as #1010 (folders no longer count as things; header count recursive). #1003 dispatched (feat/1003-questions-on-a-file); #1004 waits for a free slot.
- #997 merged as #1011. #1002 PR #1012 in review. #1004 dispatched (chore/1004-polish). Minor follow-ups: compare.tsx keeps its own scoreOf copy; smoke.sh `.claude` needle fails inside Claude worktrees.
- #1002 merged as #1012; #1003 merged as #1013.
- #995 merged as #1006 after the security review (6 fixes). #1000 dispatched (fix/1000-runner-truth) with AC7 (name clashes) and AC8 (sheet cost at 2000 lines).
- #1004 merged as #1014. Minor follow-ups: Thumb and loadThumbnail both call thumbnailLinkOf on a refused fetch (one extra files.get).
- #1001 merged as #1015 (after one resume). Only #1000 left. Minor: run-outcome startedAt prefers the runner's start for Activity/Just filed durations; agent `pnpm test` calls bash directly (fails from PowerShell).
- #1000 merged as #1016 (after review fixes). M55 closed (main 6e82fc6a). Benchmark m55 running; production waits for the owner's yes. Backlog: #1007 (hub-name clash), Worker REPORT_FIELDS to accept `sheet`, smoke.sh is_memory_file noise.
- Bench m55 found #1016's medium rule never applied (a context note sets RULES_WRITABLE); lead fixed it in #1017 / PR #1018. M55 closed at main dddb7886. Bench m55 (agent seconds, cases 1-5): 51 (high; 41 at medium after #1018), 17, 24, 22, 77. Waiting for the owner's yes to deploy.
