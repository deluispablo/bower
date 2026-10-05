# Reusing existing software in Bower

Research date: 2026-10-05. Planning baseline: contracts-2 / main 53034a9. Implementation inspected at 8e26ed760462196b15eb4a365239223367f3b6d7, with product source 1dc7f64. This is a planning recommendation covering C01–C16, not a dependency installation, benchmark result or phase acceptance. Existing assignments and R1-D02 remain in force.

## Recommendation

Keep the app, minimal Worker and deterministic runner boundaries. Reuse maintained parsers, browser persistence, validation and provider protocols behind those boundaries. Preserve the current UI and working primitives unless a replacement resolves an accepted requirement or a measured problem. The main savings should come from avoiding new parsers and protocol implementations, reducing repeated preparation and preventing contract drift.

A component's documentation establishes a candidate, not its compatibility with Bower. Only the earlier Freed investigation inspected its exact conditional-write implementation and simulated tests at a pinned commit. The other candidates below were assessed through upstream documentation and Bower source; no candidate has been installed or benchmarked in this review. Select and pin an exact release, check its transitive dependencies/license/security notices and run the relevant Bower fixtures in its implementation entry. No claimed percentage speedup or production guarantee follows from this review.

## Current implementation evidence

- `package.json`: React, React Router, Zustand, Radix, cmdk, Vite PWA, Vitest, Playwright and axe are already reused. Keep them; adding competing frameworks has no demonstrated benefit.
- `src/data/vault/note-format.ts`: custom frontmatter and section parsing, including string searches for protected headings. `src/features/note/markdown.tsx`: custom block/inline rendering and outline parsing. Parsing and rendering are different responsibilities; a renderer cannot enforce ownership.
- `src/data/vault/drive-vault.ts:search`: title matching plus Drive full-text candidates, bounded content reads and line matching. It is already bounded; a local index adds refresh/completeness responsibilities and is not automatically faster overall.
- `src/data/drive/drive-http.ts:upload`: multipart for small files and a resumable chunk loop for larger ones. The session is local to that call; interruption/reload recovery is not supplied merely by selecting resumable upload.
- `src/data/worker/worker-http.ts`, `worker-api.ts`: hand-written runtime guards and wire types. Preserve accepted wire representations during any schema migration.
- `src/data/draft-files.ts`, `device.ts`: current transient bytes and cleanup. Durable upload storage is separate work; do not replace the recently corrected cleanup casually.
- `vite.config.ts`: Workbox caches the app shell and excludes service routes. This does not implement cached note reading.

## Capability coverage and reuse decisions

The status column describes inspected foundations or planned work, not a C-row pass. Every row still needs the evidence in P2_ACCEPTANCE.

| Capability | Current or planned foundation | Reuse recommendation | Timing and proof |
| --- | --- | --- | --- |
| C01 Identity and folder lifecycle | App session/Worker boundary exists; production OAuth is P3 | Google's authorization-code guidance plus `oauth4webapi` for protocol validation; keep app-specific sessions, folder ownership and cleanup | P3. Verify redirect/state/PKCE, refresh, revocation and two independent identities. OAuth never proves cache isolation by itself. |
| C02 Add files, links and notes | Upload loop and transient draft bytes exist; durable recovery remains separate | Native Drive resumable protocol plus `idb` for local bytes and recovery metadata | P2 storage/fake behavior; P3 real resume. Reload mid-upload, quota failure, expired session, lost response and exact file reselect. |
| C03 Browse, search, edit and Bin | Working domain adapter; custom text grammar/rendering/search | Evaluate remark/mdast, YAML and react-markdown at the grammar entry; MiniSearch only against a corpus baseline | P2 where required. Preserve existing links, tasks, headings, raw protected bytes, Bin semantics and search coverage. |
| C04 Incorporate knowledge | Scripted P2 effects; real semantics P4 | Existing extraction libraries feeding one shared preparation format; provider structured output | P2 fixtures and extraction as assigned; P4 factual-quality evaluation. Extraction is not comprehension. |
| C05 Update knowledge | Ownership and Drive conflict constraints | Structural parsing, validated operation proposals and the R1 conditional-write candidate | P2/P3 contract/provider proof. Reject conflicts; never auto-merge protected prose merely because a diff library can merge it. |
| C06 Connect information | Links/backlinks exist; semantic discovery remains future work | Parsed link graph plus local lexical candidates; bounded expansion through the semantic adapter | P2 scripted cross-project links; P4 recall corpus. Begin without a graph database or mandatory embedding service. |
| C07 Detect disagreement | Scripted capability still needs complete evidence | Shared evidence/provenance schema and a contradiction evaluation corpus | P2/P4. No generic parser or RAG package proves contradiction detection; require both source references and uncertainty. |
| C08 Generate and revise documents | Markdown display exists; generated result workflow must satisfy full acceptance | react-markdown plus GFM for display, reusable document/operation schemas | P2 long result/table/citation fixtures; P4 grounded authorship. Keep Markdown as the portable canonical output. |
| C09 Ask about stored material | Search and request boundaries | MiniSearch candidate retrieval if useful; selected source context through the same semantic provider | P2 fixtures, P4 answer quality. Preserve context expansion for relevant material outside the initial shortlist. |
| C10 Web enrichment | Allowed/denied/failed/stale simulations required; real tools P4 | Mozilla Readability and Turndown for articles; evaluate provider web-search/fetch tools behind an adapter | P4 with consent/budgets/citations. Browser CORS is not solved by Readability; remote fetching belongs in the runner/tool. |
| C11 Rules and questions | Existing domain formats and pending states | Shared runtime schemas and explicit instruction/source separation | P2/P4. Library validates shape; Bower decides authority, rule application and answer lifecycle. |
| C12 Tidy lifecycle | Current app/fake run logic; production execution spine P3 | Durable Objects as a small run-control candidate; official GitHub dispatch/concurrency/caching mechanisms | P2 simulation, P3 real proof. A queue library or Action concurrency group cannot replace durable admission/recovery. |
| C13 Undo | Manifest-based reversal required | Keep domain-specific manifests and preconditioned compensating operations | P2/P4. Generic UI undo/redo is not durable Drive undo. Later edits and partial recovery remain protected. |
| C14 Multiple clients and recovery | Current cleanup and version checks; R1 race confirmed | Drive change tokens, account/folder-scoped local stores and focused transport tests | P2/P3. Change notifications/invalidation do not provide atomic writes. Reject late replies after session changes. |
| C15 Efficient preparation | Target preparation contract not complete | PDF.js, Mammoth, Readability; content-hash/extractor-version cache; bounded worker execution | P2 app preparation, P4 runner fallback. Test responsiveness, extraction quality, cold/warm reads and cache invalidation. |
| C16 Usability and PWA | Existing React/Radix/axe/Playwright/Workbox stack | Keep stack and tests; add only missing semantic rendering/persistence behind current UI | P2 onward. Keyboard/mobile, offline stale reading, large documents and sign-out cleanup remain required. |

## Preferred components and limitations

### Shared contracts

[Zod](https://github.com/colinhacks/zod) provides runtime schema validation and TypeScript inference. Prefer one domain contract package over separately maintained browser, Worker, fake and runner guards. Start with a new/versioned boundary or one demonstrated drift problem; do not convert every guard at once. Keep domain checks for ownership, IDs, lengths, expected versions and allowed operations beyond schema shape. MIT license is [published upstream](https://github.com/colinhacks/zod/blob/main/LICENSE). Measure browser bundle impact; choose a smaller schema surface if needed rather than shipping server-only definitions to every screen.

### Durable browser storage

[idb](https://github.com/jakearchibald/idb) is a small promise wrapper over IndexedDB. It is the preferred first candidate for retained upload bytes, stale note cache and regenerable preparation/search data. Keep network requests outside database transactions; its documentation explicitly describes transaction lifetime limits. Dexie would merit a separate comparison only if relational querying/migrations make the thin wrapper cumbersome; this review does not select both.

Proposed keys include account, folder, schema version and item identity. Sign-out cleanup follows the existing distinction between person data and already-applied journal changes. Check completion against a session generation before accepting asynchronous results. Browser eviction/quota means retained bytes are best effort: preserve the approved explicit reselect path. Do not claim a local database guarantees permanent backup or cross-device synchronization.

### Markdown and protected text

[remark](https://github.com/remarkjs/remark) supplies a Markdown syntax tree; [yaml](https://github.com/eemeli/yaml) supplies a maintained YAML parser; [react-markdown](https://github.com/remarkjs/react-markdown) supports React rendering and GFM integration. Use parser positions to identify structural blocks, but splice permitted spans into the original text: round-tripping a complete note through a serializer can change unrelated formatting. YAML support must match the adopted grammar rather than silently expanding accepted values.

This is the most promising replacement for custom syntax handling, but also a migration risk. Require fixtures for headings inside fenced code, repeated protected headings, CRLF, escaped pipes, nested lists, wikilink aliases, frontmatter variants, task position mapping, anchors and malformed notes. Keep HTML disabled unless a separately tested sanitizer path is necessary. The library does not decide which sections Bower owns.

### Search and connections

[MiniSearch](https://github.com/lucaong/minisearch) supports in-memory full-text indexing for browser and Node. Evaluate incremental indexing of authorized, already-prepared notes, ranking by title/body and retaining source IDs. Keep stable Bower result types so the engine can be removed later. Rebuild persisted indexes when tokenization/schema changes; reflect incomplete coverage honestly and invalidate removed/inaccessible notes. Spanish and English matching need corpus tests. Compare first-use indexing, warm queries, memory and remote reads before changing the existing search.

A plain adjacency map is adequate for explicit backlinks initially. Semantic connections need retrieval plus Claude evaluation, not a new graph service by default. Embeddings are a later remedy for measured lexical-recall failures, not a prerequisite for the first complete second brain.

### Extraction and preparation

- [PDF.js](https://github.com/mozilla/pdf.js): browser/runner JavaScript PDF parsing and rendering, Apache-2.0. Use lazy loading and bounded page work. Text extraction is not OCR and does not guarantee correct reading order in complex layouts.
- [Mammoth](https://github.com/mwilliamson/mammoth.js): DOCX conversion, BSD-2-Clause. Prefer raw text for context when formatting is unnecessary; if HTML is shown, sanitize it. Upstream explicitly warns that conversion is not sanitization.
- [Readability](https://github.com/mozilla/readability): article extraction, Apache-2.0. [Turndown](https://github.com/mixmark-io/turndown): HTML-to-Markdown, MIT. Preserve URL, retrieval time and source hashes separately. Readability is neither a crawler nor an HTML sanitizer; keep scripts disabled and validate any rendered HTML.
- [MarkItDown](https://github.com/microsoft/markitdown): Python conversion fallback for the runner, MIT. Install only required format extras; avoid `[all]` and optional model integrations by default. It adds a Python environment, so prefer the shared JavaScript route for already-covered formats.
- [Docling](https://github.com/docling-project/docling): candidate for difficult layout/OCR cases, MIT code with separately relevant model terms. Its broader pipeline is not the default for every input. Compare extraction fidelity and cold start on the actual difficult corpus first.

Store source provenance plus extractor name/version/configuration and content hash. App and runner caches are interchangeable only when their normalized output contract and extraction identity match. Unsupported, scanned or ambiguous documents receive an explicit fallback/partial result, not fabricated text. Preserve originals.

### Google Drive protocols

Reuse the official [resumable upload protocol](https://developers.google.com/workspace/drive/api/guides/manage-uploads), including querying session progress and interpreting the acknowledged range rather than assuming the last sent chunk succeeded. Bind saved session metadata to the account, folder and exact bytes; session expiration and unknown final results need reconciliation before recreation. This extends the existing adapter instead of adding an upload service.

Use the official [changes feed](https://developers.google.com/workspace/drive/api/guides/manage-changes) for incremental refresh where it reduces reads. Changes are not simply a recursive folder listing: filter against the authorized subtree, account for moved folders/removals and rebuild when recovery requires it. Persist the next token only with the changes applied. Never expand scopes silently to make indexing easier.

The [Freed conditional-write candidate](https://github.com/freed-project/freed/blob/7319c80b9111315ebac2718b46ef39d224eee73c/packages/sync/src/cloud/library-core-google-drive-adapter.ts) remains subject to R1-D02 real-provider proof. It uses v2 metadata ETags around a content read and a conditional v2 media PUT. Its fake tests do not certify Google semantics. No other library in this review closes R1 or makes external Drive writes transactional.

[Uppy's Google Drive plugin](https://uppy.io/docs/google-drive/) accesses Drive files as upload sources and uses Companion in that integration. It is not a drop-in replacement for uploading Bower files to the person's Drive. Do not add Companion or a tus server to solve the existing protocol without a measured reason.

### Minimal Worker and execution

[oauth4webapi](https://github.com/panva/oauth4webapi) supports standards-based OAuth/OIDC and Cloudflare Workers; pair it with [Google's server-side flow](https://developers.google.com/identity/protocols/oauth2/web-server). It does not provide the entire Bower session or encrypted credential store. [Hono](https://github.com/honojs/hono), already used in the original backend, is a reasonable small routing candidate; retain the accepted HTTP contract. Reuse public library APIs and behavioral lessons without copying the old application wholesale.

[Durable Objects storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/) is a P3 candidate for per-folder run ownership, durable admission and status. Keep content in Drive. Test concurrent admission, crash before dispatch, expired attempts and recovery before selecting it; it cannot lock edits made through external Drive clients. [p-queue](https://github.com/sindresorhus/p-queue) can bound local asynchronous work if the existing batching helper becomes insufficient, but its in-memory queue is not a durable run coordinator.

Use [GitHub dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) for pinned tool dependencies, never credentials or personal note content. [Workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) is an extra guard, not authoritative job storage: default pending runs may be replaced; larger queue modes also have limits. Avoid canceling active content mutations automatically. Measure queue/startup, installation, model and Drive time separately before replacing Actions.

### Semantic work and research

Prefer the selected provider's official SDK and [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) inside the semantic adapter to repairing free-form JSON. Validate domain meaning locally; explicitly handle refusal, truncation and unsupported schema constraints. This is not an automatic change from a Claude Code session to paid API execution: choose the execution/authentication channel separately and verify its supported structured-output interface.

Evaluate [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) for stable instructions and schemas, with changing task evidence after the stable prefix. Cache eligibility, lifetime and cost depend on the chosen provider/channel; measure hits and total time. Do not assume a subscription-backed CLI exposes API cache controls or that caching eliminates semantic work.

[Provider web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) is an alternative to building a search crawler. Keep it behind the allowed-web contract, cap tool use and persist actual citations with source identity. Available features and billing depend on execution channel. Tools returning URLs do not prove an answer is grounded. Validate citation support and preserve unavailable/stale outcomes.

No general agent framework has been shown necessary here. A small schema-driven provider adapter and deterministic apply/recovery loop fit the accepted architecture. Consider additional orchestration frameworks only when they remove a concrete unmet requirement with less total code and operating cost.

### Tests and recovery

Keep Vitest, Playwright and axe. [fast-check](https://fast-check.dev/) is useful selectively for ownership-preserving edits and event ordering: generated operations should preserve untouched bytes and reject stale state. Retain minimized failures as named regression fixtures. [MSW](https://github.com/mswjs/msw) can complement fake adapters with HTTP boundary failures, but should not replace the existing stateful fake world or create a second competing simulator. Provider behavior still requires real-provider evidence.

Undo, readiness, preserved source history, journal acknowledgement and operation reconciliation remain small Bower-owned policies. Reusing generic diff/undo libraries does not provide durable storage semantics. Persist operation intent and evidence, then reconcile unknown outcomes; never automatically retry every mutation because a retry library exists.

## Adoption order

1. Finish current reservations and the already approved R1 discriminator. This review creates no new provider execution or phase blocker.
2. At O3, evaluate one shared schema boundary and the protected-text grammar together with their existing fixtures. Reuse current guards until a tested migration is ready.
3. In the accepted durable-upload/offline-read entries, prefer `idb` and the official Drive resume protocol. Preserve the recently fixed sign-out behavior and folder-scoped journal exception.
4. At O5/O6, use maintained Markdown/extraction components for the missing generation/preparation journeys. Evaluate MiniSearch only with measured coverage and speed, not as a prerequisite for unrelated P2 work.
5. In P3, choose the smallest OAuth/run-control implementation that passes existing contracts; optimize Actions setup using measurements.
6. In P4, add semantic structured output, caching and research tools through the accepted provider boundary. Keep the same deterministic mutation engine.

Before a substantial new subsystem, record a short reuse decision in its existing assignment: requirement, current implementation, one or two relevant candidates, chosen reusable part, limitation, exact version/license, small acceptance test and rollback. Prefer already-tested primitives and maintained packages over copying large source files. Copy only when a small adaptation is justified and attribution is retained. Time-box research to the decision; working low-risk code does not need a new survey. No new global harness script or repeated approval gate is required.

Expected benefits are fewer custom parsers/protocol bugs, fewer duplicated contracts, reusable extraction and fewer unnecessary Drive/model calls. Measure them in the existing capability corpus: unchanged quality and required behaviors, remote calls, bytes/tokens, cold/warm latency, mobile responsiveness, bundle growth and maintenance work. A dependency that does not improve that balance should be rejected or removed.
