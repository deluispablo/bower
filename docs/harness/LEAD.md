# Technical lead state

The lead keeps this file current under [TL-P2-43](2026-10-06-tl-p2-43-session-state.md). A fresh lead session starts here, then reads [DECISIONS.md](DECISIONS.md).

- **Role.** Claude session `Planificador`, technical lead and planner of the whole project ([GOVERNANCE](GOVERNANCE.md)). It talks to the coordinator `Orquestador` through cross-session messages, in 10 lines or fewer.
- **Documentation checkout.** `/private/tmp/bower-tl-planning`, branch `claude/tl-planning`. Fast-forward it to `main` before each change. After `pnpm check`, or the docs test plus lint for documentation only, fast-forward local `main`. Then message the coordinator, who adopts the change and backs it up.
- **Staging preview.** Redeploy after each main batch, following [STAGING.md](STAGING.md). Last deployed: `main` `4d7ab08`, batch 5, version `826a00ad`.
- **Open with the owner:** none.
- **Waiting on the coordinator:**
  - the Codex batch review of frozen `4d7ab08` against the P2 exit contract;
  - the phone/desktop evaluation, one Critical/Important round, and the P2 dossier.
- **Session rule:** never clear this session; the owner compacts by hand ([TL-P2-45](2026-10-06-tl-p2-45-manual-compact.md)). After a compaction, re-read this file.
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
