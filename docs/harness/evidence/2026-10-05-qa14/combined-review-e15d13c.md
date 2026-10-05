# Independent combined P2 review

Session `p2-combined-review-2026-10-05`; adopted revision `2026-10-05-contracts-2` (target and local main PLAN_REVISION match); P2, C01–C16. Exact immutable base `143ae2b12d5440330bee1a85bd16e90b8dccf746` → target `e15d13ca4f6f0bd15d11277bae02c7db6d180990`. Combined production code commit `cb7306141f0dbc93e49df08bd4286eb520b88cd0`; inspected src/e2e diff from that commit to target is empty. Integration `/Users/deluisp/Projects/bower-app`, `codex/close-phase-2`.

Read-only Git/source/docs/supplied-log review. Canonical session/review workflow, reviewer brief, ACTIVE combined packet, adopted product/work/acceptance, O1 and historical final-round review, O3 inventory, seven foundation proofs and naming evidence consulted. No tests, builds, installations, browser/provider calls, delegation, repository/shared-record mutations or closure performed by reviewer. Only this private report is written.

**Verdict: changes requested for one concrete Important baseline isolation defect, now coordinator-reproduced on both target and base. No newly introduced regression identified in the seven foundation fixes and two naming changes. P2 remains incomplete; none of C01–C16 is fully accepted by this review.**

## Important: reused Sources retain another folder's cached data and write destinations

Refs at target: `src/data/live/session.ts:42`–`:55`, `:93`–`:95`; `src/data/live/index.ts:54`–`:71`; `src/data/vault/drive-vault.ts:70`–`:80`, `:90`–`:99`, `:219`–`:229`, `:616`–`:628`, `:779`–`:785`; `src/data/vault/journal.ts:180`–`:219`. Actual application source lifetime: `src/main.tsx:24`–`:33`, `src/app/App.tsx:63`–`:84`.

The app builds Sources once. Session sign-out/sign-in clear only session `me` and emit; account cleanup clears device storage keys rather than the vault's in-memory index, text/note caches, Bin or uploads. makeLiveSources refreshes the vault on createFolder, not on those lifecycle transitions. A cached `DriveVault.index()` returns its existing promise without checking current root. After an existing-wire sign-in returns a different user/folder, `session.rootId()` can be B while file reads and mutation parent IDs still come from A. Journal owner resolution is B but its destination folder lookup can return A's cached `.bower/changes`.

Trigger: read A's tree/note, sign out, sign in to B using the same Sources, then read the same path and create a note before a separate foreground refresh. Effect: A's old content is exposed as B's note; the new note is created under A, and its journal file is saved under A. This is a concrete C01/C14 safety defect, not merely missing coverage.

Coordinator supplied a public synthetic reproduction on exact e15: real FakeDrive roots A/B with identical note path and different bytes, real makeLiveSources/session/vault calls, a narrow existing-wire Worker stub whose signIn changes `me`. The first content assertion fails: `Account A content` instead of `Account B content`. Recorded observations also show user Sam/root B, `createdUnderA=true`, `createdUnderB=false`, and a journal file in A's dump. Later create-location assertions are not reached after the first failure; their values are recorded observations. Evidence: `/private/tmp/bower-account-switch-probe.cjs`, `/private/tmp/bower-account-switch-e15d13c-results.json`, `/private/tmp/bower-account-switch-e15d13c.log`.

The identical immutable-source script on base143ae2b records the same old content and wrong create destination (`/private/tmp/bower-account-switch-143ae2b-results.json` and `.log`). The relevant session/index/source lifetime code is unchanged by this range. Therefore this is an existing baseline defect exposed concretely by combined review, not a regression attributed to run-order or foreground fixes. The reviewer inspected source/script/results but did not execute either probe.

Scope limit: WorkerHttp.signIn ordinarily navigates to OAuth and never resolves on the current page (`worker/worker-http.ts:49`–`:51`); this is not a reproduced real OAuth/UI/provider failure. Existing fake identity is fixed. C01's adopted simulated account isolation still needs a real two-context test. Run-order tests `(idle after session reset clears reading)`/`(...done)` at `live.test.ts:102` cover current/null locks, session events and retained outbox only; they never check vault content or write destinations, so their bounded green remains valid without certifying isolation.

Suggested bounded remedy: reset/invalidate all account/folder-scoped in-memory state before a new session becomes usable, with a local scope epoch guarding in-flight continuations and queued operations. Keep folder-keyed durable and volatile journal outboxes; never redirect old operations or retained upload bytes to a new folder. A bare refresh is insufficient for retained uploads/Bin/journal/run hydration. This requires its own registered entry, meaningful actual assertion red and renewed immutable review; a separate read-only prerequisite will refine ownership and tests without adopting new public schema or policies.

## Combined fixes and compatibility

Seven foundations have named, supplied assertion evidence plus integrated proof.log closures. Their accepted patches preserve the existing public Sources, Worker wire, v1 durable JSON, note parser ownership grammar and scheduler contracts. Individual independent reports are retained under `docs/harness/evidence/2026-10-05-qa12/` and `...qa13/`.

| Foundation | Exact named regression prefix | Combined source and bounded result |
| --- | --- | --- |
| journal-ack-content | `waiting changes require matching valid Drive contents` | `journal.ts:180`–`:214`: fresh direct/archive copies, complete primitive-field equality independent of JSON key order/whitespace, invalid duplicate/read errors preserve waiting intent. Does not repair runner's ID-only conflicting-copy dedupe. |
| pile-edit-still-seen | `editing a pile refuses external name or place changes` | `drive-vault.ts:458`, `:741`: structural check before conversion/create/move/rename, remote content-only input edits remain allowed. Existing separate provider check/write window remains. |
| pile-context-version | `stale pile context refuses every effect before write or removal` | `drive-vault.ts:459`–`:465`, `:481`: context version check precedes structure/removal; later content write retains modifiedTime. Not provider atomicity. |
| run-status-monotonic | `older run responses cannot replace newer observed state` | `live/runs.ts:75`–`:117`, `:196`–`:250`: local tickets/admission generations/known retired IDs/phase guards; guarded report hydration, accepted-state return, serialized retries/disposal. All19 cases retained. Unknown backend attempts/revisions and account scope remain separate. |
| task-preserves-source-bytes | `toggling a personal task preserves every other source byte` | `note-format.ts:185`: normalized UTF16 task offset mapped to raw source; changes one checkbox character for LF/CRLF/mixed endings, Unicode and identical labels. Grammar/serializer unchanged; rich Current state remains unresolved. |
| external-change-refresh | `returning to an idle folder refreshes external changes` | `live/runs.ts:153`–`:186`: foreground discovery, same-wave coalescing and issue-time freshness boundary; pre-wave terminal/idle snapshots require a fresh listing, active/disposed continuations checked. Status polls remain lightweight; same source/pending state preserved within its current folder.16 cases; old-list standalone assertion also passes on accepted1d6fe32 per retained coordinator evidence. |
| runner-request-preflight | `malformed request history stops a tidy-up before effects` | `fake-runner.ts:81`, `:301`–`:316`: existing requests-v1 guard before clearNew, both scopes/no pending request; fixed diagnostics, read-error propagation, refused domain snapshot and versioned repair/retry.17 cases; service telemetry and mid-run corruption remain separate. |

Naming changes are still integrated-open: shared leading-dot creation validation (`tree.ts:70`, DriveVault/demo create) precedes writes and preserves dotted stems/defaults/length behavior; source/assertion proof exists. Timeline typed file labels (`NoteScreen.ts:97`–`:109`) preserve explicit alias text, full dotted folder names, web target/provenance and raw unresolved fallback. The previously reachable renamed-folder stripping issue is corrected and tested through actual UI rename. Tests at `e2e/qa12.spec.ts:5`/`:30` use current visible headings and retain real navigation; qa5's dependent literal is adjusted. Fixtures add minimal synthetic Timeline aliases/folder provenance, without changing serialization/backlinks. These supplied scoped greens do not replace final frozen evaluation or entry closure.

## Capability status and known open gaps

No full row moves to demonstrated merely because the foundations passed. Existing O1 named evidence remains reusable in its narrower scope; this table overlays current fixes.

| ID | Full-row status | Remaining acceptance boundary |
| --- | --- | --- |
| C01 | Partial | Lifecycle/device cleanup exists; concrete reused-folder isolation finding above, pending/in-flight scope safety. |
| C02 | Partial | Real fake uploads/dedupe/retry exist; incomplete pile can still be consumed and failed member hidden. Ready-membership and reload policy unresolved. |
| C03 | Partial | Mechanical operations, structural/context guards and task raw bytes improved; protected paragraph/tasks still enter personal body under current parser. Naming entries remain open. |
| C04 | Partial | Filing/text-note creation exists; complete original→immutable source/extraction→maintained compiled result absent. |
| C05 | Partial | Fixed Timeline updates and rename follow-through exist; semantic Current state preservation/merge and replay-safe updates missing. |
| C06 | Partial | Navigation/backlinks exist; newly persisted cross-project relationships/citations not proved by seeded fixtures. |
| C07 | Missing | No explicit contradictory sources/provenance/follow-up result journey. |
| C08 | Missing | No persisted authored long document/table/sources or permitted generated-body revision journey. |
| C09 | Missing | Request completion prose is generic, not a source-linked answer over stored items. |
| C10 | Partial | allowWeb transport exists; allowed/denied/failed/stale simulated research outputs absent. |
| C11 | Partial | Pending/rules/questions/requests mechanics plus safe preflight/ack improved; truthful requested effects and fault-safe application remain incomplete. |
| C12 | Partial | Local ordered status/report UI improved; partial readiness, independent admitted work, effect recovery and persisted-report completion barrier missing. |
| C13 | Missing | Immediate action Undo exists; tidy manifest/preview/reversal and partial recovery do not. |
| C14 | Partial | Stronger two-client discovery/overlap/journal/request refusal; account isolation, malformed other consumer paths, crash/lost-effect recovery and authority remain incomplete. |
| C15 | Partial | Bounded search/hash dedupe exists; versioned preparation/extraction reuse/context expansion/fallback/measured corpus absent. |
| C16 | Partial | Broad automated UI/PWA history and new naming tests; final fake/PWA/native evaluation not completed on this target, complete capability/recovery journeys pending. |

Five registered entries remain open at exact target: `create-leading-dot`, `timeline-source-names`, `partial-pile-readiness`, `protected-current-prose`, `run-report-save-barrier`. The isolation finding was not a registered entry at this immutable SHA. Entry count208/213 is ledger state, not phase acceptance.

Prior Important baseline risks remain separately tracked: incomplete readiness; ambiguous legacy protected ownership; FakeWorker catches terminal report-write failure then publishes done (`fake-worker.ts:163`–`:166`); originating browser owns runner execution/reload recovery (`fake-worker.ts:192`–`:201`); partial effects without checkpoints/manifest; app-versus-runner/reload shape disagreement outside repaired requests; ID-only runner journal dedupe; cached null report can hide a later available result (`live/runs.ts:230`, `:249`). No new current runtime reproduction is claimed for unchanged risks beyond their retained named-target evidence. Preserve full second-brain requirements rather than redefining these gaps as completed filing.

## Evidence and verification limits

Coordinator's exact-target combined `/private/tmp/bower-combined-final-check.log` reports 51 files/481 tests and successful lint/type/build. `/private/tmp/bower-combined-final-demo.log` reports198 passed/56 intentional existing device/source skips, exit0. These are supplied executions, not reviewer tests. Older accepted candidate proofs remain scoped to their recorded SHAs. Rejected candidates and their actual reds are retained; they are not final greens.

Due the current Important isolation defect, coordinator ends this freeze and prepares a bounded new entry. **Final fake, PWA and native gates on e15 are NOT RUN**; no native navigation occurred. A subsequent corrected immutable target needs fresh combined gates and independent affected review/evaluation. Independent evaluator previously reported no usable surfaced browser; root capability checks or this code review are not an independent live-evaluation certificate.

Relevant runtime R1–R4, owner offline-reading/upload-reload rulings, explicit compatible protected grammar, and O3 contract adoption remain absent. Unknown wire revision/attempt authority, provider conditional/atomic behavior, stable identity beyond existing Me, durable independent service execution and semantic quality are not certified. No phase closure, requirement removal, planning adoption, main product merge, push, deployment or next-phase authorization is implied.
