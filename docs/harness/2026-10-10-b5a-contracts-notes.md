# B5a contracts: red-owner delivery — 2026-10-10

implementer: codex

Worktree: `/private/tmp/bower-b5a-contracts`; branch: `b5a-contracts`.
Baseline HEAD: `54f1694ac435774d36356454564a217fb633c116`.
Tests only, plus this delivery note. No git write command, network, runtime edit or corpus edit.
The coordinator owns the red commit and the separate notes commit.

## Contract basis and offline research

Read WORKER.md, the B5a packet, TL-P4-47 Q1/Q3/Q4/Q7 and addendum 1,
TL-P4-41 addendum 4, TL-P4-45 and TL-P4-38's seed appendix through local files.
Read the preparation's B5a rows, file ledger and cited F2/F3/F5/F7/F13/U1/U2/R2,
including TL-P4-39 addendum 2's narrowing of new regions. Later rulings override
preparation references to Markdown tables and additional maintain writes.

Offline standard references (no pages fetched in this session):

- [JSON Schema closed objects](https://json-schema.org/understanding-json-schema/reference/object#additionalproperties):
  strict declarations on write; the reader alone skips invalid rows. Version the enclosing table.
- [ISO 4217 currency codes](https://www.iso.org/iso-4217-currency-codes.html): money carries amount and currency;
  an absent or invented currency cannot pass merely because the amount is finite.
- [ISO 8601 dates](https://www.iso.org/iso-8601-date-and-time-format.html): calendar dates use year-month-day;
  lexical shape alone must not admit an impossible leap day.
- [RFC 9413, robustness principle](https://www.rfc-editor.org/rfc/rfc9413.html): Postel-style tolerance belongs
  only at the bounded legacy reader. It grants no schema authority and never loosens new writes.

Reuse ownership-format/note-edit, note-format, questions/answer-loop, manifest validators,
RUNNER_WRITES and dot-path hiding. No new effect kind, writer, store, parser for notes or maintain path.

## Reds

Every exact test name below failed as an assertion against baseline runtime code.
All have positive controls; old-path controls run before new API/region assertions.
New parser/validator exports are imported optionally through a helper and checked with expect,
so the absent module/export is an assertion failure, not a collection or TypeScript error.
Boundary-specific assertions behind that missing-export check remain for the implementation run;
HEAD evidence proves the missing contract seam, not yet its future internal validation.

| Exact name | File |
| --- | --- |
| `B5a contracts: b5-row-schema-and-order` | `runner/test/type-table.test.ts` |
| `B5a contracts: strict writes and lenient invalid-row reads` | `runner/test/type-table.test.ts` |
| `B5a contracts: unreadable type table uses eight seeds and forbids a write that run` | `runner/test/type-table.test.ts` |
| `B5a contracts: b5-four-typed-columns` | `runner/test/type-table.test.ts` |
| `B5a contracts: typed value bound text 200/201` | `runner/test/type-table.test.ts` |
| `B5a contracts: typed value bound list 10/11` | `runner/test/type-table.test.ts` |
| `B5a contracts: typed value bound finite number` | `runner/test/type-table.test.ts` |
| `B5a contracts: typed value bound NaN number` | `runner/test/type-table.test.ts` |
| `B5a contracts: typed value bound ISO money currency` | `runner/test/type-table.test.ts` |
| `B5a contracts: typed value bound money missing currency` | `runner/test/type-table.test.ts` |
| `B5a contracts: typed value bound finite money amount` | `runner/test/type-table.test.ts` |
| `B5a contracts: typed value bound ISO real date` | `runner/test/type-table.test.ts` |
| `B5a contracts: typed value bound ISO date spelling` | `runner/test/type-table.test.ts` |
| `B5a contracts: typed value bound enum membership` | `runner/test/type-table.test.ts` |
| `B5a contracts: enum declares at most twenty values and group_by is enum or date-year` | `runner/test/type-table.test.ts` |
| `B5a contracts: b5-explicit-column-replaces-fourth` | `runner/test/type-table.test.ts` |
| `B5a contracts: versioned type table uses write-runner-json and rejects invalid new rows` | `src/data/contracts/run-manifest.test.ts` |
| `B5a contracts: immutable proposal and stored question share one exact payload identity` | `src/data/contracts/run-manifest.test.ts` |
| `B5a contracts: b5-proposal-exact-payload` | `src/data/contracts/questions.test.ts` |
| `B5a contracts: proposal answer records only its id and uses the existing continuation once` | `src/data/contracts/questions.test.ts` |
| `B5a contracts: b5-profile-region-bound` | `src/data/contracts/note-edit.test.ts` |
| `B5a contracts: profile refuses 401 words while its 400-word positive control succeeds` | `src/data/contracts/note-edit.test.ts` |
| `B5a contracts: profile never adopts person prose and never enlarges Current state` | `src/data/contracts/note-edit.test.ts` |
| `B5a contracts: declared projection keeps four ordered columns and retains other note properties` | `src/data/vault/note-format.test.ts` |
| `B5a contracts: profile has its own ownership mark beside the four old payloads` | `src/data/vault/ownership-format.test.ts` |

### Observed HEAD reasons

- Runner declaration tests: `readTypeTable`, `typeTableOk`, `propertyValuesOk` or
  `requestTableColumn` is undefined; expected a function. All 16 fail at that assertion.
- Declared note projection: `tableProperties` is undefined; expected a function.
- Proposal subject: folder returned; expected `{ kind: 'proposal', id: 'lease-1' }`.
- Proposal answer: the answer records its question id and boolean, but start has zero calls;
  expected one instructions continuation. The state-question control starts once.
- Type-table effect and exact proposal/question manifest: `{ ok: false, reason: 'shape' }`;
  expected acceptance of the new contract using existing effect kinds. Old rich manifests pass.
- Ownership profile mark: invalid returned; expected v2. Existing v2-rich bytes parse first.
- Three profile edit tests: `ok: false`; expected true for the marked, sourced positive profile.
  HEAD ownership rejects that new region before authoring; existing link-edit controls succeed.
  The same reds retain 400/401, person-note refusal, input immutability and separate state assertions.

### Additive API fixtures for the implementer

The packet does not spell function names or stored key syntax. These tests make the proposed
pure seams explicit for review, in the packet's existing homes:

- `runner/src/type-table.ts`: `readTypeTable(text | null)` returns `{ table, writeAllowed }`;
  `typeTableOk`, `propertyValuesOk`, `insertTypeRow`, `firstMatchingRow`, `requestTableColumn`.
  The table is `{ v: 1, rows }`; a row has slug `id`, `match`, `template`, `properties`, `table`
  and optional `group_by`. Type declarations use `type` and enum `values`. `group_by` names
  `property`, with `bucket: year` for a date. `firstMatchingRow` consumes matching row ids,
  proving row precedence without inventing a semantic classifier.
- `note-format.tableProperties(parsedNote, { table })` is an additive ordered projection of
  the existing Property model. It does not remove other properties or personal prose.
- The question carries `proposal: { id, payload }`; immutable JSON is `{ v: 1, id, payload }`.
  Payload examples use `{ kind: type-row, row }`. Stored question and artifact must agree exactly.
  Answers use the existing id/boolean home, never a payload copied from the answer.
- `profile-rewrite` is a note-edit change, with `recordIds`, `previous`, `text`; framing uses
  `bower:ownership/2 begin profile` and its matching end mark. It is not a new spine effect.
  The boundary fixture repeats only the invented CV's TypeScript fact with its CV citation;
  semantic extraction and source-grounding through main remain B5c evidence.

These are test-side signatures, not delivered production exports. Implementation must preserve
all existing assertions and hand these contracts back to the lead before B5b consumes them.

## Compatibility

| Fixture/read | Exact verify test | HEAD verdict |
| --- | --- | --- |
| `src/data/contracts/run-manifest.test.ts` | `B5a contracts: old manifest fixtures read with their original hashes and operations` | PASS |
| `src/data/contracts/run-manifest.test.ts` | `B5a contracts: old checkpoint fixture retains its run identity and operation outcome` | PASS |
| `src/data/contracts/questions.test.ts` | `B5a contracts: old question fixtures retain folder inbox state and pair meanings` | PASS |
| `src/data/contracts/note-edit.test.ts` | `B5a contracts: old note fixtures keep legacy and ownership/2 meanings` | PASS |

Old manifest/checkpoint reads use the independent recovery fixture's literal original hashes
and operation ids. Old ownership reads use existing v2-rich plus legacy note shapes.
Old questions retain accepted q1, named pair, id pair, inbox and state meanings.
Existing assertions are unchanged; all 1,776 pre-existing tests in touched app files passed.

No new corpus case was added; no new method verdict row is needed. B5a has parser/API evidence;
main/corpus cases in the prep belong to B5b/B5c, not this contracts-only red session.

## Validation

| Command/scope | Result | Log |
| --- | --- | --- |
| App vitest, five touched files, --maxWorkers=2 | 8 intended reds; 1,779 pass | tmp-logs/b5a-contracts-app-red.log |
| Runner vitest, test/type-table.test.ts, --maxWorkers=2 | 16 intended reds, assertion-only | tmp-logs/b5a-contracts-runner-red.log |
| Final app vitest, changed run-manifest/questions files, --maxWorkers=2 | 4 intended reds; 1,422 pass | tmp-logs/b5a-contracts-app-final-red.log |
| tsc app | PASS | tmp-logs/b5a-contracts-tsc-app.log |
| tsc node | PASS | tmp-logs/b5a-contracts-tsc-node.log |
| tsc runner | PASS | tmp-logs/b5a-contracts-tsc-runner.log |
| eslint all touched app tests | PASS | tmp-logs/b5a-contracts-eslint-app.log |
| eslint final changed app tests | PASS | tmp-logs/b5a-contracts-eslint-final.log |
| eslint touched runner test | PASS | tmp-logs/b5a-contracts-eslint-runner.log |

Final distinct new tests: 25 intended assertion reds and 4 passing compatibility controls.
Only touched test files were run; pnpm check, unrelated corpus/method suites and e2e were
not run, following the red-owner's explicit command restriction. Output stayed under tmp-logs;
only failure diagnostics and result counts were inspected. No real-time waits were introduced.

## Preservation and handoff

removed: none
Existing assertions modified/deleted: none. Import lines only gained imports for new tests.
Contradictory existing assertions observed in touched files: none.
left out: implementation; Table UI; runtime proposal caps/dedup/decline/ignore/installation;
semantic row matching/profile incorporation through main; new corpus/model evidence; commits.
Those runtime lifecycle outcomes belong to B5b/B5c; the immutable proposal/subject/answer
contract is pinned here. No cap or boundary has been loosened.

The coordinator commits tests separately from this note. This session does not claim green
runtime verification or a completed implementation, and does not hand off shared runtime files.
