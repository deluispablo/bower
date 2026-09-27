# Security

How a Bower instance is meant to be attacked and defended. To report a vulnerability, see `SECURITY.md`.

## Threat model

1. **The operator is trusted.** They deploy the Worker and hold every secret (`TOKEN_ENC_KEY`, `SESSION_SECRET`, `GITHUB_TOKEN`, ...), so they can decrypt any stored refresh token and read every vault of their instance. This is by design, and users are told so in the privacy statement (`docs/privacy.md`).
2. **Users trust the operator**, and each other only as far as a household does: the Worker keeps one user from reading or changing another user's vault, run or settings, but nothing protects a user from the operator.
3. **Google shows an "unverified app" warning** once per user, because the operator's OAuth client asks for the full `drive` scope and is not verified (see `docs/decisions.md`). Users are told to expect it; it is not an attack.
4. **What the Worker stores (KV):** per user the email, the Google refresh token and the optional Claude API key (both AES-GCM encrypted with `TOKEN_ENC_KEY`), a cached one-hour Drive access token, the vault's folder ids, the last run, daily counters and push subscriptions; plus the allowlist and per-IP rate-limit counters (an IP address, kept two minutes). Never note content: the last run's report (its summary and the names of the files it processed) is the only trace of it.
5. **What leaves the Worker:** to the app, an `HttpOnly; Secure; SameSite=Lax` session cookie and a one-hour Drive access token (never the refresh token); after a rejected sign-in, an `HttpOnly; Secure; SameSite=Lax` `bower_not_invited` cookie holding only the address, AES-GCM encrypted inside a signed token, for 5 minutes and cleared by the first `GET /me`; to GitHub, a dispatch naming only the user id; to push services, an encrypted notification.
6. **What the runner sees:** with `BOWER_API_KEY`, one vault's folder ids, a one-hour Drive access token and, for users who set one, their Claude API key. It keeps nothing after the run and logs no file names, summaries or tokens. The model itself (`claude -p`, `agent/run.sh`) sees less than the shell that runs it: it starts under `env -i` with an explicit allow-list (`HOME`, `PATH`, `LANG`, `LC_ALL`, `TMPDIR`, `TERM`, `CI`/`GITHUB_ACTIONS` when set, and only the model credential), so a prompt-injected instruction that reaches the model anyway — a note in `0-Inbox/` or `Clippings/` is untrusted text — cannot read the Drive token, `BOWER_API_KEY` or any other `BOWER_*`/`RCLONE_CONFIG_*` value out of its own process. Only the surrounding shell, which does the sync down, the sync up and the status report, holds those.
7. **Browsers:** only `APP_ORIGIN` may call the Worker with the cookie. CORS allows that origin alone, and state-changing session routes also check `Origin` (or `Referer`) against it, so another site cannot act on a signed-in user's behalf.
8. **Abuse:** the public entry points that cost something (`GET /auth/callback`, `POST /process`) are rate limited per IP; `POST /process` also has the per-user daily quota.
9. **The Google Picker API key** (`VITE_GOOGLE_API_KEY`, #53) is public by design: it is baked into the built app's JS, readable by anyone. It grants no access on its own — the Picker still uses the signed-in user's own Drive access token for the actual listing — and is restricted, in the Google Cloud Console, to the Picker API and to the app's origin (HTTP referrer), so it is useless if copied elsewhere.

### Same-site deployment

The session cookie stays `SameSite=Lax`, so the app and the Worker **must share a registrable domain**: for example `app.example.com` and `api.example.com`, or both on `localhost` when developing. The default `*.pages.dev` and `*.workers.dev` hostnames are on the public suffix list, so the app's calls to the Worker would be cross-site and the browser would not send the cookie. The alternative, `SameSite=None`, was rejected: it makes the cookie ride along on every cross-site request, and the CSRF check would become the only line of defence instead of the second.

## Checklist

- [x] CORS: only `APP_ORIGIN`, credentials allowed, methods `GET, POST, PATCH, DELETE, OPTIONS`, headers `Content-Type, Authorization, X-Request-Id`, `X-Request-Id` exposed; preflights answered (`api/src/security.ts`, `appCors`).
- [x] CSRF: `POST /process`, `POST /vault`, `PATCH /settings`, `DELETE /me`, `POST /auth/logout`, `POST` and `DELETE /push/subscribe` require `Origin` (or, without it, the `Referer`'s origin) to equal `APP_ORIGIN`, else 403 `forbidden` (`requireSameOrigin`). Runner and admin routes (bearer keys, no cookie) and `GET` routes are exempt.
- [x] Session cookie `SameSite=Lax`, `HttpOnly`, `Secure`; app and API on one registrable domain (see above and `docs/runbook.md`).
- [x] Rate limit: 30 requests per minute per client IP on `GET /auth/callback` and on `POST /process`, else 429 `rate_limited` with `Retry-After` (`rateLimit`). Fixed one-minute windows in KV (`rate:<route>:<ip>:<minute>`); the read-then-write count can let a few extra requests through under a race, which is acceptable for slowing abuse down. Once a window is full, refused requests cost KV reads only, not writes.
- [x] Headers on every response, errors included: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (`securityHeaders`).
- [x] Secret hygiene: `api/test/log-hygiene.test.ts` fails if any `console.*` call in `api/src/` passes or interpolates a variable named like a token, secret, key, email, refresh token or cookie. No violation was found when it was added.
- [x] CI supply chain: every `uses:` in `.github/workflows/ci.yml` and the instance workflows (`agent/workflows/ingest.yml`, `lint.yml`) pinned to a full commit SHA, version in a comment; `pull_request` and `push` runs gated by a `supply-chain` job (`pnpm audit --audit-level=high`, gitleaks); `permissions: contents: read` at the top of `ci.yml`, widened per job only where needed (the `supply-chain` job's PR comments); Dependabot (`.github/dependabot.yml`) weekly for npm (grouped minor/patch) and GitHub Actions.
- [x] This threat model.

## Accepted audit exceptions

None currently. `pnpm audit --audit-level=high` is clean; the one high that `supply-chain` first caught (below) is resolved, not suppressed.

`pnpm.auditConfig.ignoreGhsas` (the pnpm ≥ 11 mechanism for silencing a specific advisory) does not exist on the pnpm version this repo pins (`packageManager: pnpm@9.15.9`, `engines.pnpm: ^9`): pnpm 9 only understands `auditConfig.ignoreCves`, and the advisory below has no CVE id (`cves: []` in `pnpm audit --json`), so neither key would have worked, config or CLI (pnpm 9's `audit` has no `--ignore` flag either). Bumping the repo to pnpm 11 to gain `ignoreGhsas` was out of scope for closing this one finding.

Instead, `pnpm.overrides.sharp` in the root `package.json` forces `sharp` to `>=0.35.4` (patched) everywhere in the tree:

| Advisory | Path | Fix |
| --- | --- | --- |
| `GHSA-g89c-p67h-r497`, `GHSA-2jg2-4ch7-h545` (sharp, libheif, `<0.35.4`) — registered as `GHSA-rgj7-g3m4-5g8c` | `api > @cloudflare/vitest-pool-workers@0.22.0 > miniflare (alpha) > sharp@0.35.2` | `sharp@0.35.4` was already present in the lockfile for another consumer; the override just makes every consumer, including `miniflare`'s, resolve to that one already-patched version instead of carrying a second, vulnerable copy. Full `pnpm test` (218 API tests, exercising the Worker's `vitest-pool-workers` sandbox) passes unchanged on `sharp@0.35.4`. Safe to drop once `@cloudflare/vitest-pool-workers` itself pins a patched `miniflare`/`sharp` and the override becomes redundant. |
