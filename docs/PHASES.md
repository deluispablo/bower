# The phases of the Bower app rebuild

Current planning revision: `2026-10-05-contracts-2`. Read [PRODUCT.md](PRODUCT.md), [WORK_PLAN.md](WORK_PLAN.md) and [P2_ACCEPTANCE.md](P2_ACCEPTANCE.md) for the adopted purpose, sequence and closure contract. [METHOD.md](harness/METHOD.md) governs execution. Phase state and evidence must always name a committed target; main receiving planning is not a phase-completion event.

## Why a rebuild

Bower is a complete web second brain in the person's own Google Drive: understand incoming material, create and update documents, connect knowledge, detect contradictions, answer requests and enrich with permitted web research. The original system's tidy-ups are too slow. Reduce repeated preparation, unnecessary reads, mechanical model work and redundant output while preserving those capabilities. Use the original project for behavior and synthetic benchmark references, never copied implementation or private data.

The owner requires phase-by-phase development: a finished UI, then a fully functional app on a simulated backend, then real backend services, then real reasoning. No next-phase implementation until the current phase is accepted. Planning interfaces and bounded P2 integration-premise probes are allowed; they do not begin P3 implementation. Declaring simulated model quality or unobserved provider guarantees is not. See [ARCHITECTURE](ARCHITECTURE.md).

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1 | Prepared UI and demo design baseline | Built and accepted baseline |
| 2 | Complete, optimized app using realistic simulated backend behavior | In progress; original logic built, closure plus capability audit/acceptance remain |
| 3 | Minimal real Worker and service integration | Not started; current app-side contract exists and will evolve through assigned entries |
| 4 | Bounded runner and full second-brain reasoning/research | Not started; capability direction adopted, implementation gated by P3 |

## Phase 1: UI baseline

The original [UI spec](specs/2026-10-04-app-ui-design.md) defines the design, shell, screens, bird, accessibility and demo. Preserve that work. A P2 capability gap may require a narrowly specified interaction within the same design system; it is not permission for an unrelated redesign.

## Phase 2: complete app over simulated services

Implementation evidence at the adoption checkpoint: 201/205 historical entries pass; four qa-12 findings open, final review at 4d98eb0 with two Important and one Minor, incomplete evaluation. Preserve docs/harness/2026-10-05-phase-2-final-round.md and live ACTIVE for actual evidence; the resumed coordinator audits complete acceptance rather than treating counts as closure.

Production app logic runs through Sources over fake Drive/Worker. Demo remains a behavior illustration, not an override of accepted requirements. Finish current fixes, audit the entire [capability matrix](P2_ACCEPTANCE.md), define missing contracts, complete simulated journeys, optimize preparation and close with independent evidence.

The deliverable includes document generation/revision results, connections, contradictions, requests over existing notes, simulated research, rules/questions, reports, recovery and supported undo. Scripted semantic responses must create real fake-file effects. The app prepares work incrementally and supports more-context/fallback cases without needing a real model.

Exit: all capability obligations covered, all P2 entries validly closed, zero known unresolved defects, full check/demo/fake/production-PWA gates on one SHA, independent code review and phone/desktop evaluation, documented product rulings and owner acceptance. Historical feature counts are not the acceptance contract. P2-R must resolve assumptions that threaten the accepted contract. Full real integration and semantic quality remain P3/P4 evidence obligations.

The [original phase-2 recipe](superpowers/plans/2026-10-04-phase-2-app-logic.md) and [ledger](superpowers/plans/2026-10-04-phase-2-ledger.md) preserve history. Their old checklist/counts, tool requirements and deferrals do not override WORK_PLAN.

## Phase 3: minimal real backend

Replace simulated service boundaries with a small Worker and real Drive integration while preserving the accepted app. Own sign-in, encrypted credentials, folder pointer, run admission/limits, dispatch, authenticated runner access and ordered status. Test concurrency/recovery and actual Drive behavior using synthetic data. The app retains direct Drive mechanics; no default central content/write service.

A production deterministic execution spine with a scripted semantic-provider double proves the backend path before Claude is introduced. It persists admission, applies/reconciles operations and recovers without the originating browser. P4 reuses it instead of building a second mutation engine. Pick storage/coordination based on invariants, not a predetermined list of services. Close only after real-service gates, independent review/evaluation and owner acceptance. Offline/read-reload policy needs an actual owner ruling; do not silently move a P2 defect into this phase.

## Phase 4: runner and complete second brain

Runner scripts validate prepared input, fill extraction gaps, retrieve bounded relevant context, execute controlled research, validate/apply semantic operations and maintain derived artifacts/reports/manifests. Claude understands, connects, synthesizes and authors necessary content. It can request additional context within a task budget; generated documents may require substantial prose.

Prove all semantic capabilities in PRODUCT and the shared corpus, including research and creation, not just fast filing. Compare original/new quality and latency components. Source notes remain immutable, user content protected, compiled knowledge traceable and operations recoverable. Phase closure requires actual model/service evidence, independent review/evaluation and owner acceptance.

## Ownership and portability

The app never writes `index.md`, `hot.md`, `log.md` or Bower-owned note sections under the current contract. New preparation caches use separately versioned artifacts. A proposed broader editing capability needs its own ownership contract. Drive is the durable knowledge store; no personal content belongs in source repositories. Development stays local; the owner-authorized private main backup follows harness/BACKUP.md. It neither deploys the app nor accepts a phase.
