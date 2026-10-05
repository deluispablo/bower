# Phase 2 final round and stable handoff

## State and authority

The owner asked to finish this session at a stable, clean stopping point; another session will orchestrate and distribute remaining P2 work and subsequent phases. This document records actual evidence, not phase acceptance.

- Branch: `codex/close-phase-2`; main remains `5d26800`. No merge, push or remote changes.
- Immutable reviewed/evaluated target: `4d98eb0869b1e7aea388ab6a8a061547be193094`.
- Current production sources are unchanged from that target; handoff changes only documentation and the backlog.
- 201 earlier entries closed with proofs; four new qa-12 entries are open: **201/205 pass**. Their named regression tests are planned, not implemented or executed.
- Code reviewer: fresh `/root/final_review_p2`, canonical session/review skills, read-only Git/code inspection. No tests/browser/builds or edits by reviewer.
- Evaluator: fresh `/root/final_evaluate_p2`, canonical session/evaluate skills, native CUA, read-only repository. Stopped at owner request; incomplete evaluation, not a clean verdict. Temporary tabs closed and viewport reset.
- No active implementation assignment remains. Next coordinator must establish ownership in ACTIVE.md.

## Committed work and gate evidence

The batch closed unsafe run-before-journal behavior, unsafe storage reporting, duplicate bookkeeping folders across clients, malformed Worker/runner replies, Home identity, Drive links, scoped search and stale scope caches, task-seen and upload-retry coverage, composer focus, and coherent names across most file views/actions. Worker candidate was independently reviewed clean. First search review required cache invalidation rework; revised candidate was independently reviewed clean before integration. No cherry-pick conflicts occurred. This is qualitative delivery evidence, not a controlled speed benchmark.

Latest screen changes: `32bbd24` plain names and `4a17962` saved-link tab proof. Both closures have actual failed assertions with the change withdrawn, then check/verify green. Final record `4d98eb0` changes docs only.

| Gate | Actual result | Local evidence |
| --- | --- | --- |
| Check: lint, strict types, unit, build, sensors | 51 files / 398 unit tests passed | `/private/tmp/bower-names-complete-check.log`, `/private/tmp/bower-final-assignment-check.log` |
| Complete demo browser suite | 194 passed / 54 intentional skips | `/private/tmp/bower-names-complete-demo.log` |
| Complete fake browser suite | 194 passed / 54 intentional skips | `/private/tmp/bower-names-complete-fake.log` |
| Production PWA | 4 passed: manifest/service worker, shell-only caching, shell opens offline, Worker paths excluded | `/private/tmp/bower-final-pwa.log` |
| Naming proof closures | Assertion red, check and named verify green | `/private/tmp/bower-names-close.log`, `/private/tmp/bower-tab-name-close.log` |

These logs are local temporary evidence and may expire. Harness proofs and tests are committed. Skips select the relevant device/source; they are not passing test executions. Screens were manually checked by the coordinator on fake at desktop/phone for each screen fix; these checks are distinct from the independent evaluation below. Gate failures during naming work (old copy expectations, missing fixture reads and a test-only unsupported type option) were corrected and all gates repeated; no behavior assertions were weakened.

A final check for this documentation/backlog handoff must pass before its commit. No new production code is introduced at handoff.

## Independent code review

Range `4833d3c77e63a693d728038f4d448b739f547b19..4d98eb0869b1e7aea388ab6a8a061547be193094`. Verdict **With fixes**: no Critical, **two Important and one Minor**. These findings are reasoned from code inspection, not reviewer-run reproductions.

### Important: journal-ack-content

`src/data/vault/journal.ts:194`: sendWaiting acknowledges the expected journal filename without reading its contents, then removes the valid local instruction. A different-id record or same-id/different wording silently replaces the person's instruction. A corrupt direct copy blocks a later runner read after the local valid copy is gone; a corrupt archived copy is never reread, so loss can be silent. Same-name folders are excluded by VaultIndex.journalFiles and do not trigger this through DriveVault.

Fix: read matching candidates afresh, validate the shape and compare the complete immutable record before acknowledgment. Preserve waiting instructions and give a readable error if a matching copy cannot be established. ID-only validation is insufficient. Test direct and archived copies with malformed JSON, another ID, changed text under the same ID, and an exact copy; retain exact-copy deduplication.

Planned verify: `pnpm vitest run src/data/vault/journal.test.ts -t "waiting changes require matching valid Drive contents"`.

### Important: pile-edit-still-seen

`src/data/vault/drive-vault.ts:462,468`: updatePile converts a lone item or renames a pile folder with cached metadata, without stillAsSeen. Another client's folder rename can be overwritten; a remotely renamed/moved lone item can be converted using stale name/place assumptions.

Fix: check stillAsSeen before any structural side effect, including creation of the conversion folder. Cache client A's pile, change name and parent separately via B, then edit context via A. Cover lone item and folder; expect conflict, unchanged remote metadata/content and no new folder. Ordinary move Undo already uses checked move; restore uses fresh untrash metadata. The remaining server check/write race belongs to the documented real-Drive boundary.

Planned verify: `pnpm vitest run src/data/vault/drive-vault.test.ts -t "editing a pile refuses external name or place changes"`.

### Minor: create-leading-dot

`src/data/vault/drive-vault.ts:223`: create checks length/reserved root names but accepts a leading dot. VaultIndex hides dot-prefixed path segments, so accepted fake/real creation immediately appears missing. Demo keeps these items visible. The empty item remains in Drive.

Fix: shared creation-name validation, consistent with rename's leading-dot refusal. Source regressions must prove no write for note/folder and a phone screen regression must prove readable refusal. Keep ordinary internal dots such as Garden.2026 allowed.

Planned verify: `pnpm vitest run src/data/demo/world.test.ts src/data/vault/drive-vault.test.ts -t "creation refuses a leading dot without writing"`.

Review scope: P2 plan/ledger/ownership contracts, Drive/live/demo/fake paths, journal recovery/duplicate folders, modifiedTime and name/place checks, Worker/runner shapes, search scope/cache invalidation, partial-write reports, Drive links, naming/focus and associated regressions, harness selected files/timeouts/closure proofs. All 15 qa-11 entries have matching current verify hashes; coverage-only entries have committed notes and supplied assertion-red evidence.

Set aside explicitly: real Drive tokenization/resumable-upload behavior/server races, offline reading and persistent upload queue, crash-safe atomic content+journal transaction, future real Worker/runner. Their integration/product boundaries remain documented; owner agreement is pending.

## Independent browser evaluation

Dev `http://127.0.0.1:5190`, fake and demo. Exact dimensions verified after tab creation: desktop 1440×900 and phone 390×844. No Git, source/storage injection, installs/builds/tests or repository edits. Production 5192 and byte uploads were not reached before owner-requested stop. CUA exposes viewport/visibility but no real-network offline control.

### Reproduced findings

- **Minor bug — create-leading-dot**, fake/default/phone: Files → expand Resources → context menu on Cooking → New note → `.Garden.md` → Make the note. Navigates to `/note/Resources/Cooking/.Garden.md` then “Not here any more”. New folder `.Garden` also opens a missing-item page. No console warning/error. Demo/phone accepts both and opens them normally. Overlaps reviewer finding; one backlog entry.
- **Minor polish — timeline-source-names**, fake and demo/default/both sizes: open Flat 3, 12 Larkspur Lane, compare Original and Timeline. Original says Lease draft; naked Timeline source labels say Lease draft.pdf and IMG_2290.jpg while file pages/tree use plain names. No console warning/error. Display naked path labels plainly; retain intentional author aliases. Planned verify: `bash scripts/e2e-both.sh e2e/qa12.spec.ts -g "timeline source links use plain file names and retain aliases"`.

### Feature-flow coverage and limits

F = fake, D = demo. Entries below describe manual browser evidence only; CLI tests are separate evidence.

| Feature entry | Completed browser coverage | Limits |
| --- | --- | --- |
| note-format | F desktop sections/tasks/original/Timeline; D note/backlinks | No independent serialization check |
| drive-fake | F normal mutations/runs/scenario resets | Not the complete data contract |
| drive-http | None | Real Drive unavailable |
| layout-seed | F/D default; F first/back/running/empty | Not all demo scenario combinations |
| vault-index | F tree/typeahead/move/Bin/Undo/counts; F/D names | Dot creation finding; no concurrent same-name replay |
| vault-files | F search/bookmarks/PDF/move/no-match/Undo/twice Bin Undo/folder Bin/tasks/outline; F/D rename-links after tidy | Timeline finding; no fault/conflict controls |
| vault-inbox | F piles/added link/questions/suggestion Undo/requests/rules; D pending-rule removal | Partial uploads/retry and edit conflicts untested |
| add-files | F desktop https://example.com saved link; F phone invalid link | Byte uploads/reload not reached |
| worker | F instant tidy/failure/retry/running | Real Worker unavailable |
| live | F account return/run lifecycle; D tidy | Real session HTTP unavailable |
| source-switch | F→D via visible Demo panel | Real source untested |
| e2e-fake | Independent flows in this table | Evaluator intentionally did not rerun CLI |
| duplicates | None | Fixtures supplied but upload group not started before stop |
| pwa | None | Production group not reached; real-network offline unavailable |

### QA-9 replay record

| Entry | Actual result | Source / size / boundary |
| --- | --- | --- |
| link-files-url | Partial: example.com tree/page/tab and correct Open web page URL | F desktop; address search not replayed |
| outbox-dedupe-real | Untested | No lost-response/cross-tab UI fault controls; evaluator cannot run data tests |
| demo-links-after-tidy | Passed ordinary rename/tidy/link/backlink flow | F/D desktop instant: Flat7 → Cobble Row flat, Flat3 link resolves renamed path |
| demo-pending-rule-remove | Passed | D phone: removed pending rule leaves request only in changes |
| note-without-journal | Untested | Unreadable journal unavailable through visible UI |
| undo-focus-twice | Passed | F desktop: twice Bin/Undo, tree active descendant Lease draft |
| toast-hold-both | Untested | Simultaneous hover/focus timing not performed |
| link-address-error | Untested | Unreadable saved address unavailable through visible UI |
| namesheet-names | Passed | F phone: Tyres.md → Tyres; slash rename explains dash |
| move-no-match | Passed | F desktop: zzz/Enter explains no match; valid query then moves |
| former-names-gaps | Untested detailed cases | Ordinary rename/backlink flow covered; detailed data-only cases not |
| tabs-forget-person | Partial | F desktop account delete/sign-in preserves folder and one Home tab; final Start again settled state not certified |
| create-name-speed | Partial | F desktop immediate focused inline New note; Soup ideas intact; exact first-keystroke race not measured |

### QA-10 replay record

| Entry | Actual result | Source / size / boundary |
| --- | --- | --- |
| situation-address-clean | Partial | F first desktop/phone: one Home tab, empty main folders closed/zero; panel-triggered, not exact address replay |
| focus-after-close | Partial | F default desktop/failure phone and D tidy desktop: Done/Close MAIN focus; F question/suggestion/rule recovery; Escape tidy untested |
| undo-says-back | Passed | F desktop move/rule Undo readable back messages |
| suggestion-no-thanks | Passed | F desktop dismissal/Undo |
| bird-not-a-button | Partial | F phone Add named Bower control; desktop tidy named buttons; no screen-reader traversal |
| side-tabs-a11y | Passed | F desktop: one tab stop/tablist, controlled panel, arrow navigation, outline H2 focus |
| tree-typeahead | Passed | F desktop res → Resources; protected-root explanation; populated-folder Delete confirmation |
| pile-date | Partial | F phone added yesterday wording; literal historical date not reached |
| runner-link-names | Partial | F desktop added domain link survives tidy/plain filing; exact query-string address not replayed |
| one-naming | Partial with finding | F/D desktop report and F phone names agree; Timeline exception |
| palette-inbox | Partial | F desktop side search Dentist reminder/Waiting in inbox; exact command palette replay untested |
| remove-pile-during-run | Passed | F desktop running: removal disabled until tidy ends |
| landing-jargon | Untested | Landing group not reached |
| welcome-back | Passed | F desktop synthetic account deletion/sign-in: Welcome back, folder preserved |
| run-result-counts | Partial | F/D instant desktop requests/rules separate once and other changes; exact isolated request+rule-only case untested |
| invalid-link-says | Passed | F phone readable error, aria-invalid true |
| small-wording | Partial | F first/default/failure desktop and D rename: Press Tidy up, slash explanation, stopped wording agree; not every variant |
| offline-footer | Unavailable exact replay | F offline scenario both sizes gives offline boot/retry; native CUA cannot cut actual network |
| phone-more-faint | Passed relevant visual property | F phone Back/More both rgb(71,85,105), readily visible; no numerical contrast measurement |

### QA-11 UI coverage

Home Alex identity consistent in exercised scenarios; Sam cannot be selected visibly. Malformed runner files not inducible without forbidden injection. F desktop Settings/file menu explain no real Drive folder; real opening and D/phone variants not replayed. Request/rule focus passes F desktop/phone and D phone; D desktop variants remain. F PDF page/tab/list/bookmark/search/move dialog/toast and phone menu names checked; Garden.2026 kept in page/Rename. Full dotted-folder, change-list, Bin and naming permutations remain. F desktop example.com saved-link tab agrees; D saved-link replay remains. Upload retry failure not prepared; own-task tick succeeds but data-level seen retention not independently replayed.

### Scenarios and console

Completed F signed-out both sizes; F first tour/empty Home both sizes; F back report phone; F running desktop/phone; F failure phone → desktop successful retry; F offline boot both sizes; F slow phone → desktop recovery; F empty desktop. F instant run filed 16 items, reported requests/rules and other changes, returned empty inbox and MAIN focus. Demo instant tidy and note/rename/rule comparison covered.

No unexpected console warnings/errors in completed flows. Offline scenario intentionally logs `BowerError: You're offline.` from fake session paths and shows a readable screen; expected failure, not a crash.

### Remaining evaluation

Production shell/PWA inspection; byte uploads/reload/duplicates; prepared partial upload/retry; remaining demo scenarios/desktop composer variants; exact keyboard/hover/palette/address-driven replays marked above; landing; prepared malformed-data and concurrency cases. Real-network offline is unavailable in native CUA; retain CLI PWA gate and report that distinction. Synthetic files exist outside repo at `/private/tmp/bower-evaluation-fixtures/` (Boiler service.pdf, Lease draft.pdf, Empty.txt); recreate made-up fixtures if temporary files expire. Never use personal files.

## Next session

1. Read normal startup docs and establish a new coordinator/assignments. Source checkout is clean and fixes committed; do not inherit a stale browser reservation.
2. Fix the two Important entries first, then both Minor entries, test first and one proof/commit per entry. Their verify commands are future test names, not existing evidence.
3. Fresh independent review of affected changes; resume remaining evaluator coverage on a new immutable target. Fix any new findings and repeat relevant rounds.
4. Final check/demo/fake/PWA gates, actual owner rulings, then owner phase acceptance and local merge. No next phase while findings remain.
5. Offline reading, uploads surviving reload and real-Drive smoke tests were proposed for P3; owner has not agreed to that proposal. Ask when presenting a concrete closure decision, not as a substitute for completing known work.
