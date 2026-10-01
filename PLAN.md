# PLAN.md

Resume point for the tech lead: M52, a faster tidy-up session, and M53, the filing sheet. The v6 plan (M47 to M51, shipped to production on 1 Oct 2026 from `main` 9d660829) is in this file's git history.

## Source

- The spec: `docs/superpowers/2026-10-01-session-speed-spec.md` (R-SS-1 to R-SS-17, decisions D-1 to D-10), approved by the owner on 1 Oct 2026.
- GitHub issues #961 to #968 and #974 (M52), #977 and #978 (M53) hold the detail. This file holds the order, the process and the state.

## Process

1. Every subagent runs on Opus 5.5 at medium effort, at most five at once, in its own worktree, and owns a disjoint set of files per wave.
2. Each PR: CI green; for PRs that change `agent/run.sh` (#961, #965, #966, #967), a code-reviewer subagent checks safety first: the agent's clean environment, nothing from the vault in logs or artifacts, `CLAUDE.md` always restored, Drive writes only through the existing paths. Then the lead reads the diff and merges (squash).
3. The benchmark (`agent/bench/`, from #961) runs on the lead's machine, with a synthetic vault and the operator's own Claude Code login: no Drive, no GitHub, no real data. It runs as a baseline on `main` after #961, again after #965, and as the final measure after #967.
4. Production only with the owner's yes, at the end:
   - redeploy the runner with `scripts/new-instance.sh`;
   - deploy the Worker;
   - deploy the app (Pages);
   - the owner applies rules v25 in Settings;
   - the next lint starts the index backfill.

## State (1 Oct 2026)

- M52: every issue merged except #968 (docs and the final benchmark), in review.
- M53: #977 merged; #978 (the runner side) in review as PR #982.
- The final benchmark is in the spec's section 8: every case filed correctly, the agent step 39 % to 67 % faster on cases 1 to 4 and 17 % on case 5.
- Next: production, with the owner's yes (see Process, step 4).

## Milestone

**M52 · A faster tidy-up session.** One tidy-up session gets faster without an app change. Done when the benchmark's one-file cases run the agent step in 2 minutes or less with at least half the turns of the baseline, and every quality check passes.

## Issues

Budget = the agent's own ceiling (tool calls / minutes).

| Issue | Title | Wave | Depends on | Owns | Budget | Status |
|---|---|---|---|---|---|---|
| #961 | Runner session stats and a local benchmark | 1 | — | `agent/run.sh`, `agent/bench/**`, `agent/test/**`, `.gitignore` | 120 / 120 | merged (#973) |
| #962 | Rules v24: section markers, index rows, Tags, scans, text copies | 1 | — | `vault-template/CLAUDE.md`, `vault-template/index.md`, `api/src/template.generated.ts`, `docs/changelog.md`, app parser tests | 90 / 90 | merged (#971) |
| #963 | fix(api): queued run fails after 17 minutes | 1 | — | `api/src/process.ts`, `api/test/process.test.ts`, `api/test/status.test.ts` | 30 / 30 | merged (#970) |
| #964 | chore(agent): pandoc from a cached release binary | 1 | — | `agent/workflows/*.yml` | 40 / 40 | merged (#972) |
| #965 | Model and effort per run | 2 | #961, #964 | `agent/run.sh`, `agent/workflows/*.yml`, `agent/test/**`, `docs/runbook.md` | 50 / 50 | merged (#975) |
| #966 | Context pack: cut rulebook, tags, folders, corrections, shorter prompts | 3 | #965, #962 | `agent/run.sh`, `agent/prompts/*`, `agent/test/**` | 120 / 120 | merged (#980) |
| #967 | Bookkeeping after the session | 4 | #966 | `agent/run.sh`, `agent/test/**` | 100 / 100 | merged (#981) |
| #974 | Benchmark: a large synthetic folder | 2 | #961 | `agent/bench/**`, `.gitignore` | — | merged (#976) |
| #968 | Docs and final benchmark | 5 | #967, #978 | `docs/runbook.md`, `ARCHITECTURE.md`, `agent/README.md`, `PLAN.md`, the spec's Result section | 50 / 50 | in review |

**M53 · The filing sheet.** The agent writes its filing decisions to `.bower/filing.tsv`; the runner checks each line and carries it out in the local copy, and the existing pipeline repeats the moves in Drive. Added after the first final benchmark showed that Sonnet at low effort filed nothing.

| Issue | Title | Depends on | Owns | Status |
|---|---|---|---|---|
| #977 | Rules v25: the filing sheet | #962 | `vault-template/CLAUDE.md`, `api/src/template.generated.ts`, `app/src/rulebook-retired.ts`, app rulebook tests, `docs/changelog.md` | merged (#979) |
| #978 | Runner files from the sheet | #977, #967 | `agent/run.sh`, `agent/prompts/ingest.md`, `agent/test/**` | in review (#982) |

## Waves

- 1: #961, #962, #963, #964, in parallel; their files do not overlap.
- 2: #965. 3: #966. 4: #967. `agent/run.sh` is the hot file, so these run in series.
- 5: #977, then #978 (M53).
- 6: #968, the final benchmark and the quality review (lead), then production with the owner's yes.

## Decisions taken for this plan

- R-SS-14 shrank: the Worker already fails stale runs (`QUEUED_STALE_MS`, `RUNNING_STALE_MS`, the job-conclusion fallback). #963 only shortens the queued window to 17 minutes.
- The owner's run of 1 Oct 2026 (job not picked up during GitHub's Actions incident) is not re-run: its ticket expired. The owner sends it again from the app.
- Sonnet 5.5 at low effort is safe only with the filing sheet: before the context pack and the sheet, plain tidy-ups ended in 9 to 12 seconds with nothing filed. Low effort ships together with rules v25 and #978's runner, never before.
