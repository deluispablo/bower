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

## Round 4 (addendum 6)

implementer: codex

Re-plan: observations.ts owns one validLearnedBlock. It reads the existing ownership
parser's spans, validates the entire trailing learned block, and, when supplied the
ledger at a write boundary, binds every claim to live evidence and rejects forgotten
text anywhere in that block. The pure note author has no ledger and uses the same
validator for framing; manifest and admission supply the resolved live ledger.
Create, init, write-through, consolidation, Forget, Undo and rebuild share this home.
The reducer's evidence identity becomes source id, source hash and normalized text;
claiming that identity before invalidation prevents section replays surviving Undo.
Budget/frontier, exact archives, dependencies and read fences keep their existing homes.

Scope: observations.ts, note-edit.ts, run-manifest.ts and runner/src/spine/admitted.ts;
all their existing callers and frozen tests are exercised, without changing tests,
fixtures, configuration, exports outside these homes, dependencies or runtime wiring.
Privacy risk: incomplete Forget must refuse the entire write, including untouched regions.
Compatibility risk: older duplicate-hash assumptions may contradict addendum 6 and will
be listed after the full suites. Missing-note creation must retain template-only support.

Offline research reuses the packet's prior references, not newly verified:
https://zod.dev/api
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://arxiv.org/pdf/2605.12978

Red: all 11 frozen b4a-r4 cases failed on assertions before production changes;
all positive controls passed. Log: /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r4-fix-wut5iuce/red.log.
The first invocation could not resolve the temporary setup through the macOS /var
alias; canonicalizing the scratch path fixed it before the assertion-red run.

### Shared mechanism and removals

validLearnedBlock reuses parseOwnership's byte spans and reconstructs the expected
heading plus exactly three framed regions. Comparing it with the complete trailing
block refuses gaps, additional regions, unknown marks, fenced marker text and trailing
prose, including outside bytes which ownership/2 correctly keeps opaque on read.
The person prefix remains byte-identical. A BOM-preserving decoder keeps Unicode and
CRLF offsets correct. Exact template-only creation remains accepted with no learned
claims; learned creation uses the same ledger-backed block check as every edit.

Manifest and admission validate the complete after-text with the ledger visible at that
operation, resolving all Undo run ids together before checking every region. Per-region
factIds still constrain the rewritten claims, while untouched regions must independently
bind to live evidence. Retained tombstones forbid their normalized text anywhere in the
block unless live evidence has superseded the forgetting through the existing remembering
rule. The four frozen adversarial findings now refuse at their production boundaries.
The pure author remains mechanical: it validates framing, not unavailable ledger state;
the round-4 Forget control intentionally confirms that its splice alone can leave a copy,
which manifest and admission must then refuse. rebuildObservations rebuilds evidence only;
its existing undoneRunIds About me write uses this same final whole-block validation.

Authorization/read fencing and consolidation scheduling stay separate from block validity:
initialization refuses existing About regions, appends only a learned section, and preserves
the prefix; rewrite keeps its exact previous payload and immutable-byte invariant. No new
parser, writer, region mechanism, evidence store, runtime dispatcher or dependency exists.
The 400/400/200-word budgets, over-budget plus five-new-live-observations frontier, ordinary
append without archive/frontier, and archive-backed Forget/Undo exemption remain unchanged.

removed: aboutEvidenceOk, the separate per-payload evidence checker; validLearnedBlock owns every claim check.
removed: appendAbout's after-parser, extra-region scan and per-region location scan; shared framing validates them.
removed: rewriteRegion's About-only complete-region/extra-region scan; shared final-block validation replaces it.
removed: manifest's initialization-only payload loop and rewrite-only evidence check; the complete after-block is checked once.
removed: manifest's per-change Undo ledger reduction and live-fact-id scan; one resolved ledger and validator cover all regions.
removed: section from observation identity and the source-version-collapsing rule; identity is source/hash/normalized text.
tests changed: none; no repository test, fixture, assertion, threshold, timeout or skip changed.

### Compatibility draft rows

| Contract home | Round-4 change | Compatibility evidence / consumer |
| --- | --- | --- |
| src/data/contracts/observations.ts | Replace aboutEvidenceOk with validLearnedBlock; source/hash/normalized-text identity excludes section | Stored v1 JSONL schema and lenient stored reads unchanged; reducer/corruption/remembering/Undo controls pass. A changed hash is now distinct evidence under addendum 6. B4b/B4c use the shared block validator; retired helper has no remaining caller. |
| src/data/contracts/note-edit.ts | Shared learned-block framing at initialization and final About edit; remove per-path region scans | Frozen round-4 author controls, BOM/CRLF/Unicode prefix, missing newline, read fence and existing MOC/profile/template controls pass. Personal bytes remain immutable; ownership parsing itself is unchanged. Author supplies framing only; write boundaries supply the ledger. |
| src/data/contracts/run-manifest.ts | Validate generated root About me creation and every entire About after-text with one resolved ledger | No persisted effect/schema changes; all 1,420 run-manifest tests and frozen round-2/3/4 controls pass. Existing dependencies, exact archive bytes, successful frontier, budgets and Forget/Undo exemption stay enforced. Legacy manifests remain readable; learned writes with unsupported claims now refuse. |

### Verification setup

All logs, reports, CPU reports, attachments, config caches, synthetic repositories and
bundle output are under /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r4-fix-wut5iuce, or the tests' own OS-temp folders.
Every Vitest invocation uses --maxWorkers=2 and --configLoader runner. The temp configs
import the existing app/runner configs and retain environments, setup and the real timer
gate. The gate copy changes only imports and CPU destination. As in the prior red-repair
session, temp-only transforms relocate harness.test.ts's two scratch destinations and
its generated Playwright import, plus new-instance.test.ts's bundle script/read destination.
The copied new-instance.sh builds real runner sources to the OS-temp bundle. All assertions
remain unchanged; no repository test/config/setup or node_modules was edited or replaced.
Unchanged new-instance tests operate only on their synthetic local git repositories; this
worker ran no git-writing command and did not commit, push, replace or symlink node_modules.

The first full app run exposed the new validator's BOM-offset bug. Its decoder now retains
the BOM, rather than shifting the calculated section start by one character. The final
1,524-test targeted run passes every contract, including the byte-preservation and read-fence
controls. The initial lint/tsc run also caught a retired parseOwnership import; removing it
made both app/runner TypeScript and touched-app ESLint pass. Neither transient failure
remains; the final full app run follows these corrections.

Green targeted command:
`pnpm exec vitest run src/data/contracts/b4a-r4.test.ts src/data/contracts/note-edit.test.ts src/data/contracts/observations.test.ts src/data/contracts/b4a-r2.test.ts src/data/contracts/b4a-r3.test.ts src/data/contracts/run-manifest.test.ts --maxWorkers=2 --config /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r4-fix-wut5iuce/app.mjs --configLoader runner --outputFile.json=/private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r4-fix-wut5iuce/contracts-final.json`
1,524/1,524 pass, including all 11 frozen round-4 cases and all positive controls.
Logs/reports: contracts-final.log, contracts-final.json. Before-change assertion reds:
red.log. First round-4 green: round4.log.

Full runner command, from runner/:
`pnpm exec vitest run --maxWorkers=2 --config /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r4-fix-wut5iuce/runner.mjs --configLoader runner`
58 files, 718 tests: 717 pass, one older contradiction below. Logs/reports:
runner-full.log, runner.json. No loader, fixture, timer or unrelated runner failure.

Non-emitting checks pass:
`pnpm exec tsc --noEmit --incremental false -p tsconfig.app.json`
`pnpm exec tsc --noEmit --incremental false -p tsconfig.node.json`
`pnpm exec tsc --noEmit --incremental false -p runner/tsconfig.json`
Touched production ESLint passes under app and runner package configurations.
`node scripts/check-unused-gate.mjs` passes both ordinary (2) and production (34) baselines.
Logs: tsc-app.log, tsc-node.log, tsc-runner.log, eslint-app.log, eslint-runner.log, unused.log.

### Frozen contradictions and external failures

1. src/data/contracts/b4a-fr1.test.ts:243, `b4a-fr1 7 rereads do not supply five observations`:
   expects changed source hashes to remain a single observation. Addendum 6 explicitly
   includes hash in identity; five distinct hashes now provide five observations. The
   same-hash replay refusal and five/four independent-evidence controls still pass.
   No test changed and no second identity was added just for the consolidation gate.
2. runner/test/admitted.test.ts:116, `b4a-artifact-scope-and-order: runner admission scopes
   artifacts and note edits`: expects admission of ungrounded `New` with no ledger effect,
   live observation or factIds. The frozen round-4 ruling requires live evidence at every
   write boundary. The shared validator correctly returns `an invalid learned section`.
   The round-4 complete admission controls pass; no test or missing-evidence bypass changed.
3. src/docs.test.ts:134, `every change since the P2 freeze is listed`: existing commit
   98abf5a3 is missing from the shared compatibility ledger. The three contract draft rows
   above are ready for the coordinator; this worker does not edit the shared ledger.
4. src/e2e-port.test.ts:37, `a server from another worktree is never reused`: expected
   sandbox listen EPERM at 127.0.0.1, a timeout and one unhandled error. No assertion,
   timeout or environment restriction changed.

The runner owns commits, pnpm check and capabilities e2e on demo/fake; these were not run
here and no check green mark is claimed. Runtime B4b/B4c wiring and all test repairs remain
outside the change. .codex-commits.json declares one production commit for the four owned
production files and one commit for these notes alone. Acceptance remains blocked on the
frozen contradictions and shared compatibility bookkeeping, not on the round-4 reds.

### Final full-suite result

Final full app command from the worktree:
`pnpm exec vitest run src --maxWorkers=2 --config /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r4-fix-wut5iuce/app.mjs --configLoader runner --outputFile.json=/private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r4-fix-wut5iuce/app-final.json`
177 files, 5,781 tests: 5,778 pass, exactly the three documented failures remain:
changed-hash identity at b4a-fr1.test.ts:243, shared compatibility bookkeeping at
docs.test.ts:134 and expected listen EPERM at e2e-port.test.ts:37 (plus its one unhandled
error). Logs/reports: app-final.log, app-final.json. All BOM, CRLF, Unicode, missing-newline,
author, read-fence and round-4 controls now pass in the full suite. The runner's one frozen
admission contradiction is the only other full-suite failure; every failure is listed above.
No test was edited to make any result green. Final git diff --check passes; read-only git
status/diff confirm only the four production files and this notes file changed. The ignored
.codex-commits.json is present and contains exactly the requested two commit objects.

Skipped: runner-owned commits, pnpm check, capabilities e2e and B4b/B4c runtime wiring.
Risk: acceptance needs the lead's frozen-test repair and coordinator's compatibility record;
the four adversarial defects and all seven shared-validation path controls are green.


## Round 4 red repair (TL-P4-51)

Scope: repair only the two older fixtures authorized by TL-P4-48 addendum 6.
The shared production validator and source-id/hash/normalized-text identity stay unchanged.
No production code, b4a-r2/r3/r4 tests, callers, exports, dependencies or repository config changed.
No byte, id, fence, word budget or independent-evidence assertion was loosened.

Prior research reused offline from the packet: https://zod.dev/api and
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents.
No network request or new dependency was needed for these fixture repairs.

Red evidence before edits:
- `b4a-fr1 7 rereads do not supply five observations`, src/data/contracts/b4a-fr1.test.ts:243:
  changed-hash fixture returned true where the old test expected false; 8 other tests passed.
- `b4a-artifact-scope-and-order: runner admission scopes artifacts and note edits`,
  runner/test/admitted.test.ts:116: expected null, received `an invalid learned section`;
  3 other tests passed.

tests changed: src/data/contracts/b4a-fr1.test.ts: `b4a-fr1 7 rereads do not supply five observations` now varies capture ids while retaining identical source id, hash and text. Addendum 6 makes distinct hashes distinct evidence; this fixture again checks rereads. Same-hash replay refusal and the five/four independent-evidence controls retain their assertions.
tests changed: runner/test/admitted.test.ts: `b4a-artifact-scope-and-order: runner admission scopes artifacts and note edits` now orders a JSONL ledger effect containing a live `New` observation before the edit, and cites its factId. Its source id comes from admitted words. Addendum 6 requires live evidence at every write boundary; all existing allowed-artifact, outside-folder, path and region assertions remain, with identical grounding for positive and negative edit controls.

Verification uses OS-temp configs copied from the preceding round's documented setup.
They retain the app/runner environments, setup and timer gate, relocate CPU reports and
harness scratch fixtures, and build/read the new-instance bundle in OS temp.
All assertions stay intact; no node_modules replacement or symlink was made.
No git-writing command was issued by this worker. Full-suite new-instance fixtures use
only their isolated, synthetic OS-temp repositories, as in the preceding round.


Logs and JSON reports: `/private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-red-repair-ldw9wi8k`.
- Full runner: `pnpm exec vitest run --maxWorkers=2 --config /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-red-repair-ldw9wi8k/runner.mjs --configLoader runner`
  from runner/: 58 files, 718 tests pass; runner-full.log and runner.json.
- App TypeScript: `pnpm exec tsc --noEmit --incremental false -p tsconfig.app.json` passes; tsc-app.log.
- Runner TypeScript: `pnpm exec tsc --noEmit --incremental false -p runner/tsconfig.json` passes; tsc-runner.log.
- Touched-file ESLint passes with each package's configuration; eslint-app.log and eslint-runner.log.
- Pre-edit targeted assertion failures: red-app.log and red-runner.log.
The first pre-edit app attempt used a noncanonical /var temp path and failed setup resolution;
canonicalizing it to /private/var allowed the assertion red above to run. No repo change was needed.


First full app run: 177 files, 5,781 tests; 5,778 pass and 3 fail.
The repaired b4a-fr1 test and all frozen round-2/3/4 controls pass.
Failures: src/e2e-port.test.ts:37 (expected listen EPERM and timeout, one unhandled error),
src/harness.test.ts:631 and :643 (the relocated fixture config loaded as CommonJS).
The OS-temp directory lacked the preceding round's `package.json` with `type: module`.
Adding that declaration only in OS temp resolves both harness failures: all 47 harness
tests pass on the focused rerun (harness.log/harness.json). No assertion or repository
configuration changed. The full app suite is rerun with that corrected temp setup.
The previously recorded src/docs.test.ts:134 compatibility failure does not occur in this checkout.


Final full app command:
`pnpm exec vitest run src --maxWorkers=2 --config /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-red-repair-ldw9wi8k/app.mjs --configLoader runner --outputFile.json=/private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-red-repair-ldw9wi8k/app-final.json`
177 files, 5,781 tests: 176 files and 5,780 tests pass. The only failure is
src/e2e-port.test.ts:37, `a server from another worktree is never reused`:
expected sandbox listen EPERM at 127.0.0.1, its timeout and one unhandled error.
Logs: app-final.log/app-final.json. Both repaired tests and all b4a-r2/r3/r4 controls pass.
No new contradiction remains. Full runner: 58 files and all 718 tests pass.

Delivery: `.codex-commits.json` contains exactly two objects, tests first and these
notes alone second. The runner owns actual commits, pnpm check and capabilities e2e.
Read-only git status/diff show only the two authorized tests, these notes and the
commit metadata changed; git diff --check passes. No production code changed.

Skipped: runner-owned commits, pnpm check and capabilities e2e; no runtime changes needed.
Risk: the app suite remains nonzero solely for expected sandbox EPERM; runner gates remain pending.

### Coordinator gate fix (round 4)

The app TypeScript gate failed at observations.ts:208 (`TextDecoderConstructorOptions` needs `fatal` beside `ignoreBOM` in the app lib). The coordinator added `fatal: false`, which is the decoder's default, so behaviour is unchanged.

removed: none
tests changed: none


## Round 5 reds (addendum 7)

implementer: codex

Scope: only the new src/data/contracts/b4a-r5.test.ts and these notes, plus the
runner's commit plan. P4-120's three findings and TL-P4-48 addendum 7
are the contract. No existing test, production caller, fixture, configuration,
export, dependency or runtime wiring changed. No second parser or writer was added.
The fixtures reuse the round-4 manifest sealing pattern and the production author,
parseRunManifestV2, outsideAdmitted, parseObservations and validLearnedBlock.
All data is made up. No network or git-writing command was used; node_modules
was neither replaced nor symlinked.

Offline research reused from the packet, not newly verified:
https://zod.dev/api
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://arxiv.org/pdf/2605.12978

### Exact reds and positive controls

1. `b4a-r5 1 final block against final ledger`:
   an existing live observation supplies the learned sentence, an About me edit
   occurs, its Forget tombstone is appended afterward, then maintain. Four cases
   cover initialization's about-append, plain write-through's about-rewrite,
   link-rewrite and an archived Undo rebuild's about-rewrite. For the generic link
   case the learned sentence was already appended and the edit rewrites a personal
   link outside the learned section. Each control removes the forgotten sentence
   from the final block and is accepted by author, manifest and runner admission.
   The rebuild also invalidates an obsolete origin and retains an independent live
   sentence, so its archive/Undo gate is genuine. validLearnedBlock confirms the
   final-block/final-ledger contrast for every case. The dependency edges include
   the late ledger write before maintain. All eight refusal assertions fail:
   manifest returns ok: true and outsideAdmitted returns null for each bad case.
2. `b4a-r5 2 link rewrites never edit the learned section`:
   live `Alex visits [[Garden]].` and a tombstoned `Alex grows beans.` are stored.
   Garden rewritten to that sentence changes learned text and is accepted by the
   author, manifest and runner admission, although validLearnedBlock rejects it.
   A benign Garden-to-Meadow rewrite also changes learned bytes, proving the ban
   is about editing the learned section rather than only detecting tombstones.
   Controls: a link rewrite in the personal region works without changing learned
   bytes; an archived ledger rebuild invalidates the old origin and refreshes the
   learned link from live Meadow evidence. Both controls pass all three paths.
   Four finding assertions fail: two author preservation checks and the manifest
   and runner-admission refusal checks for the tombstoned target.
3. `b4a-r5 3 creation is exactly the template plus empty regions`:
   About me is absent, the ledger is empty, and a generated root note puts
   `Alex prefers invented work.` before the three empty regions. Both an invented
   prefix alone and the exact template followed by that extra sentence are refused
   by the test contract; both are currently accepted by manifest and admission.
   The positive control is the exact FOLDER_TEMPLATE bytes plus the three empty
   regions, accepted by both paths. Four finding refusal assertions fail.

Every control uses hard assertions before its finding checks. Soft assertions
collect both production-boundary failures without an author refusal hiding them.
The three tests complete with exactly 16 finding-specific assertion failures;
there are no control, fixture, setup, timer, import or runtime failures.

### Verification

OS-temp logs/configs/reports: `/private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r5-ra4l3pjr`.
The temp config imports the existing Vite config and retains jsdom, app setup and
real-timer enforcement. Only its cache directory and the timer setup's CPU report
output are relocated to OS temp. No test output writes into the repository.

Final command from this worktree:
`./node_modules/.bin/vitest run --config /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r5-ra4l3pjr/vitest.config.mjs --configLoader runner --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=/private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r5-ra4l3pjr/reds.json`
Exit 1: one file, exactly three requested tests fail only on their own findings.
Logs/reports: reds.log, reds.json. The JSON report was checked for all three exact
names, assertion-only failures and their expected labels/counts (8, 4, 4).

Non-emitting TypeScript and touched-file ESLint pass:
`./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.app.json`
`./node_modules/.bin/eslint src/data/contracts/b4a-r5.test.ts`
Logs: types.log, lint.log.

The initial run already reproduced all three findings with passing controls.
Before the final run, the write-through control was simplified to share the bad
case's ledger while omitting only the forgotten sentence; creation also gained
an exact-template-plus-invented-sentence guard. No existing test or contract bound
was changed, and no red was weakened.

tests changed: src/data/contracts/b4a-r5.test.ts: new three finding reds with positive controls; final ledger checked across link rewrite, initialization, append and rebuild; learned links and exact missing-note creation guarded through manifest validation and runner admission.
tests changed: none of the existing tests; all remain unchanged.
removed: none.

.codex-commits.json declares one tests-only commit and one notes-only commit.
The runner owns actual commits. Read-only git diff/status and diff --check verify
the scope; the commit metadata is separately validated as a JSON array.

Skipped: implementation, pnpm check, full suites and e2e; this session writes reds only.
Risk: the three reviewed data-safety gaps remain intentionally unfixed for the next implementer.


## Round 5 (addendum 7)

implementer: codex

Implemented the three P4-120 findings under TL-P4-48 addenda 6 and 7, with the
existing validLearnedBlock, ownership parser and note author. Scope reaches
observations.ts, note-edit.ts, run-manifest.ts and runner/src/spine/admitted.ts;
their callers, frozen contract tests, app tests and runner tests are exercised.
No test, fixture, repository configuration, dependency or runtime wiring changed.
No network was used; node_modules was neither replaced nor symlinked. No worker
command committed, staged, switched, merged, pushed or otherwise wrote git state
in this checkout. The unchanged suites create synthetic git repositories only in
OS temp; their instance command uses a local gh stand-in, never GitHub.

Prior offline research from the packet, not newly verified:
https://zod.dev/api
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
https://arxiv.org/pdf/2605.12978

### Final-state validation and scope

Manifest validation and runner admission recognize an About me edit by its path,
captured file id or About change, rather than admitting only two change kinds.
They retain captured identity, exact authored bytes, read fences, archive grammar,
archive bytes, budgets, frontier and dependency checks. At the end of the manifest,
the latest complete About me text is checked against the last ledger write, with
all declared Undo origins invalidated. Late Forget now removes its evidence before
validLearnedBlock judges the final text. All regions are judged together, even
when the note edit is a generic link rewrite or contains multiple change kinds.

Per-edit fact-id subsets no longer decide final validity: a later Forget can
invalidate a selected fact while a valid final block already omits its sentence.
The final live ledger is authoritative. Archives, selected rebuild coverage and
consolidation/frontier scheduling retain their separate existing checks.

Generic link rewriting excludes learned payload offsets returned by the existing
ownership parser, in both ownership/2 notes and trailing-region notes with a legacy
personal prefix. Personal links still rewrite normally. Learned links retain their
bytes until the existing evidence rebuild refreshes them; no second link mechanism,
parser, author, dispatcher or ledger was introduced.

Creation uses validLearnedBlock's creation check: precisely the current folder
template bytes followed by the heading and the three canonical empty, labelled
regions. Extra personal prose, learned claims, template-only creation, extra blanks
and alternate line endings cannot enter as generated trusted personal context.
Existing template-only notes still pass the ordinary read/edit block check.
Repeated creates are refused. Maintain cannot write memory targets; admission now
matches the existing manifest refusal for About me, its ledger and its archives.

removed: manifest/admission's About-only change-kind trigger and exclusive append/rewrite restriction.
removed: operation-time learned-block evidence checks; one final-block/final-ledger check replaces them.
removed: per-change factIds maps and validLearnedBlock's unused fact-id-subset argument/filter.
removed: unconditional requirement for a preceding ledger effect on every About edit; an empty final ledger still rejects learned claims.
tests changed: none; all existing and round-5 tests, assertions, bounds, thresholds and timeouts remain unchanged.

### Compatibility draft rows

| Contract home | Round-5 change | Compatibility evidence / consumer |
| --- | --- | --- |
| src/data/contracts/observations.ts | The existing validator enforces exact template plus empty regions for creation; retires per-edit fact-id subsets | Stored JSONL and ownership formats remain unchanged. Existing two-argument consumers retain whole-block validation. Every production caller of the retired third argument was updated; creation is the new optional third boolean. Round-2/3/4/5 controls pass, including remembering, Undo, tombstones and canonical creation. B4b/B4c consume this same validator. |
| src/data/contracts/note-edit.ts | Generic renames preserve every learned payload byte using existing parser spans | Personal link rewrites, read/version fences, legacy prefixes, Unicode/BOM/CRLF, MOC/profile/template and Current state controls remain exercised by the full app suite. A rename solely inside learned regions is unchanged/refused; evidence rebuilds continue to refresh learned links. |
| src/data/contracts/run-manifest.ts | Validate the final About me block against the final ledger across all edit kinds and Undo origins; require exact empty creation | No manifest/effect schema changed. Captured file identity and write fences, archive ordering/bytes, successful frontier, budgets and rebuild coverage remain checked. Late Forget is refused when its text survives. A final block already excluding that fact passes, even if the earlier rewrite's factIds selected it. No second validity mechanism exists. |

### Red and verification setup

Before editing production, all three frozen b4a-r5 tests failed with the expected
16 finding assertions and passing controls (red.log). Exact names:
- b4a-r5 1 final block against final ledger
- b4a-r5 2 link rewrites never edit the learned section
- b4a-r5 3 creation is exactly the template plus empty regions

All four targeted round-2/3/4/5 files pass after the final production changes:
22/22 tests, including all three round-5 reds and their positive controls.
Logs/reports: targeted-final.log and targeted-final.json.

OS-temp verification folder: `/private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r5-fix-uwf86_9n`.
`/tmp/b4a-r5-fix-path` contains its exact path. Temporary configs import the real
app/runner configs, retain jsdom/node, app setup and the real-timer gate, and
relocate caches, attachments, reports and the gate's CPU output to that folder.
No test assertions or production imports are altered. Temporary Vite transforms
relocate only harness.test.ts's generated Playwright fixture directory/import and
new-instance.test.ts's build script/bundle destination. The copied instance script
builds the real runner sources with the installed esbuild into OS temp. The temp
folder declares type: module so relocated generated Playwright configs retain the
repository's ES module interpretation.

The initial full runs inadvertently exercised the older harness tests' repository
output destinations: three test-results/fx-* directories and runner/dist/runner.mjs.
Those generated outputs were moved to the verification folder's initial-output/
subdirectory; pre-existing fixture directories were left alone. The final full runs
use the OS-temp transforms. No repository test/setup/config file was edited.

Final requested commands, with --maxWorkers=2 and only output relocation flags:
- From runner/: `pnpm exec vitest run --maxWorkers=2 --config /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r5-fix-uwf86_9n/runner.mjs --configLoader runner`.
  58 files, 718/718 tests pass. Logs/reports: runner-final.log and runner.json.
- From the checkout: `pnpm exec vitest run src --maxWorkers=2 --config /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r5-fix-uwf86_9n/app.mjs --configLoader runner`.
  178 files, 5,784 tests: 5,782 pass, two external failures and one expected
  unhandled port error. Logs/reports: app-final.log and app.json.
- `pnpm exec tsc --noEmit --incremental false -p tsconfig.app.json`: pass.
- `pnpm exec tsc --noEmit --incremental false -p tsconfig.node.json`: pass.
- `pnpm exec tsc --noEmit --incremental false -p runner/tsconfig.json`: pass.
- ESLint on the three touched contract files in the app package: pass.
- ESLint on src/spine/admitted.ts in the runner package: pass.
  A combined-package invocation had parser-root ambiguity; separate package invocations pass without config changes.
- `node scripts/check-unused-gate.mjs`: pass, ordinary baseline 2 and production baseline 34.

Type/lint/unused logs: tsc-app-final.log, tsc-node-final.log, tsc-runner-final.log,
eslint-app-final.log, eslint-runner-final.log and unused-final.log. Exit codes are
recorded beside these logs. Read-only git diff --check passes.

### Older contradictions and external failures

The first full app run completed 178 files and 5,784 tests: 5,782 passed, two failed,
and one unhandled expected port error. No older test contradicting addendum 7 was
found. In particular all unchanged runner tests and all prior B4a fixtures pass.
The two app failures are external to this fix:
1. src/docs.test.ts:134, `every change since the P2 freeze is listed`: shared
   compatibility bookkeeping omits existing commit 9054e66d. This worker does not
   own that shared ledger. The three draft rows above are ready for the coordinator.
2. src/e2e-port.test.ts:37, `a server from another worktree is never reused`:
   expected sandbox listen EPERM at 127.0.0.1, with its test timeout and one unhandled
   error. No test, timeout or environment constraint was changed.

tests changed: no older contradiction was repaired or weakened; no repository test was changed.

.codex-commits.json is a JSON array with one production commit for the four owned
files, then one notes-only commit. The runner owns commits, pnpm check and the
capabilities e2e on demo/fake. No worker check mark or e2e success is claimed.

Skipped: runner-owned commits, pnpm check, capabilities e2e and B4b/B4c runtime wiring.
Risk: final integration still needs the runner's gates and the shared compatibility ledger entry.

The first output-relocated app run had two extra harness failures at
src/harness.test.ts:631 and :643 because generated Playwright configs in OS temp
lacked the repository's type: module package declaration. Adding that declaration
in OS temp resolved the setup issue: all 47 unchanged harness tests pass in
harness-final.log / harness-final.json. No assertion or repository config changed.
The full app suite is rerun with that corrected output-only setup; the transient
report is retained as app-relocation-initial.json / app-relocation-initial.log.

### Final full app result

The corrected full app run completes 178 files and 5,784 tests: 5,782 pass,
exactly the two external failures listed above remain, and the expected listen
EPERM is its one unhandled error. All 47 harness tests pass in this full run;
all B4a rounds, note-edit, observations, run-manifest, ownership, existing contract
compatibility and screen tests pass. No old test contradicting addendum 7 remains.
Logs/reports: app-final.log and app.json. The app-final.exit file records exit 1;
runner-final.exit and every requested TypeScript/ESLint/unused final exit record 0.
Only the four production files, these notes and requested commit metadata are in
the delivery. Read-only git diff --check passes; no repository test was changed.
Final artifact inventory retains only the pre-existing repository fixture
folders; all outputs of the corrected final runs are in OS temp.

Skipped: runner-owned commits, pnpm check, capabilities e2e and B4b/B4c runtime wiring.
Risk: shared compatibility bookkeeping still lacks 9054e66d; the expected sandbox port EPERM remains.


## Round 6 reds (addendum 8)

Scope: P4-121 and TL-P4-48 addendum 8; reds only. No production file or existing
test changed. One new file contains exactly three identity cases:
- `b4a-r6 1 About me`
- `b4a-r6 2 ledger`
- `b4a-r6 3 archive`

Each case seals an otherwise valid ledger write → marked About me append →
maintenance manifest. Capture places resolve the memory file and questions file
by their own IDs. Capture and operation identities are recomputed for every
fixture, including the hostile target; rejection cannot be an outdated seal.
The memory target keeps its real parent ID, changing only its declared path.

Positive controls, through parseRunManifestV2 and outsideAdmitted: the real
questions ID with `.bower/questions.json` is accepted at both boundaries; the
memory ID with its actual protected path is refused at both boundaries.
The production targetPath resolver independently confirms each captured ID.

Each case fails only four soft assertions for the ruled identity gap:
1. Memory ID aliased as `.bower/questions.json`: manifest accepts unexpectedly.
2. That same alias: runner admission returns null unexpectedly.
3. Questions ID declared as `.bower/requests.json`, while resolving to questions:
   manifest accepts unexpectedly.
4. That mismatched allowed target: runner admission returns null unexpectedly.
The independent allowed-file mismatch also proves that path/ID agreement is
required outside the memory ban. All positive and protected-path controls pass.

Verification (exit 1 expected; exactly three failed tests, twelve finding
assertions, no other failures):
`pnpm exec vitest run src/data/contracts/b4a-r6.test.ts --maxWorkers=2 --config
/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r6-reds.UqDVSNfb76/vitest.mjs
--configLoader runner`

Logs/report/config: `/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b4a-r6-reds.UqDVSNfb76/`:
`reds.log`, `reds.json`, `vitest.mjs`, `eslint.log`, and `cpu/`.
The temporary config retains jsdom and both app setup files, relocates Vite cache
and JSON output, and redirects only the timer gate's CPU report destination to
OS temp. Tests produce no repository output. ESLint on the new test passes;
read-only `git diff --check` passes. No git write, network call, dependency change
or node_modules replacement was made.

Prior research reused offline: packet's Zod declarations reference
https://zod.dev/api (not newly verified). Existing Vitest soft-assertion and sealed
manifest fixtures are reused from b4a-r5.test.ts; no new dependency or helper home.

tests changed: src/data/contracts/b4a-r6.test.ts: added three identity reds, each with manifest/admission controls.
tests changed: no existing test modified or deleted.

Commit handoff: `.codex-commits.json` requests one test-only commit and one
notes-only commit; the runner commits the diff.

Skipped: production fix, full suites, pnpm check, e2e and commits; this session is reds only.
Risk: both boundaries still admit memory aliases and mismatched allowed paths until the implementation round.


## Round 6 (addendum 8)

Implemented P4-121 and TL-P4-48 addendum 8 with one shared helper,
`maintenanceTargetOk`, in `src/data/contracts/run-manifest.ts`.
It resolves the target's file ID through the existing `targetPath` mechanism,
refuses unresolved IDs and declared/resolved path mismatches, and refuses
About me, the observation ledger and About me archives by either identity or
path. Both `aboutArtifactsOk` and `outsideAdmitted` call this helper;
no second resolver, validator, dependency or maintenance writer was added.

Scope: those two production files and these notes. Call-site search covered
manifest parsing, runner admission, maintenance's producer in runner/src/index.ts,
existing contract/runner consumers and the frozen round-6 tests. No caller,
fixture, config, export consumer or test was modified beyond the two named
boundaries. This entry does not own runner/src/index.ts.

removed: run-manifest.ts aboutArtifactsOk's path-only maintenance memory ban.
removed: admitted.ts outsideAdmitted's duplicated path-only maintenance memory ban.
tests changed: none; no test, assertion, threshold, timeout or fixture was changed.
tests changed: no older contradiction was repaired or weakened.

### Compatibility draft rows

| Contract home | Round-6 change | Compatibility evidence / consumer |
| --- | --- | --- |
| src/data/contracts/run-manifest.ts | One maintenanceTargetOk helper resolves file identity, bans protected memory and refuses a declared path that differs from its resolved path; aboutArtifactsOk uses it | No wire schema or stored bytes changed. Existing targetPath remains the sole resolver. Questions with matching captured ID/path pass; all three protected memory identities and an allowed-file path mismatch refuse at both boundaries. Strict identity binding also rejects existing maintenance manifests whose target IDs are missing from capture.places; 361 runner failures below block compatibility. Runner admission imports the same helper. B4b/B4c must consume the agreed identity contract. |

### Red-first evidence and checks

Before production edits, the frozen `src/data/contracts/b4a-r6.test.ts` failed
all three tests with exactly twelve finding assertions. Positive questions and
protected-path controls passed. Log: `/tmp/b4a-r6-before.log`.
After the fix all three tests pass, including the allowed-file mismatch and
identity controls. Log: `/tmp/b4a-r6-after.log`. Exact tests:
- `b4a-r6 1 About me`
- `b4a-r6 2 ledger`
- `b4a-r6 3 archive`

Verification folder: `/tmp/b4a-r6-checks-_2c676vs`.
Final full runner command:
`pnpm -C runner exec vitest run --maxWorkers=2 --config /tmp/b4a-r6-checks-_2c676vs/runner.mjs --configLoader runner`.
Result: 58 files, 718 tests; 357 pass, 361 fail across 40 files (exit 1).
Logs/report: runner-final.log and runner.json.

Final full app command:
`pnpm exec vitest run src --maxWorkers=2 --config /tmp/b4a-r6-checks-_2c676vs/app.mjs --configLoader runner`.
App result is recorded below after the complete run.

TypeScript app/node/runner (`pnpm exec tsc --noEmit -p <config>`): pass;
logs tsc-app-final.log, tsc-node.log and tsc-runner-final.log.
ESLint on run-manifest.ts from the app package and admitted.ts from the runner
package: pass (eslint-app.log and eslint-runner.log). The initial combined
invocation had parser-root ambiguity; separate package invocations resolve it.
`node scripts/check-unused-gate.mjs`: pass, baselines 2 and 34 (unused.log).
Read-only `git diff --check`: pass.

Temporary configs import the real app/runner configs, preserve their setup and
timer gate, and relocate caches, JSON reports, attachments and CPU output to OS
temp. Output-only transforms relocate harness.test.ts's generated Playwright
fixtures/import and new-instance.test.ts's copied build script/bundle. The copied
script bundles the actual runner sources with installed esbuild into OS temp.
No assertion or repository test/config/setup file was edited. The temp folder
has type: module so generated Playwright configs keep the same module semantics.

The initial runs incorrectly retained the older harness fixtures' repository
output paths and new-instance's build destination. Their three newly generated
fx directories and runner bundle were moved to initial-output/ in OS temp;
pre-existing fixture directories were left alone. The app's initial run was
interrupted, then both full suites were rerun with output relocation. This was
an output-isolation mistake, not an assertion change. Final runs write test
artifacts to OS temp. No git-writing command, network call or node_modules
replacement/symlink was made by this worker. Suite-internal Git fixtures operate
on their own made-up temporary repositories.

Prior research reused offline: the packet's [Zod declarations](https://zod.dev/api)
reference, not newly verified. The production identity resolver and sealed
round-6 fixtures were reused; no network or new library was needed.

### Compatibility blocker and every older runner failure

The ruled mismatch refusal is implemented without an unresolved-ID exception.
The existing maintenance producer in runner/src/index.ts:434–455 includes system,
MOC and reserved future IDs from its listing/snapshot without adding each one
to capture.places. targetPath resolves captured IDs only. Consequently ordinary
runs report `The manifest planned ... is refused (shape)` before their promised
maintenance/write results. This is a production integration blocker, not a
reason to weaken old tests. Extending identity resolution or changing the
producer requires a lead ruling; no extra mechanism or out-of-scope patch was
added. The whole runner suite was run before stopping, as TL-P4-51 requires.
All 361 failed tests are listed below with their failing assertion location;
full messages and secondary assertions remain in runner.json/runner-final.log.

- `runner/test/ask-answer-loop.test.ts:304` — an answer applies at once (TL-P4-08 addendum 8) a yes to keep one note starts a scoped run that merges
- `runner/test/ask-answer-loop.test.ts:328` — an answer applies at once (TL-P4-08 addendum 8) answers reach the model path
- `runner/test/ask-answer-loop.test.ts:358` — an answer applies at once (TL-P4-08 addendum 8) a yes to a pair ask merges through keep-one-note-merge
- `runner/test/ask-answer-loop.test.ts:385` — an answer applies at once (TL-P4-08 addendum 8) a yes to a pair whose other note is in the Bin settles and says nothing was merged
- `runner/test/ask-answer-loop.test.ts:403` — an answer applies at once (TL-P4-08 addendum 8) with no new input a second run leaves nothing held or waiting for the same reason
- `runner/test/ask-answer-loop.test.ts:442` — an answer applies at once (TL-P4-08 addendum 8) an answer during a run is applied by the next
- `runner/test/ask-answer-loop.test.ts:460` — an answer applies at once (TL-P4-08 addendum 8) a no closes the question with no run
- `runner/test/ask-answer-loop.test.ts:501` — an answer applies at once (TL-P4-08 addendum 8) a yes to a thing asked about starts a run that takes only its pile, with the answer shown
- `runner/test/ask-answer-loop.test.ts:521` — an answer applies at once (TL-P4-08 addendum 8) a yes to Write it writes the update in a scoped run
- `runner/test/ask-answer-loop.test.ts:549` — an answer applies at once (TL-P4-08 addendum 8) a person edit after the question stops Write it
- `runner/test/ask-answer-loop.test.ts:567` — an answer applies at once (TL-P4-08 addendum 8) undo of Write it restores the person's section
- `runner/test/ask-answer-loop.test.ts:591` — an answer applies at once (TL-P4-08 addendum 8) a yes to write it applies the shown text with no model call
- `runner/test/ask-answer-loop.test.ts:624` — an answer applies at once (TL-P4-08 addendum 8) write it re-asks when the section changed since it was shown
- `runner/test/ask-answer-loop.test.ts:644` — an answer applies at once (TL-P4-08 addendum 8) a write it yes whose note is gone writes one answered row
- `runner/test/ask-answer-loop.test.ts:673` — an answer applies at once (TL-P4-08 addendum 8) write it re-asks when the note changed elsewhere since it was shown
- `runner/test/ask-answer-loop.test.ts:698` — an answer applies at once (TL-P4-08 addendum 8) a clash at write time leads to the re-ask with the new sentence and no extra press
- `runner/test/ask-answer-loop.test.ts:744` — an answer applies at once (TL-P4-08 addendum 8) only a clash keeps an answer for a re-ask
- `runner/test/ask-answer-loop.test.ts:773` — an answer applies at once (TL-P4-08 addendum 8) the same non-clash refusal never starts more runs than the cap, then shows the not-written row
- `runner/test/ask-answer-loop.test.ts:823` — an answer applies at once (TL-P4-08 addendum 8) a write it refused for good writes one answered row on Home and on the note
- `runner/test/ask-answer-loop.test.ts:844` — an answer applies at once (TL-P4-08 addendum 8) a write it with nothing to write writes one answered row
- `runner/test/ask-answer-loop.test.ts:96` — an answer applies at once (TL-P4-08 addendum 8) a lone no to write it closes the question with no model call
- `runner/test/ask-answer-loop.test.ts:890` — an answer applies at once (TL-P4-08 addendum 8) a yes to write it beside a pile asks the model
- `runner/test/ask-answer-loop.test.ts:900` — an answer applies at once (TL-P4-08 addendum 8) of two answers to one question, the later one counts
- `runner/test/ask-one-per-thing.test.ts:46` — one open question per thing (TL-P4-11 addendum) two differently worded asks about one thing give one question
- `runner/test/ask-one-per-thing.test.ts:56` — one open question per thing (TL-P4-11 addendum) a thing that leaves the inbox closes its question
- `runner/test/ask-one-per-thing.test.ts:67` — one open question per thing (TL-P4-11 addendum) an answer whose subject left is settled
- `runner/test/ask-one-per-thing.test.ts:82` — one open question per thing (TL-P4-11 addendum) a re-upload of the same thing adds no question
- `runner/test/ask-one-per-thing.test.ts:96` — one open question per thing (TL-P4-11 addendum) an instructions run keeps an open thing question
- `runner/test/ask-one-per-thing.test.ts:111` — one open question per thing (TL-P4-11 addendum) a pile ask then a thing ask leave one question
- `runner/test/ask-only-lines.test.ts:36` — a run that only asks keeps the Timeline lines the model added with no cites
- `runner/test/b1-index.test.ts:97` — B1c index: exact PARA order direct notes shortest duplicate paths and recursive folded count
- `runner/test/b1-index.test.ts:171` — B1c index: 32000 character cut names every omitted folder and preserves whole rows
- `runner/test/b1-index.test.ts:220` — B1c index: hidden app settings and dot-folder notes never enter either projection
- `runner/test/b1-index.test.ts:256` — B1c index: hidden-only feed changes only the cursor with a visible-feed positive control
- `runner/test/b1-index.test.ts:275` — B1c index: unchanged summaries keep index bytes and stamp through a visible version change
- `runner/test/b1-index.test.ts:97` — B1c index: existing MOC at 40 direct members folds and rebuilds complete regions by id
- `runner/test/b1-index.test.ts:97` — B1c index: existing MOC at 41 direct members folds and rebuilds complete regions by id
- `runner/test/b1-index.test.ts:327` — B1c index: a personal MOC stays byte identical while the Bower MOC refreshes
- `runner/test/b1-index.test.ts:339` — B1c index: done replay keeps the folded projection and complete members without another write
- `runner/test/b1-index.test.ts:358` — B1c index: lost reply for .bower/index.md resumes the same maintain before the report barrier
- `runner/test/b1-index.test.ts:358` — B1c index: lost reply for Resources/Garden/Garden.md resumes the same maintain before the report barrier
- `runner/test/b1-index.test.ts:358` — B1c index: lost reply for .bower/retrieval.json resumes the same maintain before the report barrier
- `runner/test/b1-index.test.ts:403` — B1c index: corpus b1-index-no-change preserves the derived stamp on the second real instruction press
- `runner/test/b1-index.test.ts:97` — B1c index: corpus b1-moc-over-40 folds 41 leaves with complete reachable child maps
- `runner/test/b1-index.test.ts:494` — B1c index: legacy MOC migrates on its first maintain and keeps every other byte
- `runner/test/b1-index.test.ts:507` — B1c index: legacy MOC second maintain is idempotent with no MOC write
- `runner/test/b1-index.test.ts:535` — B1c index: legacy MOC without Overview and Notes is untouched
- `runner/test/b1-index.test.ts:555` — B1c index: legacy MOC belonging to a person with the same headings is untouched
- `runner/test/b1-index.test.ts:576` — B1c index: maintain MOC targets pass the fenced-edit guard and personal targets are refused
- `runner/test/b1-index.test.ts:645` — B1c fix 1: 1 settled link rewrite supplies maintenance its new MOC text and version
- `runner/test/b1-index.test.ts:672` — B1c fix 1: 2 B1a unchanged legacy MOC is discovered migrated once and folded
- `runner/test/b1-index.test.ts:97` — B1c fix 1: 3 figures count 1 direct notes without a child map
- `runner/test/b1-index.test.ts:97` — B1c fix 1: 3 figures count 40 direct notes without a child map
- `runner/test/b1-index.test.ts:758` — B1c fix 1: 4 bootstrap plans with the in-memory index
- `runner/test/b1-index.test.ts:758` — B1c fix 1: 4 missing-index plans with the in-memory index
- `runner/test/b1-index.test.ts:800` — B1c fix 2: unchanged legacy MOC without Drive ownership is discovered migrated once and folded
- `runner/test/b1-index.test.ts:873` — B1c fix 3: legacy MOC ownership comes from the index prefix with zero extra reads
- `runner/test/b1-index.test.ts:1013` — B1c fix 4: a warm run with changed notes counted through maintain equals the pre-addendum-9 count
- `runner/test/b1-planning.test.ts:62` — b1-scripted-two-step-reply-freezes-every-execution-target
- `runner/test/b1-planning.test.ts:74` — b1-index-job-offer
- `runner/test/b1-planning.test.ts:98` — b1-changes-person-edit
- `runner/test/b1-planning.test.ts:127` — b1-cut-index-no-new-destination
- `runner/test/b1-planning.test.ts:159` — b1-five-per-source
- `runner/test/b1-planning.test.ts:201` — b1-selection-closed-ids
- `runner/test/b1-planning.test.ts:252` — b1-folded-moc-expansion
- `runner/test/b1-planning.test.ts:278` — b1-target-injection
- `runner/test/b1-planning.test.ts:313` — b1-read-to-act-fence
- `runner/test/b1-planning.test.ts:342` — b1-question-candidate-binding
- `runner/test/b1-planning.test.ts:366` — b1-shared-ledger
- `runner/test/b1-planning.test.ts:420` — b1-refresh-cache-hot-order
- `runner/test/b1-planning.test.ts:464` — b1-pre-manifest-retry
- `runner/test/b1-planning.test.ts:495` — b1-neighbourhood-order-and-30-cap
- `runner/test/b1-planning.test.ts:526` — b1-expansion-is-not-a-read-picked-members-count-within-five
- `runner/test/b1-planning.test.ts:552` — b1-new-subfolder-visible-parent-name-and-near-duplicate
- `runner/test/b1-planning.test.ts:574` — b1-one-new-subfolder-per-item
- `runner/test/b1-planning.test.ts:588` — b1-one-retry-per-step-four-calls-exhaustion-leaves-items-for-next-run
- `runner/test/b1-planning.test.ts:643` — b1-200-operations-exhaustion-leaves-items-for-next-run
- `runner/test/b1-planning.test.ts:657` — b1-invalid-reply-exhaustion-fails-after-one-retry
- `runner/test/b1-planning.test.ts:687` — b1-ledger-exhaustion-valid-replies-done-with-items-left-in-inbox
- `runner/test/b1a-contract.test.ts:217` — B1a contract: addendum 4: maintain writes only retrieval index once and changed MOC regions per run
- `runner/test/b1a-contract.test.ts:251` — B1a contract: 3: retrieval state and cursor commit together before the hidden report barrier
- `runner/test/b1a-contract.test.ts:279` — B1a contract: 4: settled maintenance replays without rows or duplicate writes and done skips it
- `runner/test/b1a-contract.test.ts:303` — B1a contract: case 6: lost maintenance reply resumes the same manifest before done
- `runner/test/b1a-contract.test.ts:368` — B1a contract: 4: maintenance uses settled refusals without fabricating rows or log entries
- `runner/test/b1a-contract.test.ts:435` — B1a contract: TL-P4-45 addendum: root index is an ordinary indexed note and dot paths stay hidden
- `runner/test/b1a-contract.test.ts:488` — B1a contract: pass 1 1: the committed cursor never passes an unreflected concurrent edit
- `runner/test/b1a-contract.test.ts:535` — B1a contract: pass 1 4: maintain bootstraps and refreshes full valid ownership notes beyond 4096 bytes
- `runner/test/b1a-contract.test.ts:644` — B1a contract: round 3 1: vanished indexed notes drop without failing and ordinary edits refresh
- `runner/test/b1a-contract.test.ts:754` — B1a contract: round 4 1: a folder binned before planning drops every indexed descendant
- `runner/test/b1a-contract.test.ts:754` — B1a contract: round 4 2: a folder moved outside drops its indexed subtree and commits the cursor
- `runner/test/b1a-contract.test.ts:754` — B1a contract: round 4 3: a renamed folder updates descendant paths and index order without media reads
- `runner/test/b1a-contract.test.ts:754` — B1a contract: round 4 4: an inside folder move updates recursive paths and regroups without media reads
- `runner/test/b1d-fr4.test.ts:63` — b1d-fr4 1 shown candidates bound notes and parents
- `runner/test/b1d-fr4.test.ts:130` — b1d-fr4 3 empty selection grants no keep or Bin
- `runner/test/b1d-fr4.test.ts:160` — b1d-fr4 4 no-model answers share the 200-operation ledger
- `runner/test/b1d-fr4.test.ts:217` — b1d-fr4 6 near names collapse internal whitespace
- `runner/test/b1d-fr5.test.ts:31` — b1d-fr5 1 crossing MOC prefix
- `runner/test/b1d-fr5.test.ts:89` — b1d-fr5 2 maintenance exhaustion after effects
- `runner/test/b1d-fr5.test.ts:31` — b1d-fr5 3 answer pins belong to each source
- `runner/test/b1d-fr5.test.ts:31` — b1d-fr5 4 refreshed MOC members are selectable
- `runner/test/b1d-fr5.test.ts:31` — b1d-fr5 5 heading links resolve candidates
- `runner/test/b1d-r6.test.ts:34` — b1d-r6 A1 crossing prefixes are advisory for every note type
- `runner/test/b1d-r6.test.ts:34` — b1d-r6 A2 damaged full reads refuse only the needed note
- `runner/test/b1d-r6.test.ts:34` — b1d-r6 B1 maintenance charges every send within 300
- `runner/test/b1d-r6.test.ts:34` — b1d-r6 B2 exhaustion stops read-ahead and handles pending rejections
- `runner/test/b1d-r6.test.ts:34` — b1d-r6 C1 request pins count per source
- `runner/test/b1d-r6.test.ts:34` — b1d-r6 C2 MOC member ids have one stable fingerprint
- `runner/test/b1d-r7.test.ts:41` — b1d-r7 1 request pin is only a candidate
- `runner/test/b1d-r7.test.ts:78` — b1d-r7 2 personal type moc is not a Bower MOC
- `runner/test/b1d-r8.test.ts:57` — b1d-r8 1 a keep-one merge rewrites backlinks in an unselected note
- `runner/test/b1d-r8.test.ts:106` — b1d-r8 2 the model cannot add a non-backlink edit to an unselected note
- `runner/test/b23-hot-context.test.ts:41` — B3b hot: filing writes hot once and the next prompt puts it at position 6
- `runner/test/b23-hot-context.test.ts:101` — B3b fix 1: settled journal changes enter Recent changes on their own
- `runner/test/b23-hot-context.test.ts:129` — B3b hot: an Undo run refreshes hot from restored evidence
- `runner/test/b23-hot-context.test.ts:200` — B3b hot: an ordinary rule Undo keeps its own wording
- `runner/test/b23-hot-context.test.ts:247` — B3b hot: recent rows carry their op key and dedupe by it
- `runner/test/b23-hot-context.test.ts:282` — B3b hot: date-only refresh keeps the old bytes without another write
- `runner/test/b23-hot-context.test.ts:309` — B3b hot: hidden-only feed drains its cursor and leaves hot untouched
- `runner/test/b23-hot-context.test.ts:332` — B3b hot: a Home answer removes only its settled Open thread
- `runner/test/b23-hot-recovery.test.ts:22` — B3b hot: pre-plan failure and done redispatch send no hot writes
- `runner/test/b23-hot-recovery.test.ts:67` — B3b hot: a lost maintain reply resumes the same manifest and writes hot once
- `runner/test/c04-incorporation.test.ts:224` — the C04 slice through the Claude provider (P4-3) the C04 corpus cases score green with scripted proposals
- `runner/test/c04-incorporation.test.ts:246` — the C04 slice through the Claude provider (P4-3) a recorded Claude reply on a C04 case writes a note with its content
- `runner/test/c04-prompt-fixes.test.ts:66` — c04 prompt fixes (TL-P4-08 addendum 5) a number not found in its sources is refused and retried once
- `runner/test/c04-prompt-fixes.test.ts:101` — c04 prompt fixes (TL-P4-08 addendum 5) a raw file name is replaced by a plain name
- `runner/test/c04-prompt-fixes.test.ts:163` — c04 prompt fixes (TL-P4-08 addendum 5) the offer-and-flat rubric accepts the photo ask and a money area
- `runner/test/c05-between.test.ts:12` — a real first state write precedes the personal edit and shown update
- `runner/test/c05-bounded-reads.test.ts:269` — C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media
- `runner/test/c05-bounded-reads.test.ts:157` — C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence
- `runner/test/c05-bounded-reads.test.ts:507` — C05 bounded reads: fix 2 control: a waiting retry whose pending relocation lands completes once
- `runner/test/c05-bounded-reads.test.ts:507` — C05 bounded reads: fix 2: a waiting retry whose pending relocation failed completes once
- `runner/test/c05-bounded-reads.test.ts:507` — C05 bounded reads: fix 2: a waiting retry interrupted after its pointer and before its append appends once
- `runner/test/c05-bounded-reads.test.ts:410` — C05 bounded reads: fix 1 control: a waiting retry whose archive lands completes once
- `runner/test/c05-bounded-reads.test.ts:410` — C05 bounded reads: fix 1: a waiting retry whose archive move failed completes once
- `runner/test/c05-bounded-reads.test.ts:157` — C05 bounded reads: horizon: past 20 runs uses listing age and TOO_OLD_WHY without a chain walk
- `runner/test/c05-incorporation.test.ts:74` — the C05 slice through the Claude provider the C05 corpus cases score green with scripted proposals
- `runner/test/c05-incorporation.test.ts:90` — the C05 slice through the Claude provider every Timeline line a run writes has its own report row
- `runner/test/c05-marked-history.test.ts:10` — the marked state was actually written and its previous lines remain in undo evidence
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: title grammar case and punctuation shows the named note before hubs
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: title grammar the article shows the named note before hubs
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: title grammar my article shows the named note before hubs
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: title grammar Unicode NFC shows the named note before hubs
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: longest whole title wins and source-only or partial mentions grant nothing
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: row 6 files the source and lists 2 same-title notes by id and folder without asking
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: row 6 files the source and lists 3 same-title notes by id and folder without asking
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: row 7 files the source but four named notes produce one unlinked row and zero updates
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: consent refuses unrelated request id through main beside a legitimate append
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: consent refuses unrelated target id through main beside a legitimate append
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: consent refuses citation not filed in this run through main beside a legitimate append
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: row 5 missing Timeline is byte-identical, linked in leftAsWritten and never counted updated
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: row 8 unparseable Timeline is byte-identical, linked in leftAsWritten and never counted updated
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: corpus first append, protected ranges, state question and later non-adoption score per run
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: state answer true changes only the shown bullet or writes nothing and is never re-asked
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: state answer false changes only the shown bullet or writes nothing and is never re-asked
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: state changed before Write it re-asks and preserves the new personal bullet
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: append clash retries on the next main call with the fresh personal text and original citation
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: landed append with lost answer and failed read-back resumes exactly once
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: fix 1 finding 1: overflow blocks owned and personal note writes
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: fix 1 finding 2: a conflicted append retries its filed source within twenty retained runs
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: fix 1 finding 3: article-equivalent titles stay ambiguous in context and writes
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: fix 1 finding 4: a completed replay cannot consume the new request for the same note
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: fix 1 finding 5: an already-present bound append completes the request before replay
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: fix 1 finding 8: an unrelated filing failure preserves the filed source refusal row
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 2: only the oldest unfinished request settles for one note
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 1: ambiguity settles and reports without a model line
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 1: overflow settles and reports without a model line
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 1: missing Timeline settles and reports without a model line
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 1: unreadable Timeline settles and reports without a model line
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 3: overflow refuses its source on an unnamed owned hub
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 3: ambiguity refuses its source on an unnamed owned hub
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 5: invalid bullet count state proposal leaves the valid append independent
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 5: plain note state proposal leaves the valid append independent
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 6: retry cites the bound source id after its rename
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 3 6: satisfaction follows final citation naming on a filing collision
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 4 1: settlement survives recovery and retention
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 4 2: pending retries keep target and source ids
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 4 3: only settlement archives scripted requests
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 5 1: archived completion uses the record id inside differently named bytes
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 5 2: a retained completion never resolves a renamed target by title again
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 5 3: a request past retention is left as written and archived without an append
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 5 4: one line and one nothing-found row settle two named targets
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 person notes: round 5 5: only a clashed target retries on bound ids before archive
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 1: dated-colon list with no offered line settles as nothing found
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 2: plain list with front matter appends once, updates, archives and completes
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 2: plain list without front matter appends once, updates, archives and completes
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 3: prose stays unreadable even with a sourced line offered
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 4: appendable person and Bower-owned notes remain positive controls
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve CRLF and Unicode byte offsets through main and note-edit
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve star marker through main and note-edit
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve whole nested subtree at top level through main and note-edit
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve last top-level star in mixed markers through main and note-edit
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve last top-level dash in mixed markers through main and note-edit
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve trailing blanks with final newline through main and note-edit
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve no final newline through main and note-edit
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve trailing blanks without final newline through main and note-edit
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve following heading stays outside the list through main and note-edit
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: exact bytes preserve plain CRLF star subtree before a following heading through main and note-edit
- `runner/test/c05-person-notes.test.ts:77` — C05 person notes through runner main C05 timeline list C05 timeline list: 5: preseeded Bower star line completes once and replay keeps exact bytes
- `runner/test/claude-provider.test.ts:217` — the Claude provider a new Area with no cited rule or note is refused and retried once
- `runner/test/claude-provider.test.ts:236` — the Claude provider a new Area with a responsibility is made and the report says why
- `runner/test/claude-provider.test.ts:330` — the Claude provider a new subfolder of an existing Area is not reported as a new area
- `runner/test/claude-provider.test.ts:353` — the Claude provider a thing with text and no note or citing line is refused and retried once
- `runner/test/claude-provider.test.ts:384` — the Claude provider a thing cited by a Timeline line on an existing note needs no note
- `runner/test/claude-provider.test.ts:396` — the Claude provider a photo with no text needs no note
- `runner/test/claude-provider.test.ts:430` — the Claude provider a recorded Claude reply becomes operations the spine validates
- `runner/test/claude-provider.test.ts:495` — the Claude provider the runner logs one timing line per run with the Claude reply's numbers
- `runner/test/claude-provider.test.ts:633` — the Claude provider contract (TL-P4-01 P4-2) the Claude provider passes the scripted provider contract fixtures
- `runner/test/claude-provider.test.ts:850` — the Claude provider writes only what it proposed (P4-2 review I1) a Claude run writes no hub line or demo extra it did not propose
- `runner/test/corpus-driver.test.ts:108` — multi-press corpus answers a pair question through the answer path between presses
- `runner/test/corpus-driver.test.ts:137` — multi-press corpus keeps both notes and closes the question after Keep mine
- `runner/test/corpus-driver.test.ts:156` — multi-press corpus checks the first press independently of the final report
- `runner/test/corpus-driver.test.ts:214` — multi-press corpus replays the original request id separately from a new tidy-up
- `runner/test/corpus-driver.test.ts:241` — multi-press corpus empty expectations in the final score refuses empty questionSubjects
- `runner/test/corpus-driver.test.ts:241` — multi-press corpus empty expectations in the per-run score refuses empty questionSubjects
- `runner/test/corpus-driver.test.ts:285` — multi-press corpus reports a same-run replay and a newly written tidy-up separately
- `runner/test/corpus.test.ts:15` — the capability corpus the corpus scorer passes on the scripted provider outputs
- `runner/test/corpus.test.ts:59` — the capability corpus the corpus scorer fails when an expected file is missing
- `runner/test/drive-calls-golden.test.ts:27` — the C04 run makes the golden number of Drive calls per step the C04 run makes the golden number of Drive calls per step
- `runner/test/drive-calls-golden.test.ts:61` — drive-calls-cut offer-and-flat apply keeps its half-time budget plus the measured maintenance delta
- `runner/test/drive-calls-golden.test.ts:86` — the C04 run past 20 earlier runs (retention-never-wired, round 2) with 25 earlier runs a run makes 99 Drive calls
- `runner/test/drive-calls-golden.test.ts:112` — run records carry their run mark (retention round 6) every record Bower writes in a run folder carries its run mark
- `runner/test/duplicate-by-hash.test.ts:117` — a thing already saved (duplicate-by-hash) a thing whose content is already filed goes to the Bin as already saved
- `runner/test/duplicate-by-hash.test.ts:84` — a thing already saved (duplicate-by-hash) undo brings an already-saved thing back to the inbox
- `runner/test/duplicate-by-hash.test.ts:162` — a thing already saved (duplicate-by-hash) a copy inside the same pile keeps one and bins the other as already saved
- `runner/test/duplicate-by-hash.test.ts:84` — a thing already saved (duplicate-by-hash) an empty file is never taken for one already saved
- `runner/test/duplicate-by-hash.test.ts:84` — a thing already saved (duplicate-by-hash) a saved link with the same address as a filed one is filed as usual
- `runner/test/duplicate-by-hash.test.ts:84` — a thing already saved (duplicate-by-hash) a filed copy the person already binned does not count
- `runner/test/duplicate-by-hash.test.ts:84` — a thing already saved (duplicate-by-hash) a binned duplicate's open question closes
- `runner/test/duplicate-by-hash.test.ts:84` — a thing already saved (duplicate-by-hash) a refused Bin keeps its question open
- `runner/test/duplicate-by-hash.test.ts:84` — a thing already saved (duplicate-by-hash) a copy whose twin left during the run is not binned
- `runner/test/duplicate-by-hash.test.ts:84` — a thing already saved (duplicate-by-hash) a copy changed during the run is not binned
- `runner/test/duplicate-by-hash.test.ts:84` — a thing already saved (duplicate-by-hash) pile words with only a saved copy are kept
- `runner/test/keep-one-note.test.ts:53` — keep one note keep one note carries the facts and bins the other
- `runner/test/keep-one-note.test.ts:82` — keep one note undo of keep one note restores both notes and links
- `runner/test/keep-one-note.test.ts:127` — keep one note the other note changed after the read is not binned
- `runner/test/keep-one-note.test.ts:159` — keep one note keep-one says what happened when the other note moved or was binned
- `runner/test/keep-one-note.test.ts:178` — keep one note a line that only starts like a kept line is carried
- `runner/test/main.test.ts:86` — the runner process main applies real Drive effects through the adapter and the folder changes
- `runner/test/main.test.ts:110` — the runner process every admitted item's disposition is readable after the run, journal lines included
- `runner/test/main.test.ts:160` — the runner process main picks the scripted provider
- `runner/test/main.test.ts:172` — the runner process main reports reading with total before writing
- `runner/test/main.test.ts:184` — the runner process total counts things only
- `runner/test/main.test.ts:252` — the runner process under a rate limit main sends no fenced write again after a takeover during the rate limit wait
- `runner/test/network-retry.test.ts:196` — runner network retry a network error on a Drive write is reconciled by read-back, never retried blindly
- `runner/test/network-retry.test.ts:229` — runner network retry an attempt that ends without a terminal report exits non-zero
- `runner/test/overhead.test.ts:25` — the runner overhead the C04 run writes and counts exactly 4 checkpoints
- `runner/test/overhead.test.ts:48` — the runner overhead the runner overhead cuts keep recovery and ordered status
- `runner/test/overhead.test.ts:59` — the runner overhead a run writes one opening and one closing checkpoint per batch
- `runner/test/pair-ask.test.ts:54` — two notes for one thing (keep-one-not-asked) two notes for one thing are asked as a pair
- `runner/test/pair-ask.test.ts:71` — two notes for one thing (keep-one-not-asked) a words-only pile can become a Timeline line
- `runner/test/pair-ask.test.ts:95` — two notes for one thing (keep-one-not-asked) a words-only pile whose lines are all in its note already is already saved
- `runner/test/pair-ask.test.ts:113` — two notes for one thing (keep-one-not-asked) a yes to an older pair question whose note is in the Bin settles and names it
- `runner/test/per-thing-ask.test.ts:76` — per-thing asks (TL-P4-08 addendum 4) an ask about one thing leaves it in the inbox and files the rest of its pile
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a notJson refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noText refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a notIntent refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a thingKeys refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a thingNotAdmitted refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a thingTwice refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a placeOutside refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a nameChangesKind refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a rawName refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a numbers refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a newFolder refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteForNote refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteKeys refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteName refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteSummary refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteBody refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteSections refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteLink refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteMdLink refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noteWeb refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a pileNotAdmitted refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a pileTwice refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a tooManyLines refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineKeys refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineNote refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineText refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineCites refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a lineUncited refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a noNote refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateKeys refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateNote refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateTwice refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateText refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a stateCites refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askKeys refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askNotAdmitted refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askNotes refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askTwice refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askAlsoFiles refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a askText refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a keepKeys refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a keepNote refusal is retried once with its reason
- `runner/test/per-thing-ask.test.ts:206` — per-thing asks (TL-P4-08 addendum 4) every validation refusal is retried once with its reason a keepNotAsked refusal is retried once with its reason
- `runner/test/q1-continuation.test.ts:274` — Q1a stored answers through production entry points Q1a q1-clear-work-with-waiting-item: an option asking leaves its item and files clear work
- `runner/test/q1-continuation.test.ts:310` — Q1a stored answers through production entry points Q1a q1-options-exact-action: consent resolves stored folder id despite duplicate labels and rename
- `runner/test/q1-continuation.test.ts:350` — Q1a stored answers through production entry points Q1a q1-options-exact-action: two to four script candidates accepted and fabricated or fifth refused
- `runner/test/q1-continuation.test.ts:464` — Q1a stored answers through production entry points Q1a q1-text-person-provenance: person words stay subject data and document instructions grant no consent
- `runner/test/q1-continuation.test.ts:493` — Q1a stored answers through production entry points Q1a q1-continuation-members-and-journal: today takes new same-pile items and all journal but no new pile
- `runner/test/q1-continuation.test.ts:526` — Q1a stored answers through production entry points Q1a q1-waits-one-run-and-replay: two typed answers wait batch once and replay does not dispatch
- `runner/test/q1-continuation.test.ts:556` — Q1a stored answers through production entry points Q1a q1-two-rounds-no-third: thing exhausts after two saved askings and words reset
- `runner/test/q1-continuation.test.ts:556` — Q1a stored answers through production entry points Q1a q1-two-rounds-no-third: pile exhausts after two saved askings and words reset
- `runner/test/q1-continuation.test.ts:665` — Q1a stored answers through production entry points Q1a q1-legacy-question-answer-status: old stored records read and reports never leak option actions
- `runner/test/q1-continuation.test.ts:1570` — Q1a stored answers through production entry points Q1a q1-pile-projection: exhausted persists on reload waiting wins and word edit clears both
- `runner/test/q1-continuation.test.ts:835` — Q1a stored answers through production entry points Q1a q1-two-rounds-no-third: retries failed saves and dispatch replay count only durable askings
- `runner/test/q1-continuation.test.ts:1570` — Q1a stored answers through production entry points Q1a q1-two-rounds-no-third: exhausted identity follows reuploaded content and leaving ends it
- `runner/test/q1-continuation.test.ts:888` — Q1a stored answers through production entry points Q1a q1-legacy-question-answer-status: stored choices keep content and name-place fences
- `runner/test/q1-continuation.test.ts:945` — Q1a fix round 1 through production entry points Q1a fix 1.1: second-answer placement precedes exhaustion after an unresolved second answer
- `runner/test/q1-continuation.test.ts:945` — Q1a fix round 1 through production entry points Q1a fix 1.2: instructions scope preserves inbox counters and exhausted subjects without a third asking
- `runner/test/q1-continuation.test.ts:1570` — Q1a fix round 1 through production entry points Q1a fix 1.3: pile and member share two rounds and only changed words permit another asking
- `runner/test/q1-continuation.test.ts:1570` — Q1a fix round 1 through production entry points Q1a fix 1.4: a same-bytes reupload retains hash history through the planner and writes no asking
- `runner/test/q1-continuation.test.ts:1135` — Q1a fix round 1 through production entry points Q1a fix 1.5: missing or outside-root stored option folders cannot authorize alternative filing
- `runner/test/q1-continuation.test.ts:945` — Q1a fix round 1 through production entry points Q1a fix 1.5b: a gone option folder leaves the item waiting and the next run asks again as the next round
- `runner/test/q1-continuation.test.ts:1218` — Q1a fix round 1 through production entry points Q1a fix 1.6: words-only pile consent places its generated note in the chosen stored folder
- `runner/test/q1-continuation.test.ts:945` — Q1a fix round 3 through production entry points Q1a fix 3.1: unavailable chosen folders force a new asking before next-tidy model placement
- `runner/test/q1-continuation.test.ts:945` — Q1a fix round 3 through production entry points Q1a fix 3.2: mixed member histories cap pile askings and count only the waiting member
- `runner/test/q1-continuation.test.ts:1396` — Q1a fix round 3 through production entry points Q1a fix 3.3: exhausted members stay untouched while existing and later clear siblings file
- `runner/test/q1-continuation.test.ts:1465` — Q1a fix round 4 through production entry points Q1a fix 4.1: a loose Inbox file whose chosen folder is gone is asked again as the next round
- `runner/test/q1-continuation.test.ts:1465` — Q1a fix round 4 through production entry points Q1a fix 4.2: every member-subject path re-asks once after an unavailable folder: folder member
- `runner/test/q1-continuation.test.ts:1465` — Q1a fix round 4 through production entry points Q1a fix 4.2: every member-subject path re-asks once after an unavailable folder: loose Inbox file
- `runner/test/q1-continuation.test.ts:1465` — Q1a fix round 4 through production entry points Q1a fix 4.2: every member-subject path re-asks once after an unavailable folder: words-only pile
- `runner/test/q1c-live.test.ts:148` — Q1c durable publication through main and createApp().request q1-live-snapshot-over-64kib-trims
- `runner/test/q1c-live.test.ts:211` — Q1c durable publication through main and createApp().request q1-live-publication-transport-failure-keeps-the-run
- `runner/test/q1c-live.test.ts:285` — Q1c durable publication through main and createApp().request q1-live-question-long-note-name-publish…
- `runner/test/q1c-live.test.ts:285` — Q1c durable publication through main and createApp().request q1-live-question-invalid-shape-publishes
- `runner/test/q1c-live.test.ts:319` — Q1c durable publication through main and createApp().request Q1c fix 1: eleven askings keep clear work and publish the first ten by askedAt
- `runner/test/q1c-live.test.ts:359` — Q1c durable publication through main and createApp().request Q1c fix 1: a crash after manifest persistence recovers questions with stored option actions intact
- `runner/test/q1c-live.test.ts:451` — Q1c durable publication through main and createApp().request Q1c q1-live-question-before-clear-effects-end: durable publication
- `runner/test/q1c-live.test.ts:463` — Q1c durable publication through main and createApp().request Q1c q1-live-question-before-clear-effects-end: same-run recovery republishes without a second model reply
- `runner/test/reads-report.test.ts:20` — the runner plan reads and report plan reads finish under the budget with modelled Drive latency
- `runner/test/reads-report.test.ts:20` — the runner plan reads and report with 25 earlier runs plan reads stay within their measured maintenance delta
- `runner/test/reads-report.test.ts:20` — the runner plan reads and report the report keeps its barrier order in fewer calls
- `runner/test/real-adapters.test.ts:49` — real adapters: failure cases in the runner duplicate dispatch: a second job of the same attempt after the first ended changes nothing
- `runner/test/real-adapters.test.ts:49` — real adapters: failure cases in the runner duplicate dispatch: a second job of the same attempt finishes a first one cut mid-run, with one set of effects
- `runner/test/real-adapters.test.ts:49` — real adapters: failure cases in the runner expired attempt: a superseded attempt writes nothing
- `runner/test/real-adapters.test.ts:49` — real adapters: failure cases in the runner lost callback: a status reply is lost, and the resend is idempotent
- `runner/test/real-adapters.test.ts:49` — real adapters: failure cases in the runner lost callback: a lost reply to done fails the job visibly, and the run stays done with its effects once
- `runner/test/real-adapters.test.ts:49` — real adapters: failure cases in the runner recovery: a dead job is redispatched and reaches done
- `runner/test/rules-repair.test.ts:62` — real adapters: the old template Rules.md in an existing folder an existing folder with the old template Rules.md is repaired at plan time and the rule is worded
- `runner/test/rules-repair.test.ts:71` — real adapters: the old template Rules.md in an existing folder a repair stopped between the text and the mark gets only its mark on the next run
- `runner/test/rules-repair.test.ts:139` — real adapters: the old template Rules.md in an existing folder the runner's Rules.md repair whose answers were lost is resolved by its stamp
- `runner/test/second-brain-method.test.ts:85` — the second-brain method (TL-P4-08) an ambiguous thing stays in the inbox with a question and the run goes on
- `runner/test/second-brain-method.test.ts:127` — the second-brain method (TL-P4-08) a later run does not repeat an open question
- `runner/test/second-brain-method.test.ts:146` — the second-brain method (TL-P4-08) a document that only confirms a known fact updates the note and makes none
- `runner/test/second-brain-method.test.ts:196` — B3b hot: evidence-only method verdict covers hidden unarchived refresh
- `runner/test/state-rewrite.test.ts:85` — a change kind of its own for Current state (C05) a Bower-owned Current state is rewritten and undo restores it
- `runner/test/state-rewrite.test.ts:123` — a change kind of its own for Current state (C05) a Current state the person edited gets a line and a question, never a rewrite
- `runner/test/state-rewrite.test.ts:141` — a change kind of its own for Current state (C05) no fallback line when the run already cites the same thing on that note
- `runner/test/state-rewrite.test.ts:162` — a change kind of its own for Current state (C05) the fallback line names only what the section lacks
- `runner/test/state-rewrite.test.ts:173` — a change kind of its own for Current state (C05) a person-edited section's fallback names none of Bower's last-written lines
- `runner/test/state-rewrite.test.ts:187` — a change kind of its own for Current state (C05) Bower's last state is read from the previous state change, not searched
- `runner/test/state-rewrite.test.ts:200` — a change kind of its own for Current state (C05) with no previous state change to read, every line the section lacks is news
- `runner/test/state-rewrite.test.ts:221` — a change kind of its own for Current state (C05) a run manifest that cannot be read is passed over, and every line the section lacks is news
- `runner/test/state-rewrite.test.ts:67` — a change kind of its own for Current state (C05) after a Bower append the next run only adds a line
- `runner/test/state-rewrite.test.ts:67` — a change kind of its own for Current state (C05) an unmarked Current state is never adopted without a rule
- `runner/test/state-rewrite.test.ts:280` — a change kind of its own for Current state (C05) a yes rule lets Bower adopt the section
- `runner/test/state-rewrite.test.ts:296` — a change kind of its own for Current state (C05) undo restores an empty section empty
- `runner/test/timing-counts.test.ts:15` — timing counts the timing line counts calls and bytes per phase and names the region
- `runner/test/typed-rule.test.ts:46` — real adapters: a typed rule a typed rule is worded into Rules.md on the real adapter

### Final app result and every failed app test

Full src suite: 179 files, 5,787 tests; 5,780 pass, seven fail across three
files, with one expected unhandled listen EPERM (exit 1). Reports/logs:
app.json and app-final.log in the verification folder above.
All 47 harness tests pass under the output-only temporary configuration.
The three frozen round-6 tests pass again in this full run.

Five real-adapter contract cases hit the same maintenance identity integration
blocker as the runner suite. The other two failures are external:
src/docs.test.ts:134 finds missing compatibility bookkeeping for an earlier
commit; the worker does not own that ledger. src/e2e-port.test.ts:37 cannot listen
on 127.0.0.1 under the sandbox (expected EPERM, timeout and unhandled error).
Every failed app case is listed below; no test was changed.

- `src/docs.test.ts:134` — what the repository promises every change since the P2 freeze is listed
- `node_modules/.pnpm/vitest@5.0.3_@types+node@26.6.4_jsdom@30.1.1_@noble+hashes@1.8.0__vite@8.3.2_@types+nod_7b9e803fa99578876f85b579d849a22e/node_modules/vitest/dist/chunks/run.BTlFXlnv.js:2681` — the e2e port and server identity a server from another worktree is never reused
- `src/data/contract/vault-contract.ts:380` — vault contract: real adapters a tidy-up after tidyUp the journal is empty and the piles taken are gone
- `src/data/contract/vault-contract.ts:391` — vault contract: real adapters a tidy-up answering yes to a merge makes the next tidy-up keep one note
- `src/data/contract/vault-contract.ts:401` — vault contract: real adapters a tidy-up a tidy-up's report lists only the new questions it asked
- `src/data/contract/vault-contract.ts:413` — vault contract: real adapters a tidy-up a pile added during a run waits for the next one
- `src/data/contract/real.contract.test.ts:92` — real adapters: failure cases in the app browser close mid-run: the app goes away, and the runner plus the alarm finish

### Delivery

Status: blocked on the maintenance producer/captured-identity compatibility
mismatch. The identity bypass itself is closed by the single shared helper;
all identity reds and their positive controls pass. No unresolved-ID exemption
was invented to make existing production paths pass. The lead needs to rule on
binding maintenance targets, including reserved creates, to resolved identities
before these 366 integration cases can return green.

.codex-commits.json requests exactly one production-files commit and one
notes-only commit. The runner owns commits, pnpm check and capabilities e2e on
demo/fake. No check mark or e2e success is claimed by this worker.

tests changed: none; every older failed runner/app test is preserved and listed above.
Skipped: runner-owned commits, pnpm check, capabilities e2e and out-of-scope producer changes.
Risk: existing maintenance targets absent from capture.places cause otherwise valid real-adapter runs to refuse.
