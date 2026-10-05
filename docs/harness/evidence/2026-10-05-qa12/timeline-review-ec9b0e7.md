# Renewed independent Timeline review

Session `p2-timeline-review-2026-10-05`; entry `timeline-source-names`; adopted revision `2026-10-05-contracts-2`, P2, C03/C16.

Exact immutable range: `28d2ce2359a940f2e2d25b4f58af04636dd15a7b..ec9b0e7dbde2af0739ea3bc4750d25c54c33c2e8`. Owned worker `/private/tmp/bower-p2-journal-ack`, clean HEAD at the candidate, branch `codex/p2-timeline-names` per packet. Inspected complete base-to-candidate scope plus superseded `621ac558ba1781a2ceac152636a068c667f1a7d3..ec9b0e7` correction and supplied proof. Read-only: no tests/builds/installs/browser/provider calls, repository/shared-record edits or delegation by reviewer.

## Verdict

**No remaining correctness findings in the reviewed candidate.** The prior Minor dotted-folder label finding is addressed within this exact replacement candidate by typed rendering and inspected real assertion red/green evidence. Suitable for coordinator serial integration and its remaining gates. This is independent candidate review, not entry closure, full P2 acceptance or manual evaluation certification.

## Correction and compatibility

`src/features/note/NoteScreen.tsx:72,97–109` reads the existing tree and inspects the actual resolved node. A file label uses `thingName(node.name)`; a folder keeps `node.name` completely; missing node/tree falls back to the authored target. This closes the prior indiscriminate stripping defect. It does not add direct folder resolution: ordinary folders still follow the existing resolver behavior, and renamed-folder destinations remain reachable through the existing `formerNames` mapping. That fallback is already supplied by the journal, with no changes to resolver/schema/provider.

Targets and aliases remain separate. The first pipe splits a source target from its intentional wording; aliases, including `Lease copy.pdf`, stay verbatim regardless of file/folder/web classification. Naked PDF/image labels match their pages and Original property. Resolved files keep existing filename behavior; the final extension is removed by the shared existing helper. Dotted folders retain the entire suffix. Unresolved ordinary targets remain raw text with the existing unresolved span; unknown resolved node falls back conservatively rather than guessing its type.

Web classification still applies only when no local destination resolves. Existing naked host/full HTTP handling, hrefs, `_blank`, and `noreferrer noopener` remain. Aliased web sources preserve the target and label independently by inspection. Empty falsey sources remain omitted by the outer condition. Malformed/empty alias handling, arbitrary literal pipes, heading/block navigation and external URL validation were not broadened by this entry.

Only four authorized files changed: NoteScreen, demo notes, qa12 and the reserved dependent qa5 visible-name selector. No source content write, protected-section mutation, serialization/parser/schema change or additional resolver capability was introduced. The minimal fixture adds the existing PDF alias and an existing Viewing photos folder source to the separate Cobble Row note (`src/data/demo/notes.ts:104–109`); Flat 3's naked source fixtures and both existing web fixtures remain intact.

Existing fake seeding serializes Timeline source strings as `[[target|alias]]`, and the existing parser retains the whole source while link extraction takes only its target (`src/data/fake/seed.ts:65–76`; `src/data/vault/note-format.ts:108–125,167–181`). The alias source targets a PDF; the folder source does not introduce a new note link. No demo backlink arrays changed. The fake targeted journey proves the fixture reaches the renderer through this existing storage path; it does not prove new provider behavior.

## New assertion honesty

`e2e/qa12.spec.ts:30–85`, exact test **`timeline source links use plain file names and retain aliases`**, retains every earlier file/alias/web/destination assertion and extends the same journey:

- Navigate to the real existing Viewing photos folder.
- Rename through the actual phone menu/dialog or desktop tree context menu/inline input to `Viewing photos.2026`.
- Assert the renamed folder URL.
- Return to Cobble Row through UI navigation, retaining the same source instance and its rename journal; no page reload discards the mapping at this point.
- Require exact Timeline link label `Viewing photos.2026`, click it, then assert the complete folder URL and heading.

Thus the test exercises the reachable former-folder mapping and typed label, rather than stubbing a folder result or testing the unchanged unresolved branch. The additional fixture is synthetic and uses an existing folder.

## Inspected supplied evidence

| Evidence | Result and scope |
| --- | --- |
| `/private/tmp/bower-timeline-folder-red.log` | Two actual assertion failures, phone/desktop demo, against superseded 621ac55 with new assertions: exact full folder link missing at qa12 line 82. Earlier file/alias/web steps and real rename URL assertion completed. |
| `/private/tmp/bower-timeline-folder-fake-red.log` | Same genuine folder-label assertion failures in both fake sizes. |
| `/private/tmp/bower-timeline-folder-green.log` | Revised complete named journey passes twice in demo and twice in fake, no skips; includes original file/alias/web steps and new folder label/click/destination. |
| `/private/tmp/bower-timeline-folder-check.log` | Revised pnpm check completes: 51 unit test files/420 tests, typecheck/build/harness/bundle/landing gates. Existing lint and chunk-size warnings retained; no failure shown. |
| Prior `/private/tmp/bower-timeline-names-{red,fake-red}.log` | Preserved original genuine naked PDF-label assertion failures at qa12 line 38, two per source. |
| Prior `/private/tmp/bower-timeline-names-outline-green.log` | Dependent `the outline lists Bower's sections and sources link` passed twice per source on 621ac55. **Not rerun for ec9b0e7.** Phone returns after source/PDF navigation; desktop continues Outline assertions. |

These executions are supplied implementer/coordinator evidence, not reviewer reproduction. Original and replacement logs are distinguished; prior Outline success is not relabeled as replacement runtime evidence. Git whitespace diff inspection is clean.

## Remaining proof limits

Full integration demo/fake gates are pending. Native manual evaluation is **NOT RUN**. No reviewer browser activity occurred. No new dedicated runtime assertions cover web aliases, malformed/empty aliases, unresolved targets, transient missing tree, or heading/block suffixes; those branches were read, and no new actionable regression was found. Existing resolver duplicate-name/stale-mapping limitations are unchanged and outside this label-only assignment. Provider atomicity, version/recovery architecture and complete C03/C16 acceptance remain separate obligations. Later behavioral changes require renewed immutable review.
