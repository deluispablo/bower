# Current handoff: Claude coordinator, P4

Coordinator: the Claude Code session named "Orquestador". It integrates in `/Users/deluisp/Projects/bower-app` on branch `claude/p3`; P4 continues on it. Lead: the Planificador session ([DECISIONS.md](DECISIONS.md)). Output rule: [TL-P3-29](2026-10-07-tl-p3-29-output-rule-survives-compaction.md), in AGENTS.md. Minors: [P2_POLISH.md](P2_POLISH.md). Earlier handoffs: git history of this file.

## Resume (2026-10-11, CLI/tmux; TL-P4-56, TL-P4-57, TL-P4-60 auto-compaction)

This block is the whole current state; ACTIVE.md is the history log. A Codex successor follows [CODEX_TAKEOVER.md](CODEX_TAKEOVER.md).

**State (STOP 2026-10-12 at 99% Claude usage, TL-P4-61; READY).**
- claude/p3 (main checkout) carries everything integrated: B4b (cd75a643, close ccd3fd19) and lock-process-group (dd1491bc, TL-P4-62), plus rulings up to TL-P4-47 addendum 21 (main ba7c65ff). 528/542 entries pass.
- backup/main is at 9bca6989 (verified remote). claude/p3 and main are ahead by B4b, lock-process-group and the harness commits. The next batch boundary needs harness/jobs/suites.sh, `git -C repo fetch -q . claude/p3:main`, backup-scan.sh 9bca6989, the backup of main per BACKUP.md, the SHA to the lead and a staging deploy by the lead.
- Jobs running: none (the B5c addendum 21 test-repair attempt 32 failed with codex-failed; its chained implementation attempt 33 was killed at the STOP and left no diff).
- After each lead ruling merge main (`git -C /Users/deluisp/Projects/bower-app merge -q --no-edit main`), then claude/p3 into the entry worktree. Check `git branch --show-current` before each integrate.
- Progress guards (TL-P4-62): heavy runs only via harness/with-lock.sh (own process group, HARNESS_TIMEOUT 25 min default); kill orphan Playwright/Chrome before each gate; a gate failing twice on the same spec is a defect (never a third run); message the lead after 2 h without a commit or a gate older than 25 min; at most 2 adversarial fix rounds after the contract.
- Codex quota (TL-P4-57 addendum 2): at most 2 workers; gpt-6.1-sol only, --tier standard (low mechanical, medium implementation/reds/fix rounds, high escalated work/adversarial/closing reviews); no Astra, no xhigh.
- Prompts and job scripts of this session: /private/tmp/claude-501/-Users-deluisp-Projects-bower-app/19ca090d-5e3d-4a2f-899c-8f2af3d7d836/scratchpad/ (codex-b5c-r21-red-prompt.md, codex-b5c-r21-impl-prompt.md, jobs/b5c-r21.sh); copy them if the scratchpad is gone. Fold /tmp/codex-run/tokens-pending.csv into harness/tokens.csv at the next boundary.
- **STOP rule (TL-P4-61):** at 99% Claude usage the lead sends STOP: start nothing new, commit partial diffs on their branches, make HANDOFF and ACTIVE exact, reply READY <sha>.

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

| Entry | Branch / worktree | Last SHA | Next step | Ruling |
| --- | --- | --- | --- | --- |
| b5c (escalated) | b5c, /private/tmp/bower-b5c | 56a95016 (clean tree; claude/p3 merged) | TL-P4-47 addendum 21. DONE: the test repair (attempt 32: cfbfe182 tests, 56a95016 notes). Its notes say the rewritten no-id cases (b5c-fr1-D-profile-data, the b5c-fr7 tests) already PASS against current production, so they are not yet reds. NEXT: (2) implementation (Sol high, attempt 34): DELETE the shortest-name to fileId binding and the Source-note/bowerItem filter in runner/src/claude.ts (~:896-910) (dead code now; check that the unused/duplication gates stay at baseline); (3) compat rows, gates (gates.sh), a fresh closing review (Sol high), NO more adversarial passes; (4) integrate (known-green with a Close note: the verify names runner/test/b5c-*.test.ts); no designer (not ui). The STOP killed the first attempt-33 start (no diff). | addendum 21 |
| b6b-fit-create-ask | b6b-fit-create-ask, /private/tmp/bower-b6b-fit-create-ask | 5d0313a3 | red done; merge claude/p3, implementation (packet 2026-10-11-b6b-fit-create-ask-packet.md), gates, adversarial (max 2 fix rounds), review, designer (ui), integrate. Starts right after B5c. | TL-P4-47 |
| b7-tags | b7-tags, /private/tmp/bower-b7-tags | 01839270 | red done; implementation after B6b | TL-P4-49 |
| b8-log | b8-log, /private/tmp/bower-b8-log | a397198f | red done; implementation after B7 | TL-P4-49/50 |
| b9-markers | b9-markers, /private/tmp/bower-b9-markers | c81406ae | format/producer reds done; implementation after B8 (one entry, three serial stages) | TL-P4-50 |
| B4c / rules-* | not started | | per P4_PLAN, after B6b | |

- A job's result card is /tmp/codex-run/<entry>-<n>.result; a check-failed status on a red is expected; on a fix, read the notes' newest section and the check log. Last attempt numbers: b5c 33 (killed, no result); b4b closed.
- Pending designer checks: B6b (ui). B5c, B7, B8, B9 are not ui.

**Queue, in order.** B5c (addendum 21), then B6b, B7, B8, B9, then B4c and rules-added-region-model / rules-added-region / rules-original-ui per P4_PLAN, then the retest. A batch boundary (suites, main move, backup, staging) is due after B5c.


**Open questions to the lead.** None (B1d pass 4 ruled in addendum 24; B4a pass 2 ruled in TL-P4-48 addendum 4).

**Entry files.**
- Packets are on claude/p3 in docs/harness: 2026-10-11-b1d-selection-packet.md and 2026-10-11-b4a-contract-packet.md.
- Notes and adversarial reports are in each worktree's docs/harness:
  - B1d: 2026-10-11-b1d-selection-notes.md and b1d-adversarial-final{,-2,-3,-4}.md;
  - B4a: 2026-10-11-b4a-contract-notes.md and b4a-adversarial-{1,2}.md.
- The adversarial prompt for the next pass: the scratchpad's codex-b1d-adv-prompt.md and codex-b4a-adv-prompt.md. Update the round, the addenda and the previous pass's file first.

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
