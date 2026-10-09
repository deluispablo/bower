# Current handoff: Claude coordinator, P4

Coordinator: the Claude Code session named "Orquestador". It integrates in `/Users/deluisp/Projects/bower-app` on branch `claude/p3`; P4 continues on it. Lead: the Planificador session ([DECISIONS.md](DECISIONS.md)). Output rule: [TL-P3-29](2026-10-07-tl-p3-29-output-rule-survives-compaction.md), in AGENTS.md. Minors: [P2_POLISH.md](P2_POLISH.md). Earlier handoffs: git history of this file.

## Resume after the restart (2026-10-09, second: make the stop gate and agent caps live)

Read this first. **Every stage 3 entry is closed** (c3-pair-ask, c3-state-mark, c3-test-tamper, c3-hooks, c3-flaky-policy, c3-permissions, c3-agent-defs, c3-stop-gate). No worker is running and no worktree is open except the role worktrees.

Order after the restart (lead, TL-P4-20 addendum 3 and its message):
1. **Live stop-gate check first** (DEFECT_LOG `agent-defs-not-live-mid-session`).
   - Create a scratch detached worktree of claude/p3 and run pnpm install.
   - Dispatch a bower-implementer that creates an untracked file there and tries to stop with `status: done` + `worktree: <path>`.
   - It must be refused. Record the outcome, then remove the worktree.
   - If it is still not refused, log it and diagnose before the suites.
2. **The four suites** under `bash harness/with-lock.sh`, on an idle machine, with logs to /tmp:
   - check;
   - e2e, e2e:fake and e2e:pwa, all with `E2E_BATCH=1` (c3-flaky-policy).
   - A retry-passed test enters the defect flow.
3. **Main:** `git fetch -q . claude/p3:main`. Then the secret and personal-data scan. Then the backup per BACKUP.md, with Bash outside the sandbox: `git push backup refs/heads/main:refs/heads/main`, then verify the remote SHA. This is also the live check of the c3-permissions push hook.
4. **The SHA to the lead.** Then the staging smoke after the lead deploys (procedure in [p4-speed-baseline.md](p4-speed-baseline.md)).
5. **Then stage 4** in TL-P4-21 order: c4-focus-return (with d-v2-04) ∥ v2-field first. Carry-overs are in [2026-10-09-stage4-packet-notes.md](2026-10-09-stage4-packet-notes.md); d-v2-02 carries the c3-state-mark copy and the answer-only Home card. Then p4-rate-limits, and the open entries report-kept-your-change and type-proposals.

Rules now live:
- WORKER cards carry `worktree: <absolute path>`.
- `pnpm check` writes the green mark.
- integrate.sh needs `tests changed:` lines.
- Agents have maxTurns (80 for implementers) and `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=2`.
- The push hook allows only the backup push, and it also refuses prose that mentions the push command (`push-guard-matches-quoted-text`, minor).
- The typescript-lsp tsserver keeps worktrees "in use", so integrate.sh keeps them. Remove them by hand after checking the tree is clean.

Open defects (stage-end list): size-cap-test-timeout-under-load, per-thing-ask-timeout-under-load (load flakes, to diagnose), agent-defs-not-live-mid-session.

## Where things stand

- **P3 is accepted** by the owner (GOVERNANCE, main `88bb7de`). Dossier: [2026-10-07-p3-dossier.md](2026-10-07-p3-dossier.md).
  - Code `426a9fd` runs on staging as `aeb99a4`.
  - Still pending from P3:
    - the live revocation with another test account (deferred by the owner);
    - the Codex review of the P3 range on 2026-10-12, which the lead starts.
- **P4 is authorized:** [P4_PLAN](../P4_PLAN.md), [TL-P4-01](2026-10-07-tl-p4-01-p4-start.md). The production cutover still needs the owner's approval of the moment and the rollback.
- **Backup:** `backup/main` is pushed after each green integration. Per BACKUP.md: `git push backup refs/heads/main:refs/heads/main`, then check the remote SHA. Bash runs outside the sandbox (keychain).
- **Local-only branch** `archive/p2-o5-snapshot`: uncommitted P2 work, kept as a P4 candidate. Never push it.
- **P4 progress (2026-10-08), rulings TL-P4-01 to TL-P4-10:**
  - **Closed:**
    - P4-1 to P4-8: speed (checkpoint per batch, reads and report, input fingerprint and sections, Drive-call golden);
    - placement-check, second-brain-method (TL-P4-08: the owner's local method is the semantic reference), per-thing asks, numbers grounded, naming.
  - **C04 is closed** (TL-P4-08 addendum 6). Staging `327b987`: offer-and-flat passed 3/3 and garden 1/1, input= stable within a case. Every live run is in [p4-speed-baseline.md](p4-speed-baseline.md).
  - **C05 has started.** `state-rewrite-change` is closed per [TL-P4-10](2026-10-08-tl-p4-10-current-state-ownership.md):
    - every Bower note write sets `bowerMd5`;
    - an unmarked section is adopted when md5Checksum matches; otherwise a line and one question per folder;
    - the fix-round check passed. It touches contracts, so the app and the runner deploy together.
  - **Open:**
    - `drive-calls-cut` (implementer, fix round, `/private/tmp/bower-p4-dcut2`): the P4-13 review blocked it, because the fence reused a read up to 3 s old and a person's rename was lost;
    - `report-kept-your-change` (C12), `type-proposals` and `ask-answer-loop` (C11).
  - **Main holds `drive-calls-cut`'s first round (`f41e508`), which is under its fix round: do not deploy main until it closes.**
  - **Next:**
    - when the drive-calls-cut fix closes: a short Opus check, the four suites (src changed since 222f9c0), main, backup, the SHA to the lead;
    - then the live checks: offer-and-flat ×3 + garden ×1, plus a C05 case.
  - **Live model runs:** the lead switches `BOWER_PROVIDER` in bower-home. I press by keyboard on tab `tab-10`.
    - **Fresh folder:** Bin outputs created after `localStorage.__of_resetAt`, restore the two hubs from `__of_flathub` and `__of_jobhub`, and Bin the leftover inbox pile.
    - **Pile files:** in localStorage (`__of_*`, `__c04b64`). Synthetic only, Bin only.
- **Owner's standing permission (in my session):** made-up piles and Tidy up presses on staging with test accounts A and B. Never delete-account, sign-in or production.

## TL-P4-14 consolidation (2026-10-08, current plan)

- New feature work is stopped until the consolidation in [TL-P4-14](2026-10-08-tl-p4-14-consolidation.md) is done: stage 0 (baseline), then stages 1–4, one stage at a time, at most two workers.
- Every entry: behaviour unchanged except the listed fixes; a red from today's drift; `removed: <lines>` on the card; Drive-call goldens never rise; engine, write-once, transport and Worker deadlines/dispatch start escalated. Packets follow [packet-template.md](packet-template.md) (TL-P4-13 checklist).
- Each stage ends with the four suites, a SHA to the lead, a staging deploy and a live smoke (garden ×1, offer-and-flat ×1, c05-hub-lines ×1, Home's time).
- C05 is closed in code (scripted 4/4, ask-answer-loop, state-yes-writes); its live baseline runs on the stage-0 SHA. Coordinator findings: [2026-10-08-p4-c05-findings.md](2026-10-08-p4-c05-findings.md).

## The plan, in order

1. **Speed (P4-B):** close the `drive-calls-cut` fix round, then measure on staging. Reads and apply are the biggest steps.
2. **Semantic slices (P4-C):** C05 next (state-rewrite-change is done), then C06–C11 and C13–C15 against the corpus. Each slice goes scripted first, then the model; the corpus scorer is the bar.
3. Then P4-D quality and the comparison with the original, and P4-E production readiness, as P4_PLAN orders them.
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
