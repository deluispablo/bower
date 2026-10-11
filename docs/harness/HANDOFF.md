# Current handoff: Claude coordinator, P4

Coordinator: the Claude Code session named "Orquestador". It integrates in `/Users/deluisp/Projects/bower-app` on branch `claude/p3`; P4 continues on it. Lead: the Planificador session ([DECISIONS.md](DECISIONS.md)). Output rule: [TL-P3-29](2026-10-07-tl-p3-29-output-rule-survives-compaction.md), in AGENTS.md. Minors: [P2_POLISH.md](P2_POLISH.md). Earlier handoffs: git history of this file.

## Resume (2026-10-11, CLI/tmux; TL-P4-56, TL-P4-57, TL-P4-60 auto-compaction)

This block is the whole current state; ACTIVE.md is the history log. A Codex successor follows [CODEX_TAKEOVER.md](CODEX_TAKEOVER.md).

**State.**
- claude/p3 holds main up to TL-P4-48 addendum 4 (1ac0b793, merged): 523/537.
- After each lead ruling, merge main again (`git -C /Users/deluisp/Projects/bower-app merge -q --no-edit main`).
- Check `git -C /Users/deluisp/Projects/bower-app branch --show-current` before each integrate. An owner Codex Desktop thread once switched the checkout to main (DEFECT_LOG main-checkout-switched).
- backup/main and staging are at 5bab1288.
- Since then, claude/p3 has gained B1c, Q1c, B3b, B5a, B6a, c02/E, messages-wait-for-sheets, next-steps-plain-list and q1b-questions-ui. The next batch boundary needs:
  - the four suites (harness/jobs/suites.sh);
  - main moved (`git -C repo fetch -q . claude/p3:main`);
  - a backup after harness/jobs/backup-scan.sh 5bab1288;
  - the SHA sent to the lead;
  - a staging smoke.
- **B4a is CLOSED and integrated (59c2c7ad, 525/541 with the new entries). Codex intensity (TL-P4-57 addendum 1, main d380d1a4; owner reset the usage on 2026-10-11).** Every run passes `--tier standard` (no Fast). Sol medium for normal work and repairs, Sol high for escalated work and closing reviews, Sol low for mechanical work; Astra high only for adversarial passes, never xhigh. Max 3 workers. A third failed attempt on the same red goes to the lead (no 4th run).
- **STOP rule (TL-P4-61, main cafff851):** at 99% of Claude's weekly usage the lead sends STOP: start nothing new, commit partial diffs on their branches, make HANDOFF and ACTIVE exact for Codex, reply "READY <sha>". Keep both current at every step anyway.
- Jobs running (1 of 3): B5b golden repair (jobs/b5b-golden.sh). Every later implementation (B5c, B4b, B6b, B7, B8, B9) shares scripted.ts or claude.ts and waits for B5b, in the queue order. B5b attempt 4 is done and waits for B4a.
- Finished and waiting for slots: B6b reds (done), B7 packet (b7-tags 06e89b5c) and B8 packet (b8-log 6ae4813c): review each, merge into claude/p3, add the features.json entry, then their reds.
- When a job ends, read the result's card. A check-failed status on a red is expected; on a fix, read the notes' newest round and the check log.
- Pending designer checks: none yet (B5b needs one when built).
- Pending designer checks: none (B1d and B4a are ui: false).

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
| b5b-tables (escalated, ui) | b5b-tables, /private/tmp/bower-b5b-tables | d01314cf + merge | chain done: repair (attempt 11, commits 69fefd51, 799aec3c), step 2 red (12: b20c93cb, 5755570d), step 2 fix (13: a556c7a9, d01314cf: live proposals through the claude.ts reply schema and askAfter). Runner 757/759: the two C04 prompt goldens (model-input-fingerprint.test.ts:100, :112) are stale because the prompt gained the proposal text; golden-only TL-P4-51 repair RUNNING (attempt 14, Sol low, /private/tmp/claude-501/-Users-deluisp-Projects-bower-app/19ca090d-5e3d-4a2f-899c-8f2af3d7d836/scratchpad/jobs/b5b-golden.sh, result /tmp/codex-run/b5b-tables-14.result) | Next: compatibility rows (25a0ea1b, a556c7a9 and others touching src/features or src/data/contracts), gates incl. e2e/folder-table.spec.ts, then the Sol high review (P4-123 packet; covers both steps and the earlier adversarial findings), designer verified, set verify/review/design fields, Close note, integrate (merge claude/p3 first). Then B5c, B4b, B6b, B7, B8, B9. | TL-P4-47 addendum 5 |
| b4b-observations (escalated) | b4b-observations, /private/tmp/bower-b4b-observations | 967527b4 | red done (attempt 1: 8 named reds fail, 6 unimplemented memory controls red; commits ef9be63e, 967527b4) | The implementation owns src/data/spine/scripted.ts, which B5b is changing now, so it starts after B5b integrates (merge claude/p3 first; Sol high). Then compatibility rows, gates, adversarial, review; B4c after it. | TL-P4-48 |
| b5c | b5c, /private/tmp/bower-b5c | ad86c940 | red attempt 1 done: only 1 of 10 reds written (b5-person-profile-not-adopted fails as expected); nine are blocked by the missing profile intent, binding and template that B5b supplies (commits 4a4c23f0, ad86c940 in the worktree) | Waits for B5b to integrate; then merge claude/p3, finish the nine reds (attempt 2, Sol medium), then the implementation. | TL-P4-47 |
| b6b-fit-create-ask | b6b-fit-create-ask, /private/tmp/bower-b6b-fit-create-ask | 5d0313a3 | red done (attempt 1, six reds fail on findings, controls pass; worktree commits 8da71c0f, 5d0313a3) | Next: the implementation after B5b/B5c release scripted.ts and claude.ts (B1d is integrated); compatibility rows; gates; review. | TL-P4-47; lead GO for red-first |
| b7-tags | b7-tags, /private/tmp/bower-b7-tags | 01839270 | red done (attempt 2; 15 rows fail, one already passes; commits a47cf6e8, 01839270); open seams in the notes: the automatic-candidate declaration and the complete generation-route matrix | Waits for B4a, B5b and B5c where files overlap; then the implementation (Sol high). | TL-P4-49 |
| b8-log | b8-log, /private/tmp/bower-b8-log | a397198f | red done (attempt 2; 19 of 20 named reds fail, b8-done-redispatch-noop already passes; commits 0966ba19, a397198f); the settled B7 decision coverage is incomplete | Waits for B4a/B5b where files overlap; then the implementation. | TL-P4-50 |
| b9-markers | b9-markers, /private/tmp/bower-b9-markers | c81406ae | format and producer reds done (attempt 1: 8 reds fail, 4 already green, 12 controls pass; commits e4964ff7, c81406ae); the proof stage (corpus, H1/H2 files) comes after the implementation stages; C07 semantic acceptance pending | Waits for B4a, B5b and B5c to release the shared files; then the implementation stages serially (format, producers, proof), one review chain at the end. | TL-P4-50 (B9) |

**Queue, in order.** (The lead's order for free slots: B6b red, then B7, B8 and B9 reds; B5c's red once B5b's red is committed; B4b and B4c after B4a settles.)
1. B1d close, then B4a.
2. B5b and B5c (packets ruled by TL-P4-47 addendum 5; they wait for B1d's claude.ts handoff; the designer confirmed B5b's table).
3. B4b, then B4c (after B4a and B1d).
4. B6b, after B1d (TL-P4-47).
5. rules-added-region-model, after B1d. Then rules-added-region, then rules-original-ui.
6. B7, B8 and B9 per P4_PLAN.
7. The retest.

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
