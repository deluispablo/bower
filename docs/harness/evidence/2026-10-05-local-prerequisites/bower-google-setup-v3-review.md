# Independent Google setup v3 affected-delta review

Plan **2026-10-05-contracts-2**, P2, O2/R1/R2/R4, capabilities **C01/C02/C03/C14/C15**; reviewer `/root/prerequisites_review`. Immutable app referencefe9a965/source `44ee162abfeb77ec168d18b5e66cd24a43619915`; clean actual integration HEAD at review startup `f739b5c178c67a1d4dc93ace25a8c595d8cbd27e`, which is v3's recorded target. Reviewed exact frozen v2→v3 modules/public examples/report/manifest, supplied local logs and root-provided native CSP fixture/events/report. Prior reviews/packets remain unchanged.

No test, scaffold, browser, server, provider request, credential/config file, build, Git mutation or repository/shared record write was performed. Read-only local byte/hash/source inspection only; this scratch report is the sole output. No phase/feature closure or architecture adoption.

## Verdict

**No unresolved Critical, Important or Minor finding in this affected setup delta.** The prior Important CSP redirect concern is corrected at source level with the fixed authorization-origin allowance and supported by supplied root native synthetic reproduction/control. This verdict clears the reviewed local preparation scope, not actual OAuth/Drive execution or full acceptance.

The callback constant and default listener now consistently use the already registered `http://localhost:8788/auth/callback`; listener binds only127.0.0.1. Exact Host uses localhost plus owned port and exact POST Origin uses the same HTTP origin. The127 alias, other host/case/port, HTTPS origin and absent/null Origin refuse. Callback path is exactly/auth/callback; old path, trailing slash and child path do not reach exchange. HttpOnly/SameSite=Lax cookie, random browser binding, form CSRF, one-use state, nonce/PKCE and expiry/replay guards remain. Ephemeral test port is injected only into local request handling; fixed OAuth redirect still8788. Actual native localhost resolution, cookie return and normal-browser Google callback are not proven by the Node controls and remain runtime observations.

CSP at oauth-local.mjs:174 adds only `https://accounts.google.com` to form-action self; default-src none and frame-ancestors none remain. startFlow still constructs the fixed accounts.google.com/o/oauth2/v2/auth URL; no wildcard/arbitrary form destination appears. Origin/CSRF/state checks and no-store/no-referrer are retained. Root's native evidence shows two POST/start events: the self-only case has no target request before control; the allowed-origin control has one targetGET/result, plus separately recorded favicon. The fixture matches form→303 cross-origin behavior. Root reports actual target heading/URL and empty console capture; no CSP console message or real Google behavior is invented. The supplied v3 local policy test checks exact header/Google URL without following it. Source remedy plus root native allowed control resolves the prior concern within the declared preparation scope; it is not a native real-Google positive test.

Config and resolved-private-parent checks exclude original/v2/current public packets. The retained path red demonstrates previous public-directory acceptance; new controls refuse client/session paths under each known packet. No secret file was inspected or written into a public packet. Existing mode/owner/symlink/source-directory checks remain. Moving a future packet still requires reviewing its excluded evidence roots; no universal filesystem-confidentiality mechanism is claimed.

Adapter/inspect modules are byte-identical to v2. All prior strict boolean/reference/expiry, start/callback eligibility, per-dispatch token/JWKS/refresh/Drive-retry and saved exact grant/token/subject validation paths remain intact. The26 previous tests change only literal loopback host/callback references; assertion timing/behavior remains. Additional four tests cover callback acceptance/refusal, packet paths and exact CSP/redirect policy. Supplied final log records30pass/0fail/0skip and seven syntax modules exit0. Callback literal and refined-validator red logs each contain one AssertionError; CSP-header and packet-path reds each one AssertionError. These supplied tests were inspected, not rerun; historical reds are not combined as independent behavioral failures merely to inflate counts.

## Access and recovery limits

Actual registered-client inventory and owner authority are coordinator-provided facts, not independent provider observations by this reviewer. callback-proposal.json proposes no add/remove/origin/client/scope/audience change. Cleanup correctly removes no pre-existing callback, preserves live configuration/grants and excludes account-A project-grant revocation or secret rotation. Tokens use explicitly supplied owner-private original export/session paths; no credentials in arguments, URLs or evidence are requested.

Original private client export and normal interactive owner consent remain missing. Real identity/subject A/A2/B, exact granted scope/refresh, exported-client validation, Web PKCE enforcement, API access and localhost HTTPS-provider redirect behavior remain NOT RUN. Aliases do not prove identity; broad Drive scope is not provider folder isolation. Read smoke enables bounded GET only, with future synthetic bootstrap/write/upload cases separately reviewed and authorized. This packet cannot pass R1/R2/R4, offline/upload policies, raw ownership adapter, durable runner semantics, atomicity/exactly-once, app account isolation or P2 acceptance. No permission to inspect personal content, old ingestion/deployment or start P3/P4 follows.

## Immutable identities

Read-only identity inspection confirms all22 files in packet-hashes.json and its report match recorded byte counts/hashes; copied baseline oauth/adapter match unchanged v2.

- v3 report: `63225583a35b84d4ebd070bc7b383cf53ce35b9c2292fa4e1af4c90426ea018e`
- packet-hashes.json (actual full SHA256): `484ba84df5ba383221231e8b906736ce44ef6d37dc2560206a4cfdd4b17044b8`
- oauth-local.mjs: `4b2b2f641c56fbf7b89f39acd3aa4f8c6ef79617e6a315b9686777e8198fb733`
- adapter.mjs: `4dad67460fc4c81e0c448123769b86e57d2e92961a01b41e0779f00870c4c3d8`
- supplied local final log: `51d952016acea1e6e97a40862d1566685561804f278b896e98864cab98120a9a`
- root native proof copy: `45de47b9247f8a67804b02dd9a5d85903202454cdbaae206c4ce6281b9ec3bb0`
- native event copy: `a23cabc261a7586b8b9f3a0bb50b0881cbe2221875c92853ee6b1142154ab830`

The assignment's abbreviated packet hash omitted the `23` within `...383221231e...`; the full actual hash above is authoritative for this inspected file. No candidate change was made. Later affected changes require renewed review.
