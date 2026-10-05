# Independent R1 content-probe v2 review

2026-10-05. Reviewer `/root/prerequisites_review`. Adopted plan `2026-10-05-contracts-2`, main planning `d12c55e`; P2 O2/R1 C03/C14. Assignment registered at integration `6b3ee99`; coordinator subsequently reports documentation checkpoint `722f300` with unchanged product source. Root remains the sole shared-record, credential, browser and provider operator. This is an immutable scratch-instrument review, not product integration or phase acceptance.

## Verdict

**No remaining Critical, Important or Minor findings in this bounded v2 packet.** The prior two Important findings and one Minor finding are repaired. The coordinator may advance to the separately authorized preflight and one real synthetic Drive content-interleave case using this exact packet, subject to its current private authority, existing grant and source pins. This review neither authorizes broader provider operations nor establishes any provider result. The actual provider case remains NOT RUN at review time according to the coordinator; I did not inspect private authority or credentials.

The explicitly declared refusal of restarted CLI cleanup is acceptable as a narrow probe limitation. It supersedes the original process-reopen proposal for this instrument only. It does not meet or waive P2's general recovery obligations. Same-resource residual recovery after restart, expiry, exhausted budgets or unknown effects needs a new bounded coordinator disposition; automatic recreation, discovery or blind mutation is not authorized.

## Immutable identities and scope

- Report `/private/tmp/bower-r1-content-probe-v2.md`: SHA256 `27feba9deac00e2db5e748ff7650de6c852e1a265a5ffba61c6f44af0de338e4`.
- Manifest `/private/tmp/bower-r1-content-probe-v2/packet-hashes.json`: SHA256 `508b06d6d3107bd833e1ba51444e56a89572c6fa74ef64a0a7bfa8dff2750e00`.
- All 52 declared files match their byte lengths and hashes. The preserved original 27-file v1 and 29-file Google v4 packets were checked unchanged during this review.
- `guard.mjs`: `6ace9e16f56302433240f26154f56293edc521d25755762bdc47d694e60d1f11`.
- `case.mjs`: `4c55cfd1bf94d67b55f5ea7ff83fc1d2cd42afe39c76968ea9be7e6650189fa3`.
- `probe.mjs`: `f952f688c0afcae974750199a088d5d001c49c956e9b565100ffbf5785d7c000`.
- `regressions.test.mjs`: `bdb7c8bf9c69028f837ee2829a82f11a17ad1b854ec36865290dbf286d1a3654`.
- Prior independent v1 review remains untouched: SHA256 `fe1bba0b7be36ceed37797b2376c78dc1e55993b91f0d4c2bad7a110673bd804`.
- Original execution micropacket: `31ee828b3470563dd288139f7f5235259223f9b95b093ef9a85d33896512052e`; returned-parent correction: `cc041ebd336b72bc39360aea8b881627d4e8b1087ec3b2e84acb8e9f9699d0d3`.

Current-equivalent DriveHttp/DriveApi/types source pins agree with the loaded immutable public source: respectively `340134b45909b1f263a56942538447720e079a78ed9f4e170be6e9d25a7a8e21`, `e57343a528bb8ef72739b7277593f5b0f9caa569becbac7b4272c35b2bf27c6b`, `6f16991fb2b2c314ff26cafb3a4938083cbdb998677171bfed64b84ad7a3f121`. The prior reviewed Google adapter and OAuth modules are unchanged. Only guard/case/CLI differ among the original executable modules; original tests, loader, storage and synthetic fixture modules are byte-identical. New regression evidence and documentation are separate.

## Resolution of previous findings

**Important: HTTP completion no longer hides unresolved creation.** `guard.mjs:22` defines unresolved creation by effect registration, independently of status. At `guard.mjs:148`, mutation intent is persisted before forwarding with `effect:unresolved`; numeric HTTP status and complete response at lines 172–173 do not change that. Only a valid returned ID, exact name, marker, type and sole parent pass registration at lines 177–183. Unreadable/missing-ID 201 and completed 500 therefore remain unresolved. Known invalid IDs stay private and confer no mutation permission. `case.mjs:68–73` reports UNKNOWN aliases even without a registered resource, and `guard.mjs:125` refuses root Bin when child creation remains unresolved, including an empty inventory. There is no inference that completed 500 or an empty listing proves absence of effect, and no recreate/discovery retry.

The supplied original-v1 assertion logs show genuine failures for root/file effects with unreadable201, missing-ID201 and completed500. A separate empty-inventory baseline assertion actually fails when v1 Bins the root despite an unresolved child. Final supplied regressions cover corrected initial reporting and same-live-guard cleanup reentry. Initial red assertions stop before that later reentry; the report accurately distinguishes this.

**Important: authentication/server refusal no longer counts as stale-write support.** `case.mjs:29–31` requires exactly one actual recorded A media-PATCH, completed HTTP409/412, caller rejection, observed B before release and final B. The record now retains request kind (`guard.mjs:172`), so an A metadata GET cannot qualify. The supplied genuine v1 401/403/500 assertions fail because v1 falsely reports support; all become inconclusive in v2. Local guard suppression or an attempted retry also cannot substitute for a qualifying upstream conflict. The literal local412 positive control and local successful200/A-loss refutation remain supplied green. These classifications are bounded observations, not proof of general Drive concurrency protection.

**Minor: time and duration bounds use a monotonic runtime anchor.** `guard.mjs:24–38` establishes one nondecreasing runtime clock; `eligible` at lines 50–63 enforces original elapsed and wall-authority deadlines, with the original cleanup reserve. Forward and refresh timings use monotonic elapsed. The supplied baseline assertions show frozen/backward wall time with monotonic600001ms admitting a further v1 dispatch; v2 refuses. The new timing control measures17ms despite wall correction and refuses the next dispatch. No actual600s wait or cross-process clock was claimed.

## Restart policy and recovery boundary

`guard.mjs:28` refuses `resumed:true` or retained clock state before changing clock/root bindings. `probe.mjs:34` passes resumed for cleanup mode; first state persistence is line41 and first `tokenProvider` client/session content access is line42. A restarted cleanup therefore refuses before credential content reads, manifest persistence or network dispatch. Packet/OAuth configuration/retained manifest reads and client/session path metadata checks precede this refusal; I do not claim that no configuration or file metadata is read. Constructing the private writer closure does not itself write the manifest.

The supplied restarted-guard control verifies refusal without forwarding or mutating retained state. I inspected CLI ordering; an actual private CLI restart was not executed by this reviewer. Existing manifest in run mode is still refused rather than replaced. The same living guard keeps its original elapsed anchor, counters, intents and IDs and can perform cleanup only within the original remaining authority and budgets. Existing confirmed-Bin continuation controls remain supplied green.

The original reopen proposal is thus deliberately narrowed, not silently passed. An unknown created root may remain unlocated; cleanup is not guaranteed. Any later same-resource disposition must preserve the retained manifest and original effects/IDs, and explicitly address its new bounded authority. This is not a scheduler, host-clock infrastructure or browser-independent accepted-run proof.

## Preserved operational restrictions

Source inspection preserves three independent current-equivalent DriveHttp clients and the exact A precheck/hold, B write/observer-confirmation, unchanged A release and final independent read. Queued token equality and current authority are checked after the barrier and before every new forward, including retries and fixed-endpoint refresh; no hidden second A PATCH is forwarded. Root alias is only the literal root-create parent; the returned opaque parent stays private and is not an allowlisted request target. Exact fixture name/marker/sole-parent/type checks control all operations.

The instrument keeps fixed Drive routes, exact IDs/fields/body/header shapes, no redirects, no hard delete, no live revoke or client rotation, and no provider-wide discovery. Bin requires owned resource checks, safe known-root inventory and raw `trashed:true` verification. Unknown effects/residuals remain visible. No legacy runner, model invocation, ingestion or P3/P4 remedy is introduced; loading a legacy public module does not execute its provider client.

Private owner-only regular nonsymlink placement, repository/worktree/SecondBrain/public-packet exclusions, `.git` and packet-manifest ancestor exclusions remain before credential content reads and reviewed loading. V2 additionally excludes its own packet. Fixed public events/results use aliases, literal payload hashes and counters rather than private IDs, tokens, bodies or raw diagnostic arguments. Private intents and validated returned IDs are persisted before dependent operations. Immutable module pins remain verified by the loader.

Admission remains at most60 requests,600000ms and65536 body bytes, with10 requests/120000ms/8192 body bytes reserved for cleanup and at most2 fixed-endpoint refreshes. Limits are conservative admission/accounting bounds: body bytes exclude network framing, a received oversized chunk can exceed the counter before stop, and already-issued IO is not claimed cancelled or rolled back. No durable-envelope, product ownership, report-save, readiness or general P2 recovery certification follows.

## Evidence inspected and actual limits

I read supplied source, exact diff, public documentation, original micropackets, preserved prior findings, raw red/green logs, syntax results and manifests; used read-only hashing/JSON inspection. I ran no tests, modules, init/build/Git operation, browser or provider call; accessed no private client/session/config and changed no repository/shared record. The only new output is this report.

Supplied evidence:12 genuine original-v1 AssertionErrors before replacement; one additional empty-inventory assertion red; the final-source original-v1 counterfactual preserves12 assertion failures. Final full log46/46 green; focused log15/15 green;9 syntax checks exit0. Earlier43-green provisional evidence remains separate. The unchanged31 controls and15 new controls are meaningful local instrument evidence, not independent reviewer executions or real provider observations. The complete injected local case records23 forwards and B→A loss with verified fixture cleanup; this is not a Drive result.

Current private authority false, manifest absent and network0 are coordinator-reported facts, not independently read by this reviewer. Real Drive stale-write behavior, actual grant behavior during this case, network timing/failures and actual residual disposition are untested here. No R1–R4 provider premise or P2 acceptance is closed. A real counterexample must return to the technical lead for its contract/remedy decision; no production change is implied by these synthetic results.
