# Technical lead state

The lead keeps this file current under [TL-P2-43](2026-10-06-tl-p2-43-session-state.md). A fresh lead session starts here, then reads [DECISIONS.md](DECISIONS.md).

- **Role.** Claude session `Planificador`, technical lead and planner of the whole project ([GOVERNANCE](GOVERNANCE.md)). It talks to the coordinator `Orquestador` through cross-session messages, in 10 lines or fewer.
- **Documentation checkout.** `/private/tmp/bower-tl-planning`, branch `claude/tl-planning`. Fast-forward it to `main` before each change. After `pnpm check`, or the docs test plus lint for documentation only, fast-forward local `main`. Then message the coordinator, who adopts the change and backs it up.
- **Staging.** Deploy after each main batch with `scripts/deploy-staging.sh <sha> https://bower-staging.bower-api.workers.dev` from a clean detached worktree of `main` (`git worktree add --detach /private/tmp/bower-deploy main`). Run `scripts/new-instance.sh deluispablo/bower-home <origin>` **only after the script exits 0**. When the script refuses on a false positive, deploy by hand with the same guards and record it in [STAGING.md](STAGING.md). Last deployed: `main` `327b987` (P4-11), version `68d977df`; `bower-home` `bdc383b`.
- **Live model runs.** The coordinator asks; the lead runs `gh variable set BOWER_PROVIDER -R deluispablo/bower-home --body claude` and `BOWER_MODEL claude-sonnet-5-5`, starts `wrangler tail bower-staging --format json` (no status filter) into a file, and after the runs deletes both variables and stops the tail. Rows go in [p4-speed-baseline.md](p4-speed-baseline.md).
- **Where P4 stands (2026-10-08):** [P4_PLAN](../P4_PLAN.md), with rulings TL-P4-01 to TL-P4-08.
  - **C04 with Claude passes 3/3.** The median is 1:28 from the press to `done`; the model takes 3–4 s and 1 turn. The original took 6:38 before its speed work, and its model step took 44 s. What is left is the spine's own overhead.
  - **C04 passes live on 327b987** (TL-P4-07, TL-P4-08 addenda 1–6): garden 1:00 median, offer-and-flat 1:20–1:48. Claude is off.
  - **Consolidation (TL-P4-14), owner-approved 2026-10-08:** stage 0 (finish in-flight work, then the C05 live baseline), then stages 1–4 before C06. Each stage ends with the suites, a deploy and a live smoke. Stage 2 gets the Codex review once it is back (2026-10-12).
  - **Next:** the C05 slice (updates and the merge question), then C06, C07, C11, C08, C09, C10, C15, C13 and C12, per P4_PLAN.
- **Codex review on 2026-10-12** (TL-P3-16): check that `codex exec` answers, then run one review of the P3 Worker and spine range. Its findings are fixed before P4 code depends on that code.
- **Pane:** the coordinator's pane is signed in as test account A. The owner gave the coordinator standing permission for made-up piles and Tidy up presses on staging with A and B (2026-10-08).
- **Instance repository** `deluispablo/bower-home` ([TL-P3-13](2026-10-07-tl-p3-13-instance-repository.md)): it holds the new runner, and the lead manages it with `gh`, which has the `workflow` scope. Its secret is `CLAUDE_CODE_OAUTH_TOKEN`, set by the owner. Its variables are `BOWER_API_URL` and `BOWER_ALLOW_WEB`, plus `BOWER_PROVIDER` and `BOWER_MODEL` only during live runs.
- **To raise with the owner:** when P4 closes, review the scenario battery draft ([TL-P4-09](2026-10-08-tl-p4-09-scenario-battery.md)) and plan it.
- **Pending, owner-deferred:** a live Google revocation check with a different test account (TL-P3-28).
- **Owner ruled:** the OAuth client is In production. P3 was accepted and P4 authorized on 2026-10-07; the production cutover needs the owner's approval of the switch moment and the rollback plan.
- **After a compaction:** a `SessionStart` hook prints [after-compact.md](../../harness/after-compact.md) (TL-P4-06). Re-read this file first.
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
