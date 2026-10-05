# Independent bounded local OAuth observer review

Reviewer `/root/approved_policy_slices`; date 2026-10-05; plan contracts-2/P2 O2 R1/R2/R4, production source44ee162. This is an instrumentation review, not OAuth/provider/contract/P2 acceptance.

Inspected only `/private/tmp/bower-google-probe-observed-serve.mjs` and relevant unchanged reviewed v3 `oauth-local.mjs` source. No private configuration/credential/session file was opened. No execution, browser, provider, build, repo/Git mutation, delegation or closure. Scratch report only.

Pinned observer SHA-256: `beaf08d22318bd72890979d026233cd36cb0aa053f00403461d188e4c52a8f46`.
Pinned v3 OAuth source SHA-256: `4b2b2f641c56fbf7b89f39acd3aa4f8c6ef79617e6a315b9686777e8198fb733`.

## Result

No Critical or Important instrumentation finding. **One Minor evidence gap** below; no unsafe logging or authorization/response/transport mutation observed in this pinned script.

### Minor — response finish does not establish whether an absent request was delivered

Observer lines8–20 installs a request listener but emits only `local_response` after response `finish`. A POST/start request could arrive and remain unfinished or abort before finish, leaving the same absence of telemetry as an undelivered click. Therefore “no POST response recorded” cannot support “click not delivered.” This directly limits the stated diagnostic goal; it is not a product/OAuth/provider defect.

Small correction: emit a separate `local_request` event immediately after classifying the existing whitelisted method/route (same method/route fields only); retain current finish event/status/Boolean classification. No body/query/cookie/header/code/token inspection or authorization mutation is required. Alternatively keep the script unchanged and label every absence **inconclusive/unobserved**, but that does not distinguish the requested receipt case. Renewal review should pin corrected script bytes before the one-repeat observation.

## Safety and scope checked

- Request classification reduces exact route names to `/`, `/start`, `/auth/callback`, `/complete`, otherwise `other`; only GET/POST, otherwise `other`. Full path/query, callback code/state, arbitrary method or path bytes are never logged. Request/body/stream is not consumed by the observer; it adds one EventEmitter listener without replacing the reviewed handler.
- Response classification reads location transiently, constructs URL only to compare exact origin with fixed `https://accounts.google.com`, then emits one Boolean. Header/URL/query values, credential paths, config/project/account bindings, provider payloads and exceptions are not emitted. Invalid location parsing is classification failure only, safely false. Reading a header is not changing it; no setHeader/writeHead/end/status mutation exists in observer.
- It invokes unchanged `serve(config)` with no injected transport/exchange/save/authorization options. Reviewed serve validates explicit approved===true/current authority at startup and each relevant stage, bounded server lifetime, private client/session handling, fixed loopback callback/host, same-origin start, cookie/CSRF/state/nonce/PKCE and one consumed flow. Observer cannot turn an invalid config into a grant. Its CLI has no duplicated --authorized-execution flag, but direct serve still enforces authority; root's prepared private config remains mandatory.
- Observer SIGINT/SIGTERM handling calls only returned server.close, matching reviewed scaffold shutdown. Existing timer/close handler clears flow and emits sanitized stopped. Already-issued I/O may settle; stop is not proof of remote cancellation, session deletion, rollback or revoked grant. Close only root-owned previous listener/tab before repeat; do not stop unrelated processes. Preserve cleanup instructions for any privately saved session.
- Generic top-level refusal prints no exception/stack/private path. Existing reviewed safe events use only alias/status; instrumentation does not modify their meaning. No callback/token endpoint logging introduced.

## What the one repeat may demonstrate

`local_request POST /start` establishes observer receipt of that local route. `local_response POST /start status303 redirectsToGoogle:true` establishes the local response finished with a Location classified as Google-origin. It does not establish browser-followed navigation, consent, provider receipt, token exchange, credential identity, Drive scopes/access, successful grant or any R1/R2/R4 data effect.

Request without finish: received but completion unobserved; investigate only within allowed observation, no automatic replay or blame assignment. Neither request nor finish: request unobserved during the bounded interval, not a proven cause. Finish303 plus unchanged browser landing: local redirect sent, navigation unobserved; no unsupported CSP/browser/provider cause claim. Refusal400: local refusal, not a provider failure. Separate actual reviewed `authorization_saved` event is stronger local session-write observation, but provider/identity/Drive claims still require their planned validations.

This review authorizes no external action by itself. Root retains the serialized one-repeat reservation and action-time confirmation requirements. Original attempt remained local with no captured warning/error; neither that result nor this source review certifies a grant or probe.


## Renewed review — corrected observer

Revised observer SHA-256: `60d93a371451eb2174f318926c07c1690c145a6dfebbd806abb7251ae2a8b001`.
Reviewed v3 OAuth source SHA-256 remains `4b2b2f641c56fbf7b89f39acd3aa4f8c6ef79617e6a315b9686777e8198fb733` (unchanged).

The added immediate `local_request` event uses the same whitelisted method/route and three Boolean fields only: `hostMatches` against fixed localhost:8788; `originMatches` against the validated fixed loopback redirect origin; `bindingCookiePresent` tests only presence of the expected cookie name, without extracting/logging its value or proving equality. The fixed port matches unchanged serve default; new URL construction uses already validated redirectUri. No new authorization, response/header/body/transport mutation, external dispatch or private string output appears. Existing request/response guards and stop handling are unchanged.

**Renewed result: clean; no remaining Critical, Important or Minor instrumentation finding.** The prior Minor request-receipt gap is corrected. Root's preceding stop events/refusal do not identify cause; this review reports source inspection only. Missing request evidence is still “unobserved,” never proof of an undelivered click. A true cookie-presence Boolean does not mean cookie validation succeeded; origin/host Booleans describe only exact local header comparisons, not principal identity or granted access. Request plus finished303/Google-origin Boolean proves only local request/redirect response observations. All original provenance/runtime/confirmation/one-repeat limits remain.

No credential/config/session data was read and no execution was performed during renewal. Root may use this clean bounded source review for its separately authorized serialized observation; no provider effect, consent/token, O3 or P2 acceptance claim.
