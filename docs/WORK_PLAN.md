# Work plan for the app first rebuild

Current owner authorization: autonomous P2 completion, conditional P2 acceptance and continuation into P3, with periodic private main backups, follows [GOVERNANCE](harness/GOVERNANCE.md#owner-authorization-for-unattended-continuation-2026-10-05). It supersedes older wait-for-owner wording below; all objective gates remain required. P4 is not authorized.

Revision: `2026-10-05-contracts-2`. Adopted by the owner's 2026-10-05 request to make the planning permanent on local main. [PRODUCT.md](PRODUCT.md) defines the purpose; [P2_ACCEPTANCE.md](P2_ACCEPTANCE.md) defines what P2 must prove. This plan supersedes conflicting guidance in historical plans and the backend v2 proposal. It does not mark implementation complete.

## Delivery contract

Develop and accept one phase at a time. P1 establishes the UI. P2 completes and optimizes the app with a realistic simulated backend. P3 replaces the backend boundary with real services. P4 adds the real second-brain reasoning/execution. Do not start implementation of the next phase while the current phase has unresolved acceptance work. Planning a later interface and bounded P2 risk-retirement probes are allowed when needed to make the current fake honest. Those experiments are not P3 implementation: no production service, deployment or model dependency is introduced. The target boundaries and evidence are in [ARCHITECTURE](ARCHITECTURE.md); the dispatch-ready queue is [ORCHESTRATOR_START](harness/ORCHESTRATOR_START.md).

The existing P2 closure batch can finish its reserved atomic entry. Before the next assignment or any closure declaration, the integration coordinator must adopt this planning revision and reconcile its backlog with the capability matrix. Existing fixes and proofs remain useful; a historical 201/201 count would not alone meet the expanded explicit acceptance contract.

## Phase 1 UI baseline

Preserve the accepted screens, navigation, brand, responsive behavior and reusable components. P2 may specify a minimal missing interaction needed by a supported capability, using the same design system. It may not reopen visual design broadly under a backend optimization task.

## Phase 2 ordered work packages

| Order | Package | Output | Prerequisite and acceptance |
| --- | --- | --- | --- |
| P2-A | Finish reserved fixes and reconcile evidence | Current committed baseline; exact feature/proof counts and active reservations | Finish only the assigned work; no takeover of dirty files. |
| P2-B | Capability and gap audit | C01–C16 mapped to existing behavior, tests, missing interactions and entries | Current immutable SHA; distinguish demonstrated, partial and missing. |
| P2-C | Resolve foundation defects | Upload readiness/retry, protected sections, refresh and status ordering | Reproduce each on current SHA; one defect and named assertion proof per entry. |
| P2-R | Retire integration premises (R1–R4 below) | Bounded observed evidence, limitations and selected remedies | After P2-B; before accepting contracts that depend on the premise. No P3 product implementation. |
| P2-D | Specify app/service and runner/semantic contracts | Versioned input, operation, report, research, generated-document and undo fixtures; compatibility/fault suites | P2-B and relevant P2-R results; stable, extensible contracts, not an imagined final API. No paid model dependency. |
| P2-E | Complete vertical journeys on fake/demo | Start with admission → persisted effect/report → reopen/retry; then all capability rows | P2-D; browser-independent admitted work, duplicate/lost response and stale status covered; minimal UI extensions specified first. |
| P2-F | Incremental preparation and context selection | Background extraction where appropriate, reusable artifacts, ready-input package, retrieval/fallback and clear policies | Safe primitives from P2-C; pure functions shared by compatible runtimes. |
| P2-G | Capability and efficiency corpus | Measured app preparation and complete synthetic journeys; no semantic-quality shortcuts | P2-E/F; independent expected results and explicit benchmark conditions. |
| P2-H | Freeze, review, evaluate and close | One acceptance dossier and recorded conditional owner acceptance | All exit conditions in P2_ACCEPTANCE; repeat affected checks after fixes. |

Packages define dependency order, not large implementation tickets. Coordinator splits each into small entries with owned paths, exact steps, unchanged verify commands and actual test names. New module stubs precede a failing assertion where required by the existing harness. Do not register fictional test commands as if coverage already exists. No passes/proofs are changed by this planning update.

The gap audit must include generation/revision of documents, queries over existing items, cross-project connections, contradictions, web enrichment, recovery and undo. A pretty scripted replay without corresponding persisted data is a failure. Explicit user intent should reduce work without requiring technical forms or prompt expertise.

## P2 bounded integration probes

These are explicit P2 architecture-risk work, not the beginning of P3. Coordinator assigns one hypothesis and synthetic resource boundary per probe, verifies service access is authorized and records exact date/environment, source references, method, observations and resulting contract change. No personal content, production deployment, broad credential acquisition or paid model calls. Research official provider documentation when designing the probe, then observe behavior where the contract depends on it. Documentation alone cannot certify the runtime.

| Risk | Small experiment | Required decision / stop condition |
| --- | --- | --- |
| R1: Drive write preconditions | Two synthetic clients interleave read/update, move/rename and a lost response; inspect supported conditional behavior | Choose a demonstrably safe conflict strategy; do not label read-before-write atomic. Unresolved data-loss race blocks dependent contracts. |
| R2: identity and external inputs | Synthetic OAuth/token/folder flow and appProperties visibility; externally added item discovery and permission revocation | Confirm identity/scopes and extraction fallback assumptions; record browser/session constraints. No new product OAuth backend. |
| R3: admission and executor behavior | A disposable no-model executor probe, if access is authorized, measures dispatch/startup and observes duplicate/lost dispatch/callback behavior; otherwise record the missing evidence | Select durable dispatch/attempt/recovery design and limits. No success inferred from an accepted dispatch response; no executor migration without measured need. |
| R4: upload/readiness and recovery | Synthetic partial/resumable upload, lost response and reopened client; contrast local retained-byte and reselect policies | Separate platform facts from the owner's reload policy; define ready-set capture and recovery without silently losing members. |

Bound each experiment to its hypothesis and stop once the decision is supported. Keep only reproducible synthetic fixtures/evidence and remove disposable resources through the authorized cleanup. Probe failure becomes a design constraint, not a reason to extend a research project indefinitely. Any further backend implementation waits for P2 acceptance. Missing access blocks that probe and dependent acceptance, not unrelated P2 work.

## Phase 3 minimal real backend

Entry condition: complete accepted P2 dossier and recorded conditional owner acceptance under GOVERNANCE. Keep the P2 app behavior stable while changing the service adapters.

1. Repeat and broaden P2-R evidence against the actual deployed adapter on synthetic data: OAuth/scopes, folder recovery, pagination, resumable upload/reload, changed versions, name/parent conflicts and responses lost after effects. Resolve unproven concurrency guarantees before relying on them.
2. Implement the small Worker control plane: sessions/encrypted credentials, folder pointer, limits, durable single-active-run admission, dispatch, authenticated callbacks, ordered state, expiration and truthful errors. Select the smallest storage/coordination primitive that passes concurrency/recovery tests. Durable Objects are an option for run control, not an approved expansion into a universal write proxy.
3. Build the smallest production deterministic execution spine needed for durable admission, authenticated attempts, operation checkpoints, report persistence and recovery. Connect it to a scripted semantic-provider double and synthetic real Drive data. Run the shared behavioral suites against the real adapters, including browser close, revoked auth, duplicate dispatch, expired attempts, lost callbacks and recovery. Reuse this spine in P4; do not build a disposable second mutation engine. Prove the accepted app needs no screen/domain rewrite.
4. Document setup, secret handling, deletion and recovery. Run independent review/evaluation and the same acceptance flow before phase closure.

The app continues direct authorized Drive operations; the Worker retains credentials and operational metadata, not a content database. Any broader backend role is an explicit architecture change requiring rationale and a measured benefit. P3 does not implement real model reasoning early to hide incomplete P2 flows.

## Phase 4 bounded complete second brain

Entry condition: accepted P3. Implement the runner in slices that preserve C04–C13, not only filing.

1. Consume and validate the P2 preparation contract; supply deterministic fallbacks for external/unprepared inputs. Retrieve only needed content and record provenance/version boundaries.
2. Reuse P3 production execution mechanics and extend them only for newly specified semantic operations: preservation, idempotency, conflict detection, manifests, reports and recovery. Prove each extension with scripted proposals before adding model uncertainty. Keep the same semantic-provider interface and compatibility fixtures.
3. Add semantic incorporation and knowledge updates with structured operations. Then validate connections, contradictions and question/rule handling against the capability corpus.
4. Add rich document creation/revision and queries over stored information. Context can expand through bounded requests. Necessary authored output is not arbitrarily truncated to hit a token target.
5. Add permission-aware web research and integration with citations, reuse/freshness rules and unavailable-evidence outcomes. It is a release capability, not an automatic indefinite deferral.
6. Validate real undo, multi-device interactions and crash recovery. Compare complete outcomes, latency and tokens against the original benchmark on equivalent synthetic tasks.
7. Close with independent semantic quality review and app evaluation against real services, operational evidence and owner acceptance.

One/two calls can be a target for ordinary ingestion. Task budgets adapt to required work; requests that exceed them surface an honest continuation/partial state. Do not drop a requested analysis, source or contradiction silently to make a run fast. Keep the existing button-triggered user flow unless the owner adopts scheduling separately.

## Decision register

| Decision | Status | Rule for continuing |
| --- | --- | --- |
| App-first phases and a complete simulated P2 | Adopted by owner | This plan and capability matrix govern closure. |
| Preserve full second-brain capabilities while reducing redundant model work | Adopted by owner | Quality parity precedes efficiency claims. |
| Minimal Worker; app direct mechanics; deterministic runner | Adopted direction | Centralized all-write backend from v2 is superseded. |
| Technical lead owns planning/method only for now | Adopted by owner | Do not implement product fixes or seize the active coordinator role. |
| Local documentation integration into main | Authorized by owner | Merge only planning/method files; product-code closure remains separate. |
| Offline reading | Pending specific product ruling | Scope must be explicit before P2 closure; shell caching is not note reading. |
| Upload persistence across reload | Pending specific product ruling | Recommend recovery where feasible; same-session safety/retry is mandatory regardless. |
| Real Drive atomic conflict behavior | Unverified contract-threatening premise | P2-R investigates before dependent contract acceptance; P3 validates the real implementation. Fake simulations cannot certify provider semantics. |
| Stable app/service and runner/semantic boundaries | Adopted in contracts-2 | Shared behavioral/compatibility suites; explicit migration for breaking changes. |
| Durable execution independent of the browser | Adopted in contracts-2 | Simulate in P2, implement/prove deterministic spine in P3, reuse in P4. |
| Specific model, latency/token budget, executor changes | Unmeasured | Decide using the shared quality/performance corpus; no arbitrary universal caps. |
| Extra export formats, mail/connectors or scheduled processing | Not automatically in core scope | Separate requirements and owner scope decisions. |

The general approval of this plan does not stand in for the unresolved specific choices. The lead prepares a concrete recommendation; only the owner can remove a product requirement or accept a scope deferral.

## Implementation packet and completion dossier

Every packet names affected boundary/contract version, compatibility evidence and failure/recovery scenario, planning revision, phase, capability IDs, entry ID, immutable base/target, integration/worker paths, file ownership, dependencies, acceptance scenario, real verify, required checks, available skills/tools and evidence destination. Context expansion and exceptions belong in the repository, not only in private agent chats.

The closing dossier records exact SHA, capability-to-test mapping, gate logs, intentional skips, reviewer/evaluator targets, remaining product limitations and the owner's ruling. Separate tested simulated behavior from real-service evidence. A phase does not close because a session ran out of context or because every previously registered entry is green.

## Technical leadership and implementation authority

See [GOVERNANCE.md](harness/GOVERNANCE.md). The lead maintains purpose, phase boundaries, tradeoffs, planning and the Harness; the batch coordinator owns live assignments, code integration and proof closure. Planning changes land independently on main and are adopted at a safe checkpoint. No session rewrites another session's dirty checkout to synchronize instructions.
