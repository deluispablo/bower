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
