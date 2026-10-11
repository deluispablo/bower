# B6a templates: red session notes

implementer: codex

## Delivery

Tests only at HEAD `5b16b6fa552af6a2855654d6aced8c594b4a443a`, branch `b6a-templates`.
No runtime code, existing assertion, git state, corpus fixture or shared harness record was changed.
The coordinator owns commits. This red session does not implement B6a.

removed: none
tests changed: none; existing assertions are unchanged, with new tests appended to their suites.

## Contract and offline research

Read WORKER, the B6a packet, TL-P4-47 Q1/Q5/Q7 and addendum 1, the named B56 prep
sections/ledger, TL-P4-42 Q1/Q2 and its quoted-summary addenda, and the DECISIONS
entries for TL-P4-45, TL-P4-49, TL-P4-50, TL-P4-51, TL-P4-29 and TL-P4-41.
TL-P4-45 hides runner files; TL-P4-50 changes monthly log paths and uses plain markers.
Neither ruling licenses another template serializer or maintain write.

Offline research reuses the existing shared NoteFile, parseNote/serializeNote,
parseOwnership/togglePersonalTask, applyChanges, and planScripted APIs.
The declarative-schema standard is one declaration consumed by validators and writers:
[Zod schemas](https://zod.dev/api), already cited by the prep and used by the runner.
[CommonMark list items](https://spec.commonmark.org/0.31.2/#list-items) supplies the list grammar;
checkboxes are the [GFM task-list extension](https://github.github.com/gfm/#task-list-items-extension-).
Next steps fixtures use `- [ ]`, through the existing task/ownership boundary.
No network or original-app files were read.

## B5a dependency and additive test seam

B5a is not landed. These tests do not import a type table or assert that a row names a template.
The five names are pinned through the declaration home and note-format only.
B5a must hand off shared note-format, ownership-format, note-edit, run-manifest and types before implementation.

The creation fixture supplies `template: source|concept|project|area|moc` alongside the existing NoteFile.
The declaration fixture expects `NOTE_TEMPLATES` in contracts/note-templates, with ordered `sections` per name.
The new module is imported inside an assertion helper. A missing module/export is an expect failure,
not a suite load failure or TypeScript error. No stub production module was added.
The additive edit fixture uses `{kind: 'template-rewrite', region: 'goal'|'next-steps',
recordIds, previous, text}` through applyChanges, isolated by a test-only unknown-to-Change cast.
Ownership fixtures append marked `goal` and `next-steps` payloads after the four existing v2 payloads.
These are explicit creation/edit intents; legacy parse/serialize inputs do not opt into templating.
Grounded task edits preserve every byte outside their payload, personal tasks, and Timeline;
a stale previous payload refuses. LF and CRLF are covered.

## Reds

Every exact name below failed as an assertion at unchanged HEAD in `tmp-logs/b6a-reds-final.log`.
Each test first exercises a supported positive control: legacy note serialization, valid summary/tag bounds,
ordinary Concept history/link edits, canonical personal task toggles, or a real planner filing/body create.

| Exact name | File | HEAD failure |
| --- | --- | --- |
| `B6a templates: b6-source-body-immutable refuses new history on a stored Source` | `src/data/contracts/note-edit.test.ts` | Source body and its legacy Timeline are immutable after creation: expected true to be false // Object.is equality |
| `B6a templates: b6-source-body-immutable refuses a rewrite of Source prose links` | `src/data/contracts/note-edit.test.ts` | A Source is never rewritten after creation: expected true to be false // Object.is equality |
| `B6a templates: legacy MOC Timeline stays unrewritten by ordinary history updates` | `src/data/contracts/note-edit.test.ts` | A legacy MOC Timeline stays unrewritten: expected true to be false // Object.is equality |
| `B6a templates: b6-project-next-steps-owned rewrites only the goal payload through note-edit` | `src/data/contracts/note-edit.test.ts` | The ordinary note author must support grounded template region changes: expected false to be true // Object.is equality |
| `B6a templates: b6-project-next-steps-owned rewrites only the next-steps payload through note-edit` | `src/data/contracts/note-edit.test.ts` | The ordinary note author must support grounded template region changes: expected false to be true // Object.is equality |
| `B6a templates: b6-person-note-no-metadata refuses template adoption and retains every personal byte` | `src/data/contracts/note-edit.test.ts` | A person note cannot acquire template ownership or metadata: expected { ok: false, reason: 'field' } to deeply equal { ok: false, reason: 'not-bower' } |
| `B6a templates: b6-five-template-shapes declares exactly five ordered section shapes in one home` | `src/data/contracts/note-templates.test.ts` | The single note-templates declaration home must be available: expected Error: Cannot find module '/src/data/cont… { …(2) } to be undefined |
| `B6a templates: b6-five-template-shapes serializes source through note-format` | `src/data/vault/note-format.test.ts` | expected [ '## Current state', '## Timeline' ] to deeply equal [ '## Summary', '## Key points', …(2) ] |
| `B6a templates: b6-five-template-shapes serializes concept through note-format` | `src/data/vault/note-format.test.ts` | expected [ '## Current state', '## Timeline' ] to deeply equal [ Array(4) ] |
| `B6a templates: b6-five-template-shapes serializes project through note-format` | `src/data/vault/note-format.test.ts` | expected [ '## Current state', '## Timeline' ] to deeply equal [ '## Goal', '## Next steps', …(3) ] |
| `B6a templates: b6-five-template-shapes serializes area through note-format` | `src/data/vault/note-format.test.ts` | expected [ '## Current state', '## Timeline' ] to deeply equal [ '## Standard to maintain', …(3) ] |
| `B6a templates: b6-five-template-shapes serializes moc through note-format` | `src/data/vault/note-format.test.ts` | expected [ '## Current state', '## Timeline' ] to deeply equal [ '## Overview', '## Notes', …(1) ] |
| `B6a templates: b6-source-absent-url omits missing url and creates Source without a generic Timeline` | `src/data/vault/note-format.test.ts` | expected '---\nsummary: Alex records grounded g…' not to contain '## Timeline' |
| `B6a templates: b6-five-template-shapes refuses a 201-character summary on an explicit template write` | `src/data/vault/note-format.test.ts` | Explicit template creation uses the shared strict metadata bounds |
| `B6a templates: b6-five-template-shapes refuses a multiline summary on an explicit template write` | `src/data/vault/note-format.test.ts` | Explicit template creation uses the shared strict metadata bounds |
| `B6a templates: b6-five-template-shapes refuses four tags on an explicit template write` | `src/data/vault/note-format.test.ts` | Explicit template creation uses the shared strict metadata bounds |
| `B6a templates: b6-project-next-steps-owned frames Goal and Next steps outside personal tasks` | `src/data/vault/ownership-format.test.ts` | Goal and Next steps must be declared Bower payloads: expected 'invalid' to be 'v2' // Object.is equality |
| `B6a templates: b6-source-absent-url plans a Source with its original and no invented address` | `src/data/spine/scripted.test.ts` | A generated Source must identify the filed original without inventing a url: expected undefined to be 'IMG_2301.jpg' // Object.is equality |

The absent-url checks already omit URLs for the missing-evidence input and retain a supplied example.com URL.
Their reds pin the incomplete Source construction: note-format still emits the generic Timeline;
planning omits original/type and also emits a Timeline. The planned original's name is read from its move.
The person-note red currently refuses an unknown change as field, rather than identifying the personal boundary.
It pins the refusal on the new template path; existing personal bytes/metadata controls pass.
The Goal/Next steps edit fixtures currently refuse damaged-boundary before the new edit path can run.
The metadata-write reds currently fail because serializeNote accepts invalid explicit template metadata.

## Compatibility

| Contracts delivery | Stored fixture | Entry point | Evidence |
| --- | --- | --- | --- |
| Pending red-test commit, coordinator-owned | Old typed Source with a 2 Oct Timeline | parseNote then serializeNote | Exact bytes retained; old body and Timeline entries retain meaning |
| Pending red-test commit, coordinator-owned | Old typed MOC with a 2 Oct Timeline | parseNote then serializeNote | Exact bytes retained; no template backfill |
| Pending red-test commit, coordinator-owned | Existing plain/legacy/v2 format, ownership, edit and planning fixtures | Whole touched suites | All 362 pre-existing tests pass, assertions unchanged |

Exact new passing compatibility names in `src/data/vault/note-format.test.ts`:
- `B6a templates: legacy source note with a Timeline stays readable and unrewritten`
- `B6a templates: legacy moc note with a Timeline stays readable and unrewritten`

## Contradictions (TL-P4-51)

None found in the targeted existing assertions. The whole five-file target ran before delivery.
New Source/MOC creation is explicitly distinguished from legacy serialization, so legacy shape assertions stand.
No assertion was weakened, deleted, skipped or focused.

## Verification

Final command:
```sh
pnpm exec vitest run src/data/contracts/note-templates.test.ts src/data/vault/note-format.test.ts src/data/vault/ownership-format.test.ts src/data/contracts/note-edit.test.ts src/data/spine/scripted.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=tmp-logs/b6a-reds-final.json > tmp-logs/b6a-reds-final.log 2>&1
```
Result: 382 tests; 18 expected assertion failures, 364 passes (362 existing plus 2 new legacy reads).
All five test files loaded; no failed suite import or unhandled-error failure.
Read only failed assertions and aggregate counts from the output.

TypeScript `--noEmit -p tsconfig.app.json`, `tsconfig.node.json`, and `runner/tsconfig.json`: pass.
ESLint on all five touched test files: pass.
Logs: tmp-logs/b6a-tsc-app.log, b6a-tsc-node.log, b6a-tsc-runner.log, b6a-eslint.log.
All output is under tmp-logs; earlier planner probe logs are superseded by the final run.

## Files and left out

- src/data/contracts/note-templates.test.ts
- src/data/contracts/note-edit.test.ts
- src/data/vault/note-format.test.ts
- src/data/vault/ownership-format.test.ts
- src/data/spine/scripted.test.ts
- docs/harness/2026-10-10-b6a-templates-notes.md

No new corpus case, so no method verdict row was required or added.
The packet's B6a entry points are format/ownership/edit APIs and scripted planning; planning uses planScripted.
Runner-main fit/create/replay corpus evidence belongs to the later B6b/B6c ledger entries.
Per the user's narrower instruction, only touched test files ran; pnpm check, untouched corpus/method suites,
e2e, implementation, runtime validators/manifest additions and commits are left to their owning sessions.
No maintain target was added, and no Bower/person file outside these synthetic fixtures was written.

## Implementation

Implementation session: current B5a/B1c/B3b/B2a worktree, no network and no git writes.
The committed reds reproduce 18 assertion failures and two legacy controls pass
(`/tmp/b6a-reds.log`). No tests were edited.

Offline research: read the installed Zod README's schema/parse example and reused
this repository's note-format, ownership-format, note-edit and task grammar.
[Zod's declarative schemas](https://zod.dev/api) are the precedent for one declaration
consumed by writers and validators; no Zod dependency or second serializer is added.
[CommonMark list items](https://spec.commonmark.org/0.31.2/#list-items) define the lists;
checkboxes are specifically the [GFM task-list extension](https://github.github.com/gfm/#task-list-items-extension-).
The existing CommonMark fence transition is reused when reading authored sections.
These are offline citations, not claims of newly fetched documentation.

`src/data/contracts/note-templates.ts` declares the five ordered shapes, their body
section, Timeline policy and Source immutability, plus the Project region names.
The existing note-format serializer consumes those declarations on explicit Bower
creation. Legacy writes retain their existing path. Explicit writes use B2a's
summary validator and the three-tag bound; template property scalars use the same
YAML quoting function. Missing URLs are omitted, and no due date is inferred.
New template notes carry `bower_template` as their creation-format discriminator;
an untouched parsed template retains its original bytes without opting legacy
reads into template creation. Person template intents add neither metadata nor sections.

Project creation frames Goal and Next steps before the ordinary four ownership
payloads; the parser also accepts the committed appended-region fixtures. The
existing region author handles `template-rewrite`, checks exact previous content,
checks Bower Project ownership and preserves all bytes outside the selected span.
The manifest's closed change union and ordering admit the same ordinary edit intent.
Source content is in the protected existing Bower-note payload, with no personal
task authority. Source edits are refused. MOC history appends are refused and other
edits may not change a legacy Timeline. A legacy MOC with a Timeline is not migrated
to empty Timeline framing: the lossless refusal leaves its old meaning intact.
New MOCs reuse moc-overview, moc-figures and moc-members; Sources stays outside their
rewrite spans. Area's Standard to maintain precedes Current state as declared.

Scripted explicit template planning consumes the same declaration and serializer.
It records the actual filed original name for a Source, creation/update dates,
type/status, source and up to five unique links from the authored evidence.
It adds no unrelated links, maintain targets, operation kinds or serialization path.

removed: generic Current state/Timeline construction from explicit Source and MOC creation.
removed: current-edit authority over stored Source content and legacy MOC Timelines.
removed: no files, tests, legacy serializer or maintain mechanism.
tests changed: none

### Scope blocker

Implementation edits stopped when the required unused-code gate reported a stale
production baseline entry. The new production use of `validSummary` means this
existing line must be removed from `harness/unused-production-baseline.json`:

`exports src/data/contracts/note-format.ts validSummary`

That file is outside the B6a ledger. It was not changed. The ordinary unused gate
passes (2 known findings); the production gate has 29 findings versus baseline 30.
No baseline bypass, indirect access or duplicate summary validator was introduced.
The entry is blocked pending lead-owned baseline removal or an expanded file scope.

### Compatibility row drafts (coordinator-owned contracts commit pending)

| Contracts delivery | Stored fixture | Entry point | Evidence |
| --- | --- | --- | --- |
| Pending B6a implementation commit | Old Source with a Timeline | parseNote/serializeNote/applyChanges | Stored bytes retained; append and link rewrites refused |
| Pending B6a implementation commit | Old MOC with a Timeline | parseNote/serializeNote/applyChanges | Readable; ordinary history refused; Timeline cannot be rewritten |
| Pending B6a implementation commit | Existing v2 ownership fixtures and B5a profile region | parseOwnership/note-edit | Existing payload spans/tasks and profile edits stay green |
| Pending B6a implementation commit | Old serializer output without template intent | parseNote/serializeNote | Existing serialization behavior stays green; no template backfill |
| Pending B6a implementation commit | LF/CRLF Project payloads and stale previous content | applyChanges/manifest validation | Exact region rewrite passes; stale payload refuses; personal bytes unchanged |

### Verification environment

The initial red command inadvertently triggered the existing CPU reporter under
ignored `test-results/cpu`; no tracked file changed. Its direct log was in OS temp.
Subsequent runs use `/tmp/b6a-test-output.cjs` to route report/cache writes and
scratch fixture directories to `/tmp/b6a-test-artifacts`, without editing tests,
configuration or node_modules. No node_modules link or replacement was made.
`--configLoader runner` avoids Vite's checkout-local bundled-config temporary file.
The temp fixture package declares ESM; the preload resolves the installed
Playwright ESM entry for those temp fixtures. The nested quiet-gate config's module
resolution follows the redirected temporary output as well.

The first full src run reported harness/quiet-gate setup failures caused by that
temp relocation, plus the expected e2e-port EPERM. After fixing only the OS-temp
preload, harness passes 47/47 and quiet-gates passes 4/4. A full final src run and
runner run are underway against the final implementation. These are environment
setup failures, not test/packet contradictions. No assertions were weakened.

Final targeted suites pass 1,807/1,807 (`/tmp/b6a-targeted-final.log`), including all
B6a reds, old compatibility fixtures and run-manifest tests. App/node/runner tsc
and touched-file ESLint pass (`/tmp/b6a-tsc-{app,node,runner}.log`, `/tmp/b6a-eslint.log`).
Unused-code gate failure is above (`/tmp/b6a-unused.log`).

No screen changed (`ui: false`). `pnpm check` was not run: its test/build/check-mark
scripts write into the repository, contrary to the owner's instruction; the
requested separate checks were run with OS-temp output. No e2e server or deployment
was started. The harness's retry fixtures execute only their own Node tests.

### Contradictions (TL-P4-51)

No B6a or existing contract test contradicts the packet. The entire targeted suite
was run, not only the new assertions. All red-test assertions are unchanged.
The required gate's baseline file is the scope blocker, not a contract contradiction.

### Owned implementation files

- `src/data/contracts/note-templates.ts` (new declaration)
- `src/data/contracts/note-format.ts`
- `src/data/contracts/ownership-format.ts`
- `src/data/contracts/note-edit.ts`
- `src/data/contracts/run-manifest.ts`
- `src/data/spine/scripted.ts`
- `docs/harness/2026-10-10-b6a-templates-notes.md`

### Remaining contract work at the scope stop

The planner currently retains up to five unique authored related links, but does
not yet enforce that at least one is present or resolve/include the destination
hub when the authored body omitted it. The creation serializer likewise accepts
missing date/source/related properties from callers other than the grounded
planner. The current reds all pass, but this is not a claim that contracts 1–4
are fully delivered. Required-link/metadata admission remains within B6a's owned
files and must be finished when implementation resumes. Nothing was padded with
unrelated notes to make those requirements appear satisfied.

The initial incomplete temp-output preload also let the first full src run create
empty ignored `test-results/fx-*` directories via mkdtempSync before redirecting
its file contents. The corrected preload redirects mkdtempSync itself. These
ignored artifacts were not removed after the scope stop. The final runs leave
fixture/report files under OS temp. Required harness tests use their existing
scratch Git fixtures there; the session issued no git write command and made no
worktree Git-state change.

### Final verification results

- Final full src: 169 files, 5,650 tests pass; only the expected e2e-port listen
  EPERM fails (one test timeout and its one unhandled EPERM), `/tmp/b6a-src-final.log`.
  Failing test: `src/e2e-port.test.ts:37`, `a server from another worktree is never reused`.
- Final runner: 50 files, 667 tests pass, `/tmp/b6a-runner-final.log`.
- Final targeted contracts/format/ownership/edit/planning/manifest: 1,807 pass,
  `/tmp/b6a-targeted-final.log`. All five B6a red identifiers pass.
- App/node/runner tsc and touched-file ESLint pass. `git diff --check` passes.
- Ordinary unused gate passes. Production unused gate fails only the stale
  `validSummary` baseline row, `/tmp/b6a-unused-final.log`.
- Log index: `/tmp/b6a-gates.txt`. No test/packet contradictions were found.

Status: blocked, with no commits under the owner's no-git-writes instruction.
Resume required: authorize or lead-remove the out-of-ledger unused production
baseline row; finish required hub/link and metadata admission in the owned files;
rerun affected checks. The current passing reds are not full acceptance evidence.

## Implementation (finished)

Resumed 2026-10-11 under the owner's no-network, no-git-writes and no-test-changes
instructions. The earlier uncommitted implementation is retained. The coordinator's
baseline removal is retained, and both unused gates now pass. This section supersedes
the previous scope blocker and verification results. Implementation work has stopped
under TL-P4-51; acceptance is **blocked**, not done, by the contradiction below.

### Contract 3 changes

The existing scripted planner resolves authored links against listed note identities,
deduplicates by file id and includes the nearest destination hub/MOC even when the
authored body omitted it. Hub recognition uses the existing VaultIndex.isHub home,
including typed MOCs; indexed front matter is reused when available. Sources
subfolders may use their parent hub. Ambiguous or absent destination hubs refuse
before any effect. Related metadata contains the hub plus at most four resolved
authored notes. It adds no other folder notes for padding. Selected note identities
are included in the manifest's captured places.

The existing note-format serializer checks explicit template creation for every
caller: B2a summary admission, at most three tags, actual created/updated calendar
dates, nonempty source, one to five unique related wikilinks, matching type and the
Source original. It rejects duplicate/reserved property keys and personal template
creation. It emits type/status, an explicit empty tags list where needed, dates,
source, related and the template discriminator through its existing front matter
writer. Type and status retain the template's existing defaults. Legacy inputs
without template intent retain their compatibility path; stored personal notes
retain their bytes. No second serializer, validator for B2a summary, operation kind
or maintain write was added.

Offline standards remain the citations in Implementation: Zod declarative schemas,
CommonMark lists and the GFM checkbox extension. No network request was made.

removed: incomplete metadata admission from explicit Bower template creation.
removed: planner admission of explicit template notes without a grounded destination hub.
removed: authored-link-only selection that could omit the hub from the five related links.
removed: no files, tests, legacy serializer or maintain mechanism.
tests changed: none

### Every contract contradiction (TL-P4-51)

There is exactly one contradicting test after the complete targeted and src suites:

- `src/data/spine/scripted.test.ts:26` —
  `B6a templates: b6-source-absent-url plans a Source with its original and no invented address`.
  Its destination is `Resources/Gardening` (:32), its authored body supplies
  `[[Gardening]]` (:36), and it requires successful note creation (:39–47). The
  default seeded folder has no Gardening hub/MOC or Gardening note. An authored
  unresolved name is not a grounded link. The real planner now refuses this case
  before any effect, as required by contract 3 and the owner's explicit instruction.
  Making this fixture pass would require inventing grounding or changing a test;
  neither was done. The full five-file target was run before this stop, followed
  by every requested gate. Lead/coordinator resolution of this fixture is required.

`src/e2e-port.test.ts:37`, `a server from another worktree is never reused`, is the
owner-expected listen EPERM and resulting timeout/unhandled error. It is an
environment failure, not a packet contradiction. There are no other src failures.

### Final verification

All test/report/cache output used OS temp via the existing
`/tmp/b6a-test-output.cjs` preload and `--configLoader runner`. No test,
configuration or node_modules was changed, replaced or symlinked. No session git
write command was issued. Harness tests ran their existing scratch Git fixtures
under OS temp. Read-only `git diff --check` passes and the test-file diff is empty.

| Check | Result | OS-temp log |
| --- | --- | --- |
| Complete B6a five-file reds/compatibility target | 387 pass; only the contradiction above fails | `/tmp/b6a-finished-reds.log` |
| `pnpm exec vitest run src --maxWorkers=2` | 5,649 pass; contradiction and expected e2e-port fail; one expected unhandled EPERM | `/tmp/b6a-finished-src.log` |
| Runner tests, maxWorkers=2 | 50 files / 667 tests pass | `/tmp/b6a-finished-runner.log` |
| App TypeScript, noEmit | Pass | `/tmp/b6a-finished-tsc-app.log` |
| Node TypeScript, noEmit | Pass | `/tmp/b6a-finished-tsc-node.log` |
| Runner TypeScript, noEmit | Pass | `/tmp/b6a-finished-tsc-runner.log` |
| ESLint, all six owned runtime files | Pass | `/tmp/b6a-finished-eslint.log` |
| `node scripts/check-unused-gate.mjs` | Pass: 2 ordinary / 29 production known findings; no new or stale findings | `/tmp/b6a-finished-unused.log` |

The src and targeted commands also used `--configLoader runner` to avoid a
checkout-local config bundle. Runner JSON is `/tmp/b6a-finished-runner.json`.
`pnpm check` was not run because its build, report and check-mark steps write into
the repository; the owner requested the separate checks above. No screen changed
(`ui: false`), so no e2e server was started.

Additional OS-temp diagnostic probes call the unchanged production entry points:

- `/tmp/b6a-contract3-probe.ts` bundled to `.mjs`: 72 checks pass for required
  metadata across all five templates, summary/tag bounds, missing related links,
  personal creation refusal, exact personal round-trip and the absent Gardening
  seed fixture. Log: `/tmp/b6a-contract3-probe.log`.
- `/tmp/b6a-planner-probe.ts` bundled to `.mjs`: real planScripted creation with
  an omitted hub resolves it; six authored notes yield five related links including
  the hub; an unrelated neighbour is excluded; a missing hub refuses. All pass.
  Log: `/tmp/b6a-planner-probe.log`. These synthetic probes add no repo test/fixture.

### Final compatibility row drafts (coordinator-owned contracts commit pending)

| Contracts delivery | Stored fixture | Entry point | Evidence |
| --- | --- | --- | --- |
| Pending B6a implementation commit | Old Source with a Timeline | parseNote/serializeNote/applyChanges | Exact bytes retained; history and prose-link rewrites refused; compatibility cases pass |
| Pending B6a implementation commit | Old MOC with a Timeline | parseNote/serializeNote/applyChanges | Readable without backfill; ordinary history and Timeline rewrites refused; compatibility cases pass |
| Pending B6a implementation commit | Existing v2 ownership and B5a profile fixtures | parseOwnership/note-edit | Existing spans, personal tasks and profile edits pass in the complete src suite |
| Pending B6a implementation commit | Old serializer output without template intent | parseNote/serializeNote | Legacy serialization assertions pass; creation metadata is not backfilled onto stored notes |
| Pending B6a implementation commit | LF/CRLF Project payloads and stale previous content | applyChanges/manifest validation | Goal/Next steps region rewrites pass; stale payload refuses; personal bytes retained |
| Pending B6a implementation commit | Plain personal note without front matter | parseNote/serializeNote; explicit template refusal | Personal round-trip is exact; personal creation intent cannot acquire template metadata |

Owned files remain the six runtime paths and this notes file listed in Implementation.
Only note-format, scripted planning and these notes changed in this resumed session.
Status: blocked under TL-P4-51; no commits, no acceptance claim, no test modification.

## Red repair 2

tests changed: src/data/spine/scripted.test.ts: seed the Gardening hub so the link is grounded (packet contract 3)

Seeded Resources/Gardening/Gardening.md through FakeDrive createFolder/createText,
following the existing scripted planner fixture in fake-worker.test.ts:1445–1450.
Every Source assertion remains unchanged. No production file, node_modules or git state was written.
No network used; the coordinator owns commits.

Before repair: the exact b6-source-absent-url scripted test was refused by templateLinks;
the file had 1 failure and 5 passes. Log: /tmp/b6a-repair2-red.log.
After repair: all 6 tests pass, including original retention, absent invented URL and successful creation.
Log: /tmp/b6a-repair2-green.log.
Command: NODE_OPTIONS='--require=/tmp/b6a-test-output.cjs' pnpm exec vitest run src/data/spine/scripted.test.ts --maxWorkers=2 --configLoader runner
The existing preload directs test/cache artifacts to OS temp. No broader gate was run
under this mechanical repair scope; pnpm check writes into the repository.
This repair resolves the missing Gardening fixture contradiction recorded above.

tests changed: src/data/contracts/note-edit.test.ts: B6a reds (TL-P4-47 Q5 Goal/Next steps regions, legacy Timelines); additions only.
tests changed: src/data/vault/note-format.test.ts: B6a reds (TL-P4-47 Q5 template shapes and front matter); additions only.
tests changed: src/data/vault/ownership-format.test.ts: B6a reds (TL-P4-47 Q5 template region marks); additions only.

## Fix round 1 reds

Red-owning session, 2026-10-11. Packet: adversarial pass 1, BLOCK with three
Blocking findings. Added exactly one test per finding; all names start with
`B6a fix 1: `. Existing assertions remain unchanged. Only the two test files and
this notes file were edited. No runtime edits, network, git writes, commits,
node_modules replacement or symlink. The coordinator owns commits.

tests changed: src/data/spine/scripted.test.ts: added ungrounded authored-link refusal red through planScripted; existing assertions unchanged.
tests changed: src/data/vault/note-format.test.ts: added display-model and quoted-metadata reds through serializeNote/parseNote and the screen resolver; existing assertions unchanged.

### Exact reds and observed failures

1. `B6a fix 1: refuses an ungrounded authored link before effects even with a grounded Gardening hub`
   Seeds Resources/Gardening/Gardening.md using FakeDrive, then authors a Source
   with both `[[Gardening]]` and `[[Imaginary note]]`. Calls production
   planScripted with the admitted pile and real decisions. Requires BowerError
   refusal, no returned plan/manifest and an unchanged Drive listing.
   Observed: no refusal, returned executable manifest. The unchanged-listing
   assertion passes; planning itself has not applied effects.

2. `B6a fix 1: populated Project Area and MOC sections survive into the app display model`
   Serializes populated Project, Area and MOC fixtures and parses them through
   parseNote. Checks every declared section is populated on disk, then checks its
   text in the body/currentState/timeline model rendered by NoteScreen. Unique
   text per section prevents one section from accidentally satisfying another.
   Observed missing display text: Project Goal and Next steps; Area Standard to
   maintain; MOC Overview, Notes and Sources. Current state, Timeline and the
   Project/Area Notes controls pass. No assertion over raw serialized text alone
   is treated as proof of display.

3. `B6a fix 1: quoted tags and Original filenames round-trip and resolve for template and legacy notes`
   Serializes/parses Source tags `2026` and `on`, and original filename
   `Garden "mint".txt`. Repeats with no template intent to cover the legacy writer.
   Uses NoteScreen's resolverFor against a real tree entry and first verifies
   that the actual filename resolves. Requires exact parsed strings and the
   parsed Original link resolving to Resources/Gardening/Garden "mint".txt.
   Observed: template tags retain literal outer quotes; both writers' parsed
   original filenames retain backslash escapes; both Original links resolve to
   null. Legacy unquoted tags and the direct filename resolver control pass.

Soft assertions collect all defects inside each finding's single test. The full
two-file suite completed; no existing-test contradictions or load errors arose.

### Offline standards and reuse

Reused the existing shared serializer/parser, production scripted planner,
FakeDrive seeded fixture, and NoteScreen resolver. The installed Vitest README
identifies its [official documentation](https://vitest.dev/). The existing
note-format scalar code and tests cite
[YAML 1.2.2 flow scalar styles](https://yaml.org/spec/1.2.2/#73-flow-scalar-styles)
for quoted string/escape semantics. These are offline references; no network
request was made. No new serialization or resolution mechanism was introduced.

### Verification

```sh
NODE_OPTIONS='--require=/tmp/b6a-test-output.cjs' pnpm exec vitest run src/data/vault/note-format.test.ts src/data/spine/scripted.test.ts --maxWorkers=2 --configLoader runner > /tmp/b6a-fix1-reds.log 2>&1
```

Final result: 265 tests, exactly 3 new expected assertion failures, 262 passes.
All existing tests pass. Log: `/tmp/b6a-fix1-reds.log`.
The existing OS-temp preload redirects test/cache output outside the repository;
configLoader runner avoids a checkout-local Vite config bundle. Tests use only
in-memory data; no test output was directed into the repository.

Touched-file ESLint passes: `/tmp/b6a-fix1-eslint.log`.
App TypeScript (`--noEmit --incremental false -p tsconfig.app.json`) passes:
`/tmp/b6a-fix1-tsc.log`. Read-only test diff confirms additions only.
No pnpm check, e2e, implementation or broader suite was run under this test-only
red scope. No screen code changed. Production fixes and commits remain with their
owning sessions. Red delivery is done; acceptance remains blocked by these reds.
