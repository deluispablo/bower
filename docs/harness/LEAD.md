# Technical lead state

The lead keeps this file current under [TL-P2-43](2026-10-06-tl-p2-43-session-state.md). A fresh lead session starts here, then reads [DECISIONS.md](DECISIONS.md).

- **Role.** Claude session `Planificador`, technical lead and planner of the whole project ([GOVERNANCE](GOVERNANCE.md)). It talks to the coordinator `Orquestador` through cross-session messages, in 10 lines or fewer.
- **Documentation checkout.** `/private/tmp/bower-tl-planning`, branch `claude/tl-planning`. Fast-forward it to `main` before each change. After `pnpm check`, or the docs test plus lint for documentation only, fast-forward local `main`. Then message the coordinator, who adopts the change and backs it up.
- **Staging.** Redeploy after each main batch, following [STAGING.md](STAGING.md), with `bower-mechanical` from a clean detached worktree of that SHA. Last deployed: `main` `50108ab` (P3-7), version `af168bbd`.
- **Pane:** signed in as test account A. The addresses stay only in the lead's memory.
- **Instance repository** `deluispablo/bower-home` ([TL-P3-13](2026-10-07-tl-p3-13-instance-repository.md)): R3's `probe.yml` was added (`cca496b`) and deleted (`be9da88`); only the production workflows remain. The full replacement comes with the new runner. `gh` has the `workflow` scope.
- **P3-B is complete (2026-10-07):** R2, R3, R4 and the Drive suite.
- **Codex review on 2026-10-12** (TL-P3-16): check that `codex exec` answers, then one review of the P3 Worker and spine range, before P4.
- **Waiting on the coordinator:** batch P3-7: `worker-me-and-delete` is running, then `worker-process-admission` with the quota and `worker-status-revision`, then the close with the suites and an Opus delta review. Deploy staging when the coordinator sends the closing SHA.
- **Message budget.** The app pauses a session's messages to other sessions after 10 sends without an owner message. On the night of 2026-10-06 this left the coordinator waiting about 6.5 hours for an unblock it never received. Rules:
  - send one combined message per decision;
  - never leave the coordinator blocked on a message alone: a STOP names the `main` commit or DECISIONS line that lifts it, so the coordinator can lift it itself;
  - after about 8 sends, tell the owner.
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
