# R1-D02 v2 ETag conditional Markdown instrument

One immutable scratch instrument, not a product change. Local assertions use injected synthetic Responses and actual immutable DriveHttp clients. The new genuine Google v2 ETag case is NOT RUN by the preparer. Independent review must clear this packet before root alone supplies a fresh exact-case private authority and executes it.

## Fixed method

Reuse the small stable-read/conditional-media pattern from Freed Contributors, MIT, commit `7319c80b9111315ebac2718b46ef39d224eee73c`: v2 metadata before → v3 bytes → identical v2 metadata after. See [pinned adapter](https://github.com/freed-project/freed/blob/7319c80b9111315ebac2718b46ef39d224eee73c/packages/sync/src/cloud/library-core-google-drive-adapter.ts), [pinned tests](https://github.com/freed-project/freed/blob/7319c80b9111315ebac2718b46ef39d224eee73c/packages/sync/src/cloud/library-core-google-drive-adapter.test.ts) and [license](https://github.com/freed-project/freed/blob/7319c80b9111315ebac2718b46ef39d224eee73c/LICENSE). Complete notice is byte-preserved in LICENSE-Freed.txt. Local lead-provided downloads were hash-verified; root reported cache misses when independently fetching GitHub, so their provenance is lead-reported, not a fresh remotely certified commit. We copy no Freed runtime, dependencies or full synchronizer. Its fake412 branch and our local tests do not prove Google semantics.

`binding.mjs` adapts the triplet with one attempt only: refusal instead of inconsistent-read retries. Exact file ID, a strong quoted ETag and optional exact integer provider version must agree around exact expected ASCII bytes. Versions remain decimal strings; unsafe Numbers/fractions, mismatches and same-tag changed-version ABA refuse. A bound immutable token carries file, folder, fixed identity A/full-drive scope, content hash and the fixed v2 If-Match strategy. Changed observations require a changed ETag and, if present throughout, a strictly increasing integer version. There is no modifiedTime→ETag conversion or timestamp map.

Create one new owned synthetic root using request parents `["root"]`, pin its returned single opaque parent privately, and create one Markdown file with BASE. No provider-root or opaque-parent request is allowed. Acquire stable BASE token, perform one exact matching v2 media PUT of CONTROL, independently check CONTROL ownership and stable bytes/token. A queues one v2 media PUT of A with that original CONTROL token. Immediately before forwarding, the guard holds it; B uses the unchanged v3 DriveHttp GET-precheck/PATCH and independent O checks B, ownership and stable changed v2 token. Only then release the unchanged old-tag A request and independently read final ownership/bytes. Matching and stale media PUTs both use exact `Content-Type: text/markdown`, `If-Match` literal and `fields=id,etag,version&uploadType=media`. Metadata/bootstrap remains guarded JSON. No other content type, fresh tag for stale bytes, conditional retry, unconditional fallback, additional case or restorative write is permitted.

Exact literals, including final newline:

```
BASE    user: base\ncompiled: base\n
CONTROL user: base\ncompiled: control\n
B       user: external\ncompiled: base\n
A       user: base\ncompiled: app\n
```

One actual recorded stale A PUT412, with successful matching control, exact B independently observed before and after A, and A rejected, means `observed-supported-one-case`. An actual completed stale A2xx and final exact A after B means `observed-refuted`. 409,401,403,500, local refusal, unknown outcome, unusable/unchanged validator, failed matching positive and every other outcome mean `inconclusive`. No Google disposition is inferred from a local result. Cleanup is independently reported.

## Local commands

```sh
cd /private/tmp/bower-r1-etag-v2-probe
node --test binding.test.mjs guard.test.mjs controls.test.mjs regressions.test.mjs conditional.test.mjs path.test.mjs
node --test binding.test.mjs conditional.test.mjs path.test.mjs
```

No package install, app build, browser or local sockets are necessary. `baseline-v2/` preserves the copied original modules/test evidence identity and loaded neutral binding stub. First loaded-stub evidence is `binding-red.log`: one positive, fourteen genuine AssertionErrors. `path-red.log` demonstrates the old public-path guard accepting the new directory. Intermediate harness/fixture mistakes are retained and classified in the report, not counted as product regression evidence.

## Root-only execution after review

```sh
node /private/tmp/bower-r1-etag-v2-probe/probe.mjs run /ABSOLUTE/PRIVATE/PATH/etag-packet.json
```

`packet.example.json` is expired and unapproved. Its actual private replacement must have `v:1`, `case:"R1_D02_ETAG_V2"`, fixed `identityAlias:"A"`, `scopeSet:"full-drive"`, a fresh 4–80-character synthetic ASCII `caseId`, exact `rootName:"Bower R1 ETag probe ${caseId}"` and `marker:caseId`. `approved` must be exactly true, `reference` nonblank, `expiresAt` bounded epoch milliseconds. It and the unchanged reviewed v4 OAuth config must use the same execution reference/expiry, identity and scope. Existing client/grant/callback stays unchanged. `manifestFile` must initially be absent; existing manifest/intents refuse run. No new generic client export, secret, consent, account, scopes or callback is needed or authorized.

Private config/client/session/manifest live outside this directory, every older public packet, repositories, SecondBrain and prepared worktree. All paths distinct; real parent owner700, regular nonsymlink files owner600. Any ancestor with `packet-hashes.json` or `.git` also excludes a location. Own new path exclusion precedes actual v4 module import/credential reads; original v4 loader/OAuth and three immutable app source hashes must match. Source adapter safeConsole is unchanged. Root alone owns actual credentials/provider execution.

## Budgets, unknown effects and cleanup

60 admitted attempts maximum including ≤2 fixed-endpoint refreshes;600000ms hard elapsed;65536 aggregate request/response body bytes. Normal work reserves10attempts/120000ms/8192B for cleanup. Exact normal case uses23 Drive attempts, cleanup7; maximum fixed case with2refreshes32 before any read retries. Normal stages: bootstrap5, stable BASE3, matching PUT1, CONTROL ownership/triplet4, B metadata1/precheck+write2/ownership+triplet4, stale PUT1, final ownership/media2. Normal sum23. Cleanup: file ownership/Bin/rawpositive3, empty known-root inventory1, root ownership/Bin/rawpositive3. Attempts/bytes are conservative reservations, never reclaimed on local refusal after reservation. Byte cap is consumed body budget, not a physical network-traffic guarantee.

Every cached-token lookup, acquisition request, PUT, adapter retry, refresh, queued release and cleanup dispatch rechecks current approval and remaining clock/body/attempt budget. The queued bearer/tag/body remains unchanged and is checked again after waiting. Wall authority expiry is preserved; monotonic elapsed independently caps duration/timings; clock rollback refuses next dispatch. Already issued I/O is not claimed cancelled or rolled back. One-shot durable create/PUT/B/Bin intents precede forwarding; unknown create stays unresolved until an owned ID is registered. A completed HTTP body alone does not prove creation/effect resolution. Unknown mutation never gets a second forward or automatic Bin. Independent actual control/poststate checks resolve accepted effect observations; unrelated failures never prove conflict support.

Only exact owned IDs/name/parent/marks/MIME may be Binned; foreign observed content, changed ownership, unknown effects or unexpected children refuse cleanup and retain residual aliases. Child positive raw `trashed:true`, empty known-root inventory and root positive raw `trashed:true` are required. Unresolved child prevents root Bin even with an empty inventory. No DELETE, discovery, old fixture reuse, untrash, rename/move or grant revocation.

Inline/same-living-guard cleanup/reentry keeps original monotonic anchor/start/intents/IDs/body counters. A restarted CLI cannot verify old monotonic elapsed and explicitly refuses before tokenProvider/client/session content reads, new persistence or provider dispatch. It reads private packet/config/path metadata and manifest first, retains them unchanged and does not reset budgets. The command below is an intentional refusal path, not general recovery:

```sh
node /private/tmp/bower-r1-etag-v2-probe/probe.mjs cleanup /ABSOLUTE/PRIVATE/PATH/etag-packet.json
```

Expiry/exhaustion/restart residue requires a NEW bounded same-resource root disposition after review, without blind recreation/mutation. No such disposition is implemented here.

Public events/result contain fixed aliases, counters/timings/statuses, fixed strategy and payload hashes/verdict/cleanup aliases; never actual URLs, IDs, tags/versions, names/marks, headers, body, token or stack. Private manifest retains validators/version, bound content hashes, metadata/IDs/parent/intents and selected noncredential response headers. Refresh secrets/body/headers are not persisted. Exit0 is supported-one-case plus cleanup; exit2 refuted/inconclusive/residual; exit1 setup/refused restarted cleanup. None certifies product CORS, move/rename, general safety or P2 acceptance.
