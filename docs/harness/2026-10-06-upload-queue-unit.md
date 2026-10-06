# upload-queue-persistent: uploads survive a reload

Coordinator packet under contracts-2 / main `6527286`, TL-P2-07 (D02 part 1, journey 9) and TL-P2-05 (pre-generated IDs). Entry `upload-queue-persistent` (qa-23), registered with its verify.

## Assignment

- Implementer: Claude subagent `upload-queue-impl-1`. Checkout `/private/tmp/bower-p2-upload-queue`, branch `claude/p2-upload-queue`, base `f1db94f`. Evidence `/private/tmp/bower-p2-upload-queue-evidence/`.
- **Phase 1 (now)** writable: NEW `src/data/drive/resumable-upload.ts` (+test), NEW `src/data/upload-queue.ts` + `src/data/upload-queue.test.ts`, NEW `src/data/upload-store.ts` (IndexedDB store, + test if useful), `src/data/drive/drive-api.ts` (additive resumable-session/reserved-ID methods only), `src/data/drive/fake-drive.ts` (simulate session, offset, expiry, lost reply after effect, reserved ID refusing a second create), `src/data/drive/` real HTTP adapter file only for the additive methods (real protocol remains P3/R4 evidence), `package.json` + `pnpm-lock.yaml` only to add `fake-indexeddb` as devDependency if the old app has no IndexedDB test setup (reason recorded in the entry note).
- **Phase 2 (after `partial-pile-readiness` integrates; coordinator will tell you)**: wire the queue into `src/data/vault/drive-vault.ts` `sendAll`/`retryPile`/sign-out/`deleteAccount` paths and add the DriveVault-level journey tests in `drive-vault.test.ts`. Do not touch `drive-vault.ts` before that.
- Read-only: everything else, notably `live/*`, `fake-runner.ts`, `fake-worker.ts`, `pretend.ts`, contracts, shared records.
- Reuse source (owner ruling, TL-P2-07): original Bower app `/Users/deluisp/Projects/bower/app/src/upload-queue.ts` (protocol `:61–275`, browser transport `:285–376`, store interface `:381–397`, queue `:530–922`) and `app/src/cache.ts:520–596`. FSL-1.1-MIT, owner's copyright. Adapt logic and tests; do not bring shapes that contradict contracts-2. Never copy `agent/bench/`. Run a personal-data scan of everything copied before committing. Commit message records provenance (repo, paths, license).

## Behavior

Bytes stay in IndexedDB until Drive confirms, then are deleted. Stored offset resumes after reload, bounded session restart. One tab uploads (Web Locks or the old app's mechanism). Persistent-storage request and quota check; a storage failure is disclosed in one short sentence (fallback: upload from memory, ask to keep the app open). Key: account + folder + declaration + memberKey + content hash. File identity reserved before create (pre-generated ID); a restarted session reuses it and confirms by reading back — never two files. Pending uploads are keyed by account + folder: resume only for the same account and folder, another account never sees them, `deleteAccount` removes them, the person can discard one. Errors are BowerError with one short sentence, details to console.

## Evidence

Test-first: `describe('uploads survive a reload without a second file')` in `upload-queue.test.ts` (fake Drive + fake IndexedDB): reload mid-transfer resumes from offset; expired session restarts within bound and reuses the reserved ID; reply lost after effect confirmed by read-back, one file; bytes deleted only after confirmation; second tab does not upload concurrently; storage failure disclosed; other account sees nothing; discard and deleteAccount remove bytes. Commit tests (with loadable stubs if needed) first, genuine assertion red, one fix commit for phase 1; verify + full `pnpm check`. Report back at end of phase 1 and wait for phase 2 instruction.
