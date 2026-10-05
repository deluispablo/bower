# Independent Google setup v2 review

Plan **2026-10-05-contracts-2**, P2, O2/R1/R2/R4; C01/C02/C03/C14/C15. Assignment `/root/prerequisites_review`. Frozen packet references integration `fe9a965d478fbe35b7f21eaa84d500cf590cf362`, production `44ee162abfeb77ec168d18b5e66cd24a43619915`; root working HEAD at review startup was clean `f739b5c178c67a1d4dc93ace25a8c595d8cbd27e`, following naming proof commits48e6544/f739b5c. Source unchanged per assigned packet; loader intentionally pins prior identical adapters at907c9f8 and legacy7a5b1d0.

Inspected public v2 report/modules/examples, recorded hashes and supplied red/green/syntax logs, prior renewed review and pinned DriveHttp compatibility. No tests, scaffold, server, build, browser, provider request, credentials/private configuration or repo mutation was executed. Only this scratch report was written. Read-only primary CSP specification and WPT source research was used to verify the browser-path concern below; no OAuth/Drive endpoint was called.

## Verdict

**Changes requested / one Important browser-path concern.** The prior Important dispatch-expiry and two Minor grant/approval findings are resolved in the reviewed source and supplied local evidence. The newly identified CSP concern is source/specification-derived, not a reproduced local or real Google failure. Do not describe OAuth as tested or ready for owner consent until a bounded browser reproduction/disproof and any correction are complete.

### Important: form CSP can block the authorization redirect

Reference: `/private/tmp/bower-google-probe-setup-v2/oauth-local.mjs:172`, :182–191; `self-check.test.mjs` loopback callback test.

The landing document sets `form-action 'self'`. Its Continue to Google form submits POST /start, and the handler returns303 Location at the accounts.google.com authorization endpoint. That external redirect target is absent from the form source list. Form-submission navigation is checked against form-action; a browser applying the restriction across redirects blocks the entry journey before consent. The local loopback tests use Node fetch with redirect=manual and read Location; they do not apply a document CSP or prove a browser follows it.

Primary support: [W3C CSP3 form-action pre-navigation check](https://www.w3.org/TR/CSP3/#directive-form-action) defines source-list checks for form submissions. The maintained [Web Platform Tests POST form redirect-blocked fixture](https://raw.githubusercontent.com/web-platform-tests/wpt/master/content-security-policy/form-action/form-action-src-redirect-blocked.sub.html) submits to a same-origin redirect with form-action self and expects a CSP violation for its cross-origin destination. These sources support the concern; they do not certify the actual selected browser/version or this harness.

Recommended next step: reserve a root-only two-origin loopback browser reproduction with synthetic form/redirect and no Google request or credential. Record the actual CSP violation/navigation and matching allowed control. Then permit only the required fixed authorization origin in the policy (for example form-action self plus https://accounts.google.com), or use a separately reviewed navigation mechanism while retaining POST/Origin/CSRF/state guards. Do not remove the directive wholesale, add arbitrary destinations or weaken browser binding. Obtain renewed affected-delta source review and positive browser control; exact Google consent remains a later authorized runtime observation.

## Prior findings resolved

Strict config guard at oauth-local.mjs:34 requires literal true, a nonblank string reference and finite future string expiry. startFlow at :59–64 caps lifetime by packet expiry; server at :155–165/:187–195 rechecks eligibility after asynchronous setup/form input and before exchange. Listening-time race and admission shutdown are handled at :207–214. This is a local operator guard, not cryptographic evidence of owner authorization.

Each new token exchange, JWKS fetch and refresh goes through fetchJson at :91–99, which checks current authority immediately before dispatch. readOnlyFetch adapter.mjs:62–67 checks authority for every request, including DriveHttp retry after a token was cached. makeAppAdapter at :88–91 wires this same transport into unchanged DriveHttp using its actual fetch option. Existing403/429/401 retry/error behavior is traced rather than replaced. Already issued replies may settle after expiry; neither cancellation, rollback nor provider atomicity is claimed.

Saved-session shape/scope checks at oauth-local.mjs:115–120 precede cached use and refresh (:127/:131). Client/project/alias/scope labels, nonblank token strings, finite positive expiry, bounded nonblank subject and an exact unique scope array are required. New refresh state is checked before persistence, retains original subject and only falls back to validated scopes when scope is omitted. It does not authenticate a maliciously edited owner-private record or prove A/B account separation; real subject comparisons remain mandatory.

The supplied final positive command selects only self-check.test.mjs and review-regressions.test.mjs; archived baseline-review intentionally red is correctly excluded. review-red-complete logs12 AssertionErrors/1pass and saved-grant-red logs2 independent AssertionErrors. Initial EPERM is excluded from assertion-red claims. Final log records26pass/0fail/0skip and syntax file records five successful modules. I inspected those logs and meaningful assertion paths, but did not rerun them. Prior baseline module hashes match the previously reviewed original packet.

## Controls and remaining evidence limits

Read transport still limits Google Drive origin, GETs, explicit IDs/parent listing, parameters, request/time/body bounds and redirects; writes/bootstrap/upload/revocation are absent. Pinned loader limits dependencies and suppresses ID-bearing adapter diagnostics; inspect prints only aliases, counts and decoded-text hashes. Text hashes are not original raw-byte fidelity. Local private-location checks and existing-file validation remain; exported real-client parsing, identity, actual OAuth/Web PKCE behavior and credential lifetime are unobserved.

Cleanup instructions correctly retain existing live callbacks/client/audience/scopes/grants, remove only a proved newly-added callback and use Bin only for reviewed synthetic resources. Live grant revocation/rotation/deployment/old ingestion is excluded; no programmatic revoke endpoint exists. Resource reuse and policy approvals are coordinator-supplied authority, not new grants issued by this review.

Real R1 writes/barriers/lost responses, R2 properties/identity/revocation and R4 resumable bootstrap/upload scripts are absent and NOT RUN. Future write/upload shims require their own immutable independent review and bounded execution packet. This read smoke cannot close those probes, C01/C14, offline/upload implementation, ownership format, durability/atomicity/exactly-once or P2 acceptance. No product/Worker interface or next-phase implementation was approved.

## Packet identity

Read-only inspection confirms all20 files in packet-hashes.json match recorded bytes/SHA256 and the supplied report matches its recorded identity.

- v2 report: `89a14c49f90345cf76415724407352ade42b01acd76adc408f6e9b07aa66fa41`
- packet-hashes.json: `972ef1b6b71036795c9a1922c99eb39bfff8c851d0f9c79bb6a669cd3c83da2e`
- oauth-local.mjs: `108dd2042d903b0a388e7139062b07853f2e6ab89e791d8741876e16fd5bc116`
- adapter.mjs: `4dad67460fc4c81e0c448123769b86e57d2e92961a01b41e0779f00870c4c3d8`
- review-regressions.test.mjs: `17c1c4e5910bffd03d0c62eb0737059d1870c0a01638c4935d611c3134e5b333`
- supplied final local log: `9d2985248d4b79e4b63e2338fb24db7c8db54995e048ae8ba1c43b7dc706b8be`

Later relevant changes require renewed review. Original and replacement packets were left unchanged.
