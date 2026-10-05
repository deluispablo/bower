# Current partial-pile readiness reproduction

2026-10-05, root coordinator. Plan contracts-2; P2 C02/C12/C14; existing open entry `partial-pile-readiness` / qa-13. Exact integration `f98cc59a6b66f896414aa8ce69679f3703ff767d`, product source `1dc7f64b399b9ad2f893648e6e704a1e76905593`. Tree clean before and after execution. No product/test/interface changes, browser, provider, credentials, dependency installation or phase closure.

## Actual current observation

The isolated public-API probe transpiles current TypeScript in memory and constructs one FakeDrive, an uploader DriveVault, a separate reader DriveVault and the scripted runner's own fresh consumer. Inputs are synthetic two-member Blobs plus context. Exactly one upload refuses **before any upload effect**, using the DriveApi-conforming `BowerError('offline', ...)`; its sibling succeeds. This replaces the old generic-Error fixture, without changing production code.

Actual control assertions pass: exactly one refused upload, arrived sibling visible to uploader, missing member recorded with upload=-1. Uploader lists both members. The second reader lists only arrived.pdf. Scripted tidy-up reports done/filed arrived.pdf/setAside empty; afterward neither reader discovers the pile. Actual fake storage has one arrived.pdf copy and zero missing.pdf copies. The final assertion fails: `unready member must remain discoverable after another client tidy-up`.

Command (actual exit1 from this assertion, no setup/load/TypeError failure):

```sh
node /private/tmp/bower-partial-readiness-1dc7f64.cjs /Users/deluisp/Projects/bower-app /Users/deluisp/Projects/bower-app/node_modules/typescript/lib/typescript.js
```

Raw script/result archived byte-for-byte under `evidence/2026-10-05-o1/current-readiness-1dc7f64/`. The expected upload refusal is logged by production code; it is not a setup failure. The final AssertionError is the observed readiness regression. No retry/recovery was performed, so this reproduction does not demonstrate the entry's required eventual exactly-once completion. Its existing named Vitest verify remains planned, not executed or passed.

## Scope and next decision

Shared production DriveVault creates the pile and keeps expected missing members only in the uploader's instance; a separate reader sees an incomplete observed set. Consuming that set is actual **scripted fake-runner** behavior, not an observed deployed Worker/P4 runner defect. This is current corroboration of the historical143ae2b counterexample, not a relabeling of its old log. Earlier Add no-loss repair and S02 reference cleanup remain closed and preserved; neither implements durable shared readiness.

Before assigning a complete repair, lead must adopt compatible expected membership/capture/readiness and external-input fallback. Adopted D02 best-effort retained bytes/hash-verified reselection remains relevant but incomplete. The smallest fixture must then prove refusal to consume unresolved input, visible recovery on a second reader, successful missing-member retry and one effect per completed member. Real R4 resumable/unknown-response semantics remain a separate provider obligation; this before-upload refusal is plausible without resolving those premises. R1 remedy/probe stays prioritized and its scratch reservation unchanged.

No new harness entry or `passes` change: the existing entry remains open. The independently frozen O1 fb6d9afe report was written before this new execution and remains unchanged; this is an explicitly later coordinator supplement. Independent source/evidence review has not yet certified this supplement.

## Immutable hashes

- `probe.cjs.txt`: `be1329d10ea88d8f4081272b18ddcfb644fd07c618f0fe40226aa0b43e217269`
- `result.log`: `cce4d0bc66cc3ed1fe4eba80551ac303d5511293f6cf0fd833621073a041236a`
- `src/data/vault/drive-vault.ts`: `677783824f07e10aaa1089e3c9c152e9ad2280be862869eb046567747ff073c5`
- `src/data/drive/fake-drive.ts`: `0438820862bc60c464c790a42fe541736f1575c397197fef60f2a9499ad655c7`
- `src/data/fake/fake-runner.ts`: `80c86052a376705620431ff333017ce4cff65a2266605da7431ec7924c3dd396`
- `src/data/types.ts`: `6f16991fb2b2c314ff26cafb3a4938083cbdb998677171bfed64b84ad7a3f121`
