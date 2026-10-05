# S02 — actual pending-byte cleanup reproduction

2026-10-05, read-only auditor `/root/approved_policy_slices`. Plan `2026-10-05-contracts-2`; P2 O1 prerequisite, C01/C02 and adopted D02. Coordinator's immutable target `e5cb57d`, product source `1c1e60c0c6dee4b610cd845ee0a3c393f265370f`; assignment recorded in ensuing docs-only `fd13a21`. Target identity is the coordinator's pinned assignment; no Git command was used in this reproduction. Source hashes below pin the actual bytes executed/inspected.

**Reproduced Important:** actual `forgetThisPerson()` forgets Add/person storage metadata but leaves the current-page draft's selected Blob retrievable through the actual public `get(key)` API. The expected `undefined` assertion is genuinely red. No repair, entry registration, closure or full acceptance claim.

## Scope and actual execution

Session/review skill and read-only brief, current ACTIVE assignment, S02 proposal, adopted PRODUCT/WORK_PLAN/P2_ACCEPTANCE/D02 and cleanup/lifecycle sources read. Shell/Node/existing TypeScript available; Node `v26.10.0`, TypeScript `6.0.3`. No init/install/build/full gates, source/Git/shared-record mutation, browser/provider/credential access or delegation. Only new designated scratch directory and this report written.

Correct current module path is `src/features/piles/draft-files.ts`; the assignment's `src/data/draft-files.ts` does not exist. Initial read attempts with that stale path were corrected before executable reproduction. They are not assertion evidence. The existing data module's path may become a future relocation decision; no module was moved here.

Executed once:

```sh
node /private/tmp/bower-draft-lifecycle-reproduction/reproduce.mjs > /private/tmp/bower-draft-lifecycle-reproduction/red.log 2>&1
```

**Exit 1**. The script first verifies exact source hashes, snapshots unchanged bytes, transpiles only actual draft-files/device modules in memory and executes them once in a shared isolated VM/module cache. `Map`, `keep`, `get`, `forget` and `forgetThisPerson` are the unmodified production implementations. Only browser Storage is replaced by deterministic Storage-method stand-ins. No production cleanup is mocked, wrapped with extra cleanup or inferred from an expected Map result. Host/device browser storage is never touched. Existing dependencies are read, not installed.

The expectation is independently specified by AGENTS sign-out cleanup and D02's device-cleanup/account-isolation requirement, not derived from the implementation output. These bytes belong to an **unsent** Add draft; the retained folder-keyed outbox instead represents already made changes and must survive.

| Observation/control | Actual result |
| --- | --- |
| Public `keep('DRAFT_A',Blob)` then repeated `get`, exact Blob identity and text | Pass |
| Public `forget` on a separate control key | Pass |
| Seeded Add metadata actually present before cleanup | Pass |
| Actual `forgetThisPerson()` removes six local-person keys and four session-person keys, including Add context/items | Pass |
| Original `bower:outbox:FOLDER_A` exact bytes preserved; B outbox remains absent | Pass |
| Unrelated synthetic device-setting sentinel retained; zero cleanup diagnostics | Pass |
| Expected `get('DRAFT_A') === undefined` after production cleanup | **Genuine assertion red: identical Blob remains** |
| Explicit later production `forget('DRAFT_A')`, then absent old key/new keep/get positive control | Pass; manual API control, not a product fix |

The literal selected bytes are `Synthetic pending bytes A.\n`, exactly 27 UTF-8 bytes, SHA-256 `85df4b2e93fa359dd71769085a36f4a1880ab05ee3131cc0325d3beddbb745fd`. The post-cleanup object is the same Blob with the same digest. No new Blob reconstruction or simulated upload supplies the result.

Original-folder outbox literal:

```json
[{"v":1,"id":"CHANGE_A","device":"DEVICE_A","at":1,"kind":"create","what":"Synthetic note","fileId":"FILE_A"}]
```

SHA-256 before and after cleanup/recovery: `7bc4e581fecb531c76016268b7e37d910f1fe188c326137fac06f70b63e97ba2`. This is a storage preservation control, not a journal dispatch/validation run or proof about B account authorization.

The log contains successful load and positive controls before `ERR_ASSERTION`, followed by explicit recovery controls. No setup/load/TypeScript/storage error generated the failing exit. The test harness deliberately records the genuine assertion failure and continues only its public-API cleanup control before returning exit 1; it does not turn that control into a green defect result.

## Finding and source chain

`src/features/piles/draft-files.ts:7–18` owns a module-lifetime Map and exposes keep/get/per-key forget only. `src/data/device.ts:25–32` removes person storage keys without invoking draft byte cleanup. Add consumes this same public module (`src/features/piles/Add.tsx:15`), with metadata keys at lines 18–19. The exercised scope is the shared cleanup function and draft API in the same running module lifetime.

Source-inspected lifecycle routing: `src/data/live/session.ts:86–95` awaits successful remote sign-out, checks its epoch, then calls `forgetThisPerson`; account deletion lines 98–108 and auth expiry lines 152–158 also call it. Those lifecycle methods were **not executed** by this narrow harness. Demo deletion/sign-out also routes to it (`src/data/demo/world.ts:540–555`), source inspection only. Existing `draft-files.test.ts` tests individual keep/get/forget and a never-kept key after hypothetical reload, but has no device-cleanup assertion. Existing live lifecycle/outbox tests remain useful; none was run here.

Effect established: pending bytes remain reachable by their known key within the same page/module after actual person-metadata cleanup. Do **not** infer visible B UI exposure, automatic cross-account uploads, durable account identifiers, retained bytes after reload, browser behavior, hashing races, persistent-storage deletion or different-account/folder write authority from this result. No account was signed in or changed. The setting control uses an unrelated synthetic key, not the actual theme component. Storage-denied cleanup and remote sign-out failure are not reproduced here.

## Minimal proposed repair/verify, pending coordinator inspection

Existing-contract correction only: the central device/person cleanup must synchronously clear **all unsent current-page draft bytes**, including keys whose metadata is unavailable, while keeping original-folder outboxes and device settings. Wire the same cleanup through existing successful logout/deletion/expiry calls. Avoid introducing a data→feature dependency: if needed, move the tiny Map behind a data-owned module and keep the feature import as a compatible re-export. That module placement/file allowance is a coordinator/lead decision, not a schema or ownership-policy adoption from this report. Keep Worker and upload mechanics unchanged.

Proposed bounded paths: current `src/features/piles/draft-files.ts` and its existing test file, `src/data/device.ts`; optional coordinator-approved data-owned byte module and affected existing `src/data/live/live.test.ts` assertions. Do not change providers, Add admission, runner, protected grammar, durable byte retention or shared records for this slice. Preserve original public keep/get/per-key forget compatibility and independent S01 no-loss behavior.

Proposed named regression **after it exists**, not an existing green verify:

```sh
pnpm vitest run src/features/piles/draft-files.test.ts -t "person cleanup forgets pending draft bytes and keeps the folder outbox"
```

Author must first obtain actual assertion red through production cleanup with two independent pending keys, storage metadata/outbox controls, then smallest correction and named green. Useful bounded companion expectations: cleanup still drops memory bytes if Storage throws; repeated cleanup is harmless; successful lifecycle cleanup invokes it; failed remote sign-out follows existing retry semantics and does not falsely erase/re-authorize a live session. Do not claim these companion expectations are already executed. Root fixes scope/verify before registration and alone records integration/proof closure after independent review and required gates.

Recovery observed here is only explicit existing `forget(key)` releasing the old object, preserving the outbox and allowing later keep/get. No automatic application recovery is implemented. Reload/navigation disposal is separate from person sign-out, particularly under D02 future best-effort retention; this memory-only correction would not certify durable-byte deletion or principal/folder binding. Durable storage, async reply fencing and account/folder identifiers remain separately bounded follow-up decisions.

## Immutable evidence

Only the following source snapshots are executed/inspected; originals unchanged:

| Source | SHA-256 |
| --- | --- |
| Executed `src/features/piles/draft-files.ts` | `74915d6259d173835cf1d1d6012e31267734ab9487d4fc3ff932266519573099` |
| Executed `src/data/device.ts` | `12abec7ba3bf500ab940bf1b55638eac33a05a48a10836b73171563b86e0d1be` |
| Inspected-only `src/data/live/session.ts` | `aaa0af4bd2a5e124b1ee9c49e8424c99faa5abcbd1f58dcd11a158d1f780bd88` |

Artifacts under `/private/tmp/bower-draft-lifecycle-reproduction/`:

| Artifact | SHA-256 |
| --- | --- |
| `reproduce.mjs` | `0f605cf8c2d1507ad543dbdd1e543c6d739951eab14b0ffea58e8a3a66444eb8` |
| `red.log` | `ace29bf2ebd77f87d0f3b99b25099114b48360639c0bb9a1ca445c6532ecc6c4` |
| `observations.json` | `c66caed86fd6d54b4dfe419bc7d3a14513389126ef8a4168d3cc27a461e211a0` |
| `source-manifest.json` | `a2d5cd6846cc27395b08814c5c2845010c65ba6dd867ce85006cb90bb341835f` |

`sources/` contains literal copies named by source paths with `/` replaced by `__`; snapshot hashes match the table. The one-shot script refuses existing snapshot/observation outputs and source drift: preserve this original run instead of overwriting it. A subsequent reproduction must use a newly assigned output directory/independently recorded launcher and the retained literal snapshots or matching immutable bytes, not a moving checkout silently relabeled as this run.

Root inspection/registration and separately assigned test-first repair are the next actions. No harness pass count changed here.
