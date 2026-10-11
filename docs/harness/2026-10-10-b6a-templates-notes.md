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

## Fix round 1

Implementation session, 2026-10-11. Read WORKER, the B6a packet, adversarial
pass 1 and the preceding Fix round 1 reds. Reproduced exactly the three committed
assertion reds before editing runtime code: 3 failed, 262 passed in the complete
two-file suite (`/tmp/b6a-fix1-before.log`). No existing-test contradictions.

### Changes

- `scripted.ts`: the existing identity resolver now refuses every missing or
  ambiguous authored link before returning a plan. A grounded destination hub
  cannot let an ungrounded link remain in the generated body. Resolution,
  deduplication, nearest-hub selection and captured identities keep their one home.
- `note-format.ts`: writer and display reader share the existing template-section
  scanner and fence grammar. The reader projects the declaration's ordered sections
  into body/currentState/timeline, including Project Goal/Next steps, Area Standard
  to maintain and MOC Overview/Notes/Sources. Validated ownership framing is hidden
  from display; fenced marker-shaped text remains content. Ordinary Bower's note
  stays in its existing display field. Display strings grant no write authority.
- `note-format.ts`: the existing summary scalar decoder now decodes all quoted
  metadata, including Original filenames and status/property values. Tags split
  at commas outside quoted items and then use that same decoder, including YAML
  single-quote doubling and double-quote escapes. Block-list tags keep their item
  quoting until decoding; other block-list properties retain the legacy joined
  display. Unknown escapes remain verbatim. No serializer or dependency was added.

removed: silently skipped unresolved authored links in explicit template planning.
removed: the personal-payload/Source-only limit on template display projection.
removed: quote stripping without escape decoding and unconditional tag comma splitting.
removed: no files, tests, declaration home, serializer or ownership authority.
tests changed: none

### Offline standards and compatibility

Read the installed Zod README's declaration/parse example. Reused NOTE_TEMPLATES,
the one note-format serializer/scalar decoder and ownership-format's fence grammar.
Offline references: [Zod declaration and parsing](https://zod.dev/api),
[YAML 1.2.2 scalar styles](https://yaml.org/spec/1.2.2/#73-flow-scalar-styles),
[CommonMark fences](https://spec.commonmark.org/0.31.2/#fenced-code-blocks).
These are existing/local references, not freshly fetched documentation. No network.

| Uncommitted contracts fix | Stored format | Compatibility evidence |
| --- | --- | --- |
| Fix round 1 | Legacy serializer Source with quoted Original | Exact filename and screen resolution pass the committed red |
| Fix round 1 | Legacy plain/owned notes and Source/MOC Timelines | All five existing targeted suites pass; no template backfill |
| Fix round 1 | Ownership/2 templates, LF and CRLF | All declared sections display; untouched parse/serialize retains exact bytes |
| Fix round 1 | Quoted flow/block tags and scalar metadata | Numeric-looking tags, escaped quotes/backslashes, commas and single-quote doubling retain meaning |

An OS-temp production-API probe adds 104 checks across all five templates and both
line endings, plus quoted block tags/indexed metadata; it passes. Probe source,
bundle and log are `/tmp/b6a-fix1-probe.{ts,mjs,log}`. No repository test was added.

### Verification

All Vitest runs used the existing OS-temp preload
`NODE_OPTIONS='--require=/tmp/b6a-test-output.cjs'` and `--configLoader runner`.
It redirects test/cache/report writes to `/tmp/b6a-test-artifacts`; configuration
bundling stays outside the checkout. No node_modules replacement or symlink.
Runner JSON is explicitly `/tmp/b6a-fix1-runner-final.json`.

| Requested check | Result | OS-temp log |
| --- | --- | --- |
| Complete five-file B6a reds/compatibility target, maxWorkers=2 | 391 pass, including all three fix-round reds | `/tmp/b6a-fix1-targeted-final.log` |
| Full src suite, maxWorkers=2 | 168 files, 5,653 pass; only expected e2e-port EPERM/timeout fails, one unhandled EPERM | `/tmp/b6a-fix1-src-final.log` |
| Runner tests, maxWorkers=2 | 50 files, 667 pass | `/tmp/b6a-fix1-runner-final.log` |
| App tsc, noEmit/incremental false | Pass | `/tmp/b6a-fix1-tsc-app-final.log` |
| Node tsc, noEmit/incremental false | Pass | `/tmp/b6a-fix1-tsc-node-final.log` |
| Runner tsc, noEmit/incremental false | Pass | `/tmp/b6a-fix1-tsc-runner-final.log` |
| ESLint, both touched runtime files | Pass | `/tmp/b6a-fix1-runtime-eslint-final.log` |
| Supplemental production-API probe | 104 pass | `/tmp/b6a-fix1-probe.log` |

Log index: `/tmp/b6a-fix1-gates.txt`. The final full src run confirms the same
5,653 passes as the first run; only `src/e2e-port.test.ts:37` failed with its
expected listen EPERM/timeout and one unhandled EPERM. This is the owner's
expected environment exception. No test/packet contradictions were found.

No screen code changed (`ui: false`), so no touched-screen e2e. The owner's
explicit gates above replace the ordinary pnpm check invocation for this round:
its bundled test script removes checkout-local test output, and the overall
command writes other repository outputs. No check mark or pnpm check pass is
claimed. No agent-issued writing git command or commit; coordinator owns commits.
Read-only test diff is empty, and git diff --check passes.

## Fix round 3 reds

Red-owning session, 2026-10-11, TL-P4-47 addendum 3. Read WORKER and
`2026-10-11-codex-b6a-templates-adversarial-2.md`. Tests and these notes only;
no existing assertion changed. No network, writing git command, commit, runtime
edit, node_modules replacement or symlink. The coordinator owns commits.

tests changed: src/data/spine/scripted.test.ts: added all-authored-field grounding reds and grounded-note/bound-source controls through planScripted; existing assertions unchanged.
tests changed: src/features/note/b6a-task-regions.test.tsx: new Project task identity reds through NoteScreen's production callback and DriveVault.toggleTask; no display-shape assertions.

### Grounding entry point and exact names

`B6a fix 3: refuses a missing link in $template $field before effects with no manifest`
runs for all five templates and each declared section, plus the separate summary
field (25 cases). Each seeds a real Resources/Gardening/Gardening.md hub and
authors exactly one missing link. Production planScripted must throw BowerError
with B_FAILURE, return no plan/manifest, and retain the exact FakeDrive snapshot
(content, identities and metadata), rather than merely an unchanged listing.
The source Key points and Transcript are exercised separately, as are Project
Goal/Next steps, Area Standard to maintain and every MOC field. The section names
come from the existing NOTE_TEMPLATES declaration; no second declaration home.
These behavioural reds cover every current authored prose field, without making
an implementation claim about how many grounding functions the eventual fix has.

Observed assertion reds (all at scripted.test.ts:55-57):

- `B6a fix 3: refuses a missing link in source summary before effects with no manifest`
- `B6a fix 3: refuses a missing link in concept summary before effects with no manifest`
- `B6a fix 3: refuses a missing link in project summary before effects with no manifest`
- `B6a fix 3: refuses a missing link in area summary before effects with no manifest`
- `B6a fix 3: refuses a missing link in moc summary before effects with no manifest`

Every summary case returns an executable manifest without refusal. All 20 missing
section-link cases refuse correctly and pass. Snapshots remain unchanged for all
planner cases, including the broken summary cases: the defect is admission to an
executable plan, not an effect applied during planning.

`B6a fix 3: a grounded summary link still plans a Source` passes, preserves the
summary's [[Gardening]], creates a Source operation and leaves Drive unchanged.

Bound-source identity controls use the admitted item's real filename and require
the matching file-id move and generated Source operation:

- `B6a fix 3: a link to the bound source in summary still plans` passes.
- `B6a fix 3: a link to the bound source in Key points still plans` fails at scripted.test.ts:74,77.
- `B6a fix 3: a link to the bound source in Transcript still plans` fails at scripted.test.ts:74,77.

The last two are refused as ungrounded even though the non-note file is the bound
original. This is explicitly within the owner's real-note-or-bound-source rule.

### Task entry point and exact names

The fixture uses serializeNote to create a valid ownership/2 Project, verifies its
personal ownership table contains only Buy a pot, and opens it through real
DriveVault.note and NoteScreen. A spy delegates to the real Markdown component
and retains NoteScreen's onToggle callback. It invokes that callback using the
task's position in the actual parsed input, which is Markdown's current public
callback contract. No checkbox, plain-list, disabled-state, CSS or layout assertion
is made. The callback still reaches real DriveVault.toggleTask, writeText, journal
and the production report handler; the spies observe rather than replace effects.

- `B6a fix 3: toggling the personal Project task changes only Buy a pot`
  fails: the personal callback index is refused as not-found, no write happens,
  and the screen logs one error. Requires success, the full stored file equal to
  its original with only Buy a pot's checkbox byte changed, one note write and no error.
- `B6a fix 3: a toggle aimed at the Project Bower task refuses unchanged and logs one BowerError`
  fails: Plant mint's callback toggles Buy a pot, writes the note and task journal,
  and logs no error. Requires BowerError refusal, byte-exact file and snapshot
  preservation, no writes, and exactly one logged BowerError from the screen.

Both failures are assertions after the production callback/mutation, not load
errors. Exact whole-file comparisons ensure no toggle reaches another region's
line or changes ownership framing. Each test uses a fresh in-memory Drive and
disposes its vault; localStorage and component state are cleared between cases.

### Offline research and verification

Reused production NOTE_TEMPLATES, serializeNote/parseOwnership, planScripted,
FakeDrive, NoteScreen/Markdown's documented positional callback and DriveVault.
The installed Vitest README points to [official Vitest documentation](https://vitest.dev/).
The existing template declaration cites [GFM task list items](https://github.github.com/gfm/#task-list-items-extension-)
and [CommonMark list items](https://spec.commonmark.org/0.31.2/#list-items).
These are offline citations; no documentation was fetched and no new mechanism
or dependency was introduced.

```sh
NODE_OPTIONS='--require=/tmp/b6a-test-output.cjs' pnpm exec vitest run src/data/spine/scripted.test.ts src/features/note/b6a-task-regions.test.tsx --maxWorkers=2 --configLoader runner > /tmp/b6a-fix3-reds.log 2>&1
```

Final targeted result: 38 tests, 9 new expected assertion failures, 29 passes.
All seven pre-existing scripted tests pass; there are no existing-test
contradictions. Grounded summary control passes. No import/load/unhandled errors.
The existing OS-temp preload redirects all reporter/cache output outside the
repository; configLoader runner avoids a checkout-local configuration bundle.
No test writes repository files.

Touched-file ESLint passes: `/tmp/b6a-fix3-eslint.log`.
App tsc (`--noEmit --incremental false -p tsconfig.app.json`) passes:
`/tmp/b6a-fix3-tsc.log`. Read-only git diff --check passes. The tracked test diff
is additions only, and the second test file is new. No pnpm check (writes repo
outputs), e2e/server or broader gate under this explicitly test-only red scope.
Red delivery is done; implementation and commits remain with their owners.

## Fix round 3

Implementation session, 2026-10-11, TL-P4-47 addendum 3. Read WORKER, the B6a
packet, adversarial pass 2 and the notes' Fix round 3 reds. No network, writing
git command, commit, test edit, node_modules replacement or symlink. The
coordinator owns commits. Only note-format, scripted planning and these notes
change; the display and screen code retain their existing form.

The committed round 3 reds reproduce nine assertion failures and 29 passes in
`/tmp/b6a-round3-red.log`: five summary admission failures, two bound-source
admission failures and two Project task identity failures. The complete six-file
B6a target then passes all 422 tests in `/tmp/b6a-round3-targeted.log`.

`scripted.ts` has one `groundedAuthoredLinks` function over every authored string
(name, summary, body and template). Every authored section remains in body and
passes that same check. Real-note links resolve against existing file identities;
unresolved or ambiguous links refuse the whole plan before an executable manifest
or effects. A bound original is admitted by its captured file identity and the
names/paths it has before and after its planned move. Non-note originals are not
padded into related notes. The existing destination-hub selection supplies the
related metadata, and the existing serializer remains the sole writer.

`note-format.ts` reuses its existing template-section parser for both the display
and a private region identity table. It retains each source line's exact UTF-8
byte offset, including CRLF and hidden Bower prose, then matches a displayed
checkbox to the ownership table's personal checkbox byte. The identity carries
its personal-region index; protected/unclaimed task bytes carry no personal
authority. Toggle delegates only that region index to `togglePersonalTask`.
A Bower task throws `BowerError` with one short sentence before note/journal
writes; NoteScreen's existing report handler logs the error once. No logging or
mutation path is added. note-edit's existing personal-task and per-payload
re-parse invariants remain the edit boundary; no change there is needed.

removed: body-only authored-link admission and refusal of bound non-note originals.
removed: aliasing template display positions to personal-region task indices.
removed: no files, tests, display form, serializer, ownership author or dependency.
tests changed: none

### Offline standards and compatibility

Read the installed runner Zod README's declaration/parse examples, and reused
NOTE_TEMPLATES, TASK_LINE, the existing section/fence parser, parseOwnership and
togglePersonalTask. Offline references: [Zod schemas](https://zod.dev/api),
[CommonMark list items](https://spec.commonmark.org/0.31.2/#list-items) and
[GFM task lists](https://github.github.com/gfm/#task-list-items-extension-).
These references were not fetched. No second declaration or serializer.

| Uncommitted contracts fix | Stored format | Compatibility evidence |
| --- | --- | --- |
| Fix round 3 | Legacy/plain notes and old Source/MOC Timelines | Complete B6a target retains all existing assertions |
| Fix round 3 | ownership/2 Project Goal/Next steps and personal Notes | Screen/Drive toggle changes only the requested personal checkbox; Bower refusal has no effects |
| Fix round 3 | All five templates, LF/CRLF and repeated task labels | Exact ownership-byte mapping; untouched display/serialization retained |
| Fix round 3 | Project regions stored after personal content | Declaration display order still maps to the correct fetched personal byte |

Supplemental production-API probe: 68 checks pass in `/tmp/b6a-round3-probe.log`;
source/bundle are `/tmp/b6a-round3-probe.{ts,mjs}`. It covers all five templates,
repeated labels in distinct regions, LF/CRLF, reordered stored Project regions,
exact toggled bytes and unchanged parse/serialize output. An initial probe
assumption incorrectly treated Concept Related as protected; it was corrected to
use the existing personal region. A reversed Goal/Next steps fixture was invalid
ownership framing; the valid appended-region fixture was used instead. No repo
test, assertion or runtime rule changed for either probe correction.

### Verification

All Vitest runs use `NODE_OPTIONS='--require=/tmp/b6a-test-output.cjs'` and
`--configLoader runner`. The existing OS-temp preload redirects reporter, cache
and scratch writes to `/tmp/b6a-test-artifacts`; no test writes the repository.
Runner JSON is explicitly `/tmp/b6a-round3-runner.json`. All logs are OS temp.

| Requested check | Result | OS-temp log |
| --- | --- | --- |
| Complete six-file B6a target, maxWorkers=2 | 422 pass, including all round 3 reds | `/tmp/b6a-round3-targeted.log` |
| Full src suite, maxWorkers=2 | 168 files / 5,683 tests pass; two failures listed below | `/tmp/b6a-round3-src.log` |
| Runner tests, maxWorkers=2 | 50 files / 667 tests pass | `/tmp/b6a-round3-runner.log` |
| App/node/runner tsc, noEmit/incremental false | All pass | `/tmp/b6a-round3-tsc-{app,node,runner}.log` |
| ESLint on both touched runtime files | Pass | `/tmp/b6a-round3-eslint.log` |
| Supplemental production-API probe | 68 pass | `/tmp/b6a-round3-probe.log` |
| Read-only git diff --check; test diff | Pass; empty test diff | `/tmp/b6a-round3-diff-check.log` |

Log index: `/tmp/b6a-round3-gates.txt`. No screen code or display-form change
(`ui: false`), so no touched-screen e2e. The owner's explicit separate checks
replace pnpm check, whose scripts write repository outputs/check marks. No pnpm
check pass or check mark is claimed. No agent-issued writing git command.

### Complete failure list and scope stop

- `src/docs.test.ts:134`, `what the repository promises > every change since the
  P2 freeze is listed`: the existing committed round 3 red SHA `291a9cf6` is
  missing from `docs/harness/2026-10-07-p3-compatibility.md`. The assertion reads
  that shared change list and committed history, not either changed runtime
  file or these notes. Read-only `git show --stat 291a9cf6` confirms it is the
  already-committed round 3 reds. No git state, commit or change-list row was
  written by this session. The coordinator owns the missing compatibility row;
  it is outside the packet's owned files. This is a pre-existing guard failure,
  not a contradictory task/grounding assertion or a runtime regression.
- `src/e2e-port.test.ts:37`, `the e2e port and server identity > a server from
  another worktree is never reused`: expected listen EPERM in the restricted
  environment, reported as a 5,000 ms timeout and one unhandled listen EPERM.

All requested suites/checks ran before the scope stop. No test contradicts the
owner's grounding/task contract; all nine round 3 reds and every other runtime
assertion pass. Implementation is complete, but the requested entirely green
non-exempt suite is blocked by the coordinator-owned compatibility row above.
No test or shared history record was weakened or edited to hide the failure.

Owned files for this round:
- `src/data/contracts/note-format.ts`
- `src/data/spine/scripted.ts`
- `docs/harness/2026-10-10-b6a-templates-notes.md`

## Fix round 4 reds

tests changed: `src/data/contracts/note-edit.test.ts`: added only; no existing assertion changed.

- `b6-person-typed-source-still-relinks`: a person-owned ownership/2 Source must allow
  mechanical relinking, C05 Timeline insertion, and both in canonical order. All three
  exact text/byte assertions fail with `unsupported`; input bytes stay unchanged.
- `b6-person-typed-moc-still-appends`: the equivalent person-owned MOC permits relinking
  today; Timeline insertion and the combined edit fail with `unsupported`.
- The plain Source fixture reproduces the review's exact `See [[Old]].` rename refusal.
- Two Bower-written legacy controls pass: Source still refuses relinking and Timeline
  insertion, and MOC still refuses Timeline insertion. Existing controls remain untouched.
- Expected text is handwritten using the existing ownership fixture and Timeline format;
  soft assertions exercise every operation independently despite the intended reds.

Verification: `NODE_OPTIONS='--require=/tmp/b6a-test-output.cjs' pnpm exec vitest run
src/data/contracts/note-edit.test.ts --maxWorkers=2 --configLoader runner`.
Result: 3 failed tests (6 failed assertions), 76 passed, 79 total; exit 1.
Log: `/tmp/b6a-round4-red.log`. Existing OS-temp preload redirects test output/cache
writes outside the repository. No network, node_modules changes, runtime edits, or
writing git commands. Read-only `git diff --check` passes. Green gates are left to
implementation; this session owns only reds. Reference: the supplied
`docs/harness/2026-10-11-p4-113-review.md`, TL-P4-32 addendum 1, and C05.

## Fix round 4

P4-113's Important finding is fixed in the existing note-edit admission path.
Template restrictions now require both `note.byBower` and a declared type. This
also scopes the legacy Timeline invariant to Bower notes. Person-owned Source
and MOC notes retain mechanical relinking and C05 Timeline insertion, separately
and in canonical combined order. Bower-made Sources remain immutable and legacy
Bower-made MOC Timelines remain protected. No second edit mechanism was added.

Template byte retention now receives the already-parsed `bower_template` scalar
and checks `Object.hasOwn(NOTE_TEMPLATES, template)`. The declaration keys are the
single name list, and quoted markers use the existing front-matter scalar reader.
The dead unknown-template planner check is removed; AuthoredNote's closed template
union already constrains that input, and serializeNote retains strict admission.

Grounding choice: keep refusal for unresolved authored links in plain non-template
Bower notes. Packet contract 3 says "Front matter on Bower notes" and "Each new
note links its hub/MOC and 1–5 relevant notes"; it does not limit that grounding
rule to explicit templates. The named B56 prep's front-matter paragraph repeats
"Each new note". The existing resolver therefore still checks every authored
string before effects. Template-only hub selection and related metadata remain
scoped to template creation. A production planScripted probe confirms plain notes
with missing links refuse before effects, while a grounded plain note still plans.

Offline standard: reused the installed TypeScript `lib.es2022.object.d.ts`
Object.hasOwn declaration and the existing parsed-scalar/schema mechanisms.
[ECMAScript Object.hasOwn](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.hasown)
is the standard own-key membership operation;
[Zod schemas](https://zod.dev/api) remain the existing precedent for one declaration
consumed by writer and validator. These are offline references; no network used.

removed: type-only template restrictions on person-owned Source/MOC notes.
removed: the duplicated five-template regex in retainPersonalSource.
removed: the dead unknown-template check in scripted planning.
removed: no tests, files, serializers, or ownership mechanisms.
tests changed: none

### Compatibility and verification

The committed round 4 reds were reproduced before the fix: 3 tests fail with
6 assertion failures, 76 pass (`/tmp/b6a-fix4-red.log`). After the fix the complete
six-file B6a target passes 427/427, including person Source/MOC edits, Bower legacy
controls, all five shapes, stored compatibility and Project task identity
(`/tmp/b6a-fix4-targeted.log`). No existing assertion was edited.

| Stored fixture | Entry point | Result |
| --- | --- | --- |
| Person Source/MOC, ownership/2 and plain Source rename | applyChanges | Exact link/append bytes retained; input unchanged |
| Legacy Bower Source/MOC with Timeline | applyChanges | Source immutable; MOC append refused |
| All existing template and legacy format fixtures | Full B6a target | 427 pass |
| Quoted/unquoted stored template marker | parseNote/serializeNote | Original bytes retained |

Runner: 50 files, 667 tests pass (`/tmp/b6a-fix4-runner.log`); JSON report is
`/tmp/b6a-fix4-runner.json`. App/node/runner tsc pass with `--noEmit --incremental
false` (`/tmp/b6a-fix4-tsc-{app,node,runner}.log`). ESLint on all three touched
runtime files passes (`/tmp/b6a-fix4-eslint.log`). The unused-code gate passes
both baselines: 2 ordinary and 29 production findings (`/tmp/b6a-fix4-unused.log`).
The OS-temp supplemental probe passes 7 checks (`/tmp/b6a-fix4-probe.log`); its
initial scratch setup lacked root esbuild and localStorage, corrected only in OS
temp by using runner's installed esbuild and an in-memory storage implementation.

All tests use the existing OS-temp output preload and `--configLoader runner`;
reports, caches, scratch fixtures and logs stay outside the repository.
No network, writing Git command, node_modules replacement or symlink, test edit,
or shared harness record edit. Tests may execute their existing scratch Git
fixtures in OS temp; this session issued only read-only Git checks.
No screen changed (`ui: false`). The requested separate gates replace pnpm check,
whose scripts write build/test outputs and a check mark into the repository.
No pnpm check pass, check mark, e2e server, commit or deployment is claimed.

Owned files: src/data/contracts/note-edit.ts, src/data/contracts/note-format.ts,
src/data/spine/scripted.ts, and this notes file. Read-only git diff --check passes;
the test diff is empty. Full src result follows below.

Full src suite: 168 files / 5,688 tests pass, two tests fail, one unhandled
listen EPERM (`/tmp/b6a-fix4-src.log`). Complete failure list:

- `src/docs.test.ts:134`, `what the repository promises > every change since the
  P2 freeze is listed`: committed round 4 reds SHA `c30f7adc` is absent from
  `docs/harness/2026-10-07-p3-compatibility.md`. Read-only git show confirms this
  is the pre-existing test-only commit. The coordinator owns this shared change
  list, outside the packet's owned files. No test or history row was changed.
- `src/e2e-port.test.ts:37`, `the e2e port and server identity > a server from
  another worktree is never reused`: expected sandbox listen EPERM on 127.0.0.1,
  surfaced as a 5,000 ms timeout plus one unhandled listen error.

All runtime assertions and B6a reds pass. No contract/test contradiction found.
The implementation and requested checks are complete; entirely green non-exempt
src verification remains blocked by the coordinator-owned compatibility row.
