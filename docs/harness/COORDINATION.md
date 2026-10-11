# Claude and Codex on one project

Researched and adopted for the workflow documentation on 2026-10-05. This is a repository protocol, usable from either tool. It does not install an orchestrator or make their private task lists communicate. Cross-vendor orchestration needs recorded live-session evidence; this documentation alone does not validate it.

## Recommendation and evidence

Keep the existing harness: a small map, explicit requirements, reproducible tests, red/green proofs and fresh review. Add one coordinator, explicit assignments, separate worktrees and serialized integration. Use parallel implementation when ready entries have independent files and settled contracts. One entry at a time applies per worker, not to the whole project. Keep one coordinator and independent review.

| Approach | Fit for Bower | Decision |
| --- | --- | --- |
| Two writers in one checkout | Share files, index, restores and test outputs; `done.sh` temporarily replaces code | Do not use |
| One writer plus a read-only reviewer | Low coordination cost when work shares files or unsettled contracts | Use when parallel implementation would conflict |
| Two implementers in separate worktrees | Useful for independent entries; still requires assignment and integration | Prefer when dependencies and ownership permit |
| Native agent teams or subagents | Useful inside a tool, but no shared Claude/Codex task transport is established by these sources | Optional adapters, not the source of truth |
| Two agents implement the same entry | Duplicated work and incompatible solutions | Only for an explicitly requested experiment in separate worktrees |

The following are primary sources, checked on the date above. Their recommendations inform this protocol; they do not prove an optimal model pairing or speedup on Bower.

- [Anthropic: effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): persisted feature requirements and incremental, tested progress. Retain the existing feature/proof system.
- [Claude Code: agent teams](https://code.claude.com/docs/en/agent-teams): independent contexts, coordination overhead, and avoidance of competing edits. Split by deliverable and file ownership; research/review is a useful first use.
- [Claude Code: best practices](https://code.claude.com/docs/en/best-practices): verifiable outcomes and a fresh session for review. Give each assignment acceptance criteria and evidence.
- [OpenAI: worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees): parallel checkouts have separate files but shared Git metadata. Use separate paths and branches; do not treat worktrees as separate repositories.
- [OpenAI: AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and [Claude Code: memory](https://code.claude.com/docs/en/memory): repository instructions persist beyond chat context. Keep `AGENTS.md` canonical and `CLAUDE.md` importing it.

## Standing authorization for parallel work

Owner authorization dated 2026-10-05 explicitly permits the named coordinator to spawn and assign subagents for independent work without asking again for each worker. This covers implementation, focused research, tests, and independent review/evaluation within the accepted phase and authorized resources. It does not authorize recursive delegation by workers, unrelated user-owned chats, new services/spend, deployment or next-phase implementation.

At dispatch and when a slot becomes free, inspect the ready entries and dependencies. Prefer two implementers plus an independent reviewer when available capacity supports that team; reduce concurrency when contracts overlap, resource contention rises or integration cannot keep up. This is a starting configuration, not a fixed cap or a target to keep every slot busy. Reserve review capacity and prioritize completing/integrating candidates over accumulating branches.

- Assign one entry per worker in its own exclusively owned checkout, from a named immutable base. Record files, tests, contract version, prerequisite commits, shared resources and candidate destination in ACTIVE before work starts.
- Parallel entries need disjoint write ownership, including test files, fixtures, dependencies and configuration, and no dependence on another worker's uncommitted behavior. Commit shared contracts first; dependent workers start from that accepted base. Different files alone do not prove independence.
- A blocked provider premise blocks its dependent entries, not the entire project. Continue ready independent fixes, preparation or research. Do not bypass phase acceptance or implement speculative contracts to manufacture parallel work.
- Unit checks/builds may run in isolated checkouts within machine capacity. Browser suites/evaluation keep the existing serialized port/server reservation. Real-provider operations retain their explicit operator/resource limits. A browser reservation is not a ban on unrelated offline implementation.
- Review immutable candidates independently and integrate/close one entry at a time. Recheck the later candidate against the updated integration base and rerun required combined checks. Changed behavior invalidates affected review; a clean cherry-pick alone is not compatibility evidence.
- Existing narrow assignments remain narrow. A historical “sole writer” packet is not project-wide policy, but its reservation is not silently revoked either: the coordinator explicitly records new disjoint reservations or a clean handoff.

Record a brief reason in the current assignment when otherwise ready work is serialized (shared contract, overlapping file, resource limit or pending integration). Do not add a separate approval gate or research phase for routine dispatch.

## Roles and authority

The owner decides product scope and phase closure. One named coordinator, Claude or Codex, owns the integration checkout for each batch. Do not appoint both agents as coordinator. A coordinator can implement, but another fresh session reviews that implementation. Prefer cross-tool review when both tools are available; independence and evidence matter more than vendor identity. Roles are explicit per assignment. The owner has appointed a Claude technical lead and planner for the whole project (2026-10-06); see `GOVERNANCE.md`. This does not replace the active implementation coordinator.

The technical lead owns adopted purpose, phase definitions, planning and method on main. The integration coordinator owns implementation status/evidence in the live branch and alone writes its shared operational records: `harness/features.json`, `harness/proof.log`, `harness/progress.md`, `docs/harness/HANDOFF.md`, `docs/harness/ACTIVE.md`, phase completion evidence and execution ledgers. Product/phase definition changes follow the lead and owner decisions; neither role changes the other's live files without an explicit handoff. Workers report proposals and findings for the coordinator to register. Changes to shared contracts, instructions, dependencies or test configuration are separate, serialized assignments.

The short-lived batch record is `docs/harness/ACTIVE.md` in the integration checkout. Only the coordinator edits it. A worker's copy in a worktree is a snapshot: the assignment must include the integration path and the worker must read the current record there at startup, before committing and before returning a result. This is a manual single-writer protocol, not an atomic lock implemented by a script. If no coordinator is named, do not claim the first open entry automatically: remain read-only until the owner or active coordinator assigns the role.

Native Claude/Codex tasks and chat memory are convenience views. Assignment packets and the repository records carry the authority. Exchange packets through the owner or an explicitly authorized messaging route. Do not assume either tool can see the other's chats or that a pending message was received.

## Skills and startup

Every session follows `STARTUP.md` through the canonical `bower-session` skill; only the assigned role skill loads next. Selection and optional Codex capabilities are recorded in `SKILLS.md`. Native discovery is convenient, not mandatory: direct SKILL.md loading preserves the method. Skills do not assign ownership, install tools or grant delegation.

## Starting a batch

1. Follow `STARTUP.md` and check role-specific capabilities; read the usual startup documents; inspect `pwd`, `git status --short`, branch, `git worktree list` and recent commits. Record existing dirty paths and their owner. Do not stash, reset, stage or delete another session's work. A dirty integration checkout cannot be used for integration or `done.sh`.
2. Name the coordinator, integration path/branch and batch base commit in `ACTIVE.md`. Existing uncommitted work needs its owner's handoff; meanwhile other agents can investigate or review committed code.
3. Run `bash harness/init.sh` in each writable checkout before implementation. Record the exact checkout/commit and failures. If installation or a gate is unavailable, report it as blocked evidence; do not call that checkout green or repair someone else's failing work without assignment.
4. Coordinator selects one open entry per worker, checks dependencies and reserves its production and test files. Independent source files are not sufficient if both tasks change one contract or fixture. Overlap means sequence the work or re-split it.
5. For parallel writers, create separate worktrees from the recorded committed base and use distinct local branches. Keep worker changes local; workers never push or add a remote. The designated main integrator backs up main only under BACKUP.md after accepted integration. Codex app worktrees may start detached: record the path and commit, and give the work a local branch before committing. Worktrees do not contain another checkout's uncommitted work.

A CLI example after choosing real entry IDs, a committed base and writable paths (replace the placeholders; never run it literally):

```sh
git worktree add -b codex/<entry-id> <worker-path> <base-sha>
```

Claude Code can be started in that checkout; Codex can use a managed worktree. Inspect existing worktrees before creating another. Each checkout needs its own dependencies, build, test outputs and browser state; never share a writable `node_modules` or `dist` between sessions.

## Assignment packet

The coordinator copies this packet to the worker's session and records the assignment in `ACTIVE.md`. No tool-specific skill is required.

```text
Role: technical lead | implementer | reviewer | evaluator
Tool/session: Claude or Codex, with a unique session/thread label (not only /root)
Planning revision / phase / capability IDs: adopted version and acceptance mapping
Entry: exact ID (or explicit documentation/research scope)
Integration checkout and branch:
Current coordination record: <integration-path>/docs/harness/ACTIVE.md
Worker checkout and branch:
Base SHA / target SHA: immutable commits, not HEAD
Allowed production and test paths:
Dependencies and reserved contracts / versions:
Compatibility fixtures and failure/recovery scenario:
Acceptance: entry what, steps and unchanged verify
Skills / required capabilities: bower-session + assigned role; tools checked live
Commands: writer verify/check and applicable screen gates; read-only roles use prepared evidence
Browser reservation: none, or path + SHA + URL + source + scenario + sizes
Deliverable: candidate SHA, evidence and unresolved findings
Restrictions: local only; no shared-record edits; no done.sh as a worker
```

A role assignment is permission to do the stated work, not permission to expand scope or spawn more agents. If a needed file belongs to another assignment, report the dependency before editing it. The named coordinator has the standing owner delegation above; workers need an explicit coordinator assignment and may not recursively spawn agents.

## Implementation and integration

**Single writer:** keep the existing test-first workflow and normal `done.sh` closure. Reserve the checkout against other writers and browser users during closure.

**Parallel workers:** write the named test first, capture its failed assertion, implement the smallest fix, run the targeted verify and `pnpm check` in the assigned worktree. A worker commits only its assigned code/tests in one candidate commit; it does not change `passes`, proof, progress or shared state and does not run `done.sh`. Send candidate SHA, base, changed paths, red/green commands and results, and any missing checks to the coordinator. A candidate is not a closed entry. For a new module, agree a stub commit with the coordinator first so the red is an assertion, not a load error.

The coordinator integrates one entry at a time:

1. Confirm the assignment is still current; inspect the candidate diff and the unchanged verify. Obtain a fresh independent review of the immutable candidate range. Resolve Important/Critical findings before closure. A finding inside the entry's contract, about its own new code, gets a fix round under the same design. A finding that shows the design is wrong or touches another mechanism, and any live, suite or evaluator failure, follows [DEFECTS.md](DEFECTS.md): log, diagnose, the lead's ruling, then packets. The coordinator never chooses a fix design.
2. Ensure the integration checkout is clean, no `done.sh`, evaluator or test process uses it, and reserve browser resources if needed. Cherry-pick only the assigned candidate commit. If there is a conflict, resolve it deliberately with the worker; rerun review for changed behavior. Never accept all of one side blindly.
3. Keep the cherry-picked commit's SHA. Use `bash harness/done.sh <id> "<message>" --fixed-in <integration-sha>` to reproduce the failed assertion against the integrated code and run the gates/verify before recording closure. Use the SHA in the integration checkout, not the original worker SHA. The existing script permits this mode; no proof format is changed.
4. If the inverse patch no longer applies or the test stays green, the entry remains open. Rework the candidate/test rather than weakening verify or using `--known-green` to bypass a bad candidate. Genuine decision/test-only entries still follow the existing committed-note rule.
5. For screen changes, run the full demo and fake suites before closing, and inspect phone and desktop. Rerun the targeted verify on the combined tree through `done.sh`; worker results alone do not certify integration. For PWA changes also run `pnpm e2e:pwa`.
6. Record the integrated/closed SHA and review target; update the batch record and `## Next`. Release the assignment only when it is integrated or explicitly stopped.

Each candidate commit and each closure commit belongs to one entry. Parallel mode deliberately has a candidate commit followed by a proof/closure commit, matching the existing `--fixed-in` path. Do not combine several entries into a single candidate. Failed closure leaves the candidate committed but the entry open; record that state before starting another integration.

Documentation/research maintenance requested by the owner can be a documentation commit with a planning-log line in GOVERNANCE (or coordinator-owned progress when assigned); do not invent a fake failing behavioral test or alter `passes` for it. Changes to harness executable behavior still need a real entry and test-first proof. All commits still require `pnpm check`.

## Browsers and other shared resources

Worktrees isolate source files, processes' ports and servers (c4-e2e-port). Every Playwright config takes its port from `e2e/port.ts`: a hash of the worktree root (dev from 5300, preview from 7300, 2000 ports each), overridden by `E2E_PORT` (dev and explore) or `E2E_PREVIEW_PORT` (`pnpm e2e:pwa`). A server already on that port is reused only if it answers the dev-only identity route with this worktree's root; any other server stops the run with one line naming the other root. So two worktrees can run browser suites at once, and no workaround config is needed. Never kill another session's process. Browser state and display are still shared: reserve a checkout in `ACTIVE.md` for an evaluator or a `done.sh` whose verify needs the awake display.

An evaluator gets a frozen checkout and a production build of the named SHA. No edits, cherry-picks, builds or `done.sh` restores there during evaluation. Another isolated worker may continue unit-test work. Reviewer and evaluator can work concurrently only if both target the same immutable candidate and the reviewer does not mutate that checkout. Reports name SHA, source/scenario and exact steps. Stale reports cannot certify newer commits; re-review relevant changes and re-evaluate affected flows.

Use the browser automation actually available in the assigned tool, in a dedicated session with made-up data. Playwright CLI remains the reproducible gate. If interactive automation is unavailable, report the missing manual evaluation; do not substitute code inspection and call it a user evaluation. Use synthetic upload fixtures in the assigned checkout, never personal files. Respect the awake-display limitation in `HANDOFF.md`.

## Returning results and recovering interrupted work

Return: entry/role, base and target SHA, candidate SHA, changed paths, checks (passed/failed/not run with reason), review findings, contract decisions, next action. Coordinator records findings as entries; reviewer/evaluator do not edit the backlog themselves. Reports are evidence, not approval to close a phase.

If a session stops responding, retain its assignment and checkout. The coordinator checks its Git status and latest commits, contacts the owner/session, then explicitly marks it stopped or hands it over. Time passing does not release ownership. Never delete a dirty worktree; preserve needed work before cleanup. Reassign using a new packet with the exact latest committed base and unresolved checks.

`HANDOFF.md` is durable phase state; `ACTIVE.md` is the current batch; `progress.md` is the historical log; `features.json` records registered entry completion; P2_ACCEPTANCE is phase completion truth. Keep those meanings separate. A batch record in an old worktree cannot override the integration record.

## First rollout and measurement

For the remaining phase 2 work, dispatch independent ready entries in separate worktrees and reserve fresh review capacity; either Claude or Codex can fill each assigned role. Keep browser work serialized. Use the current adopted phase closure criteria, including the expanded capability and boundary evidence.

For the first three completed entries, record elapsed time to verified integration, review findings requiring rework, conflicts, repeated gate time and missing evidence. Compare with the existing roughly 3-minute unit closure and 10–15-minute browser closure observations (these are not a controlled benchmark). Continue parallel implementation only if it reduces elapsed delivery time without more regressions, conflicting edits or unverifiable closures. Otherwise keep the writer/reviewer pairing. No automated scheduler, lock enforcement or cross-vendor messaging was added here.

## Adopted phase acceptance and planning updates

Read PRODUCT, WORK_PLAN, P2_ACCEPTANCE and ORCHESTRATOR_START before assigning new scope. Boundary work follows ARCHITECTURE. Serialize shared schema changes before downstream writers; require compatibility and recovery evidence, not just type checking. A phase is blocked by uncovered capability obligations even if the old feature list is entirely green. The coordinator registers gaps, while the technical lead resolves planning/contracts and the owner resolves product tradeoffs. Keep one defect/delivery entry at a time and use the smallest test that demonstrates its effect. Independent review must check interactions as well as each local fix.

Planning can land on main independently of product code. Compare PLAN_REVISION on startup and resume. Finish or preserve a reserved atomic entry, then integrate the docs-only main update in an exclusively owned clean checkout; reconcile conflicts by purpose, preserving newer implementation evidence. Record the adopted revision before further assignments. Do not merge an old proposal branch just to acquire its prose, because it may carry unfinished product commits.

Prefer parallel ready deliverables with independent review when ownership and dependencies permit. The standing owner authorization above permits coordinator delegation; it does not expand worker authority. Use bounded packets rather than copying whole chat histories. Return assumptions and missing evidence in the result, and recheck reservations before integration. Optional bridges carry packets; they do not grant authority or certify work.

## Branch and worktree cleanup (TL-P4-19)

A worker's branch and worktree end with its integration, as with "delete branch on merge" on a forge. After a green merge, `harness/integrate.sh` runs `git worktree remove <worktree>` and `git branch -d <branch>`. Both refuse a dirty worktree or an unmerged branch, so nothing unmerged is lost ([git-branch -d](https://git-scm.com/docs/git-branch#Documentation/git-branch.txt--d), [git-worktree remove](https://git-scm.com/docs/git-worktree#_commands)). A branch that is superseded and never merged, such as an earlier fix round, is deleted only with the owner's OK, from a list the lead reviews. Cleanup never touches `main`, `claude/p3`, `claude/tl-planning` (the lead's), `claude/design` (the designer's), `archive/*` or `codex/*`. It never touches the deploy worktree, or a worktree that another session or a running process uses. "Merged" is not enough reason to remove a session's own worktree, because merging `main` makes those branches look merged (2026-10-09).

## Sessions, the main checkout and messages

- **The main checkout** (`/Users/deluisp/Projects/bower-app`) is the coordinator's integration checkout, on `claude/p3`.
  - No other session switches its branch. The lead works in `/private/tmp/bower-tl-planning`, and the designer in `/private/tmp/bower-design`.
  - When the owner opens a new session in this project, they leave the branch as it is, or choose a worktree. Opening a session on `main` once moved the checkout off `claude/p3` (2026-10-09).
- **Permission modes.** Sessions that message each other run in the same permission mode (currently bypass). Otherwise the app holds each message until the owner approves it.
- **Message budget.** After 10 sends with no owner message, a session's sends pause. The coordinator then writes its questions in `docs/harness/LEAD_QUESTIONS.md` on `claude/p3`, and the lead answers in `DECISIONS.md` on `main`. The coordinator reads DECISIONS after each merge of `main`.
- **In Codex** ([TL-P4-56](CODEX_TAKEOVER.md)): messages go through `codex queue --thread <session name>` or the mailbox in `/Users/deluisp/Projects/bower-mail/`, with the same 10-line limit. Heartbeat automations replace the watchdog cron and the tracked jobs.
