# Google local setup v4 — immutable review candidate

Date: 2026-10-05. Plan: **2026-10-05-contracts-2**; P2/O2, bounded R1/R2/R4 prerequisite preparation, C01/C02/C03/C14/C15. Coordinator assignment target: **c0c547b**, source boundary **44ee162** (DriveHttp unchanged). Sole assigned implementer `/root/google_setup_rework`; root remains sole records writer, integrator and browser owner. This delivery modifies only NEW scratch v4 files; worker Add candidate666074f and older setup packets stay unchanged. No phase or entry closure.

## Result

One replacement public packet: `/private/tmp/bower-google-probe-setup-v4/`. Minimal OAuth source difference from byte-identical v3 baseline:

1. After exact Host and current eligibility checks, **only GET / with no query** sets `Referrer-Policy: same-origin` before rendering its form.
2. Public evidence path exclusion adds `/private/tmp/bower-google-probe-setup-v3` when the module moves to v4. Both lexical config validation and realpath private location validation use the same exclusion function.

Global response policy remains `no-referrer`, including start303, callback303/refusal, completion, invalid host/query/method/path and expired landing. Fixed localhost8788/auth/callback, IPv4 loopback listen, exact Host/Origin, browser cookie/CSRF, one flow/state, PKCE/nonce, token/signature/exact scopes/subject checks, authorization/server/flow expiry, new-external-dispatch guards and CSP remain unchanged. No acceptance of missing/null Origin. CSP remains exactly `default-src 'none'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'`. Adapter and inspect code unchanged. `oauth-v3-to-v4.diff` is the complete source delta.

## Why the correction is necessary

Root's separately reviewed sanitized observer actually saw local landing200 and POST/start400, exact Host true, cookie-name presence true and exact Origin false; no Google redirect. Cookie **presence** does not prove equality/CSRF validation. These observations establish a local refusal, not an invalid secret/provider failure or unavailable browser.

Root then ran a credential-free native fixture: no-referrer landing caused Origin classified null and400, while same-origin landing caused exact localhost Origin and200; cookie and CSRF equality both true in each. Retained fixture/events/screens are under `root-origin-evidence/`. Worker inspected those existing files and asserted the exact two event objects; worker ran no browser. The refusal screenshot is the actual v3 landing, and the accepted screenshot is the synthetic control; they are not v4/Google consent screenshots.

Root reviewed [Fetch Standard section3.2](https://fetch.spec.whatwg.org/#origin-header) on2026-10-05. Its non-CORS POST rules explain null Origin under no-referrer and retained Origin under same-origin policy. This causal interpretation is supported by root's native red/control, not by a new worker browser run. Native v4 form behavior and real Google OAuth retry still **NOT RUN**.

## Test-first evidence

Before changing source, v4's `oauth-local.mjs` and baseline copy both hashed exactly as reviewed v3: `4b2b2f641c56fbf7b89f39acd3aa4f8c6ef79617e6a315b9686777e8198fb733`. Adapter original/copy hash `4dad67460fc4c81e0c448123769b86e57d2e92961a01b41e0779f00870c4c3d8`.

Command (ephemeral local sockets, no provider):

```sh
node --test --test-name-pattern='only a valid plain landing|moved packet rejects' origin-policy.test.mjs
```

Actual exit1, **2 assertion failures**, no load/bind failures; preserved `origin-policy-red.log`:

- `only a valid plain landing sets same-origin for native POST Origin`: response header actually no-referrer, expected same-origin.
- `moved packet rejects both client and session paths in former v3 public evidence`: actual missing expected exception. The unchanged copied module did not exclude former v3 directory. The full final control checks both files and both exact directory/descendant paths.

After the two source edits, unchanged named assertions plus four additional controls: `node --test origin-policy.test.mjs` exit0, **6pass/0fail/0skip**, `origin-policy-green.log`.

New six-control coverage:

| Control | Verified local behavior |
| --- | --- |
| Valid plain landing | same-origin only here; no-store, fixed CSP and HttpOnly/SameSite=Lax cookie retained |
| Moved public packet | client/session configuration refuses former v3 exact directory and descendant paths |
| Invalid host/query/method/path | 400/404 retain no-referrer, fixed CSP/no-store; no exchange/save |
| Strict start | null/missing/other Origin, wrong cookie and wrong CSRF each400, no Location/exchange/save; subsequent correct start303 only fixed Google origin |
| Callback privacy | start303, wrong state, duplicate state, accepted mock callback303, complete200, replay/repeated start all no-referrer; accepted callback removes query via /complete, clears cookie, one exchange/save; response text omits synthetic code/token markers |
| Expired landing |400 before header exception, no cookie/exchange/save |

Full explicit command:

```sh
node --test self-check.test.mjs review-regressions.test.mjs callback-reuse.test.mjs csp-policy.test.mjs origin-policy.test.mjs
```

Actual exit0, **36pass/0fail/0skip/0cancelled**, `self-check-v4-final.log`. All30 prior positive tests retained, including pinned app/legacy adapter loading, source-derived authorization expiry at /start/token/JWKS/refresh/Drive retry and cache, strict approved/reference, saved-session validation, callback host/path/cookie protections and fixed CSP. Prior callback-reuse public-path test extended with current v4 directory; old v1/v2/v3 paths retained. `node --check` all eight modules exit0, `syntax-check.json`. Root retained native exact event assertions2pass/0fail, `native-evidence-assertions.json`.

Every local server closed in finally; no long-running listener/preview launched. Sandbox escalation was used only for authorized ephemeral synthetic loopback sockets. No public Google/Drive request, real config/credential/session read, UI operation, product edit, repository record/Git mutation, delegation or phase/entry gate/closure.

## Preservation and identity

`v3-preservation-check.json` confirms all23 declared v3 files/report hashes unchanged against its existing manifest. V4 `baseline-v3/` retains exact OAuth source, adapter and v3 manifest. Older v1/v2 directories untouched; v3's existing v2 hashes remain intact. All source/examples/tests copied through an explicit public filename allowlist, never a directory-wide credential copy. Root observer/fixture source is retained as provenance evidence only, not an executable v4 entry point.

V3 report hash remains `63225583a35b84d4ebd070bc7b383cf53ce35b9c2292fa4e1af4c90426ea018e`; v3 packet manifest hash remains `484ba84df5ba383221231e8b906736ce44ef6d37dc2560206a4cfdd4b17044b8`. V4 exact file/report hashes and counts: `packet-hashes.json`. This report is immutable after manifest publication; any correction requires a new reviewed packet.

## Concrete next handoff and limits

Root already privately matched the owner-supplied existing Web client and validated its restricted local format under reviewed v3. Do not request a new client, secret rotation, original export or new account on the basis of this delivery. Existing registered callback and production callback stay intact; no new redirect/origin/audience/declared-scope configuration is proposed. Placeholder example config defaults to unapproved/expired and never grants execution authority.

Next: fresh independent review of this exact v4 identity; after root's product browser freeze is released, root may prepare a fresh current bounded execution packet and perform one serialized native OAuth retry for the designated identity. Actual new/broader security grant requires root's concrete consent action-time confirmation. Interactive Account B consent remains missing; this delivery does not manufacture it. Account A's live project grant must never be revoked. Root alone handles private paths/material; no raw real IDs/config/client bindings appear here.

Real secret validity, actual owner login/consent/token persistence, provider-granted exact scopes, Drive list/read/fixture bootstrap, cross-identity boundaries, upload/reload/offline effects, revocation/recovery and R1/R2/R4 results remain unverified or separately NOT RUN. No inferred cure of Google/provider behavior from36 synthetic controls. Transport permits only bounded read-only GETs; this package has no upload/bootstrap-write/revoke operation. Stop only an owned listener/tab; shutdown does not cancel or roll back issued I/O. Preserve dedicated evidence, then clean only dedicated private probe session material through the root-owned approved recovery; never the live client/grant.
