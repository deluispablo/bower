# Technical lead state

The lead keeps this file current under [TL-P2-43](2026-10-06-tl-p2-43-session-state.md). A fresh lead session starts here, then reads [DECISIONS.md](DECISIONS.md).

- **Role.** Claude session `Planificador`, technical lead and planner of the whole project ([GOVERNANCE](GOVERNANCE.md)). It talks to the coordinator `Orquestador` through cross-session messages, in 10 lines or fewer.
- **Documentation checkout.** `/private/tmp/bower-tl-planning`, branch `claude/tl-planning`. Fast-forward it to `main` before each change. After `pnpm check`, or the docs test plus lint for documentation only, fast-forward local `main`. Then message the coordinator, who adopts the change and backs it up.
- **Staging preview.** Redeploy after each main batch, following [STAGING.md](STAGING.md). Last deployed: `main` `3939760`, batch 4.
- **Open with the owner:** none.
- **Waiting on the coordinator:**
  - adoption of TL-P2-44 at its next batch boundary (ledger header, project agents, delete its `harness/token-baseline.md` copy);
  - batch 5 (the O5 final lane, after its e2e and the fix for the 3 regressed fake e2e tests), to redeploy staging;
  - the journey reviews;
  - the freeze.
- **Recurring duties:**
  - Measure tokens per batch with `npx ccusage session`, reporting cache reads and cost by session, and log the lead's own row in `harness/tokens.csv` through the coordinator.
  - After every three comparable entries, compare medians with [token-baseline.md](token-baseline.md), fill its measurements table and add a refinement line ([TL-P2-44](2026-10-06-tl-p2-44-enforced-token-method.md)).
  - Keep `DECISIONS.md` to one line per ruling.
- **Owner preferences** are in memory, and recorded in WORK_PLAN's decision register:
  - research first;
  - reuse before building;
  - the simplest proven approach;
  - fast P2 close;
  - the token budget;
  - the model ladder.
