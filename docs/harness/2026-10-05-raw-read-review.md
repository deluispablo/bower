# Independent review: Drive raw byte read foundation

Reviewer: `/root/raw_read_review`, fresh independent Codex session, 2026-10-05. Entry `drive-raw-byte-read` / qa-19. Planning revision `2026-10-05-contracts-2`; local main `3136adccff8fef2be0f8623d9d574476f27db4c3`. P2 O3, supporting C03/C14/C16 within the narrow additive-read assignment.

## Exact target and authority

Integration assignment checkpoint: `6394ef86fa60f12cc6fecd761ea42e6fafb0fcb0`, branch `codex/close-phase-2`. Immutable worker `/private/tmp/bower-p2-raw-read`, branch `codex/p2-raw-read`: base `e3ddfd2d49142af678f7482afbefa44ad9bf30e8`, loadable typed stub `821757f68ccef4131c505bb8b6a82173576e9320`, final fix/test `32b2a19cffed20d4b09d04c36ba7c40722e5b88a`. The commits have those exact sole-parent relationships. Both checkouts were clean at inspection; the target remained pinned throughout review.

Read bower-session and bower-review, startup, reviewer brief, adopted product/work plan/P2 acceptance, governance/method/phases, current handoff and Next, coordination, skills and affected architecture/TL-P2-03 authorization. Root remains sole integrator and shared-record writer. Git, shell, rg and standard-library hashing were available. Init, dependency installation, modules/imports, tests, builds, browsers, network, providers and private credentials were not needed and were not used. This report is the only newly written file; no delegation, source or Git mutation occurred.

## Verdict

**Critical: 0. Important: 0. Minor: 0 within the reviewed candidate and evidence scope.** No blocking defect found. This verdict permits coordinator consideration of integration; it does not close the entry, capability rows or phase.

## Checked source and compatibility

The entire base-to-candidate range changes exactly the five reserved paths: `src/data/drive/drive-api.ts`, `drive-http.ts`, `fake-drive.ts`, new `raw-bytes.test.ts`, and the one additive delegate in `src/data/live/live.test.ts`. There is no existing assertion change, consumer activation, write-token change, schema B dependency, package/lock change or shared-record edit.

DriveHttp.readBytes uses exactly the existing authenticated GET media route and call helper. It does not decode, invoke readText, normalize strings, strip BOMs or issue extra metadata requests. The nested Uint8Array construction copies the body bytes rather than sharing even a retained injected ArrayBuffer. The existing readText, auth refresh, retries and call/refusal paths are unchanged. Body-consumption failures log the original error object, preserve BowerError and map other failures to typed offline/unknown errors; they do not redispatch or return pretend bytes. No atomic read/version binding or safe write guarantee is introduced.

FakeDrive.readBytes passes the existing gate and file lookup first. Available strings are UTF-8 encoded, null is empty, and available blobs yield independent byte copies. Existing readText source/decoding behavior remains unchanged. Original in-memory large blobs remain available. A restored big marker explicitly denies original byte availability while still supporting its old text placeholder and metadata/Bin operations. Repeated snapshots preserve the existing v1 big representation rather than silently base64-encoding the placeholder as source.

The added historical v1 guard also rejects a small b64 blob with original metadata size above KEEP_BYTES, matching the old restore-to-snapshot producer shape. It conservatively marks that bounded shape unavailable; it does not purport to validate arbitrary snapshot provenance. A successful fresh writeText clears the in-memory flag only after the existing gate, lookup and modifiedTime checks. Failed writes, metadata changes and Bin/untrash cannot manufacture source availability. An explicit successful write of the same placeholder string legitimately creates new source bytes. The guard neither adds a wire version nor changes metadata access into content parsing. No hard deletion or protected-file/section write was added.

The existing typed live test wrapper gains only its delegate; both concrete DriveApi implementations provide the new required method. Adjacent transport, text, snapshot and content/metadata mutation code was traced. Existing read-before-write concurrency risk remains outside this additive read and remains open as R1-OBS01.

## Evidence verified without reexecution

Report SHA256: `70d15ebb49aac1403177efef4fe74cd89d43725ac1ca2d6a09e5373fc08149ce`.

Manifest SHA256: `9358b980f48fd73e758d6e3a8fb14378f2cc4cf0c3a1b47be9d47b4c79930c77`.

All 22 named artifact sizes/hashes match both `/private/tmp/bower-raw-read-evidence/` and the coordinator archive `docs/harness/evidence/2026-10-05-qa19/raw-read/`. The explicit archive mapping preserves bytes under .ts.txt names. Candidate/fix diffs match exact Git-generated ranges. Stub class snapshots match stub commit bytes. The four final interface/HTTP/Fake/test snapshots match candidate files; package/lock identities match the setup record.

Source SHA256 identities:

- drive-api.ts: `3887664db4caa2b4f9b57b35127f42c6c85ce8f7d9b49a57637aeb9027e284ed`.
- drive-http.ts: `ca4a7c4f529aa8d14bd11854c7ac1a66aaa007a999371ed5346cb6b80ef40da1`.
- fake-drive.ts: `97710a872109117d41ddedd8c297e682c1b097e7bec7790781b4b6ece0ab05da`.
- raw-bytes.test.ts: `49b6af5e508cfd3e2b9b84676f49a55acde05ecfddea6d09a0c6bf22d8e08e5d`.

Prepared baseline and stub checks show 607 tests / 53 files passed. The initial preserved suite and red log show 23 real assertion failures against the loadable rejecting methods, including resolved/rejected and typed error/logging assertions; no missing method, import failure or absent suite constitutes the red. First green/check show 23 named passes and 630 full tests / 54 files. Supplemental old-placeholder red shows one resolved-byte-versus-refusal assertion failure with 23 passing controls. Subsequent green/check show 24 named passes and 631 full tests / 54 files. The final literal fixture adds a normal root/f1/counter layout; this later refinement is expressly disclosed rather than claimed as the identical prior red input. Final immutable fixture logs independently show the same 24 / 631 / 54 results.

Literal binary, invalid UTF-8, BOM/CRLF/Unicode and empty expectations are independent of the readBytes implementation. Tests inspect byte values, retained buffers, two HTTP clients, actual fake upload/snapshot/restore, readText compatibility, restored large files, repeated snapshots, explicit writes and metadata/Bin effects. Body failures and auth/transport refusals do not only assert report labels. Setup failure is honestly separated from recovered gate execution: one init DNS interruption, no initial partial present at dependency-copy time, independent copy and environment-only pnpm setting. No factual discrepancy requiring a correction was found.

## Integration and inverse-proof prerequisites

Root alone must reserve a clean integration checkout, recheck unchanged assignment/dependencies and integrate the separate stub commit followed by the separate final fix commit. No affected source rewrite is needed from this review. Preserve the integrated final-fix SHA and run closure with `--fixed-in` **that integrated final fix only**, not the worker SHA or the stub-plus-fix range.

The fix-only production paths are exactly drive-http.ts and fake-drive.ts; undoing that commit restores loadable typed rejecting methods, while the additive interface/delegate and final 24-test suite remain present. The final named suite has genuine positive-byte and error-detail assertions that pin this baseline. Coordinator must actually observe an assertion red, successful restore, fresh pnpm check and the unchanged verify:

`pnpm vitest run src/data/drive/raw-bytes.test.ts -t "drive raw bytes preserve source authority"`

The documented environment-only `pnpm_config_verify_deps_before_run=false` may retain the vetted dependency setup. Worker logs are not root integration proof. No known-green bypass or missing-method red is appropriate. If later changes touch these behaviors, review the affected immutable delta again; serial integration remains necessary alongside the disjoint canonical JSON candidate.

## Explicit limits

No reviewer test, module import, browser evaluation or real Drive request was executed. The prepared tests prove bounded stub/fake behavior, not actual Google media/CORS/permissions/version guarantees or recovery of unavailable original bytes. This does not activate ownership/2 consumers, provide CAS, resolve R1-OBS01, migrate stored notes, implement retained-byte policy or authorize another provider probe. Existing legacy text behavior remains deliberately readable; it must not be mistaken for byte authority by future consumers. Full latest app/demo/fake/PWA acceptance and independent phone/desktop evaluation remain coordinator obligations. P2 stays open, and no main product merge, push, deployment, P3/P4 or owner acceptance is certified here.
