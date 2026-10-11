# Packet: B9 markers

- **Entry:** `b9-markers`; worktree `/private/tmp/bower-b9-markers`; branch `b9-markers`; escalated: **yes**, as the prep calls all three stages escalated. `ui: false`: literal note content through existing readers. Designer verification still closes the entry.
- **Sessions:** TL-P4-29/TL-P4-57: a separate Codex red session, then implementation, an independent adversarial pass, and a fresh closing review. Reds use `gpt-6.1-sol medium` normally, `high` when escalated; this entry uses `high`. Implementation uses Sol `high` here (`medium` normally). Adversarial pass and closing review use `gpt-6-astra high`, as requested. Use `--tier standard`. Coordinator commits and runs restricted gates under the lock. Fix rounds use fresh sessions.
- **Rulings:** `DECISIONS.md` TL-P4-50, B9 Q1–Q6 and Order; accepted `2026-10-10-b9-prep.md`, entry rows, file ledger, reds and cases. Follow c05-timeline-list (ruled closed) and B6a. Then format → producers → corpus/lifecycle, with serial shared-file handoffs.
- **Research first:** reuse the prep's [CommonMark](https://spec.commonmark.org/0.31.2/#block-quotes), [Obsidian callouts](https://help.obsidian.md/callouts), [strict schemas](https://zod.dev/api) and [plan-then-execute](https://arxiv.org/html/2506.08837v1). Links were not fetched offline. No network. Reuse timeline-line, note-edit's original-app-derived byte splice, the closed planner and existing links/manifest/recovery homes.

## Owned files

- Format stage: `src/data/contracts/timeline-line.ts`, `src/data/contracts/timeline-line.test.ts` (new), `src/data/contracts/note-edit.ts`, `src/data/contracts/note-edit.test.ts`, `src/data/contracts/note-format.ts`, `src/data/vault/note-format.test.ts`, `src/data/contracts/run-manifest.test.ts`, `src/data/one-timeline-line.test.ts`.
- Producer stage: `runner/src/claude.ts`, `runner/test/claude-provider.test.ts`, `src/data/spine/scripted.ts`, `src/data/spine/scripted.test.ts`, `runner/test/b9-markers.test.ts` (new).
- Proof stage: `runner/test/b9-corpus.test.ts` (new), `runner/test/b9-lifecycle.test.ts` (new), `runner/test/main.test.ts`, `runner/test/corpus-driver.test.ts`, `src/features/note/markdown.test.tsx`, `e2e/c05-person-notes.spec.ts`.
- Case 1: `harness/corpus/c17-b9-contradiction-two-sources/case.json`, `harness/corpus/c17-b9-contradiction-two-sources/expected.json`, `harness/corpus/c17-b9-contradiction-two-sources/replies.json`, `harness/corpus/c17-b9-contradiction-two-sources/rubric.md`.
- Case 2: `harness/corpus/c17-b9-uncertain-and-inferred/case.json`, `harness/corpus/c17-b9-uncertain-and-inferred/expected.json`, `harness/corpus/c17-b9-uncertain-and-inferred/replies.json`, `harness/corpus/c17-b9-uncertain-and-inferred/rubric.md`.
- Case 3: `harness/corpus/c17-b9-legacy-readable/case.json`, `harness/corpus/c17-b9-legacy-readable/expected.json`, `harness/corpus/c17-b9-legacy-readable/replies.json`, `harness/corpus/c17-b9-legacy-readable/rubric.md`.
- Case 4: `harness/corpus/c17-b9-person-list-kept/case.json`, `harness/corpus/c17-b9-person-list-kept/expected.json`, `harness/corpus/c17-b9-person-list-kept/replies.json`, `harness/corpus/c17-b9-person-list-kept/rubric.md`.
- Ledger docs: `harness/corpus/README.md`, `docs/harness/2026-10-08-p4-method-rubric-changes.md`, `docs/harness/2026-10-10-b9-prep.md`; notes path below. Seeds and inputs stay fixed. No directory wildcard grants ownership.
- **Overlap / waits:** `runner/src/claude.ts` and its test wait for B1d and B5b/B5c's provider handoffs. `src/data/spine/scripted.ts` and its test wait for B5b, then B5c. The prep flags `note-edit.ts`, `note-format.ts` and their tests as shared with B4a/B11 and B1/B2/B5/B6; B5c also owns the profile guard. Get those contract files back before format work. Other listed producer owners include Q1, B2/B3/B6/B4/B11; confirm B7/B8 handoffs too. Do not infer completion from the prep snapshot.

## Contract

1. **Q1 — one grammar.** Keep persisted `{date,text,source}` and existing Timeline parsing/writing. Materialize markers before manifest authoring. One helper owns `contradiction`, `uncertain`, `inferred`; output is `Contradiction: <text>`, `Uncertain: <text>`, or `<text> (inferred)`. No migration, registry or new section. Stored old/unknown text stays literal. Invalid ownership still refuses.
2. **Q2 — qualification.** Preserve both conflicting claims and their period/unit. Explicit uncertainty keeps its condition and undecided status. Inference is qualified, grounded and nonnumeric. Never infer sensitive facts, preferences, rules, schemas or scores. Markers grant no action authority. C07 owns detection and temporal meaning.
3. **Q3 — bound references.** Optional `marker` uses the closed enum. Optional `alsoCites` has at most one reference and requires a marker. Bind it by exact id through VaultIndex to an already shown source link or admitted evidence. Never guess from a basename or download another neighbourhood. Contradiction requires two distinct bound source ids. Keep the terminal source; append the canonical ` (also from [[<source>]])` suffix after the label/qualifier. Validate safe reference encoding. Final decorated text is at most **200** characters; refuse/retry, never clip. Keep date/source checks, one physical line and the **20-line** reply cap. Raw links, controls, separators and unknown new kinds refuse before writes.
4. **Q4 — ownership.** Structured markers belong only in existing Bower regions. A marker on a person's C05 append refuses through the existing retry. Preserve literal marker-shaped person/source bytes. A named ordinary append keeps C05's exact splice, bullet and EOL. Never adopt a note, rewrite Source bodies or create a Source/MOC Timeline. Keep Current state grants and protections.
5. **Q5 — lifecycle.** Format after final names/id binding, before dedup and effects. Two lines for one target become one edit. Compare final text/source. Use existing operation ids, manifests, fences, checkpoints, barrier and C13 inverse. Every write/move/Bin passes what it read; mutate bytes/name/place between read and act in tests. Lost responses, retries and done redispatch add no duplicate. Preserve canonical citation links and qualifiers through keep/link rewrite. Later resolution adds a sourced C07 line; no marker store, maintain write or post-run call. Report only applied outcomes. Zero extra model calls or reference-only downloads; reuse B1's five-note selection/cache and aggregate budgets.
6. **Q6 — reading.** Existing Timeline/Inline/Markdown shows literal labels and ordinary source links. No badge, footnote, control, new report kind or question copy. Timeline text has no `>` prefix. The same formatter may supply ordinary quotes to an already authorized prose producer; B4/B5/B6 own those writes. Designer verifies the built reading on phone and desktop. Any new app appearance or behaviour returns to designer → owner → lead before implementation.

## Reds

Exact proposed test names below; each includes its positive control. Prove effects through production `main` or the existing corpus driver, not helpers alone. All inputs are made up.

- `c17-b9-contradiction-two-sources`: refuse one-source, duplicate-id or guessed evidence; control: 1,450 versus 1,580 for the same period, both exact source ids, neither confirmed, earlier history/person bytes retained.
- `c17-b9-uncertain-and-inferred`: refuse cancellation, invented numbers or a resolved winner; control: conditional garden uncertainty and qualified booking inference, two entries in one target edit, booking/Alex prose unchanged.
- `c17-b9-field-boundary`: refuse 201 decorated characters, bad date/source/enum, controls, separators, raw links and invalid extra references; control: exactly 200 canonical characters with valid bound ids.
- `b9-marker-person-refused`: refuse structured marker intent on a personal target before effects; control: ordinary named C05 append succeeds, and a valid Bower-region marker succeeds.
- `c17-b9-legacy-readable`: old callout/unknown/uncited text must not fail new-write validation on read; control: v2/legacy/plain/star/CRLF notes and old manifests retain literal text/source and ownership boundaries.
- `c17-b9-person-list-kept`: reject normalization or duplicate replay insertion; control: one exact ordinary star-bullet splice, prior CRLF/metadata/markers and unnamed prose unchanged.
- `c17-b9-person-non-list`: refuse missing/prose/table/code Timeline targets; control: valid list append and independently clear work follow C05 settlement.
- `c17-b9-resume-and-resolve`: reject duplicate sends after lost response, crash or done redispatch; control: same materialized entry/manifest applies once, dated resolution is another line, supported rename and Undo retain correct links/inverse evidence.
- `b9-keep-citation-and-qualifier`: reject lost older-source links or qualifiers during keep; control: real pair-answer/main path preserves suffix, terminal source and qualifier, while ordinary link-to-text behavior stays unchanged.
- `b9-marker-read-to-act-fence`: changed bytes/version/name/place refuse the affected operation; control: unchanged target applies once and only settled work reports updated.
- `b9-marker-literal-display`: reject hidden labels/links or special callout rendering; control: actual note DOM shows the exact label/qualifier and both links through existing rendering.
- `c17-b9-temporal-change`: do not label different periods a conflict or ask unnecessarily; control: ordinary sourced dated history. Transport tests are deterministic; C07 semantic acceptance remains separate.

## Verify

Run every exact red above and the complete suites of the owned test files. Execute all four delivered cases with B1d selection then execution replies, exact ids and byte/DOM oracles. Re-applying the same entry and same-run redispatch must prove dedup; an empty second-press reply alone does not. Reuse `redispatchCase` and existing fault injection. No wall-time waits or live model calls.
Run C05, B6a and shared contract compatibility suites, corpus/method gates, then `pnpm check`. Run touched-note `e2e/c05-person-notes.spec.ts`; corpus/fake fixture edits require full `pnpm e2e:fake`. Integration/freeze run full suites. Use `bash harness/with-lock.sh` for check/e2e. Output goes to OS-temp files; read failures only. Record exact tests, id/byte assertions and deterministic versus model verdicts. The prep's 4 files / 38 tests prove fixture validation only; keep `covers:model` pending semantic acceptance. Reviewers are read-only, unit/contract tests only: no server, e2e or main-checkout switch. Close after designer verification.

## Commits

Tests-only red → fix → notes alone: `docs/harness/2026-10-11-b9-markers-notes.md`, line 3 `implementer: codex`. Record exact red/green names, unchanged bounds, calls, corpus/display/recovery evidence, `tests changed:` reasons and `removed:` lines. Reply with the WORKER.md card; each line under 120 characters.

## Open for the lead

- Confirm bundling the prep's three separately reviewed entries into this requested entry, or retain separate stage review chains. The packet does not silently cancel those chains.
- Allocate upstream H1/H2 support before corpus proof: `runner/src/corpus.ts`, `runner/test/corpus.test.ts`, `runner/test/second-brain-method.test.ts`; `runner/test/corpus-run.ts` only if named-step/id/byte observations remain missing. These are not B9-owned. Allocate any new case folders/inputs for proposed cases 5–8 explicitly.
- Confirm exact current handoffs, especially B4a's shared-contract intersection. No `ownership-format.ts`, production `run-manifest.ts`, `types.ts`, `layout.ts`, `questions.ts`, `answer-loop.ts`, `main.ts`, `index.ts`, engine/barrier or B4/B11 store is owned. Return any required scope expansion to the lead.

## Ruled

- TL-P4-50 accepts all six recommendations. The prep's six pending sign-offs are settled: plain compatible storage, qualified evidence, one extra bound source, Bower regions only, existing lifecycle and literal reading with a designer check.
- TL-P4-50 Order wins over the prep's historical pending C05 gate: c05-timeline-list is ruled closed; B9 follows it and B6a. Shared-file ownership still needs handoff.
- The requested Sol red/implementation and Astra-high adversarial/closing sessions replace the prep's Claude closing review. `standard` follows TL-P4-57 addendum 1. Its Sol-high closing mapping differs from the requested Astra-high closing review; this packet follows the explicit request.
- No new marker decision is supplied here. Open items above are allocation and dispatch questions, not permission to add mechanisms.
