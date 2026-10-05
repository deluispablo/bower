# Bower app independent review

Reviewed on 2026-10-05. Target: `ce42c1244a3af933f038fb67a9174ef728bb6af6`.

## Verdict

The architecture is coherent with the intended product: narrow Drive/Worker clients, interchangeable sources, mechanical application writes, a separate runner, and constrained Claude operations. The phase sequence is sensible. Phase 2 is **not ready to close**: four additional reproducible defects remain in the reviewed revision, four previously registered entries remain open, and product deferrals still require an explicit owner ruling. Phases 3 and 4 have direction and an app-facing contract, but not implementation-ready execution plans.

This is an independent code and planning review, not a completed browser evaluation or a production certification. Another coordinator was writing in the shared checkout. I reviewed an immutable `git archive` in `<frozen-review-snapshot>`, excluded those uncommitted edits, and made no changes to application code, harness state, shared plans, or commits.

## New findings

### R1 — Important / P1: ordering an incomplete pile hides failed uploads

Locations: `src/data/live/runs.ts:61-65`, `src/data/vault/drive-vault.ts:359-377`, `src/data/fake/fake-runner.ts:193-197`.

`LiveRuns.start()` flushes the journal but neither waits for uploads nor rejects piles with failed uploads. A pile folder is visible on Drive while its uploads are unfinished. The runner can therefore process the files that arrived and put the containing pile folder in the Bin. `DriveVault.piles()` only shows pending non-lone uploads while their folder remains in the index. Once that folder disappears, the failed item disappears from the inbox too.

Reproduced with a synthetic two-file pile: `arrived.pdf` uploads successfully; `missing.pdf` fails. Before ordering, both are shown and the latter has `upload: -1`. The fake runner finishes successfully, reports only `arrived.pdf`, reports nothing set aside, and the original pile is absent after refresh. Its remaining local upload entry is inaccessible through the inbox.

This occurs in the same session. It is distinct from the explicitly deferred durable upload queue across reloads. It violates the phase-2 plan's promise that failed items remain available for retry.

Required correction: define pile readiness in the source and runner contract, prevent incomplete piles from being consumed, and retain failed items and their retry route. A UI-only disable is insufficient when another device can start a run. Regression: successful plus failed/in-flight uploads followed immediately by ordering must keep the unfinished items visible and retryable.

### R2 — Important / P1: a protected Current state section can become editable

Location: `src/data/vault/note-format.ts:83-91`.

The parser protects only consecutive `- ` lines immediately following `## Current state`. A paragraph or a blank line ends this special parsing and moves the rest of that section into the editable body. The task-toggle path then treats tasks in the protected section as user tasks.

Reproduced with synthetic Markdown containing a paragraph, a blank line and `- [ ] protected task` under Current state, followed by `## My notes`. Parsing returns an empty current-state array and includes the protected task in `body`; toggling body task zero changes that protected task to checked.

The plan's serialized template uses consecutive bullets, but the hard ownership rule says the app never writes Bower's sections. Unexpected externally edited Markdown must therefore remain protected or fail safely, rather than silently exposing the section for editing.

Required correction: preserve the complete section by heading boundaries, or reject unsupported section structure before allowing writes. Regression: paragraphs, blank lines, additional body headings, and protected tasks must never enter the editable body.

### R3 — Important / P2: external Drive changes remain invisible without a completed run

Locations: `src/data/vault/drive-vault.ts:596-608`; `src/data/live/runs.ts:120-125`.

The Drive index is cached until an explicit refresh. Reopening a note reuses the cached file metadata and parsed text. Returning to the app only polls run status; it refreshes Drive when a previously unseen finished run arrives. Ordinary edits or added files from another client do not invalidate the index.

Reproduced by reading `Projects/Note.md`, editing its text and adding `Projects/Remote.md` through a separate Drive-side action, then reopening the note, reading the tree, and polling a null run status. All three reads still show the old text, and the new file is absent from the tree. A page reload builds a new index, but the existing session never discovers the change through these normal paths.

Required correction: define a bounded external-change refresh policy and connect it to foreground/manual reload and source reads. Ensure coalescing and preserve unsent changes. Regression: two clients over the same fake Drive must see the other's edits and additions after the documented refresh trigger.

### R4 — Important / P2: overlapping status requests can regress a finished run

Locations: `src/data/live/runs.ts:72-75`, `src/data/live/runs.ts:116-119`.

Every status response replaces `this.last` without request ordering, coalescing, or a monotonic phase check. Concurrent callers and foreground/poll requests may overlap. An older response can arrive after a newer one and overwrite it.

Reproduced with two controlled requests for the same run: the second returns `done`; the first subsequently returns its older `reading` state. The final accepted state is `reading` and `runningPiles()` returns `*`, locking piles despite having already received completion. A later poll can recover, but the UI state and replay are wrong in the meantime.

Required correction: coalesce status requests and reject stale state using a defined run identity/request order or monotonic version. Include the case of an old run response arriving after a new run starts. Regression: resolve overlapping requests in reverse order; the accepted state must not regress.

## Existing open work

At this target, the harness has 201 entries: 197 closed and four open. Existing entries are not duplicated as new findings:

| Entry | Scope | Review disposition |
| --- | --- | --- |
| `open-in-drive` | Replace placeholder/recovery link | Still open; another coordinator's uncommitted implementation was excluded. |
| `tab-link-name` | Saved-link extension in desktop tabs | Existing polish backlog. |
| `composer-focus` | Focus after sending a request or rule | Existing polish backlog. |
| `plain-file-names` | Extensions in search/actions/changes | Existing polish backlog. |

The new findings need coordinator triage and named regressions before phase closure. The reviewer must not directly flip existing proofs or register changes in the coordinator's shared records.

## Planning assessment

### Phase 2

The implementation broadly follows tasks 1-14: note formatting, fake/HTTP Drive, folder seeding and indexing, file and inbox operations, actual uploads, fake/HTTP Worker, live sources, source selection, acceptance tests, duplicate/retry handling and the PWA shell are present. That coverage is meaningful, but does not prove the interactions identified above.

The original phase-2 plan is a historical implementation recipe: its checkboxes are still unchecked, its closure example expects 14/14 entries, and its top directive makes Superpowers mandatory. Current harness documents use a larger ledger, assigned ownership, frozen review targets and optional skills. Add an explicit historical/superseded banner and a link to the current closure procedure. Agents should not infer current work from old checkbox state or select a task independently of its assignment.

The closure ledger correctly requires all registered fixes, final revision gates, fresh independent review and evaluation, and owner acceptance of deferrals. Keep those conditions. Neither historical green gates nor a majority of passing entries justifies closing the phase.

Owner decisions still pending in `docs/harness/2026-10-05-phase-2-closure.md:47`: offline reading, uploads surviving app closure, and real-Drive smoke tests deferred to phase 3. These are proposed deferrals, not accepted decisions. R1 is separate from the durable-queue decision and cannot be waived by that deferral alone.

### Phase 3: Worker

The same-site deployment, one OAuth client for app/runner, full Drive scope, encrypted refresh-token storage and narrow app contract are sound design boundaries. The Worker is explicitly not implemented. Before building, write its execution plan and specify server-side details: OAuth/session lifecycle; ticket lifetime, scope and replay protection; dispatch failures; run ownership and idempotency; authenticated runner callbacks; phase/version ordering; terminal-state/report persistence and failure recovery; deletion cleanup; limits and observable errors.

Retain a real-Drive integration gate for token refresh, pagination/search, resumable uploads, duplicate names, rename and modifiedTime behavior. The fake cannot establish Google's actual semantics. The documented read/check/write window is an integration limitation, not a newly discovered atomicity guarantee.

### Phase 4: runner

Deterministic scripts around a closed Claude operation list are the correct direction. The scripted fake proves some app behavior, not the semantics, recovery, cost or runtime of the future runner. Before implementation, define versioned operation schemas, validation and ownership checks, dependency/order rules, replay/idempotency, partial-write recovery, immutable-original retention, manifest format, report consistency, extraction/OCR caching, source citations and measurable latency/token budgets. Treat untrusted source content as data, never agent instructions.

There is a concrete cross-phase gap: `docs/specs/2026-10-04-who-does-what.md:86` promises "Undo this tidy-up" and phase 4 promises a manifest, but `RunSource` currently has only start/current/markSeen/subscribe and the Worker contract has no undo operation. This is future scope rather than a phase-2 bug. Specify authorization, endpoint/source/UI, conflict handling and exact recoverable operations before implementing the manifest, so the promise is implementable end to end.

### Harness and joint-agent setup

The current ownership model is sensible: shared startup instructions, one coordinator closing proof records, isolated implementers, independent immutable review, and explicit browser reservations. It prevented this review from interfering with an active implementation. Preserve those constraints. Optional plugins should remain conveniences, not substitutes for repository contracts or phase acceptance. The setup is not certified merely because instructions exist: a clean-start Claude-to-Codex coordination smoke test and final review on the coordinator's completed SHA remain necessary.

## Evidence and limits

- Archived exact committed target; no private Second Brain content or real Drive data used.
- Inspected architecture, data adapters, persistence/write paths, run handling, key screens, relevant tests, harness scripts, specs, execution plan, ledgers and startup/coordination documents.
- Checked harness records with their validation helper: no reported record problems; legacy proof hash matched. This checks record structure, not a fresh execution of every verify command.
- Ran four isolated synthetic Node probes loading the archived TypeScript through the installed compiler, with fake browser storage, fake Drive and controlled Worker responses. All four defects reproduced. The expected injected upload failure was logged.
- Reproduction script: `probes.cjs.txt`; the preserved portable version now requires the frozen repository root and TypeScript module path as arguments. It reads the installed TypeScript dependency from the project; it writes no project files and performs no network calls.
- Did not run fresh `pnpm check`, demo/fake Playwright, production PWA gates, manual phone/desktop evaluation, OAuth, real Drive, Cloudflare or GitHub Actions. Shared resources were owned by another coordinator. Historical test counts are not presented as this review's results.
- Findings apply to `ce42c12`, not automatically to subsequent edits. After corrections and the four existing entries, freeze the final SHA, run its full gates and obtain a fresh independent review/evaluation.

Recommended sequence: fix R1 and R2 first, then R3 and R4; close existing entries; record owner rulings; run final revision gates and independent evaluation/review; only then close phase 2 and design phase 3. No merge or push was performed by this review.
