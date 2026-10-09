# P3 security review: the Worker and the runner

Entry `security-review` (P3-19, [TL-P3-26](2026-10-07-tl-p3-26-security-review-and-freeze.md) point 2). Reviewed at `2de07f2` (branch `claude/p3`), read-only for product code. Scope: `api/src/**`, `api/wrangler.jsonc`, `runner/src/**`, `runner/workflows/tidy.yml`, `scripts/deploy-staging.sh`, `scripts/new-instance.sh`, the app's Worker client `src/data/worker/worker-http.ts`, the worker contract, `docs/runbook.md` and `docs/harness/STAGING.md`.

Standards: [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/tree/v5.0.0) (requirement ids from its `5.0/docs_en` JSON export) and [GitHub Actions security hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).

verdict: FINDINGS (8)

## Findings

Each line: id, severity, what, evidence, then the suggested fix entry.

- F1 Important A refresh token the Worker cannot decrypt (after a `TOKEN_ENC_KEY` rotation) answers 500 `internal` on every `GET /drive/token` and runner token call, forever: `decrypt` throws a `CryptoError` outside any handler (`api/src/drive-token.ts:64`, mapped to 500 by `api/src/errors.ts:104`), and signing in again keeps the unreadable token, because Google sends no new refresh token without consent and `signIn` keeps the old one (`api/src/person.ts:134`), so the callback never asks for consent (`api/src/auth.ts:257`). Proven with a throwaway probe against the real routes (500 `internal`, no cookie cleared; `signIn` without a token answers `hasRefreshToken: true`). Fix: treat `decrypt_failed` as Google's `invalid_grant` (`forgetGoogleAccess`, 401 `signed-out`), so the next sign-in asks for consent; ASVS V13.3.4, V16.5.1. Missing test: `an unreadable refresh token signs the person out and the next sign-in asks for consent`; entry: `token-key-rotation-reconsent`
- F2 Important `tidy.yml` uses `actions/checkout@v5` and `actions/setup-node@v5` by tag, not by full commit SHA (`runner/workflows/tidy.yml:30`, `:34`). The job holds the run ticket in `GITHUB_EVENT_PATH`, which opens a full-`drive` access token for the person (`api/src/runner.ts:122`): a moved tag runs someone else's code with that ticket. GitHub hardening, "Using third-party actions": pin to a full-length commit SHA; keep the tag in a comment. Missing test: a docs test that every `uses:` in `tidy.yml` is `@<40 hex>`; entry: `tidy-pin-actions`
- F3 Important The app's own document is served with no `Content-Security-Policy`, `frame-ancestors`, `Strict-Transport-Security` or `X-Content-Type-Options`: static assets bypass the Worker (`api/wrangler.jsonc:10` runs it first only on its own paths), and there is no `public/_headers`, although `api/src/security.ts:39-42` says the app's document "carries the full policy". The page holds a full-`drive` access token in memory (`src/data/worker/worker-http.ts:72`), so CSP is the standard containment for any script injection. ASVS V3.4.1, V3.4.3, V3.4.6. Fix: a generated `public/_headers` ([Cloudflare static assets headers](https://developers.cloudflare.com/workers/static-assets/headers/)) with a CSP that allows only the app, Google's APIs and the Worker, and correct the comment. Missing test: `the built app ships its security headers`; entry: `app-security-headers`
- F4 Minor The session cookie `bower_session` and the OAuth cookie `bower_oauth` have no `__Host-` prefix (`api/src/session.ts:317`, `api/src/auth.ts:55`). They are `Secure; HttpOnly; SameSite=Lax`, with `Path=/` and `Path=/auth`. ASVS V3.3.1 (L1) and V3.3.3 (L2). Renaming signs everyone out once; the OAuth cookie needs `Path=/` to take the prefix; entry: `cookie-host-prefix`
- F5 Minor The runner writes a note's path to the Actions log when an edit does not read back (`runner/src/effects.ts:85`). The runbook says the instance repository's run history "holds no folder content" (`docs/runbook.md:114`); note names are the person's content. ASVS V16.2.5, V14.2.4. Fix: log the operation ordinal or file id, as `runner/src/still-as-seen.ts:61` does; entry: `log-no-folder-content`
- F6 Minor An unreadable journal file is logged as V8's `SyntaxError`, whose message quotes the start of the file's text (`src/data/spine/plan.ts:301`; checked: `Unexpected token 'm', "{"rule": my secret "... is not valid JSON`). The same shared plan runs in the Worker's admission (`api/src/process.ts:177`, Workers logs are on, `api/wrangler.jsonc:14`) and in the runner. ASVS V16.2.5. Fix: log the file id and "not valid JSON" only; entry: `log-no-folder-content`
- F7 Minor `new-instance.sh` updates an existing repository without checking that it is private (`scripts/new-instance.sh:110`): pointed at a public repository by mistake, it pushes the runner there, and every later tidy-up's log is public. Fix: refuse unless `gh repo view --json visibility` says `PRIVATE`; entry: `instance-private-check`
- F8 Minor After "Delete my account" the person's address stays on the KV allowlist (`allow:<address>`, `api/src/store.ts:14`; `api/src/me.ts:40` empties only the person object). That is the operator's invitation, not the person's data, but the runbook's "Deletion" (`docs/runbook.md:108-114`) and "Accounts" (`:16`) say nothing else is kept. Fix: say so in the runbook (the operator removes the invitation by hand); entry: `deletion-allowlist-doc`

Known, not a new finding: `scripts/deploy-staging.sh:177` refuses when wrangler's output contains `bower-api` anywhere, which false-alarms on the account's `<account>.workers.dev` subdomain (STAGING.md, deploy of `5a4ab04`). The entry `deploy-staging-production-check` is fixing it in another checkout.

## ASVS 5.0 requirements checked

| Id | Result | Evidence |
| --- | --- | --- |
| V3.3.1 | finding F4 | `api/src/session.ts:317`: `Secure` set, no `__Host-`/`__Secure-` prefix |
| V3.3.2 | pass | `SameSite=Lax` on both cookies (`api/src/session.ts:317`, `api/src/auth.ts:55`); Lax is needed for the Google callback's top-level navigation |
| V3.3.3 | finding F4 | as V3.3.1 |
| V3.3.4 | pass | `HttpOnly` on both cookies; the app never reads them (`src/data/worker/worker-http.ts:112` uses `credentials: 'include'`) |
| V3.4.1 | pass for the Worker, finding F3 for the app document | `api/src/security.ts:49-52` (one year, `includeSubDomains`) |
| V3.4.2 | pass | CORS answers only `APP_ORIGIN`, with credentials, on every route (`api/src/security.ts:23-31`, mounted globally at `api/src/index.ts:36`); `X-Bower-Place` and `X-Bower-Epoch` allowed (`:29`) |
| V3.4.3 | finding F3 | the Worker's own answers carry `frame-ancestors 'none'` only (`api/src/security.ts:53`); no CSP on the app |
| V3.4.6 | pass for the Worker, finding F3 for the app document | `api/src/security.ts:53` |
| V3.5.1 | pass | every cookie write checks `Origin` (or `Referer`) against `APP_ORIGIN` before the session: `/auth/logout` `auth.ts:271`, `/session` `session-lease.ts:102`, `/process` `process.ts:192`, `/vault` `vault.ts:412`, `DELETE /me` `me.ts:24`; JSON bodies required where read (`security.ts:114`) |
| V4.1.1 | pass | Hono's `c.json` sets `application/json`; errors share one shape (`api/src/errors.ts:98`) |
| V4.1.3 | pass | the client IP comes from `cf-connecting-ip` first (`api/src/security.ts:187`); only the unmounted rate limits use it |
| V7.2.1 | pass | the session is verified only by the Worker (`api/src/auth.ts:98-116`) |
| V7.2.4 | pass | a new session with a fresh `sid` at every sign-in (`api/src/session.ts:121`, `api/src/auth.ts:264`) |
| V7.3.2 | pass | absolute lifetime 30 days, checked on `iat` and `exp` (`api/src/session.ts:45`, `:262-265`) |
| V7.4.1 | pass | sign-out bumps the stored generation, retiring every cookie (`api/src/auth.ts:271-286`, `api/src/person.ts:168`); every request checks it (`auth.ts:110`) |
| V7.4.2 | pass | delete keeps a generation floor, so no older cookie works after a new sign-in (`api/src/person.ts:469-478`); taking an address off the allowlist ends its sessions (`api/src/auth.ts:138`) |
| V8.2.1 | pass | session routes take `sub` from the verified cookie only; runner routes take the person from the run id and require its ticket (`api/src/runner.ts:65-75`) |
| V8.2.2 | pass | a person object is reached by `idFromName(sub)`; the lease fences writes (`api/src/session-lease.ts:84-96`) |
| V8.3.1 | pass | admission, quota and lease are decided in the person object (`api/src/person.ts:505-546`) |
| V9.1.1 | pass | HS256 signature checked before any claim is read (`api/src/session.ts:153-215`) |
| V9.1.2 | pass | `alg` must be exactly HS256 (`api/src/session.ts:174`); ID tokens RS256 only (`api/src/google.ts:229`) |
| V10.2.1 | pass | PKCE S256 plus `state` in a signed, 10-minute cookie, compared in constant time (`api/src/auth.ts:147-170`, `api/src/google.ts:63-67`) |
| V10.4.10 | pass | the code exchange and refresh send the client secret (`api/src/google.ts:143`, `:290`) |
| V10.5.1 | pass | `nonce` checked in constant time, `maxTokenAge` 10 minutes (`api/src/google.ts:226-245`) |
| V10.5.2 | pass | people are keyed by `sub`, never by address (`api/src/auth.ts:69-71`); the address is matched only when `email_verified` (`:243`) |
| V11.3.2 | pass | refresh tokens are AES-256-GCM with a random 12-byte IV (`api/src/crypto.ts:119-131`) |
| V11.4.1 | pass | SHA-256 for tickets and PKCE, HMAC-SHA-256 for sessions |
| V11.5.1 | pass | `crypto.getRandomValues` for tickets (32 bytes, `api/src/run-ticket.ts:38-40`), state, nonce, verifier and run ids |
| V12.2.1 | pass | origins must be `https://` (`scripts/deploy-staging.sh:71-73`); Google and GitHub are called over HTTPS only |
| V13.2.1 | pass | the runner authenticates with a per-attempt bearer ticket (`api/src/runner.ts:58-62`) |
| V13.3.1 | pass | secrets live only as Worker secrets (`api/wrangler.jsonc:18`); `deploy-staging.sh` and `new-instance.sh` never read or set one (`deploy-staging.sh:24-26`, `new-instance.sh:18-21`) |
| V13.3.2 | pass | `tidy.yml` asks `contents: read` and `persist-credentials: false` (`runner/workflows/tidy.yml:18-19`, `:32`); the runbook scopes `GITHUB_TOKEN` to the instance repository (`docs/runbook.md:79`) |
| V13.3.4 | finding F1 | the rotation the runbook describes for `TOKEN_ENC_KEY` does not recover by itself |
| V14.2.1 | pass | tickets travel in `Authorization` (`runner/src/token.ts`), Drive tokens in bodies; no secret in a query string |
| V14.2.4 | finding F5 | note paths in the Actions log |
| V14.3.2 | pass | `Cache-Control: no-store` on every Worker answer (`api/src/security.ts:46`) |
| V14.3.3 | pass | the Drive access token stays in memory in the client (`src/data/worker/worker-http.ts:33`) |
| V15.2.1 | pass | `pnpm audit --prod`: no advisories (below) |
| V16.2.5 | findings F5, F6 | otherwise, no token, ticket or refresh token is logged: dispatch and lookup log the status only (`api/src/github.ts:47-104`), Google errors keep the OAuth error code only (`api/src/google.ts:156-160`, `:237`), revoke logs the cause only (`api/src/me.ts:37`) |
| V16.4.1 | pass | a client `x-request-id` is kept only when it matches `[A-Za-z0-9._-]{1,64}` (`api/src/security.ts:57-68`) |
| V16.5.1 | pass | a 500 never names its cause (`api/src/errors.ts:104-108`, `api/src/env.ts:108-111`) |
| V2.4.1 | P4 note | the rate limits exist (`api/src/security.ts:282`, `:313`) but no route mounts them; the daily run quota does apply (`api/src/person.ts:519-521`) |

## Runner tickets

- Stored only as SHA-256 hex (`api/src/person.ts:668`, `:683-689`); looked up by hash and re-compared in constant time (`:792-794`). Comparing hashes of a 256-bit secret leaks nothing useful by timing. Pass.
- Expiry 60 minutes (`api/src/run-ticket.ts:24`, `api/src/person.ts:799`); a new attempt retires the older tickets, which answer `stale-attempt` (`:681`, `:795-797`); `done`, `failed` and a stale end retire the ticket (`:775`, `:846`). Pass.
- Never returned after mint (only `dispatchTidy`'s payload carries it, `api/src/process.ts:156-161`), never logged (`api/test/recovery.test.ts:342-360` checks `expectNoSecretLogged`), and masked first on Actions before any log line that follows the parse (`runner/src/main.ts:264`). Pass.
- Hostile run ids: the id must be 64 hex plus a base64url part (`api/src/run-ticket.ts:29`); `idFromString` throws for an id not of this namespace and that is answered 401 (`api/src/runner.ts:65-75`); covered by `api/test/runner.test.ts:105`. Pass.

## Delete

`DELETE /me` revokes the Google grant (a failure is logged and the deletion goes on), then `storage.deleteAll()` and a fresh schema; only `generationFloor` survives in the person object (`api/src/me.ts:29-41`, `api/src/person.ts:469-478`). KV keeps only the allowlist (`api/src/store.ts`): see F8. A run in flight loses its ticket row, so its runner gets 401. Pass, with F8.

## GitHub Actions (`runner/workflows/tidy.yml`)

| Item | Result |
| --- | --- |
| Actions pinned by full commit SHA | not pinned: `actions/checkout@v5` (line 30), `actions/setup-node@v5` (line 34), finding F2 |
| `client_payload` in `run:` | pass: the one `run:` step has no expression (line 40); `BOWER_API_URL` comes through `env:` |
| `client_payload` in `run-name` and `concurrency` | pass: neither is a shell; `run_id` and `attempt` are display and grouping only, and the runner validates both (`runner/src/main.ts:222-223`) |
| `permissions` | pass: `contents: read` only (lines 18-19) |
| `persist-credentials` | pass: `false` (line 32) |
| Secrets in logs | pass: no secret in the workflow; the ticket is read from the event file and masked (`runner/src/main.ts:256-264`) |

## Deploy guards

- `deploy-staging.sh` cannot reach production: it refuses a config that names `bower-api` or the production KV id, or whose first name is not `bower-staging`, refuses a second wrangler config, passes no `--env`, and requires wrangler's upload line to name `bower-staging` (`scripts/deploy-staging.sh:122-139`, `:169-182`). Pass; the false alarm at `:177` is known (above).
- `new-instance.sh` handles no secret: it builds, clones, copies two files, pushes and sets one repository variable (`scripts/new-instance.sh:102-156`). Pass, with F7.

## Dependencies

`pnpm audit --prod`, 2026-10-07, at `2de07f2`:

| Package | Result | Verdict |
| --- | --- | --- |
| app (`/`) | No known vulnerabilities found | nothing to do |
| `api/` | No known vulnerabilities found | nothing to do |
| `runner/` | No known vulnerabilities found | nothing to do |

## Runbook claims

- **Does a `TOKEN_ENC_KEY` rotation force each person to sign in again with consent?** No. Every Drive token call answers 500 `internal`, the session stays, and signing in again keeps the unreadable token (F1, evidence above). `docs/runbook.md` "Rotation" is corrected to say so and to give the way out until `token-key-rotation-reconsent` lands: the person removes Bower's access in their Google account (or uses "Delete my account") and signs in again, and Google then asks for consent.
- **Does a stale-run redispatch fail again, and say what, when `GITHUB_TOKEN` is missing or wrong?** There is no redispatch. Missing: the first dispatch logs `tidy dispatch is not configured: no GitHub token` (`api/src/process.ts:152-154`), and at the stale deadline the alarm logs `tidy recovery is not configured: no GitHub token` and fails the run (`api/src/person.ts:599-602`). Wrong or expired: the dispatch logs `tidy dispatch failed: status <n>` (`api/src/github.ts:71-73`), the alarm's lookup logs `tidy lookup failed: status <n>` and the run fails (`api/src/github.ts:97-99`, `api/src/recovery.ts:93`). Either way the person sees "This tidy-up took too long and stopped. Try again." 17 minutes after the press. Proven by `api/test/recovery.test.ts:342` (`a failed lookup or no token marks the run failed stale at the deadline`) and `api/test/dispatch.test.ts:145`. `docs/runbook.md` "Recovery" is corrected.

## P4 notes (not findings)

- Rate limits (TL-P3-14): the generic and strict limits are written but mounted on no route, and `COOKIE_ROUTES` lists routes that do not exist (`/settings`, `/runs`, `/push/subscribe`). Mount them before production, per isolate as written, or with Cloudflare's rate limiting binding. ASVS V2.4.1.
- Google's verification of the `drive` scope: full `https://www.googleapis.com/auth/drive` is a restricted scope. Past the testing consent screen (100 test users), production needs Google's app verification and the restricted-scope security assessment ([Google, restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).
- Successful sign-ins are not logged (ASVS V16.3.1, L2): only failures are (`api/src/auth.ts:211`). Decide with the production logging plan.
- Stale pointers in comments: `api/src/security.ts:7` names `docs/security.md`, which does not exist here; F3's fix corrects the CSP comment at `:39-42`.
