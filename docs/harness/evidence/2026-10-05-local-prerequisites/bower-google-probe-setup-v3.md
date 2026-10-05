# Google setup v3: existing callback reuse and CSP correction

Prepared2026-10-05 by `/root/google_setup_rework`, plan **2026-10-05-contracts-2**, P2, O2/R1/R2/R4, C01/C02/C03/C14/C15. Integration reference **f739b5c178c67a1d4dc93ace25a8c595d8cbd27e**, production **44ee162abfeb77ec168d18b5e66cd24a43619915**. Loader intentionally retains907c9f8 and legacy7a5b1d0; no product/source/shared-record/Git/gate/build/browser/Google operation was made by this worker. v2 remains unchanged. This scratch packet is not a feature closure, accepted contract or phase acceptance.

**Current authority and inventory.** Root reports owner-approved bounded use of the existing Google project/repository and designated account, with synthetic content only; offline cached read-only and upload best-effort/reselect policies are already approved. Do not ask for generic approvals again. Root read-only actual Google UI inventory confirms the existing Web client has `http://localhost:8788/auth/callback` beside its production callback, zero JavaScript origins, External/In production audience and no declared scope rows. These are coordinator observations, not worker/provider executions, and do not prove consent, token scopes, identity, API access or readiness. Real project/client/account/domain IDs and secret values are excluded from this packet. The secret is masked and no longer downloadable from the inventory UI; an original secure existing export is still needed, without rotation or creating a new secret. Account A has a live dependency: **never revoke its project grant**. B consent remains missing; no new account creation is requested.

## Exact delta

- Fixed callback constant becomes **http://localhost:8788/auth/callback**, server default port8788 with IPv4 loopback-only bind127.0.0.1. This is one literal callback, not configurable arbitrary origins/paths. Open the local landing using **http://localhost:8788/**; the127.0.0.1 URL alias is deliberately refused. The fixed client's exported redirect list must contain the existing callback.
- Host is exactly `localhost:<owned server port>` and POST Origin exactly `http://localhost:<owned server port>`. Test-only port0 obtains an ephemeral local server; real CLI retains8788 and the external authorization URL always uses the fixed8788 callback. Old callback path, trailing slash and child paths are refused. Existing HttpOnly/SameSite=Lax/path=/ cookie binding, random browser token, CSRF form, state/PKCE/nonce/replay checks remain. Tests prove wrong hosts/origins/cookies/forms/paths do not exchange or save; the one valid callback does each once.
- After root's actual native CSP red/control, document response policy becomes exactly `default-src 'none'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'`. Only Google's fixed authorization origin is added. The redirect URL still has fixed Google origin/path, while Origin/CSRF/browser/state/expiry guards and no-store/no-referrer remain. No arbitrary form destination, unsafe wildcard or removed directive is introduced.
- Moving a packet must not make old public packet directories eligible for credentials. Config and private real-parent checks now exclude original, v2 and current v3 packet directories. Actual local assertion red preceded this correction. No private record was read or written into a public packet.
- All v2 authorization lifetime/per-dispatch guards and exact saved grant/token/opaque-subject checks remain. New flow/server eligibility caps, code exchange/JWKS/refresh/Drive retries refuse expiry. Previously issued I/O can finish; no cancellation, rollback, atomic precondition or exactly-once guarantee is claimed. Refreshed sessions preserve the originally verified subject; aliases are not identity proof.

## Actual evidence

| File in v3 | Result and provenance |
| --- | --- |
| callback-reuse-red.log | Initial literal-callback assertion fails against copied v2 (one AssertionError). |
| callback-reuse-config-red.log | Refined assertion proves old validator refuses the already registered callback; one AssertionError, no socket/provider call. |
| csp-policy-red.log | Local actual response header lacks fixed Google allowance; one AssertionError before CSP source correction. Node reads Location without following it. |
| packet-path-red.log | Old v3 copy accepted a credential path under previous public packet; one AssertionError before directory exclusion correction. |
| self-check-v3-final.log | **30pass/0fail/0skip**: 26 retained mechanics/expiry/grant/adapter checks, three callback/resource-path controls and one CSP-header/redirect control. |
| syntax-check.json | Seven executable positive-suite/module files pass node --check, each exit0. |
| root-csp-evidence/* | Byte copies of root's actual native two-origin fixture/events/report, attributed to root; worker did not run a browser. |

Native proof: root used IAB with two synthetic IPv4 loopback origins. Original self-only form-action sent POST/start but issued no destination request, and source URL/page stayed visible. The control adds only its fixed local target origin: POST/start then exactly one GET/result with visible Synthetic redirect arrived. Incidental favicon GET remains recorded. An initial counting assertion incorrectly included favicon; corrected exact-result assertion passes against unchanged events. Native console capture was empty, so **no console CSP violation message is claimed**. This demonstrates that browser's redirect restriction and a matching fixed-origin remedy; it does not certify actual Google navigation/consent/cookies, HTTPS target behavior or a whole OAuth flow. Local v3 header test proves exact production policy/authorization origin string, not a native request to Google.

All worker local transports use only synthetic files/functions/generated RSA keys and short-lived ephemeral loopback listeners closed in finally. No real config/client export/session, browser navigation, Google endpoint, personal content, external ID or provider network request was used. Original v2 hashes/baseline copies are preserved; see packet-hashes.json for exact identities. v3/baseline intentionally contains original v2 modules only; current positive commands select explicit tests.

```sh
cd /private/tmp/bower-google-probe-setup-v3
node --test self-check.test.mjs review-regressions.test.mjs callback-reuse.test.mjs csp-policy.test.mjs
node --check oauth-local.mjs
node --check adapter.mjs
node --check inspect.mjs
```

## Concrete next access and operation

1. Obtain independent affected-delta review of this exact immutable packet and confirm callback/browser/port reservation. No Google client, scope, audience or URI changes are proposed by callback-proposal.json; inventory showed the needed callback already registered. Preserve all existing configuration.
2. Owner delivers **the original existing Web-client credential export** through a secure/private file or managed credential channel. Do not paste client secret in chat, command arguments, screenshots, repository/evidence or logs. Do not create/rotate a secret or client. Put the explicitly named file in an owner-only mode700 directory outside both repositories and every public packet; file mode600, no symlink. Export must match privately confirmed project/client and existing callback; editing a private export's URI list is never proof of Console registration. Root already knows project ID; do not request it again.
3. Root prepares private A/A2/B configurations and an exact serialized execution packet: main requested scopes remain `openid` plus full `https://www.googleapis.com/auth/drive`, with already authorized synthetic allowlists/budgets and a short reference/expiry. Optional drive.file comparison, provider revocation, API enablement, client/scope/audience changes, billing or production replacement are outside this packet. Declared Console rows being empty does not prove a grant or justify changing them. Full Drive OAuth is account-wide; **folder bounding is an operator allowlist, not provider-enforced scope**.
4. After review and owner interactive consent availability, root validates the explicitly supplied private configuration, checks8788 is free and starts only its owned listener. Open **http://localhost:8788/** in a normal authorized browser/profile. Owner handles login and exact consent. Existing Web-client PKCE enforcement, actual scopes and local callback still require real observation. Tokens stay server-side private; the harness never prints code/token/body/subject/email/provider URL. Missing/refused consent or identity/scope mismatch stops the flow; do not blindly retry it.
5. Use separately issued same-A/A2 sessions for overlapping clients and actual different B subject for R2 isolation. Compare verified opaque subjects privately, recording only equality/inequality and aliases. A designated account with live dependency is **excluded from grant revocation**; any future R2 narrower synthetic permission removal requires its own explicit reviewed case. No second account creation is requested here; B interactive consent is a concrete remaining dependency.
6. The included inspect command remains an allowlisted bounded **GET smoke**, not R1/R2/R4 acceptance. Operator must prepare synthetic resources using a separately reviewed bootstrap/case shim before it can inspect them; do not discover or reuse personal/live content by broad search. R1 writes/lost-response barriers, R2 properties and optional scope controls, and R4 resumable/reopened upload remain absent. Each requires immutable reviewed case code and exact execution/resource budget before provider dispatch.

Prepared commands below are **not executed** and do not authorize themselves:

```sh
node oauth-local.mjs validate /ABSOLUTE/PRIVATE/PATH/config-A.json
lsof -nP -iTCP:8788 -sTCP:LISTEN
node oauth-local.mjs serve /ABSOLUTE/PRIVATE/PATH/config-A.json --authorized-execution
# Open http://localhost:8788/ only in the reserved normal browser/profile.
# Ctrl-C stops this listener; verify only its owned listener is gone.
node inspect.mjs /ABSOLUTE/PRIVATE/PATH/config-A.json /ABSOLUTE/PRIVATE/PATH/resources-A.json --authorized-execution
```

Default budgets remain bounded GETs (up to80 requests,15min,12MiB response/request),20-second request timeout and denied redirects/unknown routes/writes/IDs. Flow/server admission lasts no longer than ten minutes or packet expiry. The server's stop does not cancel already issued provider I/O. Auth expiry, alias/client/project/grant/resource mismatch, unapproved effects/billing, budget exhaustion or unknown applied outcome stops new dispatch; preserve unknown outcomes for recovery, never repeat writes blindly.

## Recovery and limits

No callback was added, so **remove none** during cleanup. Preserve localhost and production callbacks, empty JS origins, client/secret, project audience/scopes and live grants. Stop only owned local process/profile state; after retained sanitized evidence remove only dedicated private probe sessions/bytes. Named completed synthetic resources use reviewed Bin-only cleanup; never hard-delete, inspect personal documents, run old ingestion/tidy-up/deploy, revoke Account A grant or replace production. No such cleanup or remote effect was executed by this worker.

Actual OAuth/token/Drive access, identity A/B/refresh, exported credential validation against a real file, provider write conditions/lost responses, appProperties, extraction eligibility, resumable upload, Safari/home-screen/reopen/storage and all real **R1/R2/R4 remain NOT RUN**. The approved offline/upload policies still need product implementation/evidence; this scaffold does not implement them. New grammar, O3 acceptance, durable runner recovery, P2 acceptance or P3/P4 implementation is not granted. Prior reports are preserved as history; v3's existing-callback/no-change/recovery instructions supersede prior proposals to add/remove53682.
