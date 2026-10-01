# PLAN.md

Resume point for the tech lead: M52, a faster tidy-up session. The v6 plan (M47 to M51, shipped to production on 1 Oct 2026 from `main` 9d660829) is in this file's git history.

## Source

- The spec: `docs/superpowers/2026-10-01-session-speed-spec.md` (R-SS-1 to R-SS-17, decisions D-1 to D-10), approved by the owner on 1 Oct 2026.
- GitHub issues #961 to #968 hold the detail. This file holds the order, the process and the state.

## Process

1. Every subagent runs on Opus 5.5 at medium effort, at most five at once, in its own worktree, and owns a disjoint set of files per wave.
2. Each PR: CI green; for PRs that change `agent/run.sh` (#961, #965, #966, #967), a code-reviewer subagent checks safety first: the agent's clean environment, nothing from the vault in logs or artifacts, `CLAUDE.md` always restored, Drive writes only through the existing paths. Then the lead reads the diff and merges (squash).
3. The benchmark (`agent/bench/`, from #961) runs on the lead's machine, with a synthetic vault and the operator's own Claude Code login: no Drive, no GitHub, no real data. It runs as a baseline on `main` after #961, again after #965, and as the final measure after #967.
4. Production only with the owner's yes, at the end:
   - redeploy the runner with `scripts/new-instance.sh`;
   - deploy the Worker;
   - the owner applies rules v24 in Settings;
   - the next lint starts the index backfill.

## State (1 Oct 2026)

- The spec and this plan are in review.
- Wave 1 is dispatched.

## Milestone

**M52 · A faster tidy-up session.** One tidy-up session gets faster without an app change. Done when the benchmark's one-file cases run the agent step in 2 minutes or less with at least half the turns of the baseline, and every quality check passes.

## Issues

Budget = the agent's own ceiling (tool calls / minutes).

| Issue | Title | Wave | Depends on | Owns | Budget | Status |
|---|---|---|---|---|---|---|
| #961 | Runner session stats and a local benchmark | 1 | — | `agent/run.sh`, `agent/bench/**`, `agent/test/**`, `.gitignore` | 120 / 120 | in-progress |
| #962 | Rules v24: section markers, index rows, Tags, scans, text copies | 1 | — | `vault-template/CLAUDE.md`, `vault-template/index.md`, `api/src/template.generated.ts`, `docs/changelog.md`, app parser tests | 90 / 90 | in-progress |
| #963 | fix(api): queued run fails after 17 minutes | 1 | — | `api/src/process.ts`, `api/test/process.test.ts`, `api/test/status.test.ts` | 30 / 30 | merged (#970) |
| #964 | chore(agent): pandoc from a cached release binary | 1 | — | `agent/workflows/*.yml` | 40 / 40 | in-progress |
| #965 | Model and effort per run | 2 | #961, #964 | `agent/run.sh`, `agent/workflows/*.yml`, `agent/test/**`, `docs/runbook.md` | 50 / 50 | pending |
| #966 | Context pack: cut rulebook, tags, folders, corrections, shorter prompts | 3 | #965, #962 | `agent/run.sh`, `agent/prompts/*`, `agent/test/**` | 120 / 120 | pending |
| #967 | Bookkeeping after the session | 4 | #966 | `agent/run.sh`, `agent/test/**` | 100 / 100 | pending |
| #968 | Docs and final benchmark | 5 | #967 | `docs/runbook.md`, `ARCHITECTURE.md`, the spec's Result section | 40 / 40 | pending |

## Waves

- 1: #961, #962, #963, #964, in parallel; their files do not overlap.
- 2: #965. 3: #966. 4: #967. `agent/run.sh` is the hot file, so these run in series.
- 5: #968, the final benchmark and the quality review (lead), then production with the owner's yes.

## Decisions taken for this plan

- R-SS-14 shrank: the Worker already fails stale runs (`QUEUED_STALE_MS`, `RUNNING_STALE_MS`, the job-conclusion fallback). #963 only shortens the queued window to 17 minutes.
- The owner's run of 1 Oct 2026 (job not picked up during GitHub's Actions incident) is not re-run: its ticket expired. The owner sends it again from the app.
