# S02 pending draft bytes — independent prerequisite review

2026-10-05. Reviewer `/root/prerequisites_review`; root sole integrator/shared-record writer. Plan **2026-10-05-contracts-2**, main planning adopted; P2/O1 C01/C02, approved **D02**. Assigned reproduction target **e5cb57d**, product source **1c1e60c0c6dee4b610cd845ee0a3c393f265370f**; current **ced2f6b** is coordinator-supplied docs-only continuity. No Git operation was performed for this review. Only this new scratch report is written.

## Verdict and finding

**Important current-product defect confirmed by inspection of the genuine supplied assertion reproduction:** `forgetThisPerson()` drops person/Add metadata but leaves unsent current-page selected file bytes retrievable through public `get(key)`.

`src/features/piles/draft-files.ts:7–18` owns the module-lifetime Map and exposes keep/get/per-key forget. `src/data/device.ts:25–32` removes storage metadata without clearing that Map. Actual production cleanup in the shared isolated module lifetime leaves the same 27-byte Blob object, hash **85df4b2e93fa359dd71769085a36f4a1880ab05ee3131cc0325d3beddbb745fd**, after six local and four session metadata keys disappear. Folder A outbox is byte-identical, B outbox absent and the unrelated setting sentinel preserved. The independent expectation `get('DRAFT_A') === undefined` reaches real **ERR_ASSERTION**, recorded as exit1; no setup/import/storage/transpilation error creates that result.

No additional Critical/Important/Minor defect is demonstrated by this packet. Companion cleanup risks/requirements below are source-derived or proposed tests, not executed findings relabeled as evidence. A bounded test-first existing-contract repair is viable; no implementation candidate is reviewed or entry closed here.

Applicability under the owner/lead prioritization recorded by root at **e1e1e8b** is explicit: select a real file in Add, then successfully sign out/delete the account or encounter auth expiry while the page/module remains alive. The shared production draft Map/device cleanup is used by real/fake/demo paths; this is not a pretend-only scenario. The existing public cleanup reproduction is the minimum discriminator: original kept Blob still retrievable after actual central person cleanup versus absent after corrected cleanup, with original-folder outbox preserved. Lifecycle routing is source-derived here, not falsely claimed as an executed browser/account flow. Repair only that memory lifetime; do not expand to invented provider failures or a new architecture. R1 actual provider observation remains the next independent priority after this prerequisite.

## Evidence assessment and limits

The one-shot script pins source hashes, snapshots literal sources and transpiles only the existing draft Map and device cleanup modules in an isolated shared VM/cache. Production Map/cleanup are not mocked. Storage-method stand-ins are the only substituted platform; local browser/device storage is untouched. Positive repeated keep/get identity/text, separate per-key forget, seeded metadata and unchanged outbox/settings checks precede the failure. Explicit later production forget removes the old key and a fresh keep/get works. The script catches only the genuine assertion to record it and its manual API recovery control, then returns1; setup/control exceptions take the distinct exit2 route.

That final manual forget is not a product repair. Established exposure is retrievability by a known key within the same page/module after actual person cleanup. No visible B UI disclosure, cross-account upload, account switch, durable reload retention, provider permission or physical secure erasure is proved. Another holder may still retain a Blob reference after Map removal; accepted scope is forgetting this module's retrievable unsent bytes.

LiveSession sign-out/deletion/expiry are source-inspected, not executed in this packet. `src/data/live/session.ts:86–108` calls production cleanup after successful remote sign-out/deletion and epoch check; expiry at153–158 calls it directly. Existing L `forgets this person's things on this device`, deletion success/failure and failed-sign-out fresh retry tests do not currently assert this Map. Existing draft tests prove per-key keep/get/forget and a never-kept key, not cleanup or actual reload.

## Minimal repair and exact reservation recommendation

Reserve a single writer for exactly:

- **NEW** `src/data/draft-files.ts`: relocate the existing tiny Map and its compatible keep/get/per-key forget API, adding one internal exported all-drafts cleanup function for device cleanup. No root/principal key, durable store, schema or new Worker role.
- `src/features/piles/draft-files.ts`: compatible re-export of existing keep/get/forget from the data-owned module; no second Map. Existing Add consumers/tests retain their import paths and Blob identity/per-key semantics.
- `src/data/device.ts`: invoke unconditional synchronous Map cleanup as part of forgetThisPerson; retain the current enumerated person-key cleanup, outbox exception and device settings.
- `src/features/piles/draft-files.test.ts`: all named regression/compatibility tests, including production cleanup and actual public successful lifecycle calls if feasible under its prepared synthetic Sources fixtures.

If root prefers lifecycle assertions in the existing `src/data/live/live.test.ts`, explicitly extend reservation to that fifth file before editing; no LiveSession production change is needed. A test may import prepared data doubles/actual Sources in the test file; production feature imports must remain compatible and independent of service implementations.

Putting a device cleanup import back into `src/features` would introduce a data→feature dependency. Relocating a small neutral data-owned byte holder and keeping the feature façade avoids it. `src/architecture.test.ts` already allows pure modules outside service folders and checks direct screen/service imports. This does not authorize reorganizing all data or introducing a new app/service method. S01 Add admission/freeze/cleanup remains untouched.

The all-drafts operation must clear every key, including orphan bytes with absent/corrupt metadata. It must not enumerate Add metadata to determine what to forget. Map clearing must run synchronously regardless of denied/unavailable Storage. Current device.ts has one catch around both arrays, so one exception stops later attempts; companion hardening must attempt each remaining accessible key independently across both storage types, diagnose failures and preserve normal synchronous/no-throw cleanup behavior. **Storage that refuses deletion cannot honestly be certified cleared**: guarantee unconditional memory clearing and continued accessible-key attempts, retain exact failed-key limits, do not report successful deletion of inaccessible storage. Never use broad Storage.clear, which would delete original-folder outboxes/settings.

Keep existing remote lifecycle order. Successful sign-out/deletion and actual expiry invoke the same central cleanup; failed remote sign-out/deletion must reject with existing semantics and not prematurely call successful person cleanup. A failed remote sign-out is not a new authorized identity transition, and retry remains possible. Existing epoch/refusal/original-owner journal handling stays unchanged. This slice does not solve stale callbacks re-keeping bytes, durable account binding, content-verified reselection or future persisted-byte deletion.

## Required test-first proof and recovery

Adopt the verify only after the named executable regression exists:

```sh
pnpm vitest run src/features/piles/draft-files.test.ts -t "person cleanup forgets pending draft bytes and keeps the folder outbox"
```

Require actual assertion red against the assigned immutable base before production edits. Use at least two independent kept keys, including an orphan absent from metadata, and independently specified get-undefined expectations through **actual forgetThisPerson**. Preserve literal outbox A bytes, absent B outbox, actual `bower:prefs` settings, all ten seeded person metadata keys and positive keep/get/per-key forget compatibility. The existing packet's setting sentinel is useful preservation evidence, not an executed actual prefs/theme component test.

Named companions must pin: repeated cleanup harmless; new keep/get after cleanup works; selective local/session removeItem exception still clears all Map keys and every other accessible metadata key; both storage getters unavailable still clears memory and diagnoses instead of crashing; missing metadata/corrupt metadata does not leave bytes; no outbox/settings touch. Test exceptions with truthful attempted/blocked keys, not an impossible successful deletion claim. Successful actual session.signOut/deleteAccount/expire must remove kept bytes and maintain current publication/bye/outbox semantics. Failed remote sign-out preserves expected retained metadata/bytes, rejects and permits a later successful retry; same for deletion if its failure behavior is tested. Do not stub the production cleanup or Map to fake routing coverage.

Keep original draft controls and S01 5 named/11 total Add controls unchanged. Full check and required coordinator integration/harness inverse-red proof plus affected browser gates where applicable remain later obligations. No proposed test is reported green by this prerequisite review.

## Immutable identities

Independently read/hash-verified report, all four declared artifacts and all three literal source snapshots; executed/inspected source pins match current integration reads:

| Artifact | SHA-256 |
| --- | --- |
| `/private/tmp/bower-draft-lifecycle-reproduction.md` (10364 bytes) | **a90154a94909b4154ba86dad3e03383f4ed8e17acd59c94c7c7ce4bcc4c58472** |
| `reproduce.mjs` | **0f605cf8c2d1507ad543dbdd1e543c6d739951eab14b0ffea58e8a3a66444eb8** |
| `red.log` | **ace29bf2ebd77f87d0f3b99b25099114b48360639c0bb9a1ca445c6532ecc6c4** |
| `observations.json` | **c66caed86fd6d54b4dfe419bc7d3a14513389126ef8a4168d3cc27a461e211a0** |
| `source-manifest.json` | **a2d5cd6846cc27395b08814c5c2845010c65ba6dd867ce85006cb90bb341835f** |
| Existing feature draft-files.ts | **74915d6259d173835cf1d1d6012e31267734ab9487d4fc3ff932266519573099** |
| device.ts | **12abec7ba3bf500ab940bf1b55638eac33a05a48a10836b73171563b86e0d1be** |
| Inspected-only live/session.ts | **aaa0af4bd2a5e124b1ee9c49e8424c99faa5abcbd1f58dcd11a158d1f780bd88** |

Artifact paths are under `/private/tmp/bower-draft-lifecycle-reproduction/`; original-folder outbox before/after hash **7bc4e581fecb531c76016268b7e37d910f1fe188c326137fac06f70b63e97ba2**. No mismatch.

Reviewer performed no test/init/build/Git/module execution, source/shared-record mutation, browser/provider/network/credential access, delegation or closure. Root must register the bounded entry/reservation before a writer implements it. D02 is already approved; no additional owner policy/credential question is needed for this repair. R1 remains a separately awaited immutable packet; no evolving probe was inspected. This review does not accept C01/C02, O1/O3/O8, durable retention or P2.
