# Packet: B1d, two-step selection and neighbourhood (escalated)

- **Entry:** `b1d-selection`. Worktree `/private/tmp/bower-b1d-selection`, branch `b1d-selection`. Escalated for selection authority and shared budgets.
  - Codex red session (tests only); Codex implementation after the shared-file handoffs.
  - Codex read-only pass, then a fresh Claude review.
  - `ui: false`: reuse approved questions and existing reports; no new copy or controls.
- **Rulings:**
  - `docs/harness/2026-10-10-tl-p4-41-b1-contract.md`: Q2, Q7–Q9 and B1d's order row; prep B1d row, P2/P3/P5/P6, cases 1/2/5/7/9 and H2/H6.
  - DECISIONS TL-P4-41 addenda 3/4: name every added call; planning and maintain reuse the run's read cache, including retrieval discovery.
  - Landed B1a/B1c: one maintain effect, index and MOC maintenance; cold index rebuilt in memory before planning and persisted afterward; warm changed prefixes use one Range request without metadata prechecks.
  - TL-P4-43 and TL-P4-44: Q1a's stored `file-to` actions bind 2–4 script candidate folders, now drawn from B1d's list; Q1c owns live publication.
  - Landed B3b: bounded hot at prompt position 6; preserve Recent changes op keys, deduplication and Undo handling.
  - B12 Q5's “B1d's one ledger” is recorded under TL-P4-52: no preparation checkpoint; a pre-manifest crash writes nothing and re-resolves on retry.
- **Research first:** reuse the prep's offline citations: [curated context and just-in-time retrieval](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [plan then execute](https://arxiv.org/html/2506.08837v1), [stable prompt prefixes](https://platform.claude.com/docs/en/build-with-claude/prompt-caching). No network; citations are not independently reverified.

## Owned files

- `runner/src/claude.ts`, `runner/test/claude-provider.test.ts`, `src/data/vault/vault-index.ts`.
- `runner/src/timing.ts`, `runner/test/timing-counts.test.ts`, `runner/src/main.ts`, `runner/test/main.test.ts`.
- `runner/test/b1-planning.test.ts` (new), `harness/corpus/b1-index-job-offer/**`, `harness/corpus/b1-changes-person-edit/**`.
- Reconcile handoffs before implementation: retain B1c/B3b's `claude.ts` and `main.ts` work, Q1c's publication callbacks, and B3b's timing pins. Consume index/maintain, scripted questions and publication through their existing homes; their other files are outside this ledger.

## Contract

1. **Refresh first.** Both steps use refreshed scoped ids, versions, summaries and coverage. Cold planning uses B1c's in-memory index without writes; warm planning shares discovery and changed-prefix reads with maintain. Never fall back to twelve hubs.
2. **Selection.** Step 1 returns the closed `{ items: [{ itemId, kind, destination, wants }], asks }`: admitted item ids; type-row id or `unknown`; existing folder id or `{ parentId, name }`; at most five note ids per source.
3. **Candidates.** Script builds the list from index ids, neighbourhood and folded MOC ids through VaultIndex. The model selects only listed ids, never paths or invented ids. Resolve properties, links and destination hub/MOC through existing parsers and retrieval.
4. **Bounds.** Words-only piles count as sources. Pinned answer/pair notes and script neighbourhood count within five L3 notes per source. Deduplicate physical reads while retaining each source's accounting. A requested folded MOC exposes its members once per step through the same bounded retrieval path.
5. **Execution authority.** Freeze ids and destinations before step 2. Its allowed targets are exactly chosen ids, the destination folder and its hub/MOC. Use existing closed execution intents, ownership checks and one merged edit per file; readable personal evidence grants no write permission.
6. **Incomplete context.** Keep the index's cut notice and coverage. No match in a cut index never authorizes a new destination; bounded expansion or an existing Q1 asking leaves that subject waiting while clear work proceeds.
7. **Questions.** Reuse Q1a's script-bound actions and subject provenance; the model picks candidates and words the asking. Preserve stored option ids, unavailable-folder re-asking, member rounds/exhaustion and Q1c's nonfatal display bounds. Publication follows manifest persistence.
8. **One ledger.** RunTiming aggregates both semantic calls, every validation retry, actual tokens, Drive calls/bytes, operations and phase time. Keep 32,000 index characters, 24,000 note characters, 48,000 source characters, maintenance's 300-call cap and the 20% whole-run reserve.
9. **Lifecycle and fences.** Preserve stored-answer paths that need no model. No writes before the frozen manifest; recovery uses the existing manifest/checkpoint/barrier. Every content write passes its read version; moves/renames pass stillAsSeen. Match by id; source instructions and derived summaries cannot broaden authority.

## Reds (a separate Codex session, through runner `main` or the corpus driver)

Exact proposed names below; each includes its positive control. Use made-up data, injected clock/stats and production-only traffic counts.
- `b1-index-job-offer`: reach the relevant hub after twelve distractors; control: file the offer with its real related links, preserve personal Applications and unrelated hubs.
- `b1-changes-person-edit`: next run sees changed summary/version before both calls; control: unchanged Garden plans stays byte-identical without another media read.
- `b1-cut-index-no-new-destination`: refuse creation justified only by a cut-index miss; control: expand an existing destination by id or ask while a clear sibling files.
- `b1-five-per-source`: six candidates for each of two sources cannot exceed five, including pinned/script notes; control: five accepted per source and a shared note physically read once.
- `b1-selection-closed-ids`: reject invented ids, paths, kinds and destinations; control: valid listed ids and a valid parent/name proposal reach execution.
- `b1-folded-moc-expansion`: enforce one expansion per step and shared bounds; control: listed members become selectable through the existing retrieval path.
- `b1-target-injection`: poisoned source/MOC text cannot add unrelated targets or Rules writes; control: permitted trusted filing and hub update succeed.
- `b1-read-to-act-fence`: change target text/name/place between read and act; control: unchanged target succeeds, changed target is refused by its existing fence.
- `b1-question-candidate-binding`: fabricated/fifth options fail; control: 2–4 listed folder actions retain id binding after rename, and clear work files beside waiting work.
- `b1-shared-ledger`: both calls and retries share limits and aggregate usage; control: a within-bound run completes with exact injected totals.
- `b1-refresh-cache-hot-order`: no duplicate discovery/prefix reads and hot stays at position 6 with op keys; control: changed-prefix refresh and settled maintain complete.
- `b1-pre-manifest-retry`: failure before the manifest writes nothing; control: redispatch re-resolves and completes, while post-manifest recovery resumes without replanning.

## Goldens

They rise only by named calls, pinned per fixture with measured cold/warm deltas in the notes. Reuse the run's read cache; exclude seeding and inspection traffic. Preserve landed B1c/B3b pins except explained additions; a time delta above 20% returns to the lead. Golden files outside the ledger require allocation.

## Verify

Run every exact red above, provider/main/timing tests, B1a/B1c, Q1a/Q1c and B3b compatibility tests, corpus and method gates, then `pnpm check`. Fixture changes require full `pnpm e2e:fake`; integration runs full suites. Output to OS-temp files; read failures only. Reviewers run unit/contract tests only, with no server, e2e or main-checkout switch; fix rounds use fresh sessions.

## Commits

Tests-only red, then fix, then notes alone: `docs/harness/2026-10-11-b1d-selection-notes.md`, line 3 `implementer: codex`; record exact reds, named calls, `removed:` lines and compatibility rows. Worker reply uses the WORKER.md card.

## Ruled (TL-P4-41 addendum 13)

1. **Neighbourhood by script.**
   - Candidates come from title or summary whole-word matches on the item's own words, then their folder's hub or MOC, then one-link neighbours.
   - Ties break by recency, then path. At most 30 candidates per item.
   - Showing an expansion is not a read; picked members count within the five wants.
   - A new subfolder's `parentId` must be a visible candidate folder (not Inbox, `.bower` or root). It passes checkCreationName plus a near-duplicate check, and there is at most one new subfolder per item. Templates stay with B6.
2. **Ledger.**
   - Selection and execution each get one retry (four calls at most).
   - They are bounded by the ruled 32k/24k/48k characters, and at most 200 operations.
   - On exhaustion the items wait, with the existing set-aside row.
3. **Ownership.** B1d owns its H2/H6 driver and golden files (`runner/test/corpus-run.ts`, `runner/src/corpus.ts`, `runner/test/corpus-driver.test.ts` and the goldens it moves).
