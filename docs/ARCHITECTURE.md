# Stable boundaries and recoverable execution

Adopted planning revision: `2026-10-05-contracts-2`. This is the target architecture, not a claim that the current code implements it. [PRODUCT](PRODUCT.md) owns capabilities, [WORK_PLAN](WORK_PLAN.md) owns sequencing and [P2_ACCEPTANCE](P2_ACCEPTANCE.md) owns P2 acceptance. Existing wire shapes remain the baseline until an assigned, tested migration replaces them.

## Design and dependency direction

Keep one app, a small Worker control service and a deterministic runner. Do not introduce a service mesh, generic plugin framework, content database or universal mutation proxy. Google Drive remains the durable knowledge store. GitHub Actions is the current executor candidate; its startup and operational behavior must be measured before changing it.

| Boundary | Stable responsibility | Replaceable detail |
| --- | --- | --- |
| Screens → Sources | User operations, domain results, truthful progress and errors | Demo, fake and real adapters; no screens importing service implementations |
| App → Worker | Identity, folder binding, admission, status and recovery discovery | Dispatch mechanism, coordination storage, callback transport |
| Runner → semantic provider | Capability-specific input, context requests and validated proposals | Claude model, prompts and tool implementation |
| App/runner → Drive adapters | Scoped reads and ownership-safe mutations with explicit preconditions | HTTP transport and provider-specific response handling |

P3 internal changes must preserve the accepted app contract. P4 internal changes must preserve both that contract and the runner's semantic-provider contract. A new user capability may need a compatible extension; absolute immunity from every future product change is not promised. Test stability instead of freezing an imagined final API.

Keep orchestration and authoritative effects in deterministic code. Claude proposes meaning and authored content; it does not select arbitrary file paths, mutate Drive directly or declare successful completion. Web evidence and stored documents are untrusted input, never authority to change permissions.

## Reusable deterministic core

Extract only rules needed in more than one runtime into a small pure TypeScript module within this repository. Start from existing parsing and validation helpers; do not reorganize all of src or publish a package just to create a boundary. It contains ownership rules, input readiness, schema validation, operation validation and deterministic preparation/selection where shared. No React, browser storage, network, credentials or environment globals; time/IDs are supplied explicitly when required. Browser and runner adapters own I/O. Architecture tests should enforce the allowed dependency direction as modules appear.

The browser incrementally prepares work and remains responsive. Prepared artifacts are optional acceleration: keyed by content hash, extraction version and relevant configuration, revalidated against current source versions, and scoped to account/folder. The runner can reconstruct missing preparation for external inputs or a closed browser. A stale cache never authorizes a stale write. Derived cache loss must not lose source knowledge.

## Two contracts, not one model-shaped API

The app contract carries user intent, accepted work identity, readable domain results and recoverable status. The semantic contract carries the selected evidence, allowed operations and capability-specific outcomes: incorporation/update, answer/document, relationship/contradiction and research. Use discriminated schemas with common provenance and error conventions; no unbounded command string or arbitrary write escape hatch. Add operations when a capability requires them, rather than anticipating every future task.

Contract work must specify:

- Version and supported capability negotiation. An old app can keep working against a compatible backend. Additive fields are safe only when readers are tested to tolerate them; new required fields, enum cases or changed meanings are potentially breaking.
- Stable run/request/operation identities and account/folder scope. Network retries are expected. Reusing an idempotency key with different intent is a conflict, not a second successful request.
- References to captured inputs, versions, readiness and permitted content boundaries. Carry large content as scoped artifact references when practical, not repeated status payloads. Validate referenced content and access before use.
- Distinction between admission, progress, terminal execution and persisted domain result. Existing RunWire/status enums are not extended by this prose; map the conceptual states deliberately in the contract entry.
- Structured failures with retryability, conflict/partial outcomes and a safe user sentence. Unknown or malformed operations fail validation without applying a subset silently. Diagnostics retain useful identifiers without secrets or personal content.
- Limits for bytes, operations, context expansion and execution; task-sensitive model budgets. A requested long document remains supported. Exhaustion produces an honest continuation/partial outcome.

Version all durable result/manifests and preparation artifacts as well as HTTP payloads. Prove old/new fixtures before changing producers. Persisted data can outlive a deployed app. A breaking change requires an explicit migration or adapter and a tested compatibility window; no silent rollback to misreading old data. Unsupported versions fail safely and visibly.

## Durable execution without a large backend

1. The app captures intent and ready input references. Local preparation is not a requirement for later execution.
2. Worker admission durably records request identity, scope and active-run ownership before acknowledging acceptance. Dispatch is recoverable: a failure after admission must leave work discoverable and retryable.
3. The runner claims the admitted run using authenticated, expiring authority and an attempt identity. Duplicate dispatch cannot create concurrent authorized writers for the same run. Specify lease renewal/takeover or an equivalent tested mechanism; expired attempts cannot finalize state.
4. Deterministic code revalidates inputs, gathers context and invokes the semantic adapter only where needed. Later arrivals are not silently added to the captured set.
5. Validate proposed operations, record intended effects and preconditions, then apply with stable operation IDs and recoverable checkpoints. Lost responses require reconciliation with Drive before retry. Do not promise global transactions or exactly-once provider delivery.
6. Persist the manifest and domain report before publishing successful completion. If effects happened but saving the report fails, retain a recoverable outcome; never show success or blindly repeat all effects.
7. Any authorized returning client can discover status and results. Browser close, reload or sign-out cannot be the scheduler or the only place holding an accepted job. Revoked credentials/account deletion need explicit stop/recovery behavior and no continued unauthorized access.

Worker storage holds operational metadata, credentials and durable admission/dispatch state. Content, reports and recovery artifacts live in Drive. The precise coordination primitive is chosen by a small experiment against these invariants. Recovery may be automatically attempted by a bounded backend mechanism or exposed as a user retry; neither depends on the original browser staying alive. Record that choice and test missed dispatch, orphaned attempts and lost callbacks.

Status has an authoritative monotonic revision/attempt rule; clients reject older observations. Cancellation, if supported, is cooperative with explicit effects already applied; cancellation never implies rollback. Do not add a cancel button merely because the internal model can represent a request.

## Safety at the actual storage boundary

Preserve the repository's ownership rules, Bin-only deletion, content version checks and name/place checks. A read-then-write precheck is not evidence of atomic compare-and-swap. A single Worker admission lock cannot prevent an external Drive client editing a note.

Before trusting those assumptions, perform the bounded experiments in WORK_PLAN. If a provider cannot enforce the required write precondition, document the reproducible race and select an explicit remedy: supported conditional update, narrower/append-only effects with reconciliation, or a product interaction that avoids unsafe overwrite. Do not simulate an unavailable guarantee, accept silent lost updates or expand to a centralized write proxy that still cannot control external clients. Unresolved high-impact data-loss assumptions block contract acceptance.

## Contract verification and phase substitution

Build reusable behavioral suites around public operations and persisted outcomes. The same applicable suite runs against the fake and real service adapters; provider-specific tests separately cover real permissions and concurrency. Schema validation alone is insufficient. Keep independent expected results so a simulator and its implementation cannot agree on the same mistake.

| Evidence | P2 | P3 | P4 |
| --- | --- | --- | --- |
| App service contract and capability journeys | Fake with real data effects; demo parity | Real services and deterministic runner double | Same app journeys with semantic provider |
| Recovery/idempotency/version behavior | Deterministic fault injection, two clients, stale responses | Real dispatch/storage races and durable recovery | Same mechanics under model/tool failures |
| Semantic contract | Scripted validated proposals and malformed/insufficient cases | Deterministic provider adapter; no live-model requirement | Model quality, research grounding and context expansion |
| Compatibility | Recorded baseline fixtures and migration cases | Old accepted app against new backend | Stable runner/app consumers against provider changes |

Before closing P2 prove the app can switch its fake service adapter without rewriting screens or domain workflows. Before closing P3 prove the runner can swap its deterministic semantic provider through the same contract. P4 adds semantic capability, not a second mutation engine: recovery/application primitives needed for P3 are built in P3 and reused.

## Performance with preserved quality

The shared corpus measures end-to-end time and its components: admission/dispatch/startup, Drive reads, preparation cold/warm, retrieval, model/tool calls, apply/report and retries. Record fixture sizes, device/runtime, cache state, repeated-run distribution (median and tail when sample size supports it), call counts, bytes/tokens and successful outcome quality. P2 measures app/simulated mechanics; early probes measure only their narrow real stages; P3 measures infrastructure; P4 measures semantics. Never extrapolate fake timings to production.

Choose budgets after a baseline. Optimize the measured bottleneck and rerun the same quality checks. Reduce redundant reads/preparation/model output, not provenance, useful connections, protected content or required authored prose. No framework, executor migration or added service without a measured problem and a simpler alternative considered.

## Mechanism map

Each mechanism has one home in the code (TL-P4-15). A change that needs one of these behaviours extends its home and never writes a second copy. A defect diagnosis names the mechanism that owns it. "Target" marks a home the consolidation (TL-P4-14) is still building. The lead updates this table when a home moves.

| Mechanism | Home | Today |
| --- | --- | --- |
| Drive transport (token, retry, errors, wire type) | `src/data/drive/` | Done: one transport with injected retry options (`c2-drive-transport`, `c2-transport-options`, `c2-transport-outcome-kind`) |
| Drive read cache, keyed by id and modifiedTime | `src/data/drive/` | Done: one `ReadCache`; the runner's listing patch log is its listing part (`c2-read-cache`, `c2-write-once`) |
| Drive ports (what a Drive can do, read or write) | `src/data/drive/drive-api.ts` | Done: both Drives offer the same ports, classed read or write (`c2-fake-parity`, `c1-drive-ops-table`) |
| "Still as seen" fence before an act | `src/data/contracts/` | Done (`c1-still-as-seen`) |
| Write-once: creates by Drive-reserved id, updates and moves by the `bowerOp` stamp plus checksum; one reservation per intended create, kept until confirmed, released on a permanent refusal | `src/data/spine/write-once.ts` | Done: one rule with a keeper port: the outbox line (journal), memory (app sends), the device record (uploads) and Durable Object storage (the Worker template). An ESLint rule allows `generateIds` and reserve/create calls only there and at the ruled batch sites (`c2-write-once`, `c3-reservation-home`, `c3-reservation-upload`, `c3-reservation-worker`) |
| Undo = the inverse forward change, decided under the outbox lock; the client never deletes a sent line | `src/data/vault/journal.ts` `retract`, pairs in `src/data/contracts/journal-record.ts` `pairsOf`, rule order in `src/data/contracts/note-edit.ts` `ruleSequence` | Done: an unsent line is dropped, a sent one gets an inverse line with `undoes`; the outbox sends in order per folder (`c4-undo-compensate`, TL-P4-27 addenda 2 to 5) |
| Applying a run's operations (check, send, observe, read back) | `src/data/spine/` engine | Done: one engine; the fake is a Drive adapter (`c2-one-engine`) |
| App updates and offline shell (service worker: network-first navigations with a 3 s timeout and a precached shell fallback, precache, skipWaiting and clientsClaim, no forced reload) | `src/sw.ts`, built by vite-plugin-pwa `injectManifest` from `vite.config.ts` | Built: `pwa-update-one-reload` (P4-97); it replaced `generateSW` with a precache-bound `navigateFallback` |
| Digests (size, SHA-256, MD5) | `src/data/contracts/hashes.ts` | Done, on `@noble/hashes` (`c1-digest`, `c1-digest-library`) |
| Model reply validation and refusal kinds | `runner/src/claude.ts`, one zod 4 declaration | Done: 37 named refusal kinds, retry text unchanged. Giving the CLI the JSON schema waits for `p4-structured-output` (`c3-reply-schema`) |
| Files the runner may write in `.bower/` | `src/data/vault/layout.ts` `RUNNER_WRITES` | Done: questions, requests and hashes, imported by the manifest and the admitted check (`c3-reply-schema`) |
| Current state bounds (strict on write, lenient on read) | `src/data/contracts/note-edit.ts` | Done: Bower writes at most 8 × 200 and reads up to 20 × 400; every stored manifest still parses (`c3-reply-schema`) |
| Model input fingerprint and section hashes | `runner/src/claude.ts` | Done: canonical JSON per RFC 8785 (JCS); input= values before `c3-fingerprint` do not compare (`c3-fingerprint`) |
| Question subject and identity | `src/data/contracts/` | Done: one subject; a yes to "Write it" applies the stored shown text with no model call (`c3-subject`) |
| Note sections (Current state, Timeline, Bower's sections) | `src/data/contracts/ownership-format.ts` | Done (`c3-note-sections`); one byte table per note (`c4-test-timers`); one parse per read note per attempt (`c4-parse-once`) |
| Pile readiness accounting (declarations, dispositions, which pile a record belongs to) | `src/data/pile-readiness.ts` | Done: records stamped with their pile id, read for the Inbox's piles only (`c2-pile-records`) |
| Planning: capture, decide, build operations | `src/data/spine/` | In progress: part 1 done (report rows by op id, one record→operations map, no fixture on the model path, enforced by dependency-cruiser); part 2 splits capture, decide and build (`c3-planner-split`) |
| Worker deadlines (alarms) | `api/src` deadlines table | Done: one deadlines table; only the alarm dispatches (`c1-worker-deadlines`, `c2-worker-dispatch`) |
| Worker route helpers (person RPC, errors, JSON body) | `api/src` middleware | Done (`c1-worker-routes`) |
| Contracts shared by app, Worker and runner (wire, phases, lease, template) | `src/data/contracts/` | Done (`c1-shared-contracts`) |
| UI data loading (one store, loading, error or ready) | `src/data/provider.tsx` | Target: per-component loads (`c4-query-store`, `c4-resource`) |
| Focus return after a menu, sheet, toast or palette closes | `src/ui/focus.ts` | Done: `closeFocus` (Radix `onCloseAutoFocus`) and `returnFocusTo`, no timers; `Sheet` records its opener; the tree menu returns to the tree at once. The route-heading rule keeps its polling until `c4-test-timers` (`c4-focus-return`) |
| UI actions (busy, error, double press) | `src/ui/` `useAction` | Target: hand-written per screen (`c4-use-action`) |
| Run status words | `src/features/tidy/run-words.ts` | Six surfaces decide alone (`c4-run-view`) |
| Heavy-run lock and timer gate | `testing/with-lock.sh` (re-entrant through `HARNESS_LOCK_HELD`; around `pnpm check` and every e2e script; the unlocked bodies are `check:run` and `e2e:pwa:run`, called only through the lock), `testing/timer-gate*.ts` with `real-timers.json` (empty) | Done (`c4-test-timers`) |
| App copy | one copy file keyed by id | Target (`c4-copy`) |
| Operation key (` · op:<12-hex>`) for the log and hot | `src/data/contracts/op-key.ts` `opKey` | Done: the first 12 hex of sha256 over the canonical [rootId, runId, operationId], on `hashes.ts`; hot's Recent changes use it (`b3b-hot-maintain`, TL-P4-42 addendum 6); B8's log reuses it (TL-P4-50) |
