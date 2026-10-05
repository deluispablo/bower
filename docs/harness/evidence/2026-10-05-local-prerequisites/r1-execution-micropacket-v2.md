# R1 micropacket v2 — creation alias and returned parent

Read-only specification clarification, 2026-10-05, `/root/approved_policy_slices`. No implementation, private-file access, provider call, browser action, Git action, gate or shared-record change. Runtime R1 remains NOT RUN.

This v2 applies to the complete original packet `/private/tmp/bower-r1-execution-micropacket.md`, SHA-256 `31ee828b3470563dd288139f7f5235259223f9b95b093ef9a85d33896512052e`, preserved unchanged. Adopted plan contracts-2, integration `aaf76ff5036d89662ee79d9bfe05e75bf5e2c981`, source `cbf4e9f`, exact source/public-module hashes, sole-preparer and independent-review flow, first content race, exclusions and all other requirements remain as written there. The replacements below override every reference to comparing a returned root parent to literal `root` or asserting independently verified provider-root identity.

## Exact replacement requirements

1. Bootstrap request remains exactly `A.createFolder('root', exactSyntheticName, exactProbeMark)` once, with JSON `parents:['root']`. `root` is the request alias, not an expected literal response parent. No extra provider-root lookup/listing is permitted.
2. After actual successful creation, require the returned new folder ID and exactly one nonempty opaque returned parent ID. Persist both privately, together with exact name/marker and completed creation provenance, before admitting another operation. `R1_ROOT` is the newly created folder; `R1_ROOT_PARENT` is its pinned returned parent. The latter is **recorded metadata, not an allowlisted resource for requests**. Missing/multiple/invalid parents: stop normal execution, retain private creation/residual information; do not infer a parent, move the folder back or recreate it.
3. The immediate GET of the new folder must match its returned ID, exact synthetic name/marker and exactly `[R1_ROOT_PARENT]`. Later ownership reads, including read-before-Bin, use that same privately pinned parent. Changed/missing/multiple parent means stop/refuse Bin and report the residual alias. Never compare the parent to literal `root`, expand the allowlist to the pinned parent, or query that parent to prove its identity.
4. This establishes bootstrap request/response provenance and subsequent parent stability **only**. It does not independently identify the returned parent as My Drive's root or prove a provider-enforced location precondition. Child creation/reads still require sole parent `[R1_ROOT]`; this correction does not relax that boundary.

The primary [Google Drive folder guide](https://developers.google.com/workspace/drive/api/guides/folder), read for this clarification, describes `root` as an alias usable where a file ID is supplied and `parents` as the containing folder's ID. Therefore the request alias and returned ID must be handled separately. This documentation is specification basis, not an observed provider result.

## Required assertion-first additions

- Positive literal fixture: request has exactly `parents:['root']`; successful creation returns exactly `parents:['OPAQUE_PARENT_A']`; private manifest pins that parent; immediate and cleanup ownership GETs return the same parent and matching ID/name/marker. Admit normal processing without a request to `root` or `OPAQUE_PARENT_A`.
- Negative literal fixture: creation pins `OPAQUE_PARENT_A`, later GET returns `OPAQUE_PARENT_B` with otherwise identical metadata. Refuse the next mutation/Bin before forwarding, retain residual state and issue no lookup or move-back. Missing/empty/multiple parent variants likewise refuse.
- Assert no literal response-parent `root` comparison and no request permission derived from retaining the opaque parent. These are proposed tests, not executed or green evidence.

## Unchanged bounds and handoff

One new synthetic root plus one synthetic Markdown file; no personal root/content search. A final precheck → pause before PATCH → B independently confirmed edit → release unchanged A request → independent provider post-read. First lost update refutes the current strategy and stops further cases. Baseline 23 Drive requests plus at most two refreshes; hard 60 actual HTTP attempts / 10 minutes / 64 KiB aggregate body bytes, with at least 10 requests and two minutes reserved for cleanup. Existing dispatch-time authority/token checks, private returned-ID allowlist, no redirects, exact route/parameter/payload restrictions, diagnostic suppression and upstream-completion distinction all remain mandatory.

Root assigns the sole scratch preparer; independent review precedes any root-operated provider action. This v2 neither implements the shim nor changes DriveApi/Worker contracts or phase acceptance.
