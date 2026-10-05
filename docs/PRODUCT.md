# Product purpose and architecture boundaries

Adopted direction: 2026-10-05. Planning revision: `2026-10-05-app-first-1`. The owner's latest clarification governs this document. Delivery order is in [WORK_PLAN.md](WORK_PLAN.md); capability acceptance is in [P2_ACCEPTANCE.md](P2_ACCEPTANCE.md). This is a requirement, not a claim that every capability is implemented.

## Purpose

Bower is a web second brain whose durable knowledge lives in the person's Google Drive. It understands incoming material, maintains and connects knowledge, answers questions, creates and revises documents, and enriches information through the web when allowed. Filing is one part of the product. Efficiency must not turn it into a file sorter or remove useful reasoning.

The person can add files, links and free-form context, ask for work on existing notes, and establish preferences. The app handles mechanical actions immediately. Tidy-up incorporates new information and carries out semantic work, leaving a truthful report, provenance, recoverable originals and unanswered questions. Knowledge remains readable outside Bower.

The three knowledge layers are an original, an immutable source note or extraction with provenance, and maintained compiled knowledge. Current state can evolve; history and citations remain. Connections, contradictions, meaningful synthesis and useful documents matter more than producing more notes. Reuse and update before duplicating.

## Four responsibilities

| Component | Owns | Boundary |
| --- | --- | --- |
| App | UI, direct Drive reads/user writes, uploads, readiness, exact dedupe, journal, incremental preparation, explicit user intent and result rendering | No model credentials; preserve runner-owned files and note sections. Browser availability must not be required after a run is admitted. |
| Worker | Sign-in, credentials, folder pointer, authorization, quotas, one active run, dispatch, ordered status and runner authentication | Small control service; no content database, no model reasoning and no default proxy for every note mutation. |
| Runner scripts | Validate prepared inputs, fill preparation gaps, retrieve bounded context, run permitted web tools, validate/apply operations, update derived files, persist reports and recovery manifests | Deterministic mechanics outside Claude; preserve originals and user-owned text; recheck versions before applying. |
| Claude | Understand, classify, synthesize, connect, identify contradictions, propose semantic changes, draft documents and research decisions | Receives task-relevant context and returns bounded structured work; no unrestricted filesystem or credential access. |

Use a shared pure domain library where browser and runner need the same parsing, selection, hashing metadata or validation. Environment-specific adapters own I/O. Do not make the browser run heavyweight extraction at the expense of responsiveness: use background workers, capability limits and a runner fallback.

App-side preparation is an optimization, not an authority. The runner validates hashes, schema versions, readiness, selected scope and current Drive state. Material added through Drive or another client receives equivalent processing even if the app prepared nothing.

## Optimize work without removing capability

- Prepare incrementally at upload/edit time and reuse extraction by content hash plus extractor version. Store reusable preparation in dedicated, versioned per-item artifacts; do not repurpose `index.md`, `hot.md` or `log.md` as app-owned files.
- Keep an explicit readiness manifest. A progress indicator is not proof that every member of a pile arrived. A run never consumes an incomplete pile or removes late additions.
- Distinguish actions already resolved by explicit user input, deterministic maintenance and semantic work. A structured rule can be executed mechanically; a natural-language preference still needs interpretation before it becomes such a rule.
- Start with selected candidates and relevant sections. Permit bounded requests for additional notes, sources or web evidence when necessary; a fixed initial shortlist must not prevent discovering a connection.
- Apply budgets per task type and complexity. A receipt, a cross-project synthesis and a requested report do not have the same context/output requirements. One or two calls are an optimization target for simple tasks, never a universal feature limit.
- Claude returns decisions and necessary new prose. Code generates IDs, dates, paths, serialization, indexes, mechanical links and report structure. A requested long document legitimately requires long output.
- Group related inputs to reuse context. Reconcile multiple proposed updates to the same note before writing. Independent inputs need not share unrelated context.
- Keep web enrichment within the product scope, controlled by the person's setting and task. Simulate it in P2; implement and evaluate it in P4. Fetches and references are bounded, cited and treated as untrusted data.
- Avoid hidden semantic degradation. Insufficient context, exhausted budgets, unreadable content and unavailable web access produce a visible pending/partial/refused outcome, not fabricated success.

## Operations and ownership

The current operation list is a starting contract, not a ceiling on the second brain. It must cover creation and revision of generated documents, maintenance of compiled sections, links, contradictions, questions, rule wording and answers/research artifacts. A generic arbitrary-file-write operation is not needed to support rich document generation.

Distinguish a generated document's writable body from a person's protected body. Existing hard ownership rules remain until a separately specified, explicitly authorized editing flow changes them. Do not infer permission to rewrite user text from “tidy up.” The initial portable document representation is Markdown, including tables and citations. Additional export formats need individual requirements and acceptance tests; “documents” does not silently promise every binary format.

Drive remains the knowledge store. A version precheck is not a proven atomic transaction against external clients; real-Drive conflict behavior is a P3 integration gate. Neither adding a lock nor reducing tokens proves data safety.

## Product continuity from the original Bower

Preserve ingestion, requests about already filed items, useful comparisons and authored documents, knowledge updates, cross-project connections, contradiction checks, sources, explicit preferences and web enrichment. Reuse the original benchmark's synthetic scenarios as evidence inputs; do not copy its implementation or private content.

Mail integration, shared-drive collaboration, broad offline note editing and arbitrary external actions are not implied by “second brain.” They need explicit scope decisions. Optional connector absence must not remove core note/document/research acceptance. Current offline-reading and durable-upload product questions stay recorded as unresolved until the owner makes a specific ruling; this general planning approval is not that ruling.

## Superseded proposal

The earlier backend v2 proposal at `codex/backend-proposal-v2` / `cbb6dc2` is historical. Its default centralized mutation service, backend expansion and blanket deferral of web enrichment are not the adopted direction. Its reproduced defects, recovery concerns and compatibility questions remain useful evidence. The current source of planning authority is this document plus WORK_PLAN and P2_ACCEPTANCE on local `main`.

## Optimize against preserved quality

Measure the same synthetic corpus before/after: correct filing, useful generation, factual support, cross-note links, contradiction handling, preservation and recovery. Then compare preparation time, executor startup, Drive reads, model time/calls/tokens, output size and application time. Count actual useful completion, not just a fast terminal status. No latency improvement or semantic parity is claimed by this documentation alone.
