# Technical leadership and planning authority

Owner instruction dated 2026-10-06 appoints the Claude Code session `Planificador` (label `claude-planificador-2026-10-06-24fea5c3`) as technical lead and planner of the whole project, across all four phases. It replaces the Codex planning session appointed on 2026-10-05, whose rulings TL-P2-03 to TL-P2-05 remain in force until superseded. This is a durable role assignment, not permission to implement product features, take another session's checkout or close a phase: implementation, integration and proofs stay with the named coordinator, so independent review keeps its meaning.

## Owner authorization for unattended continuation (2026-10-05)

The owner explicitly authorized autonomous work during their absence, continuation from P2 into P3 when P2 is complete, and periodic private GitHub backups. This supersedes earlier requirements to wait for another owner reply solely to accept P2 or begin P3. It does not waive any capability, provider-premise, automated gate, independent review or evaluation requirement.

The named coordinator may close P2 on a frozen, fully evidenced target after independent review and evaluation, record that the owner's conditional authorization was applied (not that a live human evaluation occurred), integrate the validated release into local main, and begin the adopted P3 plan without another permission request. Register the P3 acceptance checklist and assignments before implementation. P4 remains outside this continuation authorization.

Use judgment for routine implementation and reversible technical decisions within the adopted scope. Preserve capabilities, data and existing production service. An unavailable credential or required product choice blocks only dependent work; record it and continue independent work. Do not replace missing evidence with approval, silently weaken requirements, introduce spending or overwrite production under this instruction.

Back up validated main after each integration and check for pending backups hourly while work is active, following [BACKUP.md](BACKUP.md). Never merge unfinished work solely for backup. Only the designated main integrator pushes, with explicit ref and verified destination; workers never push. Keep an exact local/remote SHA in the handoff, and report failures honestly.

## Responsibilities

| Role | Authority | Does not own by default |
| --- | --- | --- |
| Owner | Product purpose, scope tradeoffs, unresolved rulings, phase acceptance | Routine implementation choices inside an accepted assignment |
| Technical lead | PRODUCT, WORK_PLAN, P2_ACCEPTANCE, phase definitions, architecture boundaries, Harness/skills and planning decisions; docs-only integration to local main | Product implementation, current batch reservations, feature passes/proofs, approval of its own implementation |
| Integration coordinator | Live ACTIVE record, assignments, implementation branch integration, feature registration/proofs/progress and truthful phase evidence | Silently narrowing capabilities or advancing phases without acceptance |
| Implementer | One assigned entry in an owned checkout | Shared plan/proof edits or unrelated file reservations |
| Reviewer/evaluator | Independent findings on a fixed target | Source changes, backlog closure or unassigned delegation |

Technical lead and coordinator can both be Codex or Claude in future assignments, but their session identities and authority must be explicit. The lead appointment does not rename or replace the ongoing implementation coordinator. A lead can review planning, but independent behavioral acceptance remains a separate role.

## Sources of authority

1. Current explicit owner instruction.
2. Adopted PRODUCT, ARCHITECTURE, WORK_PLAN, P2_ACCEPTANCE and planning revision on local main.
3. Accepted phase-specific specs/contracts and actual implementation assignment.
4. Live integration ACTIVE record for who may touch which files/resources.
5. Historical ledgers/proposals and tool-private memory as context only.

There are two different facts: main carries adopted planning; an integration branch may carry newer implementation/proofs. Neither branch's completion counts overwrite the other's history. A documentation merge is not evidence that code was integrated or a phase closed.

At startup compare the checkout's `docs/harness/PLAN_REVISION` with `git show main:docs/harness/PLAN_REVISION` when available. Read changed planning docs from main if the checkout is behind. A reviewer names both code SHA and planning revision. A worker does not merge/rebase dirty work itself. The coordinator finishes/preserves an already reserved atomic task, reaches a safe clean checkpoint, integrates the planning update, reconciles capabilities/backlog and then issues new assignments. No phase closure from stale instructions.

## Planning changes

Publish purpose, decision, affected capabilities/contracts, dependency changes, evidence and adoption instructions. Distinguish adopted requirements from pending product choices and unverified technical hypotheses. Material scope changes return to the owner; a generic “optimize” request cannot silently remove research, generation, connections or recovery.

Documentation changes may be committed with documentation/skill validation and pnpm check, without invented behavioral red proofs. Keep a planning log in this document when another coordinator owns integration progress. Executable harness changes still need assigned entries and test-first evidence.

## Handoff across sessions and tools

Use the shared repository and assignment packet; do not depend on Claude private memory, Codex chat history or plugins being installed. Include a unique session/thread label (not only `/root`), plan revision, phase, capability/entry, exact SHAs, owned paths, checks and next action. Messaging another user-owned chat requires explicit authorization; a document assignment does not create that permission. The owner explicitly authorized the named coordinator on 2026-10-05 to spawn and assign subagents for independent parallel work within the accepted scope, as COORDINATION defines. Workers may not recursively expand that delegation. This does not grant permission to message unrelated user-owned chats. On 2026-10-06 the owner authorized the technical lead and the named coordinator to message each other directly (Claude cross-session messages) to resolve the coordinator's questions and blockers; rulings exchanged that way are recorded in a committed decision document before the coordinator relies on them.

On context compaction/resume, refresh main's plan revision and the live ACTIVE record before changing files. A lost session does not release ownership automatically. Keep browser gates serialized under the current configuration. Native multi-agent features or a Claude-to-Codex bridge are optional transports; they do not replace ownership, proof or independent review.

## Planning log

- 2026-10-05: owner adopted app-first phased delivery and appointed a planning/method technical lead. Prepared revision `2026-10-05-app-first-1` on a docs-only branch from main. P2 expanded into explicit complete simulated-app acceptance; full second-brain capabilities preserved; the heavier backend-v2 recommendation superseded. Implementation remains with its existing coordinator, with no feature/proof changes from this update. Local main integration is authorized; no push is authorized.

- 2026-10-05: owner requested architectural concerns be adopted throughout planning. Revision `2026-10-05-contracts-2` adds stable app/service and runner/semantic contracts, shared pure rules, browser-independent admitted work, bounded P2 premise probes and a dispatch-ready queue. P3 now explicitly builds the reusable deterministic execution spine; P4 adds semantics. No product-code/proof edits or phase closure; existing coordinator/evaluation reservations preserved.

- 2026-10-05: owner authorized a private GitHub backup of accepted main only, while all development remains local. BACKUP.md is the narrow exception to historical no-push rules; feature branches, deployment and production remain outside this authorization.

- 2026-10-05: owner authorized coordinator-managed parallel work. One active entry applies per worker, not project-wide; isolated ownership, accepted dependencies, independent review and serialized integration/browser gates remain. This method-only update preserves contracts-2 product requirements, current reservations and phase boundaries.

- 2026-10-05: owner authorized unattended completion of P2, conditional acceptance and progression into P3, plus periodic private main backups. The conditions above supersede historical wait-for-owner wording without waiving evidence or authorizing P4.

- 2026-10-06: owner appointed the Claude Code session `Planificador` as technical lead and planner of the whole project, replacing the Codex lead (Codex usage is unavailable until 2026-10-12). Same authority as above: planning, method, contracts and technical rulings on main; no implementation, integration or proof closure. Owner authorized direct lead–coordinator messaging. First decisions: [TL-P2-06](2026-10-06-tl-p2-06-decision.md), [TL-P2-07](2026-10-06-tl-p2-07-decision.md), [TL-P2-08](2026-10-06-tl-p2-08-decision.md), [TL-P2-09](2026-10-06-tl-p2-09-decision.md), [TL-P2-10](2026-10-06-tl-p2-10-decision.md), [TL-P2-11](2026-10-06-tl-p2-11-decision.md), [TL-P2-12](2026-10-06-tl-p2-12-decision.md), [TL-P2-13](2026-10-06-tl-p2-13-decision.md), [TL-P2-14](2026-10-06-tl-p2-14-decision.md), [TL-P2-15](2026-10-06-tl-p2-15-decision.md), [TL-P2-16](2026-10-06-tl-p2-16-decision.md), [TL-P2-17](2026-10-06-tl-p2-17-decision.md), [TL-P2-18](2026-10-06-tl-p2-18-decision.md), [TL-P2-19](2026-10-06-tl-p2-19-decision.md), [TL-P2-20](2026-10-06-tl-p2-20-note-edit-contract.md), [TL-P2-21](2026-10-06-tl-p2-21-decision.md), [TL-P2-22](2026-10-06-tl-p2-22-decision.md), [TL-P2-23](2026-10-06-tl-p2-23-decision.md), [TL-P2-24](2026-10-06-tl-p2-24-decision.md), [TL-P2-25](2026-10-06-tl-p2-25-decision.md), [TL-P2-26](2026-10-06-tl-p2-26-decision.md), [TL-P2-27](2026-10-06-tl-p2-27-decision.md), [TL-P2-28](2026-10-06-tl-p2-28-decision.md), [TL-P2-29](2026-10-06-tl-p2-29-decision.md), [TL-P2-30](2026-10-06-tl-p2-30-decision.md), [TL-P2-31](2026-10-06-tl-p2-31-decision.md), [TL-P2-32](2026-10-06-tl-p2-32-decision.md), [TL-P2-33](2026-10-06-tl-p2-33-decision.md), [TL-P2-34](2026-10-06-tl-p2-34-decision.md), [TL-P2-35](2026-10-06-tl-p2-35-decision.md), [TL-P2-36](2026-10-06-tl-p2-36-decision.md), [TL-P2-37](2026-10-06-tl-p2-37-decision.md), [TL-P2-38](2026-10-06-tl-p2-38-fast-close.md), [TL-P2-39](2026-10-06-tl-p2-39-main-and-staging.md) and [TL-P2-40](2026-10-06-tl-p2-40-capability-journeys.md). Contracts-2 stays the adopted revision.
- 2026-10-06: owner ruled R1 (keep the modifiedTime check, accept the rare residual race), offline reading (none in app; local Drive sync) and uploads in progress (kept across a reload), and adopted reuse of the original app's working features and of existing solutions. Recorded in the WORK_PLAN decision register and TL-P2-06.
- 2026-10-06: owner ruled one active session per person with WhatsApp-style takeover, narrowing C14 to takeover plus outside changes. Recorded in TL-P2-13, P2_ACCEPTANCE and the decision register.
- 2026-10-06: owner decided P3 runs tidy-ups on GitHub Actions with the existing Claude subscription, free tiers only, and authorized replacing the original production app with the new one at the end of P4. The replacement reuses the existing Cloudflare, Google and GitHub setup; P3 deploys to a separate staging environment first. This narrows the earlier rule against overwriting production to that planned cutover. Recorded in [P3_DRAFT](../P3_DRAFT.md).
- 2026-10-06: owner rule: for complex or rare problems, take the simplest proven approach (how successful apps and repositories do it), limit or reload rather than perfect. First application: reload on a back-forward cache restore (TL-P2-28).
- 2026-10-06: owner rule: always research first. Before any design or ruling, search the web for the usual solution, recommended practice and standards, follow them and cite sources. Recorded in AGENTS, WORK_PLAN, and the technical-lead and coordinator briefs.
- 2026-10-06: owner approved a fast P2 close and asked for fewer parallel subagents. TL-P2-38 narrows the P2 exit, moves real-service and real-model evidence to P3/P4, cuts the remaining legacy entries to two, batches full e2e and caps workers at two.
- 2026-10-06: owner asked for main and GitHub updates after every green batch, and a staging deployment to try the app. TL-P2-39: green batches go to main and are pushed; the lead deploys a static demo/fake preview of main to Cloudflare Pages (no Worker, no secrets), separate from production.
- 2026-10-06: owner ruled a token budget (TL-P2-41): read by role, small live records, one-page packets, cheapest capable model, fewer reviews, logs to files, short messages and sessions. Decisions are indexed in [DECISIONS](DECISIONS.md).
- 2026-10-06: owner asked for per-task token measurement and a cheap-first model ladder. TL-P2-42 adds a token ledger, a pre-analysed starting model per packet, and escalation Haiku → Sonnet → Opus.
