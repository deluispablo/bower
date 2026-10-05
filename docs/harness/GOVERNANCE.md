# Technical leadership and planning authority

Owner instruction dated 2026-10-05 appoints this Codex planning session as technical lead, currently limited to improving planning and the work method. This is a durable role assignment, not permission to implement product features, take another session's checkout or close a phase.

## Responsibilities

| Role | Authority | Does not own by default |
| --- | --- | --- |
| Owner | Product purpose, scope tradeoffs, unresolved rulings, phase acceptance | Routine implementation choices inside an accepted assignment |
| Technical lead | PRODUCT, WORK_PLAN, P2_ACCEPTANCE, phase definitions, architecture boundaries, Harness/skills and planning decisions; docs-only integration to local main | Product implementation, current batch reservations, feature passes/proofs, approval of its own implementation |
| Integration coordinator | Live ACTIVE record, assignments, implementation branch integration, feature registration/proofs/progress and truthful phase evidence | Silently narrowing capabilities or advancing phases without acceptance |
| Implementer | One assigned entry in an owned checkout | Shared plan/proof edits or unrelated file reservations |
| Reviewer/evaluator | Independent findings on a fixed target | Source changes, backlog closure or unassigned delegation |

Technical lead and coordinator can both be Codex or Claude in future assignments, but their session identities and authority must be explicit. The current owner appointment does not rename or replace the ongoing implementation coordinator. A lead can review planning, but independent behavioral acceptance remains a separate role.

## Sources of authority

1. Current explicit owner instruction.
2. Adopted PRODUCT, WORK_PLAN, P2_ACCEPTANCE and planning revision on local main.
3. Accepted phase-specific specs/contracts and actual implementation assignment.
4. Live integration ACTIVE record for who may touch which files/resources.
5. Historical ledgers/proposals and tool-private memory as context only.

There are two different facts: main carries adopted planning; an integration branch may carry newer implementation/proofs. Neither branch's completion counts overwrite the other's history. A documentation merge is not evidence that code was integrated or a phase closed.

At startup compare the checkout's `docs/harness/PLAN_REVISION` with `git show main:docs/harness/PLAN_REVISION` when available. Read changed planning docs from main if the checkout is behind. A reviewer names both code SHA and planning revision. A worker does not merge/rebase dirty work itself. The coordinator finishes/preserves an already reserved atomic task, reaches a safe clean checkpoint, integrates the planning update, reconciles capabilities/backlog and then issues new assignments. No phase closure from stale instructions.

## Planning changes

Publish purpose, decision, affected capabilities/contracts, dependency changes, evidence and adoption instructions. Distinguish adopted requirements from pending product choices and unverified technical hypotheses. Material scope changes return to the owner; a generic “optimize” request cannot silently remove research, generation, connections or recovery.

Documentation changes may be committed with documentation/skill validation and pnpm check, without invented behavioral red proofs. Keep a planning log in this document when another coordinator owns integration progress. Executable harness changes still need assigned entries and test-first evidence.

## Handoff across sessions and tools

Use the shared repository and assignment packet; do not depend on Claude private memory, Codex chat history or plugins being installed. Include a unique session/thread label (not only `/root`), plan revision, phase, capability/entry, exact SHAs, owned paths, checks and next action. Messaging another user-owned chat requires explicit authorization; a document assignment does not create that permission. Subagents require explicit delegation from the owner or current authorized assignment, and may not recursively expand it.

On context compaction/resume, refresh main's plan revision and the live ACTIVE record before changing files. A lost session does not release ownership automatically. Keep browser gates serialized under the current configuration. Native multi-agent features or a Claude-to-Codex bridge are optional transports; they do not replace ownership, proof or independent review.

## Planning log

- 2026-10-05: owner adopted app-first phased delivery and appointed a planning/method technical lead. Prepared revision `2026-10-05-app-first-1` on a docs-only branch from main. P2 expanded into explicit complete simulated-app acceptance; full second-brain capabilities preserved; the heavier backend-v2 recommendation superseded. Implementation remains with its existing coordinator, with no feature/proof changes from this update. Local main integration is authorized; no push is authorized.
