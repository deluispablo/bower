# B1d adversarial pass 5 (Astra xhigh, attempt 21, round 7)

- **Important — Blocking: data safety — [runner/src/claude.ts:1551](/private/tmp/bower-b1d-selection/runner/src/claude.ts:1551):** Admit a “keep one” answer for A/B and select only those notes. An unselected personal C contains `[[B]]`. Execution accepts the merge, then `planScripted` rewrites C to `[[A]]`. Reproduced through `main`: two calls, done/code 0, C changed despite being absent from both candidates and allowed targets. The merge check fences the pair but not its resulting link edits.

- **Minor — v1 limit — [runner/src/claude.ts:1422](/private/tmp/bower-b1d-selection/runner/src/claude.ts:1422):** Admit 31 requests, each naming one distinct note. Global request pins fill every source’s 30 candidate slots, excluding the last request’s own target. Selecting that target twice produces failed/code 1 without execution. Each source individually needs only one note.

No second planner, cache, ledger, writer, or pending store found. No unauthorized assertion weakening found across sweeps 3–6 or the round 7 repairs. Round 6’s shared-contract, read-ahead, and Home edits stay in scope.

Full suites/e2e were not rerun; verification used read-only, in-memory probes. Unselected merge edits remain the blocking risk.

verdict: BLOCK
