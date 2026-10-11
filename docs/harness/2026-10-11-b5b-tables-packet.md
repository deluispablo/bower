# Packet: B5b, table context and proposals

- **Entry:** `b5b-tables`; worktree `/private/tmp/bower-b5b-tables`; branch `b5b-tables`; escalated: yes; `ui: true`.
- **Sessions:** TL-P4-29/TL-P4-57: separate Codex red and implementation sessions, each `gpt-6-astra high`; independent adversarial pass `gpt-6-astra xhigh`; fresh closing review `gpt-6-astra high`; all Fast. Coordinator commits and runs restricted gates under the lock; fresh sessions for fixes.
- **Rulings:** `2026-10-10-tl-p4-47-b56-contract.md` Q1–Q7 and order; accepted prep B5b row, ledger, reds/cases; DECISIONS TL-P4-47 addenda 1–4; TL-P4-41 addenda 19–20. Consume landed B5a contracts/P4-112 handoff and B6a templates; upstream ownership lasts until handoff.
- **Research first:** reuse the locally cited [closed JSON objects](https://json-schema.org/understanding-json-schema/reference/object#additionalproperties), [ISO currencies](https://www.iso.org/iso-4217-currency-codes.html), [ISO dates](https://www.iso.org/iso-8601-date-and-time-format.html), [bounded tolerant reads](https://www.rfc-editor.org/rfc/rfc9413.html) and [Zod schemas](https://zod.dev/api). No network; citations are not independently reverified. Reuse existing parsers, planner, questions, answer loop and effects.

## Owned files

- `runner/src/type-table.ts`, `runner/test/type-table.test.ts`, `runner/test/b5-incorporation.test.ts`, `runner/test/ask-answer-loop.test.ts`.
- `src/data/spine/scripted.ts`, `src/data/spine/scripted.test.ts`, `src/data/spine/engine.ts`, `src/data/spine/engine.test.ts`, `src/data/answer-loop.ts`, `src/data/answer-loop.test.ts`; shared files pass to B5c only after handoff.
- Table: `src/data/contracts/types.ts`, `src/data/contracts/note-format.ts`, `src/data/vault/note-format.test.ts`, `src/features/files/FolderScreen.tsx`, `e2e/folder-table.spec.ts`; preserve landed B6a changes.
- `harness/unused-production-baseline.json`, limited to B5b’s named removals; notes path below. B1d-owned files are excluded.

## Contract

1. **Context and precedence.** Consume `.bower/type-table.json` through B5a’s versioned reader; render Markdown at prompt position 2 through B1d’s handoff. Eight seeds include cover letter; first matching row wins, accepted rows precede generic fallbacks, and unknown kinds file immediately using the closest row.
2. **Validation.** Strict writes, lenient stored reads: skip invalid rows; unreadable tables use seeds without writing that run. Carry P4-112’s empty/all-invalid seed fallback and unknown-key preservation. Enforce text 200, list 10, enum 20, finite numbers, amount plus valid ISO currency and real ISO dates; share currency validation.
3. **Proposals.** Admit at most two new distinct payloads in item order and at most five open, including earlier runs. Deduplicate across questions/runs; ignored stays open, declined never returns. Immutable `.bower/proposals/<id>.json` and the authoritative question retain identical frozen payloads and evidence/acceptance provenance.
4. **Answers and recovery.** Proposal subjects survive filing and have no inbox two-round limit. Only boolean answers apply: yes starts the existing instructions continuation once and installs exactly the stored payload; no starts no run. Replays neither reinstall nor reopen; Q1 publishes after manifest persistence, and hot only projects authoritative state.
5. **Authority and writes.** Documents supply facts, never schema consent or column requests. A trusted explicit property request uses `requestTableColumn`, replacing the fourth when full and reporting through today’s done line. Table/proposal writes are planning effects; profile/template writes remain ordinary note effects; no added maintain writes, writer or consent store.
6. **Table selection.** Follow the owner-approved `docs/design/specs/2026-10-10-folder-table-type-columns.md` at `cd85b5ce`. Count notes, not folders; majority type wins, ties follow row order, other types leave empty cells. With no matched non-generic row, use first four property keys minus technical keys; retain all other note properties.
7. **Table behavior.** Name, optional existing Status pill, up to four declared property labels, Changed. Exclude type/status/summary/tags/created/updated/source/related and existing kind/folder exclusions. Preserve header controls, sideways scroll and structure; apply the value/sort rules below.
8. **Compatibility and fences.** Reuse B6a’s template declarations, scalar serializer and single authored-field grounding check; preserve personal typed Source/MOC edits, Bower Source immutability and legacy Timelines. Match ids; writes pass read versions, moves/renames pass `stillAsSeen`; concurrent change refuses while unchanged controls succeed.
9. **Handoff cleanup.** Remove landed baseline rows for note-format `propertyValuesOk`, `tableProperties` and the whole `runner/src/type-table.ts`. After B1d, remove the replacement export baselines for `insertTypeRow`, `requestTableColumn`, `firstMatchingRow` when wired; if the last has no production caller, delete it and its test per addendum 20.

## What the person sees

Text/enum stay as written; lists join with ", "; money uses `Intl.NumberFormat` currency style, whole amounts without decimals; numbers use equivalent numeric formatting; dates use the existing short format. Numeric headers/cells align right with tabular figures. Typed sorting uses amount/date, text uses existing numeric `localeCompare`, and empties stay last both ways. The approved table follows verbatim:

| Situation | What shows |
| --- | --- |
| A folder of one type (job offers) | Name, Status (if any), its declared columns (Company, Salary, Location), Changed. No Summary, Tags, Source or Created column. |
| A type declaring more than 4 columns | Only its first 4. |
| A type declaring status | Status shows once, in today's Status column with its pill. |
| A mixed folder (2 job offers, 1 cover letter) | The job offer columns; the cover letter's cells are empty. |
| A tie between two types | The columns of the row that comes first in the type table. |
| A folder with no typed notes | Today's columns, minus the technical keys. |
| Money and numbers | "€48,000", right-aligned with tabular figures; sorting orders them by amount. |
| A column the person asked for | It stands in the 4th place; the report's detail says `"<request>" done`. |
| Phone at 375 | The same table, scrolling sideways as today. |

## Reds

Exact proposed names; each includes its stated positive control. Made-up data only; runtime promises go through production `main`/answer loop, Table promises through the screen.
- `b5-first-row-controls-context`: offer/CV beats generic rows at position 2; control: ordinary generic material still files correctly.
- `b5-unknown-files-and-two-proposals`: three novel kinds file with only two distinct proposals, respecting existing open cards; control: capacity admits an eligible new payload in item order.
- `b5-proposal-yes-no-ignore-replay`: persist decline, ignored state and cross-run dedup; reject text/options and changed payloads; control: exact yes installs once, no starts no run, unrelated eligible proposals remain possible.
- `b5-document-cannot-teach-schema`: source instructions cannot install rows or choose columns; control: subject-bound explicit person words and frozen-payload yes retain their respective authority.
- `b5-table-first-create-and-lenient-read`: missing/empty/all-invalid tables use seeds, unreadable tables prohibit writes, rewrites retain unknown stored keys; control: a valid table remains usable and first creation succeeds through the ruled existing mechanism.
- `b5-typed-property-bounds`: reject undeclared/oversize values and invalid dates/currencies; control: all six valid kinds at their ruled boundaries pass through planning and validation.
- `b5-folder-table-approved-states`: test every verbatim row, generic fallback, lists/dates, typed sorting and empty-last both ways; control: existing Name/Status/Changed controls and nonprojected note properties remain usable.
- `b5-explicit-column-replaces-fourth`: forged source request leaves columns unchanged; control: trusted request replaces column four and produces today’s truthful done detail.
- `b5-read-to-act-fence`: mutate text/name/place between read and act; control: unchanged id-bound targets succeed without duplicate application.
- `b5-landed-contract-compatibility`: preserve B6a grounding, personal typed-note edits and legacy reads; control: grounded Bower template creation still succeeds while invented links are refused.
- `b5-unused-baselines-removed`: fail while any handed-off B5b baseline remains; control: actual production callers pass the unused gate, or the permitted unused `firstMatchingRow` helper/test is removed.

## Verify

Run every exact red and the complete owned test suites, B5a/B6a compatibility, runner corpus and method gates, then `pnpm check`. Run `e2e/folder-table.spec.ts` on demo/fake at 375/1440, with WCAG 2.2 axe tags and `target-size`; require designer `verified`. Fixture changes require full `pnpm e2e:fake`; integration runs full suites. Record named call/count deltas using the shared read cache; timing growth above 20% returns to the lead.
Output to OS-temp files; read failures only. Reviewers run unit/contract tests only, no server/e2e/main-checkout switch. Preserve assertions; disclose contradictions and missing allocations.

## Commits

Tests-only red, then fix, then notes alone: `docs/harness/2026-10-11-b5b-tables-notes.md`, line 3 `implementer: codex`. Record exact verification, compatibility, named calls and `removed:` lines; reply with the WORKER.md card.

## Open for the lead

- Prep allocates `runner/src/claude.ts`, currently B1d-owned; its provider test also overlaps the reference B1d packet. Resolve that handoff before prompt/execution wiring. Do not edit B1d’s `model-input.ts`, `drive.ts`, `index.ts`, `main.ts`, `timing.ts` or `src/data/vault/vault-index.ts`.
- Specify the existing app data path for loading row declarations into Table; the ledger does not allocate that transport. Allocate any needed contract/creation-path changes: `write-runner-json` currently needs an existing file. Identify durable decline/payload lookup within existing homes, without a new store.
- P4-112 requires row/property-count bounds but gives no numbers; strict closed rows conflict with preserving unknown stored keys unless the read/rewrite boundary is specified. Its `profile-rewrite` `byBower` guard needs `note-edit.ts`/tests allocated or an explicit B5c handoff.
- Allocate any corpus/driver/golden changes outside this ledger. B1d owns driver/scorer work; do not duplicate it. No contract gap above is delegated as an implementation ruling.

