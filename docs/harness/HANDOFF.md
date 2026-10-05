# Handoff for planning and phased delivery

Planning revision: `2026-10-05-app-first-1`. Read PRODUCT, WORK_PLAN, P2_ACCEPTANCE, GOVERNANCE and shared STARTUP. The owner appointed the current Codex lead for planning/method only. Preserve the separately owned implementation batch.

## Where things stand

P1 is the accepted UI baseline. P2 is built in substantial part and still open: the existing coordinator is fixing naming-related regressions in `codex/close-phase-2`, while the adopted plan also requires an explicit full capability audit. P3 and P4 implementation have not been authorized to start.

This main update is documentation/method only, based on main's existing product code. Do not confuse main's older feature counts with the implementation branch's evidence. Consult that branch's live ACTIVE file and exact SHA for assignments and code status; copied historical counts never certify closure.

## The plan, in order

1. Existing coordinator completes or preserves its current reserved atomic entry, reaches a clean checkpoint and adopts the docs-only main planning update. Never merge over another session's dirty files.
2. Audit C01–C16 against the current immutable implementation target. Register missing capabilities, contracts and the four reproduced review concerns (incomplete uploads, protected sections, refresh, stale status). Do not infer closure from the old ledger count.
3. Execute P2-A through P2-H in WORK_PLAN: foundations, complete simulated flows, deterministic preparation, quality/efficiency corpus and final acceptance. One assigned entry at a time, with honest proofs.
4. Resolve offline-reading/upload-reload policy with actual owner rulings. Record supported behavior without silently deferring same-session correctness or core second-brain capabilities.
5. Freeze one SHA; run all gates and independent reviewer/evaluator rounds. Fix every known unresolved defect and uncovered acceptance obligation, rerun affected evidence, then obtain owner acceptance.
6. Only after P2 closure start the minimal real Worker/service plan. Only after P3 closure implement the real runner/model/research. See PHASES and WORK_PLAN.

## How to run a round

Use COORDINATION and the assigned reviewer/evaluator briefs, current planning revision, capability IDs and immutable code SHA. Reviewer and evaluator are independent of the builder. Browser work is reserved and serialized. An evaluator checks full synthetic user journeys, not only already registered findings; a reviewer checks behavior, contracts and proof honesty. No source/build changes under an active evaluation.

Findings return to the integration coordinator for registration. A candidate, a passing unit suite and an old phase review are each insufficient to close P2. No known unresolved defect or required capability gap may be hidden by a scope label; the owner controls actual scope changes.

## Traps on this machine

- **Playwright needs the display awake.** Headless Chrome (system Chrome, `channel: 'chrome'`) stalls when the Mac's display sleeps: a test hangs for ~15 minutes, often with the boot screen still up, and Chrome logs `CVDisplayLinkCreateWithCGDisplay failed`. Check first: `system_profiler SPDisplaysDataType | grep "Display Asleep"` (no output means awake). If asleep, do unit-test work and ask the owner to wake it. `caffeinate`, GPU flags and `--global-timeout` do not help.
- **macOS has no `timeout` command.** A script that relies on it never runs what it wraps (a bisect "proved" a docs commit guilty this way).
- **Servers:** dev on 5190 and the build preview on 5192 (`.claude/launch.json`); Playwright starts its own dev server on 5191 (`reuseExistingServer`). The preview needs `pnpm build` to show new code.
- **Dates in tests:** never hard-code today's date (a journal test broke at midnight).
- **Shared state between component tests:** unmount (`cleanup()`) and reset the UI store in `afterEach`, or one test's dialog closes the next.
- **Prettier** reformats whole files; do not run it over a file you only touched in places.
- **Commands chained with `;`** go on after a failure; use `&&` around gates.

## Decisions taken in phase 2

Current hard rules remain in AGENTS and accepted specs: content writes check their read version, moves/renames check name/place, app-owned text and runner-owned sections remain separate, no hard deletes and no app writes to index/hot/log. The folder-keyed journal outbox exception at sign-out remains. Exact implementation rulings/evidence belong to the integration ledger, not this main planning snapshot.

The owner adopted app-first development with a complete simulated P2 and a minimal backend, preserving generation, modification, connections and permitted web research. The centralized-write default in backend proposal v2 is superseded. Specific offline/read-reload decisions and actual provider guarantees remain unresolved; see WORK_PLAN's decision register.

## Cross-session continuation

Compare PLAN_REVISION with local main on startup/resume. Use unique session IDs, explicit file ownership and shared packet records. Optional skills/plugins do not confer delegation or messaging permission. The planning lead updates purpose/method; the existing implementation coordinator keeps live assignments and proof closure. See GOVERNANCE and the planning adoption handoff.
