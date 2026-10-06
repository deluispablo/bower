# Orchestrator launch packet

Current owner authorization: autonomous P2 completion, conditional P2 acceptance and continuation into P3, with periodic private main backups, follows [GOVERNANCE](GOVERNANCE.md#owner-authorization-for-unattended-continuation-2026-10-05). It supersedes older wait-for-owner wording below; all objective gates remain required. P4 is not authorized.

Planning revision: `2026-10-05-contracts-2`. Ready for assignment preparation, not a declaration that P2 has passed. Use [PLANNING_HANDOFF](PLANNING_HANDOFF.md) to adopt local main first. The existing named integration coordinator retains authority; a new session needs an explicit handoff before taking its role. This packet neither launches agents nor messages another chat.

## First actions

1. Follow STARTUP; locate the live ACTIVE file through git worktree list. Record actual code SHA, plan revision, ownership, running checks and frozen evaluations. Do not mutate a frozen target; let authorized review finish and retain its report with its original scope.
2. At a clean exclusive checkpoint merge the docs-only main update, preserving newer implementation records. Run pnpm check and record the combined SHA. An existing 201/201 ledger does not prove the revised capability contract.
3. Assign O1 below as the first planning/audit deliverable. Register implementation gaps only from current evidence. The standing owner authorization in COORDINATION permits preparing O2 in parallel with separate ownership; it needs no browser reservation. No speculative bulk feature registration.
4. Convert the queue into small executable entries. Use actual repository paths and real named test commands after inspecting the code. An unimplemented probe/test is planned evidence, never a green verify. Contract fixtures/types have one serialized owner.

## Ordered assignment queue

These are planning package IDs, not harness entries and not claims of completed coverage.

| ID | Deliverable and capability scope | Dependencies | Evidence / completion |
| --- | --- | --- | --- |
| O1 | Audit C01–C16 against current code, final review and tests; map boundary risks | Planning adoption | One compact matrix: demonstrated/partial/missing, named evidence and exact SHA; triage old four findings without reopening fixed bugs |
| O2 | Integration premise probe specifications for R1–R4 in WORK_PLAN | Adoption; scope synthetic resources and real-service access | Hypothesis, method, stop condition, result format and cleanup; execute only with authorized resources; missing credentials remain missing evidence |
| O3 | Boundary contract and compatibility fixtures | O1 plus relevant R1–R4 results | App/Worker and runner/semantic contracts; scope, identity, versions, recovery, failures; independent review; accepted fixtures before dependent writers |
| O4 | First vertical slice: accepted run → persisted effect/report → reopen/retry | O3 and reproduced prerequisite fixes | Two fake clients; lost response, duplicate dispatch, browser close, stale status and save failure; no duplicate effect or false done |
| O5 | Complete semantic capability simulations C04–C11 and undo C13 | O3/O4 | Documents/revisions, answers, connections, contradictions, permitted research and conflicts with actual fake persistence; one capability entry per worker at a time |
| O6 | Incremental preparation/shared core C02/C15 | O3; safe readiness primitives | External unprepared input, invalidated cache and bounded context expansion; responsive app; extract shared rules only as needed |
| O7 | Quality/performance corpus and measured optimization | O4–O6; capture baseline before optimizing each slice | Same fixtures and expected outcomes; stage timings, reuse/read counts and complete outcome preservation |
| O8 | Frozen P2 acceptance dossier | All gaps resolved, probes and policies resolved | Full gates, independent reviewer/evaluator, C01–C16 mapping and owner acceptance |

Repair a reproduced data-loss or ownership defect before building a slice on it. O2 probes are P2 risk retirement, not permission to build P3 services. O5/O6 can be split across writers only once shared schemas are committed and file reservations are disjoint. No parallel edits to contracts, harness records, shared fixtures or test configuration.

## Parallel dispatch

Treat the queue as a dependency graph, not a global mutex. The owner authorizes the named coordinator to launch independent subagents without further permission. Schedule ready entries across isolated checkouts, preferably two implementers with review capacity when useful. O5 and O6 may progress concurrently after their actual shared prerequisites are accepted. O2 preparation and independent repairs may overlap when neither consumes the other's unsettled contract or shared resources. Keep actual provider probes and browser gates within their existing reservations. Finish existing reserved atomic work before changing its ownership.

## Required additions to each packet

Use the complete COORDINATION packet, adding affected boundary and contract version, compatibility fixtures, failure/recovery scenario, dependencies already satisfied, performance hypothesis if any, and exclusions. Provide only the relevant architecture sections and entry evidence, not entire prior conversations. The reviewer checks both user behavior and preserved consumer compatibility.

Worker outputs: immutable candidate, changed paths, actual red/green/check evidence, contract impact, unresolved findings. Coordinator integrates serially and records proof. Prose/probe findings use the documentation/research path; production changes follow test-first entries. A probe script must make its expected assertion observable and must not be counted as a feature proof simply because it exited successfully.

## Product decisions and stopping rules

Owner rulings of 2026-10-06 (WORK_PLAN decision register): no in-app offline note reading, a truthful offline state; uploads in progress kept across a reload, storage failure disclosed, same-session retry everywhere; R1's residual race accepted as a documented limitation with the existing modifiedTime check. Reuse the original app's working features and existing libraries before writing new code.

A provider risk that could invalidate safety or the app contract blocks O3 acceptance and P2 closure until observed and resolved. No credentials means the relevant probe is blocked, not passed; obtain access through the normal owner-authorized setup. Minor implementation choices inside an accepted contract do not need repeated permission.

## Readiness report to the owner

Report adopted revision and combined SHA, coordinator/session, first assigned entry and owned checkout, current evidence gaps, next dependency and any actual user decision needed. Say separately whether the team is ready to assign work, P2 is ready to close, or P3 is ready to start. Only the first is enabled by this planning packet. Never declare native Claude/Codex orchestration tested from repository instructions alone.
