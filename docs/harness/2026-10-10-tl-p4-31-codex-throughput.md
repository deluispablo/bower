# Technical-lead decision TL-P4-31: Codex throughput for P4

**Owner request, 2026-10-10:** speed up everything that is left using Codex, as fast as possible without losing code stability. The owner chose all four levers.

**Starting point:**
- Stage 4 closed on 2026-10-10, about five days ahead of plan.
- Claude's share of spend fell from about 98% to about 82% (TL-P4-29).
- Today's limits are three:
  - P4-C runs one slice at a time;
  - P4-E waits behind P4-C;
  - the coordinator commits and gates every Codex delivery by hand, which costs Claude tokens and time.

## Rulings (amending P4_PLAN's order and TL-P4-29's cap)

1. **Prepare all of P4-C now.** In free Codex slots, Codex drafts the preparation for C06, C07, C11, C08, C09, C10, C15, C13 and C12, the way it did for C05 (TL-P4-28 addendum 1). Each draft covers:
   - corpus cases with expected outcomes;
   - scripted proposals;
   - the harness gaps the slice will need.

   It is read-only research plus test fixtures, with made-up data. The lead reviews each draft before it becomes a packet. A gap in the harness becomes its own Codex entry before the slice starts.
2. **P4-E runs in parallel with P4-C.** The production work that does not depend on the model starts now on Codex:
   - p4-rate-limits;
   - p4-structured-output;
   - upload-resume-after-reload and orphan-pile-count (C02);
   - landing-csp;
   - rules-original-conversion.

   Escalated ones (data safety, recovery) follow the escalated pipeline of TL-P4-29. Three items stay last and stay the owner's: revocation-live, production-precheck and the cutover.
3. **Up to two slices at a time.** Two P4-C slices run together only when their owned files do not overlap.
   - **The shared homes:** the planner prompt and reply schema (runner `claude.ts`), `scripted.ts`, `contracts/` and note-edit. Only one slice at a time may own any of them. The other slice waits, or the shared change is split out first as its own small entry.
   - **The packet lists the owned files.** The coordinator checks that the two lists do not intersect before dispatching.
   - **The pairs follow P4_PLAN's order.** C05 goes first and alone, because it waits for the owner's person-notes answer.
4. **A script does the routine work around a Codex delivery.** Entry `c5-codex-run` (Codex, harness, non-escalated) adds `harness/codex-run.sh`.
   - **What it does:** it takes a worktree and a prompt file, runs `codex exec --json` with the right sandbox, and writes the usage row to tokens.csv. It commits the delivery with an `implementer: codex` line, runs `pnpm check` (and the e2e the packet names) under `with-lock.sh`, and writes one result file for the coordinator to read.
   - **What it refuses:** a branch named `codex/*`, a change to `.claude/`, hooks, settings or agent definitions, any staged secret or address (the existing pre-push scan), and a dirty tree before the run.
   - **What it never does:** push, merge or switch the main checkout's branch.

   Once the script passes its review, the cap becomes 1 Claude worker plus 4 Codex workers. The TL-P4-23 stop rule stands: drop a Codex slot when the lock wait eats the gain.

## Stability guards (what keeps speed from costing quality)

- **Every entry keeps its whole chain:**
  - a red first (on escalated data, from a separate Codex session);
  - the implementation;
  - the gates under the lock;
  - a Codex adversarial pass on escalated entries;
  - a fresh Claude review whose PASS closes the entry;
  - the designer's check on UI.
- **The full four suites run on every integration batch** of at most four entries, not only at stage ends. A failing suite stops new dispatches until it is green.
- **After every two capabilities,** there is a staging deploy and a live smoke with Claude on. The press-to-done times are recorded against the stage 4 baseline.
- **The re-plan rule stands.** A third round on any entry is a re-plan by the lead.
- **Codex's weekly quota is the real cap.** The coordinator records Codex usage per entry. When the quota nears its end, implementation goes first, and preparation and adversarial passes wait.
