# Phase 2 capability and acceptance contract

Current owner authorization: autonomous P2 completion, conditional P2 acceptance and continuation into P3, with periodic private main backups, follows [GOVERNANCE](harness/GOVERNANCE.md#owner-authorization-for-unattended-continuation-2026-10-05). It supersedes older wait-for-owner wording below; all objective gates remain required. P4 is not authorized.

Revision: `2026-10-05-contracts-2`. Phase 2 delivers the complete app over simulated backend behavior. Its fake stack uses production app data logic and realistic persistence/failure contracts; the demo illustrates the experience. P3 supplies real backend services, and P4 supplies real semantic reasoning and research. A scripted result proves the app can carry and present a capability, not that a model can perform it well.

## Capability matrix

Every row is a P2 acceptance obligation unless the owner explicitly narrows it in the decision register. “Planned” is not “passed.” Implementation coordinator maps rows to actual code, harness entries, named tests and frozen evaluation evidence. Existing green features may satisfy parts of a row; reuse valid evidence after checking interactions.

| ID | User capability | What must work by P2 exit | Real-service proof later |
| --- | --- | --- | --- |
| C01 | Sign in, create/recover folder, sign out, leave | Fake lifecycle and account isolation, recoverable errors, local cleanup, truthful states | P3 Google/session/revocation and actual Drive folder lifecycle |
| C02 | Add files, links and notes as piles | Bytes and context retained, readiness explicit, retries for missing items, no lost incomplete pile; reload behavior matches the adopted policy | P3 resumable protocol and real persistence |
| C03 | Browse, search, move, rename, edit supported fields/tasks and Bin/restore | Same real app logic over fake Drive; protected sections preserved; errors/recovery; no extension/name inconsistencies | P3 permissions/version/concurrency behavior |
| C04 | Incorporate new knowledge | Scripted backend creates source/compiled notes from a synthetic input; UI reads and links the actual resulting data | P4 comprehension and factual quality |
| C05 | Update existing knowledge | Scripted updates preserve user text and history, mark what changed, reveal conflicts and remain idempotent | P4 semantic merging and conflict interpretation |
| C06 | Connect information | Related notes, citations and cross-project links arise from persisted scripted results and are navigable | P4 meaningful retrieval/relationship discovery |
| C07 | Detect disagreement | Conflicting synthetic sources produce an explicit contradiction with both sources and a follow-up path | P4 detection accuracy and appropriate uncertainty |
| C08 | Generate/revise documents | Free-form request produces a persisted Markdown answer/report/comparison, including a longer result, tables and sources; revision targets the permitted generated content | P4 useful authored content and grounded revisions |
| C09 | Ask about stored material | Request targets an existing item/project with no new inbox file; answers link back to actual sources | P4 retrieval and answer quality |
| C10 | Enrich from the web | Setting/intent respected; simulated allowed, denied, failed and stale-evidence cases; result has URLs/provenance and honest missing information | P4 real lookup/fetch, citation accuracy and tool boundaries |
| C11 | Preferences, rules, requests and questions | Immediate pending state, scripted application, answer lifecycle, retained wording and no policy changes from source-document instructions | P4 correct interpretation and useful suggestions |
| C12 | Tidy-up lifecycle | Captured ready inputs; later arrivals wait; coherent ordered phases, truthful partial/failure result, persisted report, replay and return after reload | P3 real dispatch/status; P4 actual application and completion barrier |
| C13 | Undo supported tidy-up effects | App-side contract, preview/conflict behavior and scripted manifest reversal; later edits protected; partial recovery visible | P4 real manifest/application reversal |
| C14 | Multi-device changes and recovery | Two fake clients, refresh/invalidation, overlap, stale replies, malformed backend files and journal recovery | P3 external Drive behavior; P4 runner concurrency |
| C15 | Efficient preparation without blocking the person | Ready-input/context package, cached extraction metadata, bounded initial candidates, more-context request, fallback for unprepared inputs; app stays responsive | P3 actual transport; P4 model/extractor cost and quality |
| C16 | Full product usability | Phone/desktop, keyboard, accessibility, all relevant scenarios, production PWA shell, no unexplained console failures or placeholder actions | P3/P4 same journeys against real services |

The established UI is the design baseline. Reuse its navigation, components and language. If a missing interaction is necessary for a matrix row, specify the smallest consistent extension before coding. “UI closed in P1” does not authorize a dead button or silently dropping a capability.

## End-to-end synthetic journeys

Use made-up data, stable IDs and independent expected outcomes. Complete each relevant journey on fake first and confirm equivalent demo behavior. Never insert a report fixture that says an operation succeeded while the underlying fake files stayed unchanged.

1. Add two files and a note; fail one upload; start from another client; the failed member stays visible/retryable and is not consumed. Retry it and complete exactly once.
2. Add a new source about an existing project; scripted backend updates Current state, appends history, links the source and preserves all user-owned bytes.
3. Ask for a comparison of already filed items; a generated document contains a table, its provenance and navigable links. Ask for a revision and see the persisted change.
4. Add evidence that contradicts an existing note in another project; the scripted result exposes both sources and a concrete question. Answer it and verify the next run consumes the answer once.
5. Request enrichment with web off, then on; a scripted provider returns evidence, fails or has no answer. The app never claims research occurred when denied or unavailable.
6. Start a run, add a later pile, refresh/reopen and deliver status replies out of order. The captured set and status remain correct; the later pile waits.
7. Lose a response after a mutation, then fail report persistence. Retry/recover without duplicate logical effects or premature “done.”
8. Preview and undo a scripted run; repeat with a subsequent user edit and a failure mid-undo. Conflicts and remaining recovery are visible, with no forced overwrite.
9. Reload/sign out/switch account during pending work. The adopted persistence policy is honored and no operation reaches another account/folder.
10. Use phone and keyboard-only desktop for request, result, failure, retry and recovery; no focus loss or inaccessible action.

## Preparation contract to design and test in P2

A versioned package identifies selected ready items, base versions/hashes, extraction references/version, user instruction events, applicable rules, initial context candidates and remaining semantic tasks. Add task class and measured context size/budget metadata, without exposing implementation details in ordinary product copy.

The simulated runner revalidates stale packages, requests more context and handles absent preparation. Persist per-item reusable artifacts without simultaneous devices overwriting a shared mutable cache. Test externally added inputs that have no app-side preparation. Put IDs/provenance in deterministic structures; do not fill missing meaning with heuristics and call it understanding.

The output contract must support generated document content, owned-section changes, links, contradictions, questions, web provenance, insufficient-context responses and partial outcomes. Keep actual schema evolution behind a serialized assignment, version fixtures, and preserve current readers until migration is tested. No new wire field in this planning document is implemented merely by being named.

## Quality and efficiency evidence

Create a capability corpus from the original synthetic benchmark, extended to the journeys above. In P2, check preparation relevance, cache reuse, bounded reads, output expressiveness, file effects, UI responsiveness and failure recovery with scripted semantic results. In P4, run the same semantic questions against Claude and compare content quality as well as latency/tokens. Never use fake-model time as a production speed benchmark.

Capture the baseline before optimizing each slice. Separate admission/dispatch/startup, preparation, retrieval, model/tool, apply/report and retry time where the phase can actually observe them. Record cold/warm preparation time, context bytes (tokens when the actual tokenizer/provider is available), candidate count, extraction reuse, remote-read count and operation count. Define device/file-size assumptions before setting responsive-time targets. Do not declare “optimized” from a smaller prompt alone or adopt arbitrary one-call/output limits that break generation/research.

## Boundary and integration-risk acceptance

Apply [ARCHITECTURE](ARCHITECTURE.md) and WORK_PLAN P2-R. P2 freezes a stable baseline contract with compatible evolution, not a final API for all future features. Tests exercise fake service substitution through the production app boundary without screen/domain rewrites. Runner proposals have a separate validated semantic contract; malformed/unknown operations produce no silent partial application.

Cover accepted-but-not-dispatched work, duplicate request/dispatch, lost response after an effect, stale attempt/status, closed originating browser, unavailable credentials and report-save failure. Persist actual fake effects and recover from another client. Model the simulated service lifecycle independently from the client under test (controlled scheduler and shared fake persistence); closing one client must not destroy the simulated accepted work. This is contract evidence, not a claim that browser-local demo code executes while every browser is closed. Version old/new durable fixtures and prove compatibility or a specified migration. Conceptual lifecycle/error cases must be mapped onto tested schemas; this document does not add wire enums.

Observe contract-threatening real provider/executor assumptions through the bounded P2-R probes before accepting dependent contracts. Record exact limitations and remedies. These probes do not certify a production backend and do not replace P3 integration. A blocked high-impact premise is a blocked acceptance item, never an implicit deferral.

## P2 exit checklist

- All C01–C16 rows have an explicit supported scope, named automated regressions, outcome evidence and applicable user evaluation. No untracked gap behind a green historical feature count.
- All registered P2 entries pass with valid proofs; all reproduced findings are resolved or formally disproved. No known Critical, Important or Minor defect remains open. A scope removal requires an explicit owner decision; it is not a way to relabel a defect as passed.
- The four independent-review concerns are triaged on the current target: incomplete-pile loss, protected-section parsing, external-change refresh and stale run responses. Preserve their reproduction evidence.
- `pnpm check`, full `pnpm e2e`, full `pnpm e2e:fake` and `pnpm e2e:pwa` pass on the same frozen implementation SHA. Explain each skip; no skipped required journey counts as coverage.
- Independent reviewer and evaluator certify their stated scope on that SHA. Phone/desktop and console/error paths are covered; later relevant changes invalidate the affected evidence.
- Offline reading, reload durability and other unresolved product policies have actual owner rulings and matching behavior. A PWA shell is not offline notes; fake data is not evidence of real-service behavior.
- Shared boundary/fault/compatibility suites pass for implemented P2 adapters; R1–R4 results resolve contract-threatening assumptions, with no unsupported data-safety guarantee. Admitted work survives the originating client in the simulation.
- Specs, schemas, handoff and fixtures match the accepted app. The coordinator records the complete evidence summary and applies the owner’s conditional acceptance under GOVERNANCE; no additional owner reply is required.

“Without failures” means no known unresolved defects within the accepted scope, completed gates and independent evaluation. It is not a mathematical claim that unseen defects cannot exist. If a relevant defect appears after closure, stop dependent phase work, repair the foundation and revalidate before continuing.
