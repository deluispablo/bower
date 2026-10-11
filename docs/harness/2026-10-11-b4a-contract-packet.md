
# Packet: B4a, About me shape and contracts

- **Entry:** `b4a-contract`; worktree `/private/tmp/bower-b4a-contract`; branch `b4a-contract`; escalated: yes; `ui: false` (TL-P4-48 Q9: note content and existing rows).
- **Sessions:** TL-P4-29/TL-P4-57: separate Codex red, implementation, read-only adversarial and fresh closing-review sessions. Fast tier throughout; `gpt-6-astra high` for escalated reds, implementation and closing review; `gpt-6-astra xhigh` for adversarial. Fresh sessions for fixes; coordinator owns commits and restricted gates.
- **Order:** first B4 entry, after landed B5a/B6a and contract-file handoffs from B1a/B1c/Q1a. B4b consumes this contract; B4c follows B4b.
- **Rulings:** `docs/harness/2026-10-10-tl-p4-48-b4-b11-contract.md`, B4 Q1–Q8 and Order; `docs/harness/2026-10-10-b4-prep.md`, B4a ledger and accepted cases, with contract overrides.
- **Rulings:** DECISIONS TL-P4-48 drops own-text observations/deletion tracking and case 4; accepts `forget-fact`; removes the About me file-id segment from archive paths. TL-P4-41 addendum 8 supplies the existing parser for opaque, preserved outside bytes.
- **Research first:** reuse the prep’s offline [episodic-memory reference](https://arxiv.org/pdf/2605.12978), [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) and [Zod declarations](https://zod.dev/api). Citations are prior research, not new verification; no network or new library.

## Owned files

- `src/data/contracts/observations.ts` (new), `src/data/contracts/observations.test.ts` (new).
- `src/data/contracts/ownership-format.ts`, `src/data/vault/ownership-format.test.ts`.
- `src/data/contracts/note-edit.ts`, `src/data/contracts/note-edit.test.ts`, `src/data/contracts/folder-template.ts`.
- `src/data/contracts/run-manifest.ts`, `src/data/contracts/run-manifest.test.ts`, `src/data/vault/layout.ts`.
- `runner/src/spine/admitted.ts`, `runner/test/admitted.test.ts`, `runner/test/b4-contract.test.ts` (new).
- Notes file named under Commits. No B1d-owned file; no runtime wiring in this entry.

## Contract

1. Extend the one ownership parser with trailing regions `about-you`, `about-working-on`, `about-preferences`, labelled About you, What you're working on, How you like things, beneath `## What Bower has learned`.
2. Append the section once as bytes; preserve all preceding personal text/front matter. Never infer ownership from headings or whole-file `by:bower`. Missing About me uses the existing folder template; duplicate notes or damaged marks refuse memory writes.
3. Declare one versioned JSONL ledger at `.bower/observations.jsonl`: script-issued event/fact ids, section, date, text ≤200 characters, source id/hash and typed admitted origin; observation, tombstone and consolidation events share this home.
4. Resolve provenance from admitted capture or validated lineage, never model-asserted origin. Documents may describe explicit subjects, but cannot supply preferences, sensitive facts, rules or schema. Personal About me text is direct trusted context, never an observation source.
5. Deduplicate evidence/events and retain fact/source tombstones across same-source replay and version changes. Explicit later remembering creates a new observation; it never erases a tombstone. Torn/unreadable logs freeze memory writes and produce a BowerError.
6. Encode budgets of 400/400/200 authored words. Consolidation requires `words > budget` and ≥5 new live observations since that section’s successful frontier; duplicates/tombstones do not count. Forget and Undo rebuild without this gate.
7. Admit only the explicit JSONL and `.bower/archive/about-me/<section>/<date>-<op id>.md` artifacts and narrowly marked note edits. Archives are write-once exact pre-consolidation sections; no broad `.bower/**` permission or whole-JSON parsing of JSONL.
8. Represent frozen text and ordered dependencies in the existing manifest: ledger event → confirmed archive when consolidating → one About me edit → successful frontier → maintain/barrier. Every content edit passes its read version; preserve old manifests, ownership, MOC, profile, template and Current state behavior.
9. Contracts support Undo origin invalidation and evidence rebuild without restoring forgotten facts, and B1d’s position-4 context with ≤4,000 characters of learned content, an honest cut mark and separately typed personal input.

## Reds

Exact proposed names in the owned contract tests; made-up data only. Exercise production parsers, author, admission and manifest validators.
- `b4a-composite-byte-append`: preserve personal/front-matter bytes and refuse duplicate/damaged targets; control: valid legacy-prefix append and missing-note template initialization succeed.
- `b4a-existing-regions-compatible`: reject permission outside the new marks; control: existing MOC/profile/template edits and Current state protection retain their behavior.
- `b4a-admitted-origin-only`: reject document preference/sensitive/policy claims and own-text observations; control: admitted words and explicit document-subject biography validate.
- `b4a-ledger-identity-and-corruption`: reject malformed/torn evidence and replay resurrection; control: valid events deduplicate and explicit new remembering retains the tombstone.
- `b4a-section-gate`: refuse consolidation at the budget or with four new live facts; control: over-budget with five qualifies, and Forget/Undo bypass the gate.
- `b4a-artifact-scope-and-order`: refuse arbitrary paths, old file-id archive paths and premature frontiers; control: exact allowed artifacts and correctly ordered frozen effects validate.
- `b4a-read-version-fence`: changed bytes/version refuse the edit; control: the same authored edit succeeds against unchanged read evidence.
- `b4a-context-and-undo-contract`: mixed trusted blobs and archive-based restoration fail; control: typed bounded context and live-evidence rebuilding validate.

## Verify

Run every named red, all owned test files, and landed B1a/B1c/B5a/B6a/Q1a compatibility tests; coordinator runs `pnpm check`. Any corpus/demo/fake fixture change requires full `pnpm e2e:fake`; integration runs full suites. Write output to temp logs and read failures only. Reviewers run unit/contract tests only, without servers, e2e or main-checkout switches.

## Commits

Tests-only red, then implementation, then notes alone: `docs/harness/2026-10-11-b4a-contract-notes.md`; line 3 exactly `implementer: codex`. Record exact reds, compatibility evidence, named calls and `removed:` lines; worker reply uses the WORKER.md card.

## Open for the lead

- Q9 requires `forget-fact`, but landed `src/data/contracts/questions.ts` accepts only `file-to`; allocate that file and its tests explicitly to B4a or a prerequisite. They are absent from the accepted prep ledger.
- If new region exposure needs `src/data/contracts/note-format.ts`, allocate it explicitly; reuse it unchanged otherwise.
- No B1d overlap in this ledger. Runtime proof and position-4 assembly remain dependent on B4b/B4c and B1d handoffs.

