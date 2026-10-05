# R1 content-interleave packet

This replacement immutable scratch packet preserves v1 and prepares one owner-operated P2 premise probe. The preparer executed local stubs only. Google Drive R1 is NOT RUN. Independent review is required before the coordinator runs either command against private credentials.

## Commands

Local checks, no provider/session access:

```sh
cd /private/tmp/bower-r1-content-probe-v2
node --test guard.test.mjs controls.test.mjs regressions.test.mjs
node --test regressions.test.mjs
```

Coordinator only, after fresh independent review and case-specific current approval:

```sh
node /private/tmp/bower-r1-content-probe-v2/probe.mjs run /ABSOLUTE/PRIVATE/PATH/r1-packet.json
```

`packet.example.json` is an expired, unapproved placeholder. Create its actual replacement privately; never copy private config/client/session/manifest into this directory, any Google packet, either repository, or another published packet. Private parent directories must be owner-only (700), files owner-only (600), regular and non-symlink. Paths must be distinct. A published `packet-hashes.json` or `.git` file/directory in any ancestor also excludes the location; the owned worktree and SecondBrain are excluded explicitly. The new manifest path must initially be absent; an existing manifest is retained and refuses run. Reopening the CLI does not renew its old monotonic budget; see restart policy below. This packet reads the unchanged v4 modules only after excluding all declared private paths; runtime module and immutable app source hashes must match.

Use only the already consented identity A/full-drive session and existing client. The v4 OAuth config must remain that identity/grant/client; renew only its bounded execution authority and the private R1 packet. Both authorization references and expiry values must agree: OAuth expiry is ISO text, R1 `expiresAt` is UTC epoch milliseconds. `caseId` is a fresh synthetic ASCII identifier (4–80 letters/digits/underscore/hyphen); exact root name is `Bower R1 probe ${caseId}` and marker is the same caseId. `manifestFile` is a new private durable path for this case. No new account, secret, client, redirect, consent, scope or revocation is required or authorized by this packet.

## Effects and disposition

One synthetic folder is created using the request alias `root`; its returned sole opaque parent is pinned privately and never becomes a request resource. One synthetic `fixture.md` receives BASE, B and A exact literals. Three independent DriveHttp clients share the existing grant. A pauses immediately before forwarding its PATCH, after its actual final GET precheck; B writes, the observer reads B, then A is released unchanged and the observer reads the final bytes.

The first observed A success and final A bytes after confirmed B is `observed-refuted`; no further premise cases or restorative writes follow. Only one recorded actual A media-PATCH 409/412 conflict refusal, with B preserved and A rejected, supports this single case. 401/403/500, local retry suppression and unrelated failures remain inconclusive. All other outcomes are inconclusive. Cleanup is a separate disposition: ownership reads, child Bin/raw `trashed:true`, empty known-root inventory, root ownership/Bin/raw `trashed:true`. No DELETE, broader discovery or grant revocation. Ownership changes, foreign content, unknown mutation outcomes or unexpected children retain residual aliases for coordinator recovery. A completed create HTTP response does not resolve its possible effect: missing/unreadable/invalid owned identity keeps ROOT_UNKNOWN or FILE_UNKNOWN, including completed errors. An unresolved child always prevents root Bin, even with an empty inventory. A completed Bin in the private manifest is not replayed; its raw confirmation can be resumed.

All dispatches—including cached-token requests, refresh, adapter retries and A release—require current approval and remaining budgets. Authorization expiry remains wall time; monotonic runtime elapsed independently caps case duration and request/refresh timings. Wall rollback or monotonic rollback refuses the next dispatch. Hard limits: 60 admitted HTTP attempts including ≤2 refreshes, 600000 ms and 65536 aggregate request/response body bytes. Normal work reserves 10 attempts, 120000 ms and 8192 body bytes for cleanup. Budget reservations are conservative upper bounds on actual forwards; a refusal after durable reservation does not reclaim a slot. An already issued request is not claimed cancelled/rolled back. Response chunks exceeding the remaining byte budget stop consumption and execution; this is not a physical network traffic guarantee.

Inline cleanup and cleanup-only reentry of the **same living guard** keep the original monotonic anchor, original wall start, attempts/body counters, create intents and resource IDs. A new process has no portable proof of the old elapsed interval. This v2 deliberately rejects **every restarted cleanup CLI** before tokenProvider/private client/session reads, new persistence or provider dispatch, retaining the unchanged manifest. The refusal command (not a supported automatic recovery path) is:

```sh
node /private/tmp/bower-r1-content-probe-v2/probe.mjs cleanup /ABSOLUTE/PRIVATE/PATH/r1-packet.json
```

Do not delete/reset its manifest, old start or clock. Expiry/exhaustion/restart residue needs a NEW coordinator-approved bounded same-resource recovery disposition; this packet implements no such follow-up and never recreates unknown resources. This expressly limits the original micropacket's process-reopen recovery proposal and requires fresh independent review. It is not proof of general restart recovery.

Public output contains fixed event/operation aliases, status/counters/timings, payload hashes, verdict and residual aliases. No actual IDs, name/marker, URL, token, headers, body or exception stack. Private manifests retain returned IDs/parent, creation/write/Bin intent and completion, metadata versions, selected noncredential response validators and body hashes; credentials remain solely in original private client/session files. Source adapter diagnostics use its unchanged safeConsole.

Exit 0: one supported case and inline cleanup complete. Exit 2: refuted/inconclusive/residual. Exit 1: setup/operation/refused restarted cleanup; keep private manifest. Same-guard local cleanup controls do not make a restarted CLI supported.
