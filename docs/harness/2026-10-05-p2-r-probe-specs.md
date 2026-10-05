# O2 bounded premise probe packet

Draft for technical-lead review; no contract changes adopted by this packet.

- Author/session: Codex read-only probe specification author, `p2-o2-2026-10-05`.
- Planning/phase/capabilities: `2026-10-05-contracts-2`; P2-R R1–R4; C01/C02/C03/C12/C14 (R2 fallback also informs C15).
- Immutable code target: `143ae2b12d5440330bee1a85bd16e90b8dccf746`, branch `codex/close-phase-2`, integration `/Users/deluisp/Projects/bower-app`. Local main planning revision matches. Startup tree was clean.
- Read: session skill, STARTUP/GOVERNANCE/COORDINATION/METHOD/PHASES/HANDOFF/progress Next, live ACTIVE, PRODUCT/WORK_PLAN/P2_ACCEPTANCE/ARCHITECTURE/ORCHESTRATOR_START/SKILLS and relevant Drive/Worker baseline sources.
- Capabilities observed: Git/shell, Node 26.10.0, pnpm 12.8.1, official documentation browsing. No OAuth grants/tokens, synthetic Drive resources, authorized Actions repository/workflow, callback resource, browser reservation or prepared isolated probe harness established. None searched for or acquired. Init/gates not run: read-only author, no exclusive implementation checkout.
- All R1–R4 runtime outcomes: **NOT RUN — missing authorized resource setup**. Documentation and code inspection are evidence for designing experiments only. No production deployment, model call, remote change, product implementation, repository edit or phase closure performed.
- Return-time refresh: coordinator advanced integration to `b4761933812b53d8496e2d1750d5e123c4344c50`; tree remains clean. Diff from the immutable target changes only coordinator records and synthetic O1 evidence, with no src changes. This packet still evaluates `143ae2b`; new O1 foundation reproductions do not substitute for R1–R4 provider observation.

| Risk | Runtime result | Missing authorized setup |
| --- | --- | --- |
| R1 | NOT RUN | Synthetic Drive root, two preauthorized clients, barrier/response harness |
| R2 | NOT RUN | Disposable OAuth project/users/flow, external fixtures, session endpoint/device; optional comparison grants |
| R3 | NOT RUN | Explicitly authorized disposable Actions repo/default-branch probe workflow, credential mechanism, budget; callback collector if testing live callbacks |
| R4 | NOT RUN | Synthetic upload resources, scratch persistence origin/profiles/device; owner reload-policy decision remains pending |

## Common execution/evidence rules

The coordinator must issue a separate bounded execution assignment naming an operator, prepared isolated scratch harness, exact service resources, credential delivery mechanism, allowed mutations/cleanup, UTC date, browser/runtime versions and budgets. Use dedicated synthetic accounts and an explicit resource allowlist; no arbitrary Drive root search or personal file reads. Credentials, cookies, ID tokens and resumable session URIs stay outside logs, source, dispatch payloads and reports. Use resource aliases in publishable evidence; keep any necessary real IDs in a restricted local manifest. Reject redirects or parent changes outside the resource boundary.

Each case records pre-state, barrier/event order, request method/path alias, response status, elapsed time, post-state hashes/metadata and a named assertion. Dropping a response means forwarding the request, recording that upstream replied, then withholding that reply from the caller; aborting before transmission is a separate case. No blind retry while effect is ambiguous. Provider behavior and local harness behavior must be reported separately.

Use this result envelope, with one row per case:

```json
{
  "probe": "R1",
  "case": "content-interleave",
  "targetSha": "143ae2b12d5440330bee1a85bd16e90b8dccf746",
  "planningRevision": "2026-10-05-contracts-2",
  "utcDate": "YYYY-MM-DD",
  "environment": {"provider": "Drive v3", "clientVersion": "recorded", "resourceAliases": ["FILE_A"]},
  "status": "not-run",
  "events": [],
  "assertions": [{"name": "external bytes survive or stale writer is refused", "observed": null}],
  "evidenceFiles": [],
  "limitations": ["authorized setup absent"],
  "contractDecision": "pending technical-lead review",
  "cleanup": {"completed": false, "remainingResourceAliases": []}
}
```

Result statuses: not-run, observed-supported, observed-refuted, inconclusive. Passing one case does not certify all related endpoints, transport forms, browsers or races. Cleanup failure is recorded, never hidden by a green experiment exit.

## R1 — Drive content/name/place preconditions

**Hypothesis.** A supported storage precondition can refuse a stale content or structural write after another client edits between the app's final read and its PATCH. The current implementation only compares modifiedTime before writing, and separately checks name/first parent in stillAsSeen; both leave an interleaving window. DriveApi.writeText's stronger “writes only if” promise is not established by that implementation.

**Resources.** One disposable root with Parent A/B/C, four synthetic Markdown files (one per subcase), two independent HTTP clients for the same synthetic owner, a recording response/barrier shim. Max 60 API requests/10 minutes/64 KiB content; no real notes.

**Exact method.** All GET metadata calls request id/name/parents/modifiedTime/version; record available response validators separately. Reads also retrieve content. For each subcase use fresh fixture bytes `user: base\ncompiled: base\n`.

1. Content race: A reads base text/metadata; A's final precheck GET completes and pauses at a barrier before PATCH. B writes `user: external\ncompiled: base\n`; independently confirm B's bytes. Release A to PATCH its prepared `user: base\ncompiled: app\n`. Re-read from a third observation. Assert B's edit survives or A is refused; if external bytes disappear, record a counterexample and stop testing the existing unsafe strategy.
2. Conditional candidate: only if a genuine validator is exposed, try matching-validator control then stale-validator PATCH with `If-Match` on the exact media-update route and separately metadata-update route. Wrong/invented validators are negative controls, not proof of a valid compare-and-swap mechanism. Assert matching update works and stale update is refused without mutation. Missing validator or undocumented behavior is inconclusive; never invent a version query precondition from the output-only version field.
3. Structural race: A sees name Alpha/parent A, passes stillAsSeen and pauses. B renames to Beta or moves to B, confirm that state. Release A's stale rename to Gamma or move A→C (addParents/removeParents); inspect actual state/status. Assert unrelated content unchanged and a stale competing structural intent refused or safely reconciled. Test rename and move separately: an error for removeParents alone proves no general name/place precondition. Control: a content-only B edit must not automatically block a compatible rename.
4. Lost response: for a proven supported operation, allow PATCH effect, withhold its response, then re-read bytes/name/parents and reconcile expected effect. Retry the same logical intent only after deciding whether it already happened. Insert another B edit before recovery; assert recovery preserves it and does not blindly restore A's old payload.

**Stop/cleanup.** Stop on the first lost-update counterexample for a strategy, unsupported validator, exhausted bound or boundary violation. A counterexample is sufficient to refute safety; one successful interleave is insufficient to prove universal atomicity. Bin only the allowlisted disposable root; never hard-delete. Retain sanitized transcript and hashes.

**Contract/compatibility/failure recovery.** Affects DriveApi.writeText, structural preconditions, app/runner Drive boundary, protected text and operation reconciliation (C03/C14; later C05/C13). For lead review: supported conditional update with observed semantics, or immutable/append-only effects plus explicit reconciliation; if neither protects a current user edit, a narrowly specified product interaction is required. A post-write check or central app lock cannot undo an already lost external update. Fake and real tests must distinguish a stale precheck refusal from the race; migrate existing ifModified fixtures explicitly, preserving stale-write refusal and user-owned bytes. No weakening of safety accepted here.

**Provider basis.** [files.update](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update) documents content/metadata PATCH and parent parameters, but does not establish conditional-write support. [File resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files) describes version as output-only and increasing. This research found no official v3 guarantee supporting the source comment's absolute “no If-Match” claim; R1 remains an observation requirement.

## R2 — Identity, grants, metadata visibility and external inputs

**Hypothesis.** App and runner identities share the necessary app-private marks and scopes; externally created eligible inputs remain discoverable without preparation; revoked access yields a safe stop rather than cross-account fallback. Account identity/folder scope remain stable across sessions.

**Resources.** Owner-prepared disposable OAuth project/client with an already authorized normal test flow, dedicated synthetic user A and B, isolated browser profiles, root/inbox under A, an app-created marked text file, externally added Markdown and small PDF with no appProperties. Optional native Google Doc is a transport-capability control, not a new promise to support every native format. Owner may supply already authorized comparison clients (same project/different project) only if needed to identify appProperties visibility; absent comparisons remain a stated limitation. The whole project must be disposable for OAuth revocation. Max 80 API calls/15 minutes.

**Exact method.** Do not build an OAuth backend. Use an existing authorized test harness. Record granted scopes and verification outcomes for token signature/issuer/audience/expiry/nonce/state as applicable, but no claims containing personal data. Alias the stable account subject. Reopen session A and compare subject; session B must have a different subject and separate root binding. A client cannot obtain an A folder pointer/status/token through B's session.

1. Obtain two separately issued A sessions using the same client; read the marked file and query `appProperties has { key='bowerItem' and value='ITEM_A' }` within the disposable root. Assert all expected marks and file identity match. If supplied, run read-only comparison clients and report visibility by exact OAuth client/project relationship. Do not infer that all different client IDs are isolated from the guide's phrase “restricted to your app.”
2. In Drive UI, owner adds the synthetic files into Inbox after A's first listing. A and the runner-side reader perform fresh parent-scoped paginated listing, then metadata/content reads. Assert new IDs/MIME types/parents appear, missing marks/preparation do not make them disappear, and binary/Markdown content hashes match. Use files.export for a native-document control; transport availability does not prove an extractor exists. Record denied/unsupported content as pending/refused, never silently processed.
3. If the owner already supplied a narrower drive.file grant, repeat discovery without explicitly sharing each external item with that app; record visibility and failed operations. Otherwise the scope-comparison case is not-run. Never expand scopes silently.
4. Reopen A with only a lost local folder pointer; retrieve the known authorized root by its allowlisted ID or bounded parent recovery marker query. Assert identity consistency and no duplicate logical binding. Duplicate marked roots must produce a specified resolution path, not an arbitrary first match. This validates the prepared flow's binding rule; no POST /vault service is presumed available.
5. Separately revoke permission to an owner-prepared shared synthetic child and test reads; record actual 403/404 behavior without assuming 404 uniquely means deletion. For OAuth revocation, owner revokes only the disposable project grant. Retry one bounded access and one refresh; assert authorization fails and no content mutation occurs. No fallback to B or a different root. Clean Drive fixtures with an independent owner session if revoked credentials cannot do so.
6. For an existing authorized HTTPS session test endpoint, browser-check same-origin or configured same-site API fetch with credentials, reload, logout and B sign-in; assert cookie/session isolation and network-only token/status routes. Safari/home-screen runtime testing needs a reserved actual target/device; absent endpoint/device remains not-run. Do not claim local mock cookies prove real Google redirect or Safari session behavior.

**Stop/cleanup.** Stop on scope/identity mismatch, denied setup, personal-resource exposure, bound or first failed invariant; no broad grant acquisition. Bin allowlisted files/root before revocation where possible; remove only dedicated test grants/profiles afterward. Record cleanup that requires the owner after revocation.

**Contract/compatibility/failure recovery.** C01/C14 and external-input C02/C15; Worker identity/folder/token, appProperties, retrieval/preparation fallback. Lead review must determine actual client/project sharing boundary, granted scope policy, root collision recovery and unsupported-file outcome. Old fixtures missing new readiness/preparation fields must remain externally eligible via a tested fallback; no newly required marks that erase external material. Credential unavailability remains a recoverable stop, never successful completion.

**Provider basis.** [Properties](https://developers.google.com/workspace/drive/api/guides/properties) restrict appProperties to an authenticated app. [Scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) limits drive.file to files created/opened/shared with the app. [OpenID reference](https://developers.google.com/identity/openid-connect/reference) uses sub for stable identity. [OAuth revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke) invalidates grants across project clients. [Downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads) distinguishes binary retrieval from Workspace export. [WebKit tracking prevention](https://webkit.org/tracking-prevention/) substantiates the cross-site cookie constraint, not the specific deployment's working session.

## R3 — Admission, no-model dispatch/startup and recovery

**Hypothesis.** Actions is a usable executor when dispatch is treated as fallible delivery, with durable admission and authenticated expiring attempts providing effect authority. HTTP dispatch acceptance alone does not demonstrate startup or completion.

**Resources.** Owner-provided explicitly authorized disposable repository with an existing no-model probe workflow on its default branch, pinned workflow SHA/actions, permitted runner class and spending ceiling. No workflow push from this checkout. Dispatch credential supplied through normal authorized setup; Actions metadata/artifact read permission separately established. Workflow accepts only synthetic run/request/attempt IDs and mode, emits a small versioned event/report artifact, has a short timeout, no Drive/model/network credentials and no product writes. A prepared scratch durable control double outside the app records admission, claim expiry, monotonic revision and delivery checkpoints. Authentic live callbacks need an owner-prepared permitted collector; absent collector leaves that subcase untested.

**Exact method.** Bound to eight dispatches/30 minutes aggregate, 2 minutes execution each, 10 minutes observation per request, <=1 MiB artifacts. Measure three serial baselines, two same-run duplicate dispatches, two same-run dispatches with first HTTP reply withheld, one run whose completion notification is withheld. Record REST status, Actions run ID, created/start/finish times, workflow SHA and first instruction timestamp. Use durations on a common provider clock where available; record cross-clock uncertainty and polling resolution. Publish individual timings and range; no tail percentile/SLO or executor migration conclusion from three samples.

1. Persist synthetic admission before dispatch; close the originating test client. Another process loads the admission and can locate eventual executor/report evidence. Assert the admission is not lost with the first process. This is local control-double evidence, not a real Worker implementation result.
2. For every dispatch, POST repository_dispatch with a bounded event type/payload; locate matching workflow evidence and report terminal outcome. A 204 with no start before observation bound is accepted-but-unobserved, never a passed execution. Preserve the admission for later reconciliation.
3. Send duplicate same-run dispatches; inspect whether one/two workflows start and actual configured concurrency behavior. Both may execute harmlessly. Feed their events to the control double: one unexpired claimant may authorize one synthetic effect; the other must refuse/stand down. Actions concurrency alone is not an authenticated run lease.
4. Withhold a confirmed dispatch HTTP response, then reconcile matching run artifacts before a bounded redispatch. Assert retries do not produce a second logical effect in the control double. Separately suppress dispatch entirely after local admission and restart the control double: discover it as undispatched and recover it with the same request identity. Record separate local/provider observations.
5. Persist an effect/report marker artifact then suppress completion delivery. Returning observer must reconcile artifact existence before retrying and must not call a marker-less run done. If live callbacks are authorized, deliver duplicates/out-of-order callbacks and replay an expired attempt; assert authenticated expiry/monotonic rejection. Without a collector, replay recorded synthetic events locally and label live authentication/delivery not-run.
6. Local fault-only controls: crash after claim, advance supplied clock past expiry, hand off to a new attempt, then deliver old completion; reject old authority. Same request ID with different intent/folder is a conflict; report-persistence failure retains recoverable state and blocks done. These checks require no Actions dispatch and belong to a disposable model, then to future assigned fake contract tests.

**Stop/cleanup.** Stop on missing permission/workflow, bound, unexpected workflow action, secret exposure or unmet invariant; no retry storms. Export sanitized evidence. Owner/operator cancels only allowlisted outstanding probe runs and removes only their probe artifacts if separately authorized; do not delete the repository or workflow automatically. Remove scratch state/temporary credentials after retaining evidence. Record residual runs/artifacts.

**Contract/compatibility/failure recovery.** C12/C14; request/run/attempt identity, admission, dispatch/recovery, authoritative status and persisted-result barrier. Recommend for lead review durable admitted dispatch state, bounded reconciliation, expiring authenticated claim plus stale-attempt fencing and operation checkpoints. This does not select a storage product or implement P3. Versioned fixtures must cover current RunWire and proposed conceptual states; additive enum meanings are not automatically compatible. Old app consumers require deliberate adapter/negotiation tests.

**Provider basis.** [Dispatch REST](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event) returns 204 and documents token permissions/payload limits. [repository_dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#repository_dispatch) requires the workflow on the default branch. [Concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency) permits concurrent runs by default and documents pending-run cancellation/default versus opt-in queueing. Record the prepared workflow's actual setting; never presume a durable FIFO scheduler.

## R4 — Resumable uploads, ready-set capture and reopened clients

**Hypothesis.** Unknown upload outcomes can be reconciled without duplicate files, and a durable inventory of expected members can prevent an incomplete pile being consumed by another client. Browser byte retention is conditional platform behavior and a separate owner policy.

**Resources.** Disposable root/Inbox, two HTTP/browser clients, one small text item and one deterministic 10 MiB binary (bytes `(offset % 251)`, known SHA-256), immutable item IDs, a three-member expected inventory including a synthetic note. A prepared scratch IndexedDB/OPFS storage test origin, browser versions/storage modes and reserved Safari/desktop profiles. Proposed inventory is an experiment fixture, not a newly implemented schema. Bound 80 API requests/40 MiB transferred/15 minutes per platform.

**Exact method.** Use raw resumable protocol first, then contrast existing adapter behavior without changing it. Initiate upload in allowlisted Inbox with pile/item marks. Send one 8 MiB aligned chunk; capture the provider's acknowledged offset. Withhold that response or stop before the second chunk. In a fresh client with separately retained session reference/bytes, send empty PUT with `Content-Range: bytes */TOTAL`; continue only from observed server offset. On terminal response verify file ID, size, hash and one occurrence of item ID. Never log the session URI. Withhold the terminal response and reconcile completion before creating any replacement file. An expired/invalid-session case is simulated locally unless an actual expired session is supplied; no week-long wait in this probe.

1. Complete the small item and note, pause/fail the binary, then list Inbox from B. Record visibility of in-progress uploads (do not assume metadata appears before completion). B compares observed members to the experiment's expected inventory. Assert pile is incomplete, cannot enter captured ready set, and partial members remain intact/retryable. A late new item/pile after capture must wait. Duplicate/lost terminal replies must not change membership count or mark readiness twice.
2. Retained-bytes candidate: store original bytes/hash, expected IDs and protected session metadata in scratch local storage; close/reopen browser; read bytes and verify hash before resuming. Inject storage-denied/quota/record-missing cases locally; assert clear pending/reselect state and no false ready. A successful reload of 10 MiB proves only this platform/profile/sample, not unlimited or eviction-proof retention.
3. Reselect candidate: retain inventory/identity but no bytes; reopen must explicitly require reselect for missing item. Verify selected bytes against original hash before resuming; a different file with same name/size must refuse or become a separately identified replacement. Do not consume uploaded siblings or duplicate the completed item. This is a policy option for owner review, not an adopted fallback.
4. Switch to B account/folder or sign out while bytes/session pending. No old upload reaches the new scope; session references remain inaccessible to B and forget-person cleanup follows the selected policy. Preserve the existing folder-keyed journal outbox separately, since it represents effects already made. Partial upload cleanup bins only completed disposable files; no readiness marker is inferred from progress=100%.

**Stop/cleanup.** Stop on duplicate/missing member, hash mismatch, wrong-scope write, budget or denied storage. Do not fill disk to force eviction; use fault injection and explicit storage clearing only on scratch origin. Bin completed allowlisted Drive root. Discard session references and synthetic local bytes; unfinished sessions are abandoned unless provider offers a supported authorized cancellation operation. Record session expiry residual without retaining the secret URI in shared evidence.

**Contract/compatibility/failure recovery.** C02/C12/C14; Drive upload, stable item identity, expected-versus-completed inventory, readiness/capture and scoped device retention. Lead review: per-pile versioned expected inventory/commit-ready marker usable by any client/runner; complete-byte/hash reconciliation before ready; capture by item IDs/versions rather than a dynamic folder listing. Legacy externally added complete inputs require explicit fallback admission rules, not indefinite exclusion. Unresolved owner decision: retain selected bytes across reload where supported versus explicit reselect; same-session retry/no lost incomplete pile remain mandatory under either policy. No unconditional local durability claim.

**Provider basis.** [Upload protocol](https://developers.google.com/workspace/drive/api/guides/manage-uploads) uses a saved resumable session, status queries, received Range and complete/incomplete/expired responses; session expiry is one week and chunk sizing is aligned. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) documents quota failures and eviction. [OPFS](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/) describes origin isolation and persistent storage behavior. These facts do not decide Bower's reload policy or certify current byte retention.

## Independent local work possible before service setup

No local tests executed in the shared integration checkout. Existing named tests below are inspected coverage, not new probe results. A coordinator can reserve an isolated prepared checkout and run, for example:

```sh
pnpm exec vitest run src/data/drive/drive-http.test.ts -t 'writeText checks modifiedTime and rejects conflict'
pnpm exec vitest run src/data/drive/drive-http.test.ts -t '401 refreshes once then fails with auth'
pnpm exec vitest run src/data/drive/drive-http.test.ts -t 'upload over 5 MB is resumable in chunks and reports progress'
pnpm exec vitest run src/data/vault/drive-vault.test.ts -t 'a retry never sends twice a thing that arrived but whose answer was lost'
pnpm exec vitest run src/data/vault/drive-vault.test.ts -t 'first changes on separate clients are all visible after refresh'
```

These pin existing simulated cases; none observes Google or GitHub. Newly assigned tests can force GET→external PATCH→stale PATCH, partial Range/lost upload response, incomplete inventory seen by a second client, pending bytes unavailable after reload, callback/claim replay and report-save failure. Build those in an assigned scratch/isolated target with assertion-first proof and independent expected results; do not register planned names as existing green verifies. Compatibility fixture preparation and owner-policy alternatives can proceed without credentials. Serialized schema adoption waits on relevant probe results.

## Blocking evidence and next setup

R1: no observed provider-enforced atomic content/name/place precondition or accepted safe remedy. R2: actual grant/client visibility, identity/folder lifecycle, external transport and browser session proof absent. R3: authorized no-model workflow/startup and actual dispatch/callback evidence absent; local control-double tests cannot certify production recovery. R4: actual upload interruption/reconciliation and platform retention evidence absent; reload policy remains owner-pending. These block dependent O3 acceptance and P2 closure, not unrelated P2 repairs or local fault/fixture design.

The next authorized action in this assignment is returning this packet. The coordinator should obtain owner-provided resource boundaries through the normal setup route and issue an execution packet. Minimum Drive setup: isolated synthetic users/project, preauthorized same-client test sessions, allowlisted disposable root, bounded reads/writes/Bin cleanup and explicit project-revocation authority. Minimum executor setup: owner-provided disposable repo/default-branch workflow SHA, dispatch/artifact read permissions, runner/budget ceiling and optional callback collector. Minimum browser setup: prepared HTTPS scratch/session targets, reserved desktop/Safari/home-screen device and origin-only cleanup. Do not ask for secret values in chat, reuse unverified tokens, presume access to the owner's repository, acquire broad grants or deploy a Worker to unblock this packet.
