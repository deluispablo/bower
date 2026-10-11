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
