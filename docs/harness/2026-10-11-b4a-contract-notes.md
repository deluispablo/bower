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


## Fix round 1

implementer: codex

Implemented TL-P4-48 addendum 3's nine findings in the five existing production homes.
No test, dependency, fixture, shared harness record or runtime memory wiring changed.
No network, repository-writing git command, node_modules replacement or symlink was used.
The runner owns commits; `.codex-commits.json` declares production and notes separately.

### Changes and removed paths

1. `run-manifest.ts` binds each declared runner-write path to its target name and, when
   captured, that file id's path and read identity. `admitted.ts` checks the same path/name
   binding against the captured identity and the admitted system folder. A questions path
   cannot disguise a ledger overwrite, including a forged target name on the ledger id.
2. `ownership-format.ts` uses the existing `fenceAfter` transition both outside and inside
   payloads, including the first-region lookup. Fenced examples never grant ownership.
   A truncated marker is no longer ignored because its region lacks `about-`. Complete
   older marker-shaped text without a format declaration remains plain personal text,
   preserving the existing `plain-marker-looking` fixture; it grants no region authority.
3. `observations.ts` applies source-wide tombstones only for settled Bin. Forget blocks
   named facts, leaving other facts from the same source live.
4. The same reducer reserves each evidence identity before applying Undo or tombstones.
   Event ids retain their existing strict replay/conflict validation. A duplicate cannot
   become the surviving observation just because the original run was undone or forgotten.
5. Frozen manifest About me rewrites require explicit live fact ids and the confirmed,
   exact archive. Omitting the archive no longer skips the existing gate/frontier checks.
   The pure Forget/Undo rebuild contract and its gate bypass remain unchanged; runtime
   intake, invalidation, rebuild scheduling and recovery still belong to B4b/B4c.
6. Damaged boundaries are refused by the one ownership parser before any note author writes.
7. The reducer's evidence key excludes the source hash: rereading the same source fact,
   even at another source version with fresh issued ids, adds no live evidence at the gate.
   Different facts and independent sources remain distinct; thresholds stay 400/400/200
   authored words and five new live observations after the section frontier.
8. Admission imports the existing `targetPath` resolver from run-manifest. It resolves
   captured parents and createdBy chains through the same implementation. No runner-side
   path resolver was added.
9. `note-edit.ts` appends one separator newline when the existing file is nonempty and
   unterminated. Its existing byte-append invariant permits exactly that separator and the
   supplied section, keeping BOM, CRLF, Unicode and every pre-existing byte unchanged.

removed: path-only runner-write admission that could bypass ledger protections.
removed: optional archive/fact-id bypass in frozen About me rewrite validation.
removed: active-payload-only fence tracking and the about- substring damage blind spot.
removed: Forget's source-wide suppression of unrelated facts.
removed: post-invalidation evidence claiming and source-version-based duplicate identities.
removed: admission's separate existing-parent-only archive lookup; reused targetPath.
removed: the newline-free initialization assumption in the author and its invariant.
tests changed: none

### Research and mechanism reuse

Prior packet research reused offline, without new verification or library installation:
https://arxiv.org/pdf/2605.12978
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://zod.dev/api
The established mechanisms remain the ownership parser/fence transition, note author,
observation reducer, manifest validator and admission. No second parser, writer, event
store, effect lifecycle, path resolver or region mechanism was introduced.

### Compatibility draft rows

| Contract home | Fix-round change | Evidence and compatibility |
| --- | --- | --- |
| run-manifest / admitted | Declared runner-write path must match target identity | `b4a-fr1 1 ledger target identity`; ordinary questions and valid ledger controls pass. Three legacy manifest tests intentionally alter only path and contradict addendum 3; listed below. |
| run-manifest | Frozen rewrites require factIds and confirmed exact archive | `b4a-fr1 5 consolidation requires archive and fact ids`; original `b4a-artifact-scope-and-order` passes. No stored event field or version changed. |
| ownership-format | Fences apply outside payloads and damaged marks refuse initialization | `b4a-fr1 2 fenced markers stay personal`, `b4a-fr1 6 damaged boundary refuses initialization`; all 52 ownership tests pass, including legacy/plain-marker-looking controls. |
| observations | Forget by fact; Bin by source; evidence claimed before origin invalidation | `b4a-fr1 3 forget only named facts`, `b4a-fr1 4 undo cannot resurrect replay`; existing corruption, explicit remembering and Undo controls pass. Stored events and tombstones remain intact. |
| observations | Source-version-only rereads add no gate evidence | `b4a-fr1 7 rereads do not supply five observations`; independent five-fact and four-fact controls pass; original section gate passes unchanged. |
| admitted / run-manifest | Share existing createdBy path resolver | `b4a-fr1 8 first archive accepts created parent`; existing-parent archive and runner admission controls pass. |
| note-edit | Add missing final newline with byte-preserving append | `b4a-fr1 9 initialization adds missing final newline` passes in Node, including Unicode/BOM/CRLF and repeat-init refusal; jsdom's cross-realm typed-array assertion remains a test-environment conflict at line 275. |

### Verification

Logs, Vitest reports, Vite/module caches and timer CPU reports are under OS temp.
The already supplied `/private/tmp/b4a-contract-validation/app-full.mjs` imports the
production Vite config and preserves its React, alias, CSS, environment and timer settings.
The temporary timer setup changes only import resolution and CPU-report destination.
`--configLoader runner` avoids writing a bundled config to node_modules. Full app tests
use jsdom as configured; the supplemental pure-contract run explicitly uses Node.
Tests are unchanged: no `.skip`, `.only`, threshold, assertion or fixture edit.

| Check | Result | Log in /private/tmp/ |
| --- | --- | --- |
| Original fix-round reds before changes | 9 failed on the assigned assertions | b4a-fr1-before.log |
| All nine final reds, unchanged, Node environment | 9 passed | b4a-fr1-nine-node.log |
| All named B4a app contracts including fix-round reds, Node | 18 passed; 1,556 unrelated tests name-filtered | b4a-fr1-b4a-node.log |
| Ownership compatibility after parser refinement | 52 passed | b4a-fr1-ownership.log |
| Full app src suite, final production tree | 5,756 passed, 6 failed; 1 expected EPERM unhandled error; 174 files | b4a-fr1-src-final.log |
| Full runner suite | 669 passed, 1 expected RUNNER_WRITES pin failure | b4a-fr1-runner-full.log |
| tsc app, node, runner, no emit | All passed | b4a-fr1-tsc-app.log, b4a-fr1-tsc-node.log, b4a-fr1-tsc-runner.log |
| ESLint, four touched app files and runner file from respective roots | Passed | b4a-fr1-eslint-app.log, b4a-fr1-eslint-runner.log |
| node scripts/check-unused-gate.mjs | Passed: 3 ordinary / 33 production baseline findings, none new or stale | b4a-fr1-unused.log |

Commands used (stdout and stderr redirected to the logs above):

```sh
pnpm exec vitest run src/data/contracts/b4a-fr1.test.ts --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner --maxWorkers=2
pnpm exec vitest run src/data/contracts/b4a-fr1.test.ts --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner --maxWorkers=2 --environment node
pnpm exec vitest run src --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner --maxWorkers=2 --outputFile.json=/private/tmp/b4a-fr1-src-final.json
# From runner/:
pnpm exec vitest run --config /private/tmp/b4a-contract-validation/runner.mjs --configLoader runner --maxWorkers=2
# From the worktree root:
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
pnpm exec tsc -p runner/tsconfig.json --noEmit
pnpm exec eslint src/data/contracts/observations.ts src/data/contracts/ownership-format.ts src/data/contracts/note-edit.ts src/data/contracts/run-manifest.ts
# From runner/:
pnpm exec eslint src/spine/admitted.ts
# From the worktree root:
node scripts/check-unused-gate.mjs
```

An initial combined app/runner ESLint invocation hit ambiguous tsconfigRootDir discovery.
Running the same checks from their respective config roots passed; no lint config changed.
An initial parser scan also treated complete legacy marker examples as damaged. The final
scan preserves those complete plain examples and still refuses truncated boundaries; the
52-test ownership suite verifies that compatibility refinement.

### Frozen test conflicts and handoff

The full targeted suite was run before classifying contradictions, per TL-P4-51.
These are not repaired by weakening production guards or changing owner-frozen tests:

- `src/data/contracts/run-manifest.test.ts:371`, `accepts supported variant: requests.json write`:
  changes only the path to requests.json but retains the questions.json target.
- `src/data/contracts/run-manifest.test.ts:372`, `accepts supported variant: hashes.json write`:
  changes only the path to hashes.json but retains the questions.json target.
- `src/data/contracts/run-manifest.test.ts:840`, `the manifest takes the runner-writable files as a parameter`:
  adds suggestions.json to the supplied list and expects a write with that path but the
  questions.json target to pass. All three contradict addendum 3's declared-target equality.
- `src/data/contracts/b4a-fr1.test.ts:275`, `b4a-fr1 9 initialization adds missing final newline`:
  in jsdom, the test builds input via realm-local Uint8Array.from while the production
  TextEncoder returns Node-realm Uint8Array. Vitest reports byte arrays with no visual
  difference as unequal. The exact unchanged test passes in Node, proving the byte prefix,
  complete resulting text and repeat-init refusal. Production encoding was not changed to
  accommodate this matcher/realm difference; the default-environment result is not green.
- `runner/test/claude-provider.test.ts:600`: expected exact RUNNER_WRITES pin omits
  observations.jsonl. Deferred until after B1d under TL-P4-48 addendum 2; unchanged.

Full pnpm check remains with the coordinator per packet. No screen, fixture or UI changed;
no e2e or server was started by this worker. The app suite's e2e-port listener assertion
hits the expected sandbox EPERM. Runtime memory wiring, consolidation recovery and the
barrier remain B4b/B4c work. No green check mark or clean integration gate is claimed.


Final full-src result: 5,756 passed, six failed across four files. The failures are exactly
run-manifest's three declared-path contradictions, fix-round red 9's jsdom realm assertion,
`src/docs.test.ts:134` (existing commit `75e64e67` missing from the shared compatibility list),
and `src/e2e-port.test.ts:37` (expected listen EPERM and the resulting timeout). The one
unhandled error is that same expected EPERM. No additional failure remains after preserving
complete plain marker examples. The final JSON report is `/private/tmp/b4a-fr1-src-final.json`.
B1a compatibility, B1c index, B5a type-table/questions, B6a template/ownership/note-format and
Q1a continuation coverage is retained by the full src and runner suites.

The earlier full-src run (`/private/tmp/b4a-fr1-src.log`) had four plain-marker compatibility
failures before the parser refinement; all four pass in the final run. Its other six
failures are the same final conflicts above. No rerun is presented as all green.
Final `git diff --check` passed. The commit plan names only the five production files and
this notes file in its separate commit; no test file is modified or included.

Delivery status: blocked on the frozen test conflicts and shared compatibility bookkeeping,
with production fixes for all nine retained for review. The coordinator/red owner must
resolve the three invalid-target fixtures and the jsdom byte-array assertion under the
ruling, and update the shared compatibility list. B1d still owns the deferred runner pin.
The worker made no commit and requests no permission to change those owner-frozen files.


## Fix round 1 red repair

implementer: codex

Tests-only TL-P4-51 repair of the frozen conflicts listed in Fix round 1's
"Frozen test conflicts and handoff", under TL-P4-48 addendum 3.

- The requests.json and hashes.json supported variants now change the target's
  `before.name` with the declared path. The suggestions.json parameter fixture does
  the same before resealing its operation identity. All original acceptance and
  refusal assertions remain unchanged; the supplied writable list still decides
  which correctly identified file may be written. No identity guard was weakened.
- Red 9 now constructs its unterminated input with `new TextEncoder().encode(prefix)`,
  matching the production encoder's Uint8Array realm. Its exact byte-prefix equality,
  complete resulting text, single learned heading and repeat-init refusal remain.
  Both plain text and BOM/CRLF/accented/combining/emoji input remain covered.

tests changed: src/data/contracts/run-manifest.test.ts: match requests.json, hashes.json and suggestions.json target names to declared paths; preserve writable-list subjects and all assertions.
tests changed: src/data/contracts/b4a-fr1.test.ts: encode red 9's input with TextEncoder to preserve exact byte-prefix equality across jsdom realms; retain complete text and repeat-init refusal.

Production code and runner/test/claude-provider.test.ts are unchanged. No dependency,
node_modules replacement/symlink, network access, or repository-writing git command
was used. The runner owns commits; .codex-commits.json has tests and notes separately.

Prior packet research is reused offline, without new verification or dependencies:
https://arxiv.org/pdf/2605.12978
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://zod.dev/api
No production mechanism changed or second mechanism was introduced.

### Red and focused green

- Before repair: two files, 1,425 passed and four assigned failures: requests.json
  supported variant, hashes.json supported variant, writable-files parameter,
  and b4a-fr1 9 initialization adds missing final newline.
  Log: /private/tmp/b4a-red-repair-before.log.
- After repair, same focused command and jsdom environment: two files and all
  1,429 tests passed. Log: /private/tmp/b4a-red-repair-focused.log.

Commands (stdout/stderr redirected to the temp logs):

```sh
pnpm exec vitest run src/data/contracts/run-manifest.test.ts src/data/contracts/b4a-fr1.test.ts --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner --maxWorkers=2
NODE_OPTIONS='--require=/private/tmp/b4a-red-repair-validation/scratch-output.cjs' NODE_PATH=/private/tmp/bower-b4a-contract/node_modules pnpm exec vitest run src --maxWorkers=2 --config /private/tmp/b4a-red-repair-validation/app-full.mjs --configLoader runner
pnpm exec eslint src/data/contracts/run-manifest.test.ts src/data/contracts/b4a-fr1.test.ts
pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false
```

The full src run preserves the production Vite config, jsdom, React, aliases, CSS
and timer guard. Its temporary config/setup redirect only reports and caches.
The preload relocates the harness's legacy test-results mkdir/mkdtemp scratch
fixture paths to /private/tmp/b4a-red-repair-validation/fixture-results; fixture
assertions are unchanged. NODE_PATH supplies the installed modules to those
external Playwright fixtures without replacing or linking node_modules.
A temp package.json preserves the repository's ESM mode. The preload changes only
those generated fixtures' @playwright/test import to the same installed index.mjs;
assertions and production imports remain unchanged.
Full-suite final log: /private/tmp/b4a-red-repair-src-final.log.
Full-suite JSON: /private/tmp/b4a-red-repair-validation/app-results.json.
Full pnpm check remains coordinator-owned under the packet; no UI/e2e screen
changed. No screen e2e or app server was started by this repair worker.

### Temporary fixture setup correction

The first full src run had 5,759 passed and three failed: expected e2e-port EPERM
plus two harness scratch-fixture failures introduced by relocation outside the
repository's ESM/package-resolution context. No repository file was changed to
address these setup failures. The temp ESM package metadata and generated import
resolution correction above preserve the same installed Playwright package.
All 47 harness tests then passed with all scratch fixtures still in OS temp:
/private/tmp/b4a-red-repair-harness.log.
The entire requested src suite was rerun with that corrected temp setup.
Initial full log: /private/tmp/b4a-red-repair-src.log.
Initial full JSON: /private/tmp/b4a-red-repair-validation/app-initial-results.json.
The earlier Fix round 1 docs compatibility-bookkeeping conflict is absent in this
checkout: src/docs.test.ts passed all 19 tests in the initial full run.

Touched-test ESLint passed: /private/tmp/b4a-red-repair-eslint.log.
App TypeScript no-emit/non-incremental check passed: /private/tmp/b4a-red-repair-types.log.

### Final verification and handoff

Final requested full src run: 173 files passed; only src/e2e-port.test.ts failed
(174 files total). Tests: 5,761 passed and one expected listener test failed
(5,762 total). The only unhandled error is that same `listen EPERM` for 127.0.0.1,
which causes src/e2e-port.test.ts:37's timeout. Exit 1 is expected in this sandbox.
Every other src test passed, including the three repaired manifest subjects, all
nine fix-round reds, all 47 harness tests and all 19 docs tests.
Log: /private/tmp/b4a-red-repair-src-final.log.
JSON: /private/tmp/b4a-red-repair-validation/app-results.json.

Final git diff --check passed. The only tracked changes are the two authorized
test files and this notes file; .codex-commits.json is the requested runner plan.
The plan has exactly two commits: tests first, notes alone second. No local commit
was made. Production files and the deferred runner provider test remain untouched.
Repair status: done; pnpm check stays with the coordinator, and no touched-screen
e2e is applicable to this tests-only entry.

## Round 2 reds (addendum 4)

implementer: codex

Reds-only session for TL-P4-48 addendum 4 and
`docs/harness/2026-10-11-b4a-adversarial-2.md`. Scope: one new adjacent contract
suite, these appended notes, and the runner's two-commit plan. No production,
existing test, fixture, configuration, caller or export was changed.

Prior packet research reused offline, without fresh verification or dependencies:
https://arxiv.org/pdf/2605.12978
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://zod.dev/api
The tests reuse the existing author, ownership parser, canonical record serializer,
manifest validator and admission boundary. No parallel production mechanism is added.

Named reds and passing controls, all through public contract functions:

- `b4a-r2 1 forgotten fact stays forgotten on replay`: parseObservations retains
  fact-replay after Forget when the same source sentence receives new event/fact
  ids, a new hash and biography-to-activity classification in about-working-on.
  Expected only fact-independent; received fact-independent and fact-replay.
  Controls: the original is initially live; Forget removes it; a different fact
  stays live; the tombstone is retained before and after replay.
- `b4a-r2 2 init passes the evidence check`: parseRunManifestV2 accepts an
  about-append containing Alex's invented preference with an empty ledger and no
  admitted words. Expected ok:false; received ok:true. Control: initialization
  with all three empty learned regions passes the author, validator and
  outsideAdmitted. Both plans use the same captured targets and identity sealing.
- `b4a-r2 3 forget to the bare heading succeeds`: one short preference plus its
  Forget tombstone, an exact dependent archive, a heading-only rewrite with no live
  fact ids, and maintain without a successful consolidation frontier. Expected
  ok:true; received ok:false, reason:shape. Controls: five live facts and 201
  authored words with archive and frontier validate; the Forget helper permits the
  short rebuild while the consolidation helper refuses it; applyChanges preserves
  the personal prefix and leaves exactly the heading in that region; archive bytes
  equal the previous section; outsideAdmitted accepts the Forget plan. This red
  chooses Forget, as permitted by the requested Forget-or-Undo scenario.
- `b4a-r2 4 regions without front matter`: initialization succeeds and the
  ownership parser exposes the learned region, but parseNote omits bowerNote.
  Control: identical regions with front matter display all three learned headings
  and the preference; personal bodies agree. Expected the same bowerNote object;
  received undefined for the plain note.

tests changed: src/data/contracts/b4a-r2.test.ts: new suite with four addendum-4 reproductions and passing controls; no existing test modified or deleted.
removed: none.

Verification on the final test file: four tests, four expected AssertionErrors,
one at each finding's final assertion. All earlier control assertions pass; no
import, loader, timer, hashing, admission or unrelated assertion failure occurs.
Every Vitest invocation used --maxWorkers=2. ESLint and the app's non-emitting,
non-incremental TypeScript check pass. The initial TypeScript check caught missing
narrowing of the ownership result in the new test; narrowing was added and all
three focused checks were rerun. No contract assertion or threshold was weakened.

Commands (stdout/stderr redirected to OS-temp logs):

```sh
pnpm exec vitest run src/data/contracts/b4a-r2.test.ts --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner --maxWorkers=2 --outputFile.json=/private/tmp/b4a-r2-results.json > /private/tmp/b4a-r2-reds.log 2>&1
pnpm exec eslint src/data/contracts/b4a-r2.test.ts > /private/tmp/b4a-r2-eslint.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false > /private/tmp/b4a-r2-types.log 2>&1
```

The existing OS-temp config preserves production jsdom, plugins, setup and timer
checks, and redirects Vite/module caches and CPU reports to
`/private/tmp/b4a-contract-validation/`. The JSON result and logs above also stay
in OS temp. The tests themselves perform no filesystem writes. No network,
repository-writing git command, dependency install or node_modules change was used.

The runner owns commits: `.codex-commits.json` lists the new test file first and
these notes alone second. No local commit was made. Final git diff --check passes.
Implementation, full suites, pnpm check, e2e and B4b/B4c runtime wiring were not
run or changed in this reds-only assignment. The four defects remain unfixed.

## Round 2 (addendum 4)

implementer: codex

Implemented the four adversarial findings and the two gate diagnoses in the existing
ledger resolver, manifest validator, note projection and capabilities spec. No network,
git-writing command, dependency install, node_modules replacement, second parser, writer
or region mechanism. Prior packet research is reused offline, not newly verified:
https://arxiv.org/pdf/2605.12978,
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents,
https://zod.dev/api.

Scope/callers checked before editing: parseObservations, rebuildObservations,
canRebuildAboutSection, parseRunManifestV2/aboutArtifactsOk, applyChanges, parseNote,
runner outsideAdmitted, and Questions/expectAxeClean. The change reaches the three
contract homes and the one authorized e2e selector. Existing fixtures, configuration,
ownership parsing, authoring, admission and dispatch remain the consumers.

- Forget matches the original fact's section and NFKC-normalized, whitespace-folded,
  case-folded text. Event/fact ids, source versions and classification cannot revive it;
  a different source alone cannot either. Different text remains live. Explicit later
  remembering from new words retains the tombstone and its existing authority checks.
  Evidence deduplication uses the same normalized text without classification.
- aboutEvidenceOk validates initialized and rewritten learned lines against live
  observations in their section; rewrites also restrict them to the cited factIds.
  Only the section's exact heading and blank lines are exempt. Timeline syntax uses
  parseTimelineLine; payload spans come from parseOwnership. An empty ledger therefore
  allows only empty regions. This is an exact normalized evidence check, not semantic
  validation of paraphrases; unsupported wording refuses losslessly.
- A same-run section tombstone identifies a Forget/Bin rebuild. Optional undoneRunIds
  on about-rewrite names known ledger origins for Undo and invokes parseObservations'
  existing resolver with those origins invalidated. Both routes keep the confirmed,
  exact archive and live-fact checks, bypass budget/frontier only, and allow the heading
  alone. Ordinary consolidation still requires its budget, five new facts and frontier.
  rebuildObservations delegates to that same parser/resolver; no alternate rebuild path.
- parseNote includes the already parsed Bower content in its no-front-matter return.
  Personal bytes and the existing serializer preservation mechanism are retained.
- Both TextDecoder calls explicitly set ignoreBOM:false, preserving their old BOM
  behavior and fatal invalid-UTF8 refusal while supplying the complete options shape.
  The frontier scan uses ES2022-compatible forEach rather than findLastIndex.
  No tsconfig was edited.

Axe diagnosis: src/features/home/Home.tsx:293 obtains headingId with React useId;
:351 assigns that id to the section's aria-labelledby. The spec had already located
and asserted the visible question/update list, then scanned the obsolete literal
section[aria-labelledby="qs"]. That selector matches no element on either viewport.
The repaired spec reads aria-labelledby from its existing named questions locator,
asserts it is present and passes that section selector to the same axe helper.
The WCAG 2.2 scan and all behavior/violation assertions remain intact; no screen change
is indicated by this failure. Browser confirmation belongs to the runner's gates.

tests changed: e2e/capabilities.spec.ts: the authorized item-6 fix follows Questions' useId label instead of obsolete qs; same axe scope and assertions.
tests changed: no unit/contract test, fixture, threshold or skip was changed.
removed: category and unnormalized text as ways to evade forgotten-evidence matching.
removed: initialization's evidence bypass and unconditional consolidation gate on Forget/Undo.
removed: front matter as a prerequisite for displaying parsed Bower content.
removed: findLastIndex and the obsolete fixed qs selector; no configuration or dependency added.

### Compatibility draft rows

| Contract home | Round-2 change | Compatibility evidence / remaining consumer |
| --- | --- | --- |
| src/data/contracts/observations.ts | Normalized section/text Forget matching; shared evidence validation; additive optional undoneRunIds parser input; ES2022 frontier scan and explicit decoder options | Stored v1 events/tombstones unchanged; existing corruption, remembering, section-gate and Undo tests pass. Supplementary assertions preserve BOM reading and new remembering. B4b/B4c supply runtime origins. |
| src/data/contracts/run-manifest.ts | Validate initialization evidence; additive optional about-rewrite.undoneRunIds; Forget/Undo archive-preserving gate exemption | All 1,420 manifest tests and round-1/round-2 controls pass. Omitted Undo input preserves ordinary consolidation; unknown origins refuse. Legacy manifest shapes and confirmation edges retained; unfounded learned writes now refuse. |
| src/data/contracts/note-format.ts | Expose already parsed Bower content without front matter | Round-2 no-front-matter control and all 258 note-format tests pass; person-prefix/body and front-matter controls remain unchanged. |

### Round-2 verification

Before editing, src/data/contracts/b4a-r2.test.ts reproduced all four expected
AssertionErrors: forgotten replay, invented initialization, bare-heading Forget and
missing plain-note projection. Log: /private/tmp/b4a-r2-fix-red.log.
After the final code changes, all 1,694 tests in b4a-r2, b4a-fr1, observations,
run-manifest and vault/note-format pass: /private/tmp/b4a-r2-focused.log.
The two runner admission/B4 suites pass (5 tests): /private/tmp/b4a-r2-runner-focused.log.

A standalone OS-temp assert script (no repository test changed) passes nine additional
production checks: Undo without budget/frontier, refusing invalidated evidence and an
unknown Undo origin, live-evidence initialization, forgotten initialization refusal,
heading-shaped invented claim refusal, normalized replay from another source,
explicit remembering, and stored BOM compatibility. It bundles the existing production
imports and uses the round-2 manifest fixture's frozen identities, not a mock validator.
Script/log: /private/tmp/b4a-r2-self-check.ts and /private/tmp/b4a-r2-self-check.log.

App/node/runner non-emitting, non-incremental tsc, touched-file ESLint and the unused
code/production gates pass. Logs: /private/tmp/b4a-r2-types-{app,node,runner}.log,
/private/tmp/b4a-r2-eslint.log and /private/tmp/b4a-r2-unused.log.
The unused baselines stay unchanged (3 ordinary and 33 production findings).

Commands, each with stdout/stderr redirected to OS temp:

```sh
pnpm exec vitest run src --maxWorkers=2 --config /private/tmp/b4a-contract-validation/app-full.mjs --configLoader runner --outputFile.json=/private/tmp/b4a-r2-app.json
pnpm exec vitest run --maxWorkers=2 --config /private/tmp/b4a-contract-validation/runner.mjs --configLoader runner --outputFile.json=/private/tmp/b4a-r2-runner.json
pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false
pnpm exec tsc -p tsconfig.node.json --noEmit --incremental false
pnpm exec tsc -p runner/tsconfig.json --noEmit --incremental false
pnpm exec eslint src/data/contracts/observations.ts src/data/contracts/run-manifest.ts src/data/contracts/note-format.ts e2e/capabilities.spec.ts
node scripts/check-unused-gate.mjs
```

The supplied temporary configs retain production environments, setup, plugins and
timer checks, redirecting CPU reports, module caches and JSON reports to OS temp.
No test output is directed into this repository. The runner suite completed before
an API-only cleanup; its affected admission/B4 consumers and all focused app contracts
were rerun after that cleanup, as were all static checks.

Full-suite results and every remaining failure:

- Full runner: 669/670 tests pass across 51 files. The only failure is
  runner/test/claude-provider.test.ts:600, "a write the two runner lists judged
  differently is judged once by RUNNER_WRITES": its expected array omits
  .bower/observations.jsonl. This is the pin already called out in TL-P4-48
  addendum 2. The current instruction forbids changing it, so it remains untouched.
  Log/report: /private/tmp/b4a-r2-runner.log and /private/tmp/b4a-r2-runner.json.
- Full src: 5,764/5,766 tests pass across 175 files. src/docs.test.ts:134,
  "every change since the P2 freeze is listed", reports the existing commit
  0aaaa69d missing from the shared compatibility ledger. This session records the
  requested draft rows above and does not edit that shared ledger.
- src/e2e-port.test.ts:37, "a server from another worktree is never reused", times
  out after the expected listen EPERM on 127.0.0.1 (also reported as one unhandled
  error). No timeout, assertion or test is changed for this sandbox restriction.
  Log/report for both src failures: /private/tmp/b4a-r2-app.log and
  /private/tmp/b4a-r2-app.json.

No additional contract contradiction was found. All four round-2 reds and the nine
round-1 regression tests pass unchanged. The implementation is ready for review;
acceptance is blocked on the stale runner pin/shared compatibility record and the
runner's unrestricted gates, not a claim of a fully green suite.

The runner owns committing and pnpm check plus app/capabilities e2e on demo/fake.
Those gates were not run here; no server or browser was started. B4b/B4c runtime
wiring stays outside this entry. .codex-commits.json declares one code/spec commit
and one notes-only commit. git diff --check passes; only those five owned files and
the commit-plan file are dirty.

### Round 2 coordinator pin (addendum 4)

tests changed: runner/test/claude-provider.test.ts: the RUNNER_WRITES pin now lists '.bower/observations.jsonl', the runner file that B4a added to the allowlist (TL-P4-48); no bound or assertion about bytes was loosened.


## Round 3 reds (addendum 5)

Red-owning session only, following TL-P4-48 addendum 5 and
`docs/harness/2026-10-11-b4a-adversarial-3.md`. Scope: one new contract test file,
these appended notes, and the runner's commit plan. No production code, existing
test, fixture, config, export or caller was changed. No second mechanism added.

Research: reused the packet's prior offline references, including
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
and https://zod.dev/api, plus the existing round-2 public-contract test pattern.
These citations are prior research, not freshly verified; no network was used.

Public boundaries: `parseObservations`, `applyChanges`, `parseRunManifestV2`,
`outsideAdmitted` and `canRebuildAboutSection`. Manifest content hashes, capture
identities and operation identities are sealed independently with node:crypto and
`canonicalRecordJson`. Expected after-bytes are supplied independently so an
invalid authoring request can still be checked at the manifest/admission boundary.
All facts, identities, dates and content in the fixtures are made up.

Exactly four new reds, each with passing positive controls:

1. `b4a-r3 1 tombstone holds across sections, last word wins`
   - Controls: the original fact is live; Forget preserves unrelated evidence;
     later own words explicitly remembering the fact are live; replay/document
     fixtures are valid and live in isolation.
   - Red: normalised cross-section replay and document replay are live after
     Forget. Explicit words dated before or on the tombstone date also become
     live. All four must remain blocked. Fresh event/fact ids and source hashes,
     full-width/case/whitespace normalization, and a fresh document source are covered.
2. `b4a-r3 2 exactly the three ruled regions`
   - Controls: all three ruled regions author, validate and admit, both empty
     and with a live evidence-bound preference. The ownership/2 prefix includes
     the existing current/personal/timeline/bower-note frames.
   - Red: an appended profile region authors, validates and admits with either
     ledger. An unknown region already fails authoring/validation but admission
     still accepts it. Soft assertions exercise every boundary and both ledgers;
     all failures belong to the extra-region finding.
3. `b4a-r3 3 below budget a write is a plain append`
   - Controls: 201 authored words plus five new live observations consolidate
     successfully with the exact previous-section archive and dependent frontier.
     Missing archive, missing frontier, only four observations, and exactly 200
     words each refuse consolidation. The ordinary append authors exact expected
     bytes and admits; it has only ledger, edit and maintain effects, no archive
     or consolidation frontier.
   - Red: adding one live preference to initialized empty sections returns
     `{ok:false, reason:"shape"}` from the manifest validator instead of success.
4. `b4a-r3 4 remember, Forget, remember, Forget, remember: the third remember is live`
   - Controls: first remember is live, first Forget leaves none, second remember
     is live, second Forget leaves none, and both tombstones remain retained.
   - Red: the third remember, with fresh source/run and later date, yields no
     live fact instead of `fact-third`.

Verification (all test runs use `--maxWorkers=2`):

- New file alone: exactly 4 tests, all 4 fail only on the findings above; controls
  pass, with no import, fixture-shape or runtime error. Report and failure log:
  `/private/tmp/b4a-r3-red.json`, `/private/tmp/b4a-r3-red.log`.
- New file plus unchanged `b4a-r2.test.ts`: 8 tests, 4 existing tests pass and
  exactly the 4 new reds fail. No additional contract contradiction found.
  `/private/tmp/b4a-r3-compat.json`, `/private/tmp/b4a-r3-compat.log`.
- Targeted ESLint passes: `/private/tmp/b4a-r3-lint.log`.
- App TypeScript check passes with `--noEmit --incremental false`:
  `/private/tmp/b4a-r3-types.log`.
- Temp-only test configuration: `/private/tmp/b4a-r3-4dydlrwh/vitest.config.mjs`.
  It preserves jsdom, the app setup and timer-gate setup. The setup wrapper changes
  each fork's working directory to that OS-temp directory before loading the
  existing setups, so their CPU reports also go to temp. Config loader is runner,
  cache is disabled, and cache/attachment destinations are in OS temp. No test
  writes into the repository; node_modules was neither replaced nor symlinked.

Command for the final combined run (the first run's temp config included only r3):

```sh
node node_modules/vitest/vitest.mjs run --config /private/tmp/b4a-r3-4dydlrwh/vitest.config.mjs --configLoader runner --no-cache --maxWorkers=2 --reporter=default --reporter=json --outputFile=/private/tmp/b4a-r3-compat.json > /private/tmp/b4a-r3-compat.log 2>&1
```

tests changed: src/data/contracts/b4a-r3.test.ts: new file; four addendum-5 reds with positive controls.
tests changed: no existing test was modified or deleted; no bounds, skips or focused tests added.
removed: none.

The runner owns committing. `.codex-commits.json` declares one test-only commit
and one notes-only commit. No git-writing command, production fix, pnpm check,
full suite, server, e2e or B4b/B4c runtime wiring was attempted. The four contract
failures remain intentionally unresolved for the implementation session.

## Round 3 (addendum 5)

implementer: codex

Implemented TL-P4-48 addendum 5 in the existing observation resolver, note author,
manifest validator and runner admission. No test, fixture, dependency, configuration,
shared harness record or ownership-parser grammar was changed. No network or git-writing
command was run by this session; node_modules was neither replaced nor symlinked.
Research reuses the packet's prior offline context-engineering and Zod references:
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
and https://zod.dev/api. These are prior research, not newly verified citations.

Scope/callers checked before editing: parseObservations and rebuildObservations feed
aboutEvidenceOk, canRebuildAboutSection and manifest validation; applyChanges supplies
manifest authoring and now admission's About me byte check. Existing appendAbout and
rewriteRegion consume parseOwnership's spans. Runtime memory wiring remains B4b/B4c.
No public export or persisted event/effect shape changed. Existing sources, date validation,
normalization, read-version fences, archive creation and dependency effects remain the homes.

- Forget matches normalized text across all three sections. A new own-words observation
  must reference a forgotten matching fact, use a fresh source, follow the tombstones in
  event order and have a date strictly after every matching tombstone. Referencing the
  latest forgotten fact no longer requires referencing every older fact in that chain.
  Document/replay evidence stays blocked; retained tombstones, source Bin and Undo guards
  are unchanged. This preserves the person's latest valid remember/Forget instruction.
- The note author refuses any parsed non-About region introduced by initialization and
  any non-About region following the learned regions on rewrite. Unknown/damaged marks
  still refuse through the one parser. Stored reads remain lenient: no parser fork or
  read-format change. Admission reuses applyChanges and compares its exact authored bytes
  with the effect, so a declared change kind cannot hide an extra region.
- If the shared consolidation predicate is false, an ordinary write must preserve the
  entire previous payload as its byte prefix and have no archive. Its lines and fact ids
  still require live evidence. An over-budget section with five new observations still
  requires the exact archive and dependent successful frontier. Forget/Undo retain their
  archive-backed gate exemption; Forget can rebuild affected sections other than the
  original fact's section. A plain append cannot claim a successful frontier, because the
  existing frontier validator requires the corresponding archived rewrite.

removed: per-section isolation of normalized Forget matching and the every-old-fact remembers requirement.
removed: initialization/rewrite permission for extra parsed regions in the learned section.
removed: admission's reliance on declared About me kinds without checking the existing author's bytes.
removed: unconditional archive/frontier consolidation shape for ordinary below-gate appends.
removed: no parser, writer, region mechanism, dependency or persisted format was added.
tests changed: none; every repository test and assertion remains unchanged.
tests changed: runner/test/claude-provider.test.ts:600 pins RUNNER_WRITES, already including observations.jsonl; passes unchanged.

### Compatibility draft rows

| Contract home | Round-3 change | Compatibility evidence / remaining consumer |
| --- | --- | --- |
| src/data/contracts/observations.ts | Match Forget text across sections; require later dated own words; allow repeated remember/Forget chains | Stored v1 events and tombstones still parse; round-2/round-3 controls and ten-cycle OS-temp self-check pass. Older observations.test.ts assertions expect cross-section resurrection and same-day remembering; conflicts recorded below. B4b/B4c retain runtime ownership. |
| src/data/contracts/note-edit.ts | Use existing parsed spans to enforce exactly the three learned regions on writes | No read grammar changes. Existing ordinary ownership/MOC/profile/template behavior remains; round-3 author controls pass. Extra known regions before/after the About block refuse in supplemental checks. |
| src/data/contracts/run-manifest.ts | Accept evidence-bound byte appends below the consolidation gate; preserve archive/frontier checks above it; allow cross-section Forget rebuild | No effect/schema/export change. Round-2/round-3 manifest controls pass, including 201 words/five observations versus 200 words/four observations. Supplemental checks refuse truncation, below-gate archive and append frontier. |

### Verification and remaining contradictions

Before editing, b4a-r3.test.ts reproduced exactly the four named reds, with all four
b4a-r2.test.ts controls passing. Log: /private/tmp/b4a-r3-before.log.
After the changes, all eight tests pass: /private/tmp/b4a-r3-after.log.
Exact reds/greens are `b4a-r3 1 tombstone holds across sections, last word wins`,
`b4a-r3 2 exactly the three ruled regions`, `b4a-r3 3 below budget a write is a plain append`,
and `b4a-r3 4 remember, Forget, remember, Forget, remember: the third remember is live`.

Additional assertions use production imports bundled from an OS-temp script; no test file
was edited. They cover ten successive remember/Forget cycles, retained tombstones, an extra
known region before the About regions, malformed stored extra regions on rewrite/admission,
ordinary append to a nonempty payload, truncation refusal, below-gate archive/frontier refusal,
and cross-section Forget rebuilding. All pass. Script and logs:
/private/tmp/b4a-r3-validation/self-check.ts, self-check-build.log and self-check.log.

Required commands (all stdout/stderr redirected to /private/tmp/b4a-r3-validation):

```sh
# From runner/:
pnpm exec vitest run --maxWorkers=2 --config /private/tmp/b4a-r3-validation/runner.mjs --configLoader runner --no-cache
# From the worktree root:
pnpm exec vitest run src --maxWorkers=2 --config /private/tmp/b4a-r3-validation/app.mjs --configLoader runner --no-cache
pnpm exec tsc --noEmit --incremental false -p tsconfig.app.json
pnpm exec tsc --noEmit --incremental false -p tsconfig.node.json
pnpm exec tsc --noEmit --incremental false -p runner/tsconfig.json
pnpm exec eslint src/data/contracts/observations.ts src/data/contracts/note-edit.ts src/data/contracts/run-manifest.ts
# From runner/:
pnpm exec eslint src/spine/admitted.ts
# From the worktree root:
node scripts/check-unused-gate.mjs
```

Temporary Vitest configurations import the unchanged production configs and retain their
plugins, environments and test lists. Cache, attachment, JSON and timer CPU report paths
point to OS temp; the temporary timer setup changes only import/output paths. The full
src suite's existing src/harness.test.ts:600-620 nevertheless creates three nested Playwright
fixtures under repository test-results. This was discovered after they ran: those three
new fixture directories were moved to /private/tmp/b4a-r3-validation/harness-fixtures;
pre-existing artifacts were left alone. Thus the blanket no-repository-test-writes condition
was not met during that existing harness test. No app/capabilities browser gate was started.

App/node/runner tsc all pass after explicitly narrowing the parser's invalid result.
ESLint passes separately under the app and runner configs; a combined invocation failed
configuration discovery (multiple tsconfigRootDir candidates), not a code rule.
Unused-code and unused-production-code gates pass at unchanged baselines of 3 and 33.
Logs: tsc-app.log, tsc-node.log, tsc-runner.log, eslint-app.log, eslint-runner.log, unused.log.

Full runner suite: 669 passed, 1 failed, 51 files. Full src suite: 5,767 passed,
3 failed, 176 files, with the expected EPERM unhandled error. Logs/reports:
/private/tmp/b4a-r3-validation/runner.log, runner.json, app.log and app.json.
All round-1/round-2/round-3 regression tests pass. Every remaining failure/conflict:

1. src/data/contracts/observations.test.ts:46, `b4a-ledger-identity-and-corruption`:
   its "independent" fact has exactly the forgotten fact's text in about-you and
   expects resurrection. Addendum 5 requires an empty live set. The same test's
   later assertion at :51 also expects remembering on the tombstone's own date
   (all fixture dates are 2026-10-11); the new ruling requires a strictly later date.
   The full suite reports :46 first; :51 is a second contradictory assertion in
   that test, identified from its fixtures. Neither assertion was changed.
2. runner/test/admitted.test.ts:111,
   `b4a-artifact-scope-and-order: runner admission scopes artifacts and note edits`:
   its partial edit fixture has no beforeText or final text and expects admission.
   The reused author cannot prove its region scope without those bytes, so admission
   now refuses it. Complete round-3 admission controls still pass. No test was changed
   and no missing-bytes compatibility bypass was added.
3. src/docs.test.ts:134, `every change since the P2 freeze is listed`: the existing
   commit 940a9394 is absent from the shared compatibility ledger. The requested
   per-contract draft rows are above; this worker does not edit the shared ledger.
4. src/e2e-port.test.ts:37, `a server from another worktree is never reused`: the
   expected sandbox listen EPERM at 127.0.0.1 produces a timeout and one unhandled
   error. No timeout, assertion, threshold or environment restriction was changed.

No RUNNER_WRITES failure remains: runner/test/claude-provider.test.ts:600 already has
observations.jsonl. No other full-suite failure or contradictory test was found.
The implementation is delivered for review, but acceptance remains blocked on the
frozen contradictory tests and shared compatibility bookkeeping. The worker card's
blocked status follows WORKER.md's instruction to list every contradiction after the
whole targeted suite; no approval or question is requested here.

The runner owns commits, pnpm check and app/capabilities e2e on demo/fake; those gates
were not run by this session. No pnpm check green mark is claimed. Runtime B4b/B4c
wiring and any test repairs remain outside this change. The commit plan is
.codex-commits.json: one production commit for four files and one notes-only commit.

## Round 3 red repair (TL-P4-51)

implementer: codex

Repaired only the two older fixtures authorized for fix round 3, following
TL-P4-48 addendum 5 and the preceding section's remaining conflicts 1 and 2.
No production source, assertion, id, read fence, byte expectation, bound or
threshold changed. The b4a-r2 and b4a-r3 test files remain untouched.
No public caller, export, configuration, dependency or runtime wiring changes.
Research reuses the packet's offline references, including https://zod.dev/api
and https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents;
these are prior research, not newly verified sources. No network was used.

tests changed: src/data/contracts/observations.test.ts: b4a-ledger-identity-and-corruption now gives the independent about-you fact different text and dates own-word remembering 2026-10-12, strictly after the 2026-10-11 tombstone. Cross-section normalized text remains forgotten; every identity, corruption, replay and retained-tombstone assertion is unchanged.
tests changed: runner/test/admitted.test.ts: b4a-artifact-scope-and-order: runner admission scopes artifacts and note edits now supplies beforeText with exactly the three ruled regions and independently expected final text. Old/New payloads include their framing newline. The complete edit still admits; wrong-path and personal-region refusals remain unchanged, with no missing-byte bypass.
removed: none.

Before editing, the two named tests reproduced assertion reds:
- `b4a-ledger-identity-and-corruption`, observations.test.ts:46: empty live facts
  instead of the expected independent fact. The fixture also had the same-date
  remembering conflict at :51, identified in the preceding implementation notes.
- `b4a-artifact-scope-and-order: runner admission scopes artifacts and note edits`,
  admitted.test.ts:111: "an About me edit without its read bytes" instead of null.

Red logs: `/private/tmp/b4a-repair-92fbflkd/red-app.log` and `red-runner.log`.
The first app attempt had a syntax error in the temporary configuration; it was
corrected before reproducing the assertion red. No repository config was edited.

### Validation and scratch-output handling

All command logs, JSON reports, Vitest caches, attachments and CPU reports use
`/private/tmp/b4a-repair-92fbflkd`. Temporary configs import the production app
and runner configs, retain their environments, test lists, plugins and timer gate,
use the runner config loader and disable caching. The timer setup copy changes
only import resolution and its report destination. node_modules was neither
replaced nor symlinked. No direct git-writing command was executed.

The app's existing harness tests create nested Playwright fixtures in repository
test-results. A temp-only transform relocates those two scratch destinations and
the generated Playwright import; no assertion changes. The initial full app run
had two harness failures because that temp location lacked ESM package metadata.
Adding an OS-temp package.json with type:module resolved both: all 47 unchanged
harness tests pass in `harness.log` / `harness.json`.

The initial runner passes exposed another existing repository write:
new-instance.test.ts invokes the real build, rebuilding ignored runner/dist/runner.mjs.
This breached the no-repository-test-writes instruction on those initial runs.
The final temp runner config relocates its script copy's bundle output and the
test's expected-bundle read together, still building real production sources with
the installed esbuild. Script control flow and every byte assertion stay intact.
The relocated bundle is compared with the initially rebuilt repository bundle;
no tracked production source or build configuration is changed.

App and runner non-emitting TypeScript checks pass with incremental output disabled.
Touched-test ESLint passes separately under each package's configuration.
Logs: `tsc-app.log`, `tsc-runner.log`, `eslint-app.log`, `eslint-runner.log`.

Final full-suite results are recorded below once both runs finish.

The runner owns commits, pnpm check and capabilities e2e. Those gates were left
for the runner as instructed; no green check mark or e2e result is claimed.
The commit plan declares exactly one commit for both tests and one for these notes
alone. Runtime B4b/B4c wiring and all other test repairs remain outside this change.

## Round 4 reds (addendum 6)

implementer: codex

Red-owning session only, following TL-P4-48 addendum 6 and
`docs/harness/2026-10-11-b4a-adversarial-4.md`. Scope reaches only the new
`src/data/contracts/b4a-r4.test.ts`, these appended notes and the runner's
`.codex-commits.json`. No callers, exports, fixtures, dependencies, configuration,
existing tests or production code changed. Made-up data only. No network,
git-writing command, node_modules replacement or symlink was used.

### Exact reds and positive controls

- `b4a-r4 1 replay dedupes and falls with Undo`: source/hash/normalized-text
  replay under a different section with fresh event/fact ids must dedupe to the
  first observation. Both parseObservations with undone run ids and
  rebuildObservations must leave nothing live after Undo of that first run.
  Controls: a standalone normalized observation, same-section deduplication,
  Undo of the duplicate preserving the original, Undo of the original removing
  its same-section replay, and independent evidence from another source pass.
  A changed hash is separately required to be distinct evidence by addendum 6;
  its refusal is part of the same identity finding.
- `b4a-r4 2 Forget removes every copy`: the same sentence is stored in
  about-you and about-preferences, backed by two source observations. A Forget
  tombstone leaves zero live facts. Archiving/rebuilding only preferences leaves
  the sentence in about-you and must refuse at manifest and admission boundaries.
  Control: Forget of the sole stored copy archives it and rebuilds to the heading,
  without a consolidation budget/frontier, and passes author/manifest/admission.
- `b4a-r4 3 creation runs the same validator`: About me is absent, intake and
  live evidence are empty, and create-text/purpose generated targets the root
  About me note. Invented preference text must refuse at manifest and admission.
  Control: the existing FOLDER_TEMPLATE plus three empty regions is accepted.
- `b4a-r4 4 no unmarked prose after the regions`: an ownership/2 note initializes
  three empty regions followed by unmarked invented prose. Author, manifest and
  admission must all refuse. Control: the same personal prefix followed by the
  learned heading and exactly those regions passes all three boundaries.

`b4a-r4 rule validLearnedBlock validates every write path` adds seven separate
cases named `<path> refuses an invalid whole block`: create, init, write-through,
consolidation, Forget, Undo and rebuild. Each first accepts a valid whole block,
then requires refusal of the same block with unmarked trailing prose. The edit
cases use the adversarial ownership/2 shape, whose existing parser preserves
outside bytes; the ruled learned-block validator must therefore do the refusal.
Consolidation's control retains 201 authored words, five observations, an exact
archive and its successful dependent frontier. Forget and Undo retain their
archives and bypass the budget/frontier gate. Rebuild exercises the existing
public rebuildObservations contract and then the existing undoneRunIds
about-rewrite path; there is no separate rebuild effect kind to invent or mock.
These are observable path contracts for the single validator, without supplying
another parser/validator or assuming a new function signature in the tests.

Frozen after-bytes, content hashes and operation/capture identities are sealed
independently of applyChanges so every invalid fixture reaches manifest and
admission assertions even when authoring is refused. Soft assertions expose all
affected boundaries; positive controls use ordinary assertions and all pass.
Public calls: applyChanges, parseOwnership, parseObservations,
rebuildObservations, parseRunManifestV2, outsideAdmitted, canonicalRecordJson.

### Verification

All invocations used `--maxWorkers=2` and `--configLoader runner`. Logs, JSON
reports, cache, attachments, temporary configs and CPU reports are under
`/private/tmp/b4a-r4-ublyd18n/`. The final temp setup retains the existing test
setup and timer gate, changing only the gate copy's imports and CPU destination.
No tests wrote into the repository. No repository config or setup changed.

- Final red-only run: 11/11 expected assertion failures. Every positive control
  passed; no import, timer, fixture, corruption or other unrelated failure.
  Log/report: `reds.log`, `reds.json` in the temp directory above.
- Final targeted contract run: 1,601 tests, 1,590 passed, only the 11 new reds
  failed. Includes all four b4a regression files, observations, note-edit,
  run-manifest, ownership-format, questions, B1a, note-templates and note-format.
  Log/report: `contracts.log`, `contracts.json`. No existing contradiction found.
- Non-emitting app TypeScript check, with incremental output disabled, passed:
  `types.log`. New-test ESLint passed: `lint.log`.

Final red command from the worktree:
`./node_modules/.bin/vitest run --config /private/tmp/b4a-r4-ublyd18n/vitest.config.mjs --configLoader runner --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=/private/tmp/b4a-r4-ublyd18n/reds.json`
The targeted run uses `contracts.config.mjs` and `contracts.json` in that directory.

Initial fixture-only corrections: wrap encoded test bytes in the local
Uint8Array realm for rebuildObservations; retain both ledger and create
dependencies at the barrier; use ownership/2 for the per-path trailing-prose
bypass. The first wider run relocated cwd and could not read relative stored
fixtures; relocating only CPU output in the temp setup resolved every such
failure. No existing test, bound, tolerance or contract number was weakened.

tests changed: src/data/contracts/b4a-r4.test.ts: new four finding reds with positive controls and seven whole-block validation path cases; no existing test changed.
removed: none.

Offline sources reused from the packet, not newly verified:
https://zod.dev/api
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://arxiv.org/pdf/2605.12978

Commit plan: one tests-only commit and one notes-only commit in
`.codex-commits.json`; the runner owns commits. Left out: implementation,
pnpm check, e2e, full app/runner suites and B4b/B4c runtime wiring. The four
contract gaps remain intentionally red for the implementation session.
