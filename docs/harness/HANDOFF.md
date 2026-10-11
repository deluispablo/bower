# Current handoff: Claude coordinator, P4

Coordinator: the Claude Code session named "Orquestador". It integrates in `/Users/deluisp/Projects/bower-app` on branch `claude/p3`; P4 continues on it. Lead: the Planificador session ([DECISIONS.md](DECISIONS.md)). Output rule: [TL-P3-29](2026-10-07-tl-p3-29-output-rule-survives-compaction.md), in AGENTS.md. Minors: [P2_POLISH.md](P2_POLISH.md). Earlier handoffs: git history of this file.

## Resume (2026-10-11 wind-down before the CLI/tmux restart; TL-P4-56, TL-P4-57)

This block is the whole current state; ACTIVE.md is the history log. A Codex successor follows [CODEX_TAKEOVER.md](CODEX_TAKEOVER.md).

**State.**
- claude/p3 holds main a22301d8 (merged): 523/537.
- After each lead ruling, merge main again (`git -C /Users/deluisp/Projects/bower-app merge -q --no-edit main`).
- Check `git -C /Users/deluisp/Projects/bower-app branch --show-current` before each integrate. An owner Codex Desktop thread once switched the checkout to main (DEFECT_LOG main-checkout-switched).
- backup/main and staging are at 5bab1288.
- Since then, claude/p3 has gained B1c, Q1c, B3b, B5a, B6a, c02/E, messages-wait-for-sheets, next-steps-plain-list and q1b-questions-ui. The next batch boundary needs:
  - the four suites (harness/jobs/suites.sh);
  - main moved (`git -C repo fetch -q . claude/p3:main`);
  - a backup after harness/jobs/backup-scan.sh 5bab1288;
  - the SHA sent to the lead;
  - a staging smoke.
- No job is running. Nothing is dispatched.

**Loop per entry (TL-P4-29/31/51/54, TL-P4-56 addendum 1, TL-P4-57).** Workers are Codex only, through `harness/codex-run.sh <worktree> <prompt> --entry <id> --attempt <n> --model … --effort …`. The result is `/tmp/codex-run/<entry>-<n>.result`, and codex-run commits per `.codex-commits.json`: a JSON array of {message, files}, with notes in their own commit so done.sh can revert the fix.
- **Models:** escalated reds, implementations and closing reviews use gpt-6-astra high. Adversarial passes use gpt-6-astra xhigh. Normal and fix rounds use gpt-6.1-sol high, and mechanical work uses Sol medium. Cap: 4.
- **Steps:**
  1. A red.
  2. The implementation.
  3. The coordinator adds compatibility rows for every non-merge commit touching src/features or src/data/contracts.
  4. Gates: `harness/jobs/gates.sh`. Codex can't bind ports.
  5. An adversarial pass (escalated entries).
  6. A fresh read-only Codex reviewer at high.
  7. The designer's verified (ui entries).
  8. `harness/jobs/integrate-done.sh`, or known-green with a committed Close note.
- Set `BOWER_TOKENS=/tmp/codex-run/tokens-pending.csv` so runs don't dirty the main checkout. Fold that file into harness/tokens.csv at boundaries.

**In flight.**

| Entry | Branch / worktree | Last SHA | Attempt | Next step | Ruling |
| --- | --- | --- | --- | --- | --- |
| b1d-selection (escalated) | b1d-selection, /private/tmp/bower-b1d-selection | a187863c | round 6 done; adversarial pass 4 ruled (TL-P4-41 addendum 24, main 1034ad40) | Round 7 (no work done yet): one red for (1) and (2), then the fix, gates, Astra xhigh, Astra high review. (1) execution writes only ids the selection names; a request pin only makes its note a candidate, and if left out the request stays unconsumed in the inbox. (2) a person's note with type: moc and no by: bower is never snapshotted as a Bower MOC. (3) cut-context fingerprints are a v1 limit; write it in the notes. | TL-P4-41 addenda 13–24 |
| b4a-contract (escalated) | b4a-contract, /private/tmp/bower-b4a-contract | 6ea75a9c | fix round 2 running (TL-P4-48 addendum 4): red attempt 10, fix attempt 11 (scratchpad jobs/b4a-r2.sh) | The fix covers findings 1–4 of adversarial-2, the tsc app errors and capabilities.spec:210. Next: compatibility rows, gates, the Astra xhigh pass 3, then the high review; the loop end applies after this round. After B1d integrates: merge claude/p3, update the RUNNER_WRITES pin (claude-provider.test.ts:600), watch for conflicts in ownership-format, run-manifest and note-format, then integrate. | TL-P4-48 addenda 1–4 |

**Queue, in order.**
1. B1d close, then B4a.
2. B5b and B5c (packets ruled by TL-P4-47 addendum 5; they wait for B1d's claude.ts handoff; the designer confirmed B5b's table).
3. B4b, then B4c (after B4a and B1d).
4. B6b, after B1d (TL-P4-47).
5. rules-added-region-model, after B1d. Then rules-added-region, then rules-original-ui.
6. B7, B8 and B9 per P4_PLAN.
7. The retest.

**Open questions to the lead.** None (B1d pass 4 ruled in addendum 24).

**Notes.**
- B6a's integrate rule: a verify pattern needs at least 4 non-meta characters (scripts/harness-rules.mjs).
- done.sh can't revert a fix commit that also carries notes lines touched later. Close those known-green with a committed Close note.

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
