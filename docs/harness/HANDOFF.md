# Current handoff: Claude coordinator, P4

Coordinator: the Claude Code session named "Orquestador". It integrates in `/Users/deluisp/Projects/bower-app` on branch `claude/p3`; P4 continues on it. Lead: the Planificador session ([DECISIONS.md](DECISIONS.md)). Output rule: [TL-P3-29](2026-10-07-tl-p3-29-output-rule-survives-compaction.md), in AGENTS.md. Minors: [P2_POLISH.md](P2_POLISH.md). Earlier handoffs: git history of this file.

## Where things stand

- **P3 is accepted** by the owner (GOVERNANCE, main `88bb7de`). Dossier: [2026-10-07-p3-dossier.md](2026-10-07-p3-dossier.md).
  - Code `426a9fd` runs on staging as `aeb99a4`.
  - Still pending from P3:
    - the live revocation with another test account (deferred by the owner);
    - the Codex review of the P3 range on 2026-10-12, which the lead starts.
- **P4 is authorized:** [P4_PLAN](../P4_PLAN.md), [TL-P4-01](2026-10-07-tl-p4-01-p4-start.md). The production cutover still needs the owner's approval of the moment and the rollback.
- **Backup:** `backup/main` is pushed after each green integration. Per BACKUP.md: `git push backup refs/heads/main:refs/heads/main`, then check the remote SHA. Bash runs outside the sandbox (keychain).
- **Local-only branch** `archive/p2-o5-snapshot`: uncommitted P2 work, kept as a P4 candidate. Never push it.

## The plan, in order

1. **P4-1 (now):** `p4-corpus` (bower-implementer) and `claude-provider` (bower-escalated), per TL-P4-01.
2. **P4-2:** `original-baseline` and `provider-contract`, then the first semantic slice, C04, against the corpus.
3. Then packages P4-B to P4-F, as P4_PLAN orders them.
   - **Owner steps:** the Claude credential when `claude-provider` closes (the lead asks), and the OAuth publishing status.
   - **Cutover last,** with the owner's approval.
- **Reuse first:** the original app is at `/Users/deluisp/Projects/bower` (`agent/claude-settings.json`, `agent/run.sh`, `agent/prompts/`, `agent/bench/`).

## How to run a round

- At most two workers at a time, through `.claude/agents/` only. Packets are one page, with the research-first line. Card lines stay under 120 characters (TL-P3-29).
- `bash harness/done.sh <id> "<msg>" --fixed-in <sha>`. When the fix's revert can't load (a new file), or later commits touched the same lines:
  - prove the red at the tests-only commit by hand;
  - close with `--known-green "<evidence>"`.
  - On the "no assertion failed" exit, `done.sh` leaves the reverted files behind. Restore them with `git checkout`.
- Merge each worker branch with `--no-ff` into `claude/p3`. Move main with `git fetch -q . claude/p3:main`, then back up. Run the suites per batch on an idle machine, with logs to `/tmp/<name>-*.log`.
- A compatibility row is needed for every non-merge commit under `src/features` or `src/data/contracts` (`src/docs.test.ts`).

## Traps on this machine

- **Presses on staging:** the permission system refuses an evaluator's press. The coordinator presses by keyboard: focus the button by page script, then Enter.
  - The owner allows "Tidy up", run, answer, add-pile, "Use here" and Bin/Undo (probe folder only) presses during walks.
  - Never: delete-account, sign-in or sign-out, production.
- **Service worker:** a new one waits until every tab closes, and a reload keeps the old bundle. Close the tab and open a new one, check `index-*.js`, then press "Use here".
- **The Worker's CSP is `default-src 'none'`:** page-script `fetch` fails from `/health` and `/me` documents. Run scripts from an app page.
- **A stuck "saving" run:** read `gh run view <id> -R deluispablo/bower-home --log` (read only). The Worker redispatches attempt 1 at phaseAt + 30 min.
- **Stopping a background suite:** kill the parent shell and the orphaned `pnpm e2e` by PID, then check that port 5191 is free. Playwright stalls when the display sleeps.
- **macOS has no `timeout`.** A jsdom teardown race can fail `pnpm check` once under load; rerun it before blaming the code.
- **Test account addresses never go in the repo or in messages.** The staging origin and the probe folder id go only in worker prompts.

## Decisions taken in phase 2

All rulings are indexed in [DECISIONS.md](DECISIONS.md) (TL-P2, TL-P3, TL-P4). These P2 notes still hold in P4:
- a session `leave` after `DELETE /me` is answered harmlessly;
- the Inbox byte checks use Drive checksums on the real source.
