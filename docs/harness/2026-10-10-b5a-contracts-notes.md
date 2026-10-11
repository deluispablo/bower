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

## Implementation

2026-10-11: implementation is present but delivery is blocked by a contradictory existing test.
No test was changed, no network was used, and no writing git command was issued by the implementer.
No dependency directory was replaced or symlinked. HEAD remains
`82f6d8ccb01be1f127447a9caa6726599691d2df`; all delivery changes are uncommitted, as instructed.
The earlier answer-loop scope stop is resolved by the owner's ledger amendment in this session.

### Research and bounded reuse

The offline citations in Contract basis above remain the research sources; no page was fetched.
JSON Schema closed objects inform strict version-1 declarations. The reader alone skips invalid rows
and keeps first-id precedence; unreadable/unsupported envelopes use eight seeds with writes forbidden.
ISO 4217 currency membership uses the runtime's ICU currency enumeration plus ISO fund/metal/testing
units omitted by that enumeration. ISO 8601 calendar dates reuse the existing real-date validator,
relocated from note-edit into note-format so both note edits and typed properties use one implementation.
RFC 9413 bounds Postel-style tolerance to stored reads; it never grants new schema or column authority.

### Implemented contracts and their homes

Changed runtime files: `runner/src/type-table.ts`, `src/data/answer-loop.ts`,
`src/data/contracts/types.ts`, `src/data/contracts/note-format.ts`,
`src/data/contracts/ownership-format.ts`, `src/data/contracts/note-edit.ts`,
`src/data/contracts/questions.ts`, `src/data/contracts/run-manifest.ts`, `src/data/vault/layout.ts`.
Only these owned runtime files and this owned notes file changed.

- `runner/src/type-table.ts` owns the seed/fallback reader, immutable accepted-row insertion,
  first-match selection by supplied ids, and person-words-only explicit column replacement.
  New property declarations and their strict validators live in the existing note-format contract;
  the runner reuses them. The ordered projection preserves other properties and person prose.
- `.bower/type-table.json` joins SYSTEM, RUNNER_WRITES and RunnerWrite. Its existing
  write-runner-json effect validates the closed table; create-text and maintain cannot write it.
  No effect kind or runtime table writer was added.
- Questions retain frozen proposal identity/payload in the existing question, stored reader,
  public snapshot and report homes. Proposals survive the inbox item leaving, close through existing
  answers, and accept boolean answers only. Snapshot writes allow at most five proposal cards.
- The existing manifest admission validates create-once proposal artifacts, their closed versioned
  envelopes and canonical payload identity against their questions. At most two distinct new payloads
  are admitted; duplicates and more than five reported proposal identities are refused.
  The existing target-path resolver was extracted for reuse rather than duplicated.
- `answerRun` adds only the proposal subject in its existing continuation: true starts instructions,
  false starts none, and option/text answers grant no proposal continuation. checkedAnswer already
  refuses those answers before storing them. All other answer-loop behavior remains unchanged.
- Ownership/2 gains optional profile framing after the four existing payloads (and alongside MOC
  framing). The existing region rewrite and outside-region invariant now handle MOC and profile.
  Profile text is at most 400 whitespace-separated words with a source link; semantic grounding is
  B5c's production-planner evidence, not a claim that a syntactic link proves its facts.
  An explicitly framed profile is Bower-owned by its own mark; unframed person prose is never adopted.
  Current state retains its independent existing limits. No new profile store or note writer exists.

### Mandatory contradiction audit (TL-P4-51)

The whole targeted B5a suite and the whole runner suite were run before stopping.
Every observed test contradicting the packet:

| Test | Assertion | Conflict |
| --- | --- | --- |
| `runner/test/claude-provider.test.ts:599`, `a write the two runner lists judged differently is judged once by RUNNER_WRITES` | RUNNER_WRITES equals exactly the old seven paths | Q1 requires type-table.json to use that existing allowlist/effect; adding it makes the old exact-list assertion fail |

The positive B5a type-table manifest test is `src/data/contracts/run-manifest.test.ts:127`.
It requires the new path in that same allowlist. Neither a second allowlist nor changing the test
is authorized. The lead must rule on the contradictory assertion; implementation stops here.
No additional production file is requested. Any repair of the contradictory test requires the
lead's action on `runner/test/claude-provider.test.ts`, outside this ledger and the no-test-edit rule.

Another runner failure is `runner/test/new-instance.test.ts:137`, expected two fixture commits but
observed three on the second build/copy. It does not contradict B5a and is not claimed as green.
The full src suite has only the explicitly expected `src/e2e-port.test.ts:37` listen EPERM,
its resulting timeout, and the same unhandled EPERM. The final touched-file suite passed after
the last runtime refinement; all 1,792 assertions, including the old answer loop, are green.

The suite's instance tests rebuild the runner through scripts/new-instance.sh. Runtime files were
still being refined during that suite; consecutive bundles may therefore differ. No test or script
was changed to suppress it, and it was not rerun through the repository-writing build script.

### Output and verification discipline

All command logs are in the OS temp folder. Initial targeted calls used the default timer setup,
which unexpectedly wrote ignored CPU reports in test-results/cpu and runner/test-results/cpu.
Those session-created reports were moved to `/tmp/b5a-initial-cpu`; later calls used the OS-temp
preload `/tmp/b5a-test-output.mjs` to redirect only those observational artifacts to `/tmp/b5a-cpu`.
The reporter was explicitly default, preventing the runner's configured repository JSON report.
Tests and assertions were not modified by that output redirection.
The full runner suite also invoked its existing new-instance build, which writes ignored runner/dist.
This breaches the requested no-repository-test-output constraint; it is disclosed, not presented as
compliant. No further invocation of that build-writing test or of pnpm check was made.
pnpm check is omitted because its scripts write repository reports, build artifacts and a green mark;
no green mark is claimed. This entry is ui:false, so no screen e2e applies.

| Scope | Result | OS temp log |
| --- | --- | --- |
| Initial B5a app exact-prefix reds | 9 assertion reds; 4 old-fixture controls pass | `/tmp/b5a-app-red-current.log` |
| Initial B5a runner reds | 16 assertion reds | `/tmp/b5a-runner-red-current.log` |
| Final touched app files plus existing answer-loop tests | 1,792 pass | `/tmp/b5a-targeted-final.log` |
| Final B5a runner reds | 16 pass | `/tmp/b5a-runner-final.log` |
| Full src, maxWorkers=2 | 5,630 pass; expected e2e-port EPERM and its timeout only | `/tmp/b5a-src.log` |
| Full runner, including corpus and method | 665 pass; the 2 failures listed above | `/tmp/b5a-runner-all.log` |
| tsc app, node, runner | pass | `/tmp/b5a-tsc-app.log`, `/tmp/b5a-tsc-node.log`, `/tmp/b5a-tsc-runner.log` |
| eslint touched app/runner files, separately in each config | pass | `/tmp/b5a-eslint-app.log`, `/tmp/b5a-eslint-runner.log` |

removed: note-edit's private date validator moved into note-format; no duplicate date validator retained
removed: MOC-only rewrite/invariant spelling generalized in place for the existing region author
removed: requestMoveKind's nested target-path resolver extracted to the same manifest home for reuse
removed: no effect, writer, parser, store or existing assertion removed
tests changed: none

### Compatibility row drafts for the contracts handoff

No contracts commit was made. These drafts cover every changed contract for the coordinator's ledger.

| Change | Legacy read meaning retained | Verification |
| --- | --- | --- |
| TypeRow/TypeTable and six property kinds | Versioned strict new writes; invalid stored rows skipped; missing seed and unreadable no-write fallback | `runner/test/type-table.test.ts`, all 16 cases |
| Ordered note property projection | All unprojected properties and person prose remain unchanged | `src/data/vault/note-format.test.ts:29` |
| Shared real-date validator relocation | Existing Timeline dates and calendar refusals keep their behavior | Full note-edit tests plus type-table ISO-date bounds |
| Type-table path, existing effect and strict declaration validation | Old v1/v2 manifests preserve hashes and operation identities | run-manifest old-manifest and checkpoint B5a controls |
| Immutable proposal create/envelope and exact payload identity | No existing effect meaning changes; no proposal overwrite path or blanket hidden-path allowance | `src/data/contracts/run-manifest.test.ts:138` |
| Proposal subject and stored/public/report projections | q1, inbox, state and id/name pairs retain their old meanings | questions old-fixture control; existing question/snapshot suites |
| Proposal boolean continuation | Existing inbox, pair, state and folder continuations are unchanged | `src/data/contracts/questions.test.ts:41`; `src/data/answer-loop.test.ts` |
| Optional profile region and ordinary note edit | Old four-payload notes, legacy notes and MOC regions keep their meanings; personal spans preserved | ownership profile control; note-edit old-fixture and 400/401 tests |
| Shared target-path resolver extraction | Captured/created pending-folder paths retain existing request disposition meaning | Existing full runner request-disposition tests |

left out: B5b's runtime table context/writer, lifecycle dedup/decline/ignored persistence and exact installation;
B5c's semantic profile incorporation; Table UI; commits; pnpm check green mark; contradiction repair.

## Red repair (Q1 sweep)

2026-10-11: owner-authorized TL-P4-51 sweep for TL-P4-47 Q1.

tests changed: runner/test/claude-provider.test.ts: TL-P4-47 Q1: .bower/type-table.json joins RUNNER_WRITES

Added exactly `.bower/type-table.json` to the existing exact-list assertion, with a
TL-P4-47 Q1 comment. No other test behavior changed. This resolves the earlier Q1
contradiction; the positive contract remains `src/data/contracts/run-manifest.test.ts:127`.

Swept runner and src tests once for RUNNER_WRITES references and literal/SYSTEM runner
file lists. No other exact pin of the complete RUNNER_WRITES allowlist was found.
Related fixed lists inspected and left unchanged:

- `runner/test/claude-provider.test.ts:600`: complete allowlist pin; updated here.
- `runner/test/claude-provider.test.ts:585`: admission/refusal cases, not the complete allowlist.
- `src/data/compat-p2.test.ts:15`: frozen P2 fixture map, not today's runner file inventory.
- `src/data/contracts/run-manifest.test.ts:832`: deliberately supplied parser allowlist subset.
- `src/data/spine/barrier.test.ts:61`: exact report-write order; Q1 adds no report write.
- `runner/test/barrier.test.ts:234`: report-file shape checks, not a complete allowlist assertion.
- `runner/test/b1a-contract.test.ts:24`: derived index/retrieval/hot/log fixture set.
- `src/data/contracts/b1a-contract.test.ts:105`: index/retrieval/hot/log contract controls.
- `src/data/fake/fake-worker.test.ts:1926`: unreadable-file cases, not a complete file inventory.
- `runner/test/b23-hot-context.test.ts:53`: hot-path membership only; no exact pin.

Verification: `NODE_OPTIONS='--import=/tmp/b5a-test-output.mjs' pnpm -C runner exec
vitest run test/claude-provider.test.ts --maxWorkers=2 --reporter=default` passed all
23 tests. Log: `/tmp/b5a-q1-claude-provider.log`. Existing OS-temp preload redirects
CPU reports to `/tmp/b5a-cpu`; default-only reporter avoids repository JSON output.
No full check/e2e was run for this explicitly bounded test repair.

Read-only production diff snapshots before and after compare byte-for-byte equal:
`/tmp/b5a-q1-production-before.diff`, `/tmp/b5a-q1-production-after.diff`.
No network, writing git command, dependency replacement or symlink was used.
Only the assigned test and this notes file were edited; coordinator owns commits.

## Coordinator: unused-production baseline (handoff to B5b)

B5a is contracts only (no runtime table writer yet), so knip --production finds three unused items: `exports src/data/contracts/note-format.ts propertyValuesOk`, `exports src/data/contracts/note-format.ts tableProperties`, `files runner/src/type-table.ts`. They are baselined in harness/unused-production-baseline.json as hot.ts was for B3a→B3b; B5b removes all three lines when it wires the type table, and its check fails while any is listed.
