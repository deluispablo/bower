# B4a contract reds — 2026-10-11

implementer: codex

Role: red-owning session only, TL-P4-48 addendum 1. All changes are additive tests and these notes.
The runner owns commits. No git-writing command, network access, node_modules change, app change,
fixture change, runtime wiring, server, e2e or full check was performed.

## Exact red names and controls

- `b4a-composite-byte-append`: `src/data/contracts/note-edit.test.ts`; unchanged BOM, CRLF,
  Unicode, custom front matter and personal prefix; one append, no whole-file adoption;
  damaged/duplicate marks refuse. Controls: valid legacy prefix and the existing missing-note
  folder template initialize. Supplemental parser test in `src/data/vault/ownership-format.test.ts`
  requires exact spans for all three sections, excludes learned tasks from personal tasks,
  refuses damaged/duplicate marks, and retains old legacy/v2 parsing.
- `b4a-existing-regions-compatible`: `src/data/contracts/note-edit.test.ts`; headings,
  whole-file by:bower, unrelated regions and marker escape grant no About me permission.
  Controls: new marked About me edit plus unchanged MOC, profile and project-template edits;
  Current state still refuses a person's changed state.
- `b4a-admitted-origin-only`: `runner/test/admitted.test.ts`; resolves from actual
  planAdmission/takeAdmitted results, refuses forged source labels, unadmitted ids, About me
  source ids and a pile deferred after its source changes. Controls: admitted words and document
  provenance. Supplemental `observations.test.ts` author test admits words and explicit-subject
  document biography, rejects document preference/sensitive/rule/schema claims and own-text
  observations, checks script-issued ids and source hashes, and distinguishes validated prior
  lineage from an unvalidated stored label.
- `b4a-ledger-identity-and-corruption`: `src/data/contracts/observations.test.ts`; malformed,
  torn, invalid-UTF8, oversized-text, impossible-date and conflicting-id evidence throw BowerError.
  Same-source replay, including a changed hash, cannot revive a tombstoned fact.
  Controls: empty ledger, valid 200-character event, event/evidence deduplication, independent
  evidence and explicit later remembering, retaining the original fact/source tombstone.
- `b4a-section-gate`: `src/data/contracts/observations.test.ts`; all three budgets are pinned
  to 400/400/200 authored words. Equality, four new live observations, duplicates and tombstones
  cannot consolidate. Controls: budget + 1 and five live facts; five after the successful
  section frontier; other-section/failed frontiers do not advance it; Forget and Undo bypass
  both predicates. Framing, heading, date and citation words do not count as authored payload.
- `b4a-artifact-scope-and-order`: `src/data/contracts/run-manifest.test.ts`; rejects arbitrary
  ledger paths, archive paths with the old file-id segment, non-section/traversal paths,
  missing confirmation dependencies, archive overwrites, non-exact archive bytes, duplicate
  About me targets and mismatched read versions. Control: independently sealed frozen
  ledger -> archive -> one About me edit -> successful frontier -> maintain manifest, plus
  a legacy manifest. The consolidation fixture has 201 authored words and five observations.
  Supplemental runner-admission test exercises the exact JSONL artifact, scoped archive and
  narrowly targeted note edit; old question writes remain admitted.
- `b4a-read-version-fence`: `src/data/contracts/note-edit.test.ts`; changed personal/learned
  bytes and changed modifiedTime refuse via recheckEdit/notAsSeen. Control: the same authored
  About me edit succeeds on identical read bytes and version. Unfrozen extra after-text refuses.
- `b4a-context-and-undo-contract`: `runner/test/b4-contract.test.ts`; mixed trust, oversized
  learned input, a dishonest cut flag and archive-based restoration fail. Controls: separately
  typed personal input, learned text at 3999/4000 and cut at 4001/8000 characters (mark included
  in the 4000 ceiling), and live-ledger rebuild. Undo invalidates the undone run's observations,
  preserves independent live facts and never revives a later Forget, including Undo of Forget.
- `b4a-forget-fact-question-action`: `src/data/contracts/questions.test.ts`; additive stored
  fact-id action validates; wrong/extra keys, unsafe ids and a folder substituted for a fact
  refuse. Controls: existing file-to wire and stored questions are unchanged; public cards
  strip actions and only shown option ids can be answered.

## Production boundary handoff

Existing calls exercised: parseOwnership, applyChanges, recheckEdit, notAsSeen,
parseRunManifestV2, planAdmission, takeAdmitted, outsideAdmitted, isQuestionOption,
isRunnerFile, publicQuestion and checkedAnswer. FOLDER_TEMPLATE supplies the missing note.
Manifest hashes/content sizes are independently computed with node:crypto.

The packet defines behavior but does not name new TypeScript exports or all wire fields.
These tests propose the following additive spellings at the owned homes, as prior B1/B5/B6
contract reds do; they do not implement a parallel mechanism:

- observations.ts: parseObservations(bytes), observationOf(candidate, scriptContext),
  canRebuildAboutSection({ledger, section, text, reason}), aboutContext({personal, learned,
  factIds}), isAboutContext(value), rebuildObservations({source: 'observations', bytes,
  undoneRunIds}). The scriptContext admitted/validated-lineage collections are trusted script
  inputs, never fields accepted from a model candidate.
- runner/src/spine/admitted.ts: observationOrigin(sourceReference, took, capturedEvidence).
- The existing Change union gains about-append/about-rewrite; composite payloads are exposed
  through the existing ownership parser. No new parser or B1d prompt builder is supplied.
- The manifest reuses write-runner-json for the exact observations.jsonl path, with a JSONL
  validator rather than whole-JSON parsing, and create-text purpose about-archive for the
  write-once section. Frozen about-rewrite carries factIds and its archive path when consolidating.
  Existing dependsOn edges require confirmed predecessor effects. The tests cover contract
  validation; checkpoint recovery, second ledger-write read-version refresh and barrier runtime
  proof remain B4b/B4c work, not a claim made by this red session.

Absent modules/exports are guarded by explicit Vitest assertions. No import fails and no
mock supplies the missing implementation. The observation/context matrices cannot execute
past their required-function assertion until the implementation exists; their controls are
written, not reported as already passing B4a behavior. Existing-author and admission controls
that can execute on HEAD do pass.

## Verification

All output, Vite/module caches, JSON reports, and CPU reports are under
`/private/tmp/b4a-contract-validation/`. Test fixtures create scratch files through os.tmpdir().
Temporary configs retain the production test environments and timer gate. A temporary copy
of the timer-gate setup changes only import resolution and its CPU report destination to
that OS-temp directory. `--configLoader runner` avoids the config bundle cache in node_modules.
Every Vitest invocation used `--maxWorkers=2`.

Full targeted app run: 1,573 tests, 1,564 passed, 9 expected new B4a failures.
Full targeted runner run: 113 tests, 110 passed, 3 expected new B4a failures.
All 1,674 pre-existing selected tests passed; no loader, timer or unrelated matcher failures.
Final named-red runs: 9 app + 3 runner failures, all AssertionError at missing B4a behavior.
Name filtering skips old tests only in those final red-only runs; no test adds .skip or .only.

Logs: app.log, runner.log, reds-app.log, reds-runner.log in the directory above.
Reports: app-results.json, runner-results.json, reds-app-results.json, reds-runner-results.json.
App and runner non-emitting TypeScript checks passed; touched-test ESLint passed.
`git diff --check` passed. Coordinator owns pnpm check; ui:false, no e2e or corpus change.

Full app command (from worktree):
`./node_modules/.bin/vitest run --config /private/tmp/b4a-contract-validation/app.mjs --configLoader runner --maxWorkers=2 src/data/contracts/observations.test.ts src/data/vault/ownership-format.test.ts src/data/contracts/note-edit.test.ts src/data/contracts/run-manifest.test.ts src/data/contracts/questions.test.ts src/data/contracts/b1a-contract.test.ts src/data/contracts/note-templates.test.ts src/data/vault/note-format.test.ts`

Full runner command (from runner/):
`../node_modules/.bin/vitest run --config /private/tmp/b4a-contract-validation/runner.mjs --configLoader runner --maxWorkers=2 test/admitted.test.ts test/b4-contract.test.ts test/b1a-contract.test.ts test/b1-index.test.ts test/type-table.test.ts test/q1-continuation.test.ts`

Compatibility coverage: landed B1a app/runner contracts; B1c index; B5a type table, profile,
questions and manifest controls; B6a templates, author and ownership controls; Q1a continuation;
legacy ownership, notes, manifests and checkpoints in the owned suites.

Contradicting existing assertions: none found in the full targeted suites and inspected tests.
No existing assertion was modified. An initial new parser control incorrectly expected a
BOM-prefixed legacy note to have status legacy; the existing parser calls it plain. The
control now uses the BOM-free legacy input, while the B4a byte-preservation case keeps its BOM.
No bound, threshold or tolerance was loosened.

## Change inventory

tests changed: src/data/contracts/observations.test.ts: new ledger, origin and section-gate contract reds/controls.
tests changed: src/data/vault/ownership-format.test.ts: appended composite parser red/controls; existing tests unchanged.
tests changed: src/data/contracts/note-edit.test.ts: appended byte append, region compatibility and read-fence reds/controls.
tests changed: src/data/contracts/run-manifest.test.ts: appended artifact/order red and independently sealed controls.
tests changed: src/data/contracts/questions.test.ts: appended additive forget-fact action red with file-to controls.
tests changed: runner/test/admitted.test.ts: appended admitted-origin and artifact-permission reds/controls.
tests changed: runner/test/b4-contract.test.ts: new context and Undo contract red/controls.
removed: none.

## Offline sources and scope left out

Prior research, reused without network or a new library:
https://arxiv.org/pdf/2605.12978
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://zod.dev/api

Reuse homes: existing ownership parser, note author, manifest validator, admission and questions.
Left out: implementation, runtime memory/Forget/Bin wiring, B1d assembly, archive recovery and
semantic model proof, full pnpm check/e2e, committing. Own-text deletion/case 4 stays dropped.
The archive path has no About me file-id segment. No original-app/personal content was read.

Requested commits are declared in .codex-commits.json: tests only, then this notes file alone.

## Implementation

implementer: codex

Implemented the owned contract homes only, with no runtime intake, planner, dispatcher,
consolidation call, prompt assembly, server, deployment, network access or git-writing command.
The runner owns commits. Existing tests and node_modules were not changed.
The research above is reused offline: episodic evidence as the durable source, bounded derived
context, and closed typed declarations. No citation is claimed as newly verified.

The implementation extends the ownership parser's existing marker state machine to a
personal prefix followed by the three About me regions. The prefix is retained byte for byte;
the original template remains the missing-note seed. The existing note author appends once,
rewrites only parsed payload spans and rechecks the full read bytes. The note-format projection
exposes those same spans through Bower's note field, without scanning for marks again.
`undoEdit` refuses to restore an About me before-image: its rebuild contract uses live evidence.

`observations.ts` declares JSONL observation, tombstone and consolidation events. Every line
uses the existing strict record-JSON reader and canonical identity helper. Invalid encoding,
unterminated or malformed events, and conflicting identities log and throw BowerError.
An empty file or the empty-ledger newline parses as empty; interior blank records refuse.
Event/evidence deduplication is separate from source/fact tombstones; the latter survive
new source hashes, replay, explicit remembering and Undo of Forget. A successful section
frontier counts only later, distinct live facts. Authored word counting uses timeline-line's
parser, excluding headings, framing, dates and citations, with 400/400/200 and five unchanged.

Observation candidates cannot assert ids, hashes or origins. The author resolves references
from script-supplied admitted evidence or explicitly validated lineage. Documents require
an explicit matching subject and cannot author preferences, sensitive facts, rules or schema.
Personal About me text has no observation origin. Admission resolves actual taken pile words
or document ids; a deferred pile cannot be re-admitted through stale evidence. Answer/rule
lineage has typed record references; its runtime capture remains B4b's work.

Manifest validation freezes the same effects and confirmed dependencies: ledger, exact
write-once section archive, one authored About me edit, successful frontier, then maintain.
JSONL uses its line reader rather than JSON.parse of the whole artifact. Read content/stamps,
captured target identity, source evidence hashes and append-only prior ledger bytes are
checked. Archive paths have no file-id directory. No new lifecycle, broad internal-path
permission, ownership writer or marker parser was added. Creation of the exact ledger uses
the existing create-text effect; subsequent writes retain the existing read-content fence.
The second write's refreshed runtime read version and replay/barrier execution remain B4c.

The context contract separates personal input from learned content. Its 4,000-character
limit includes the visible cut mark. Undo filters invalidated observation origins while
retaining all tombstones; an archive or mixed-trust input cannot become rebuilding authority.
Stored questions add only the closed `forget-fact` action; the public projection strips
both action kinds, and existing shown-option validation is reused.

### Compatibility draft rows

| Contract home | Additive change | Compatibility evidence / remaining consumer |
| --- | --- | --- |
| ownership-format | Three trailing About me payload spans on a personal prefix | `b4a-composite-byte-append`; old plain, legacy and ownership/2 tests retained; B4b consumes spans. |
| note-edit | `about-append`, `about-rewrite`, exact prefix/span invariants; no before-image memory Undo | `b4a-composite-byte-append`, `b4a-existing-regions-compatible`, `b4a-read-version-fence`; MOC, profile, template and Current state controls retained; B4b/B4c author effects. |
| note-format | Display learned spans through the existing Bower note projection | Existing note-format suite retained; no new parser or whole-file adoption; B4b produces this content. |
| observations | Version-1 JSONL events, script ids/provenance, permanent tombstones and successful frontier | `b4a-ledger-identity-and-corruption`, `b4a-admitted-origin-only`, `b4a-section-gate`; new stored format with strict event reads; B4b intake and B4c consolidation. |
| observations | Separately typed bounded context and evidence-only Undo rebuild | `b4a-context-and-undo-contract`; no earlier context wire replaced; B4c supplies B1d's position-4 input. |
| run-manifest | Additive changes, exact ledger/create/archive artifacts, frozen order and read fences | `b4a-artifact-scope-and-order`; v1/v2 and B1a/B5a/B6a controls retained; B4c executes recovery and barriers. |
| layout | Explicit observations.jsonl entry in RUNNER_WRITES | B4a manifest/admission controls pass; existing exact-list assertion at runner/test/claude-provider.test.ts:600 conflicts and is unchanged. |
| admitted | Taken-source provenance and narrow About me/archive permissions | `b4a-admitted-origin-only`, `b4a-artifact-scope-and-order`; old admission/question artifact controls retained; B4b connects intake. |
| questions | `file-to` or `forget-fact`, each with its own closed id payload | `b4a-forget-fact-question-action`; Q1a wire/public-answer controls retained; unowned scripted.ts:723 needs an action-kind guard before its folder lookup. |

Named production calls exercised: parseOwnership, parseNote, applyChanges, recheckEdit,
notAsSeen, parseRunManifestV2, planAdmission, takeAdmitted, outsideAdmitted,
observationOrigin, parseObservations, observationOf, canRebuildAboutSection, aboutContext,
isAboutContext, rebuildObservations, isQuestionOption, isRunnerFile, publicQuestion,
checkedAnswer. FOLDER_TEMPLATE is reused unchanged.

### Baseline handoff

Both baselines are changed only for the contract exports the unused gate reports.
`observationOrigin` is listed in both passes because its committed red accesses it with
Reflect.get. Its production caller is B4b. `observationOf` is removed from the production
baseline by B4b. `aboutContext` and `rebuildObservations` are removed by B4c. Each exact
baseline finding has a reasons row naming its remover. Internal contract consumers already
use the remaining exports; no throwaway production call hides an unused export.

removed: none; existing parser, author, artifact lifecycle, folder template and Timeline grammar are reused.
removed: no tests, fixtures, dependency packages or runtime callers.
tests changed: none

### Blockers and contradictory assertions

- `src/data/spine/scripted.ts:723` reads `action.folderId` without checking the discriminant.
  The additive stored action exposes this pre-existing assumption. App and runner tsc report
  TS2339 at this line. It is outside the owned files. A sound union was kept; no cast, phantom
  folder id or false type predicate was added to hide the missing consumer guard.
- `runner/test/claude-provider.test.ts:600`, test `a write the two runner lists judged differently
  is judged once by RUNNER_WRITES`, asserts an exact allowlist without observations.jsonl.
  B4a requires this explicit addition and its committed red requires the new member.
  This is a contract contradiction, not a reason to hide the artifact from the existing home.
  The whole runner suite was run to enumerate contradictions, as WORKER.md requires.
  Tests are owner-frozen and this test is outside the packet, so it is unchanged.

Closing the entry requires lead allocation of the narrow scripted caller guard and a red-owner
update of the contradicted exact-list expectation. Runtime B4b/B4c wiring, semantic entailment
proof, full pnpm check and e2e remain outside this contract entry. No corpus/demo/fake fixture
or screen changed; pnpm check remains the coordinator's gate per the packet.

The full src run exposed the remaining gate conflicts, also left unchanged:

- `src/architecture.test.ts:154`, `contracts import only themselves and allowlisted pure libraries`.
- `src/architecture.test.ts:166`, `the spine runs in every runtime: its closure uses no browser or environment globals`.
  Both apply the regex at line 117 to source text including string literals. The required
  `'document'` origin discriminant in observations.ts and run-manifest.ts matches its browser
  global pattern. Their reports contain no outside imports or external dependencies. No browser
  global is accessed. The B4a document-origin red requires this spelling; obscuring that spelling
  or changing the frozen gates would hide the contradiction. Both need a red-owner ruling.
- `src/docs.test.ts:134`, `every change since the P2 freeze is listed`: existing commit
  `0b047d16` is missing from the shared compatibility list. No commit was made by this session;
  the draft rows above are supplied for the coordinator, who owns the shared record.
- `src/e2e-port.test.ts:37`, `a server from another worktree is never reused`: listen EPERM on
  127.0.0.1 plus the resulting 5,000 ms timeout. This is the expected sandbox limitation named
  in the assignment. No app server or remote network connection was started.

An initial architecture error-handler complaint was resolved in the owned observations.ts:
the catch now explicitly documents that its helper logs and throws BowerError. The focused
architecture rerun confirms `errors are never swallowed` passes. No exception was suppressed.
These are all failures found by the completed full src and runner suites; no test was weakened.

### Implementation verification

All output, reports, Vite/module caches and timer CPU reports are in the OS temp directory
`/private/tmp/b4a-contract-validation/`. The existing temporary timer setup keeps the same
production timer gate and changes only its import resolution and report destination.
The full-src temporary config imports the production Vite config, including React, aliases and
CSS settings, then overrides only output/cache/setup paths. `--configLoader runner` avoids a
config bundle written into node_modules. Every Vitest command uses `--maxWorkers=2`.

| Check | Result | Temp log |
| --- | --- | --- |
| B4a app assertion reds before implementation | 9 failed, 1,556 skipped by name filter | implementation-red-app.log |
| B4a runner assertion reds before implementation | 3 failed, 2 skipped by name filter | implementation-red-runner.log |
| All owned app contract/ownership/note-format tests on final implementation | 1,823 passed in 6 files; every app B4a red green | implementation-contract-final.log |
| Full runner, final implementation | 669 passed, 1 failed in 51 files; all 3 runner B4a reds green; only the exact-list contradiction at claude-provider.test.ts:600 | implementation-runner-final.log |
| Full src | 5,746 passed, 5 failed in 173 files; one failure subsequently resolved as described above | implementation-src-full.log |
| Focused architecture/docs after the exception comment | 23 passed, 3 failed: two literal-regex conflicts and the missing existing compatibility row | implementation-gate-detail.log |
| App tsc | TS2339 only at unowned scripted.ts:723 | implementation-app-types.log |
| Node tsc | Pass | implementation-node-types.log |
| Runner tsc | TS2339 only at unowned scripted.ts:723 | implementation-runner-types.log |
| ESLint on touched app and runner production files, using each package's config separately | Pass | implementation-eslint-app.log; implementation-eslint-runner.log |
| Unused-code and unused-production gates | Pass with named B4b/B4c baseline removers | implementation-unused-final.log |
| Diff whitespace / no test edits | Pass | git diff --check; git diff --name-only -- '*.test.ts' '*.test.tsx' |

The first full-src attempt used the reduced config suitable for the earlier contract reds;
it lacked the app aliases and was interrupted after import failures. It is not counted as
verification. The full-config run above supersedes it. Likewise, a combined root/runner ESLint
invocation had config-root ambiguity; the separate package invocations above pass.

Commands (stdout/stderr redirected to the temp logs in the table):

- `pnpm exec vitest run src --maxWorkers=2 --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner`
- `pnpm -C runner exec vitest run --maxWorkers=2 --config /private/tmp/b4a-contract-validation/runner.mjs --configLoader runner`
- `pnpm exec tsc -p tsconfig.app.json --noEmit`
- `pnpm exec tsc -p tsconfig.node.json --noEmit`
- `pnpm exec tsc -p runner/tsconfig.json --noEmit`
- `pnpm exec eslint` with the seven touched src production paths, and `pnpm -C runner exec eslint src/spine/admitted.ts`
- `node scripts/check-unused-gate.mjs`

Full src includes the landed B1a/B5a/B6a/Q1a contract controls; the full runner includes
B1a/B1c index, type-table and Q1 continuation compatibility. No pnpm check green mark or
runtime B4b/B4c completion is claimed. The two requested commits are declared in
.codex-commits.json (production/baselines first; these notes alone second), for the runner.

Final delivery: **blocked**, pending the unowned caller and frozen gate/compatibility rulings above.
All 12 B4a named red tests are green. No test changes, git writes or runtime wiring were made.
A compact result index is `/private/tmp/b4a-implementation.txt`.


## Addendum 2

implementer: codex

Applied the lead's 2026-10-11 TL-P4-48 addendum 2. This section supersedes the
Implementation section's caller/architecture blockers and its two-commit handoff.
The production change is one discriminant guard at scripted.ts:723: only `file-to`
reaches the folder lookup. `forget-fact` remains a declared action for later wiring.
No action payload, origin word, manifest contract or RUNNER_WRITES member changed.

The shared architecture scan now walks TypeScript syntax with the already installed
TypeScript compiler API. Identifier checks exclude comments and literal contents;
property-access checks retain `process.env` and `import.meta.env`, including comments
between tokens. Template expressions remain executable syntax and are still scanned.
Both existing contract/spine assertions use this same helper, with their closure,
external-import checks, expected results and existing exceptions unchanged.

Offline research: inspected the installed TypeScript declarations for createSourceFile,
forEachChild, isIdentifier, isPropertyAccessExpression and isMetaProperty in
`node_modules/typescript/lib/typescript.d.ts`. This reuses the existing parser dependency,
with no new package or custom string/comment lexer. Canonical compiler API reference:
https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
The reference was not fetched or newly verified; no network was used.

Test-first evidence: both new instances of `the global scan ignores literals and comments
but rejects real access in %s` failed on `export const origin = 'document';` (expected
false, received true) with the old scan. The two existing contract/spine assertions also
failed on observations.ts/run-manifest.ts. The pre-fix app tsc reproduced TS2339 at
scripted.ts:723. After the fix all nine architecture tests passed.

The new control exercises contract and runner source snippets in memory, without
writing fixtures into the repository. It checks real `document.title` and
`window.location`, template/nested-template expressions, access after a URL string or
comment, both environment accesses, storage, indexedDB, fetch and React. Those snippets
must be rejected by the same helper used by the existing assertions. Strings, template
text, regex literals, line/block/JSDoc comments and URL strings must remain accepted.

tests changed: src/architecture.test.ts: replace raw-text browser/environment detection in the two existing shared-core assertions with syntax traversal; add contract/runner controls accepting literals/comments and rejecting real global accesses. Expected closure/import results and existing exceptions are unchanged.
removed: duplicated regex comment stripping in the two shared-core scans, replaced by their shared syntax visitor.
removed: no tests, fixtures, runtime mechanisms, dependencies or contract words.

The frozen `runner/test/claude-provider.test.ts` is unchanged. Its RUNNER_WRITES pin
remains allocated after B1d integrates, as the addendum requires. The commit manifest
`.codex-commits.json` declares exactly three commits: architecture scan/control,
scripted kind guard, and these notes alone. No git-writing command was run and
node_modules was neither replaced nor symlinked.


### Addendum 2 verification

All logs below are under `/private/tmp/b4a-contract-validation/`. The existing temporary
configs retain the production app configuration and timer gate, redirecting caches,
JSON results and CPU reports to the OS temp folder. `--configLoader runner` avoids
writing a config bundle into node_modules. Tests used two workers; no repo output,
dependency replacement, network access or git-writing command was introduced.

| Check | Result | Log |
| --- | --- | --- |
| Architecture before fix | 4 assertion failures: two new controls and two existing shared-core checks | addendum2-red.log |
| App tsc before guard | TS2339 at scripted.ts:723 | addendum2-red-app-types.log |
| Architecture after fix | 9 passed, including both runner/contract controls and both shared-core checks | addendum2-architecture.log |
| Full src | 5,751 passed, 2 failed in 173 files; one EPERM unhandled error | addendum2-src.log |
| Full runner | 669 passed, 1 failed in 51 files | addendum2-runner.log |
| App / node / runner tsc | All passed | addendum2-app-types.log; addendum2-node-types.log; addendum2-runner-types.log |
| Touched-file ESLint | Passed | addendum2-eslint.log |
| Diff whitespace and frozen runner test | Passed; claude-provider.test.ts has no diff | git diff --check; git diff --exit-code -- runner/test/claude-provider.test.ts |

Commands (stdout/stderr redirected to the logs above):

- `pnpm exec vitest run src/architecture.test.ts --maxWorkers=2 --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner` (red, then green).
- `pnpm exec vitest run src --maxWorkers=2 --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner`.
- `pnpm -C runner exec vitest run --maxWorkers=2 --config /private/tmp/b4a-contract-validation/runner.mjs --configLoader runner`.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit`.
- `pnpm exec tsc -p runner/tsconfig.json --noEmit`.
- `pnpm exec eslint src/architecture.test.ts src/data/spine/scripted.ts`.

Complete remaining failure inventory after running both full suites:

1. `src/docs.test.ts:134`, `every change since the P2 freeze is listed`: existing
   commits `181274e5` and `0b047d16` are absent from the shared compatibility list.
   The list and test are outside this addendum's scope; no commits were made here.
2. `src/e2e-port.test.ts:37`, `a server from another worktree is never reused`:
   expected sandbox `listen EPERM` on 127.0.0.1 and the resulting 5,000 ms timeout;
   Vitest also records that EPERM as one unhandled error.
3. `runner/test/claude-provider.test.ts:600`, `a write the two runner lists judged
   differently is judged once by RUNNER_WRITES`: expected frozen exact-list failure,
   with `.bower/observations.jsonl` as the additional member. The addendum assigns
   the pin update after B1d integrates, so it remains unchanged.

All requested code changes and checks are complete. Entry closure remains blocked by
the unowned compatibility rows and the deferred runner pin; no all-green gate is claimed.
The former architecture and scripted type failures are resolved. Full src/runner runs
exercise the B4a tests and landed compatibility controls. Full pnpm check and e2e remain
the coordinator's integration gates under the packet; this entry touches no screen.

## Fix round 1 reds

implementer: codex

Red-only delivery for TL-P4-48 addendum 3 and all nine findings in
`docs/harness/2026-10-11-b4a-adversarial-1.md`. One new test per finding in
`src/data/contracts/b4a-fr1.test.ts`; no existing test or production file changed.
Each test calls the existing production contracts and runs its positive controls before
its failing assertions. Soft assertions collect variants of the same finding only.
The manifest fixtures use independent SHA-256/canonical identities, real frozen content,
and ordered dependencies; they do not mock validation, admission or the note author.

| Exact test name | Assertion red | Passing positive control |
| --- | --- | --- |
| b4a-fr1 1 ledger target identity | Manifest validation and admission accept questions JSON targeting ledger-id/observations.jsonl, replacing stored evidence and its Forget tombstone. | Valid ledger/consolidation and an ordinary questions write both validate and are admitted. |
| b4a-fr1 2 fenced markers stay personal | Backtick and tilde fenced About me marks in outside bytes expose writable spans and applyChanges rewrites the code example. | Existing ownership/2 framing and real unfenced About me regions remain valid and writable. |
| b4a-fr1 3 forget only named facts | Forget of beans removes mint from the same source. | Both facts start live; a settled Bin invalidates the whole source. |
| b4a-fr1 4 undo cannot resurrect replay | Undo of run A promotes run B's same-source/hash/text replay with fresh ids. | Repeated event ids dedupe; original evidence wins; Undo of the replay preserves the original and independent evidence. |
| b4a-fr1 5 consolidation requires archive and fact ids | Four facts with archive/frontier omitted shorten 201 words; an empty ledger with factIds omitted also authorizes an unbound rewrite. | Five facts, exact archive, confirmed dependencies, edit, frontier and maintain validate. |
| b4a-fr1 6 damaged boundary refuses initialization | The truncated `begin abo` mark parses as plain and initialization writes a second learned section. | An ordinary personal note initializes. |
| b4a-fr1 7 rereads do not supply five observations | Five versions of one unchanged fact, differing only in hashes and issued ids, pass the 201-word consolidation gate. | Five independent observations qualify, four do not; five rereads with the same hash do not qualify. |
| b4a-fr1 8 first archive accepts created parent | Admission rejects an archive under a section folder created earlier through parent.createdBy. | The existing-folder manifest validates and is admitted; the correctly ordered createdBy manifest also validates. |
| b4a-fr1 9 initialization adds missing final newline | Ordinary and BOM/CRLF/Unicode prefixes without a final newline refuse initialization. | A terminated prefix appends exactly once; successful output must preserve every input byte and refuse a second initialization. |

Finding 7 preserves both formulations: the ruling's same-hash reread guard already passes;
the adversarial finding's unchanged fact across five different hashes is the failing case.
No threshold was changed: preferences remain 201 authored words with five new observations.
Finding 9 expects the author to add the single missing separator newline before its supplied
learned section. Existing bytes, including BOM, CRLF, combining characters and emoji, stay exact.

Validation used `--maxWorkers=2` throughout. All logs, reports, module/Vite caches and CPU
reports are in the OS temp folder; the existing temporary configuration retains production
app settings and the timer gate. `--configLoader runner` avoids bundled config output in
node_modules. Test data is made up and entirely in memory. Uint8Array.from gives the new
fixture bytes the current test realm's Uint8Array identity, avoiding a jsdom/Node realm
mismatch at rebuildObservations' input guard.

- Final red run: nine tests failed, all on their assigned finding; every positive control passed.
  Log: `/private/tmp/b4a-fr1-reds.log`.
- Full selected app contracts: 1,840 tests, 1,831 passed, exactly these nine reds failed.
  Log: `/private/tmp/b4a-fr1-contracts.log`;
  report: `/private/tmp/b4a-fr1-app-results.json`.
- Selected runner contracts: all 113 tests passed across six files.
  Log: `/private/tmp/b4a-fr1-runner.log`;
  report: `/private/tmp/b4a-fr1-runner-results.json`.
- App non-emitting TypeScript check passed: `/private/tmp/b4a-fr1-types.log`.
- New test ESLint passed: `/private/tmp/b4a-fr1-lint.log`.
- No import, runtime, timer or unrelated assertion failure in the final selected suites.
  No contradictory existing assertion found; no existing test modified or deleted.

Commands (output redirected to the logs above):

```sh
./node_modules/.bin/vitest run src/data/contracts/b4a-fr1.test.ts --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner --maxWorkers=2
./node_modules/.bin/vitest run src/data/contracts/b4a-fr1.test.ts src/data/contracts/observations.test.ts src/data/vault/ownership-format.test.ts src/data/contracts/note-edit.test.ts src/data/contracts/run-manifest.test.ts src/data/contracts/questions.test.ts src/data/contracts/b1a-contract.test.ts src/data/contracts/note-templates.test.ts src/data/vault/note-format.test.ts --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner --maxWorkers=2
# From runner/:
../node_modules/.bin/vitest run test/admitted.test.ts test/b4-contract.test.ts test/b1a-contract.test.ts test/b1-index.test.ts test/type-table.test.ts test/q1-continuation.test.ts --config /private/tmp/b4a-contract-validation/runner.mjs --configLoader runner --maxWorkers=2
# From the worktree root:
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
./node_modules/.bin/eslint src/data/contracts/b4a-fr1.test.ts
```

Compatibility includes the owned contracts, ownership and note format, B1a contracts,
B1c index, B5a type table, B6a templates and Q1a continuation. Full check remains with the
coordinator per packet; no screen changed and no e2e was run. The reds intentionally stay red.
Initial fixture setup failures (missing manifest envelope fields, a v2 questions-only
manifest without maintain, and cross-realm bytes) were corrected before the final runs;
none is presented as evidence of a product finding.

Offline research reused from the packet, not fetched or newly verified:
https://arxiv.org/pdf/2605.12978
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://zod.dev/api
Existing homes remain the ownership parser, note author, ledger reducer, manifest validator
and runner admission. No second production mechanism was added.

tests changed: src/data/contracts/b4a-fr1.test.ts: new additive fix-round-1 tests 1–9 with positive controls; no existing test changed.
tests changed: none of the existing test files or assertions.
removed: none.

No network, git-writing command, node_modules replacement/symlink, production change or
repository test output. The runner commits the diff. `.codex-commits.json` declares exactly
two commits: the new test file, then this notes file alone. Implementation is left to the
fresh implementation session; this red-only assignment is complete.
