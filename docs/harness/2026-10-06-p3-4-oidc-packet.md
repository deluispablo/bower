# Packet: worker-google-oidc (P3-4)

Starting model: `bower-escalated` (Opus). Reason: new security code (ID-token validation with `jose`, people keyed by `sub`) on top of the adapted original `google.ts`; one review follows (Opus until Codex returns on 2026-10-12, Codex after).

- **Entry:** `worker-google-oidc` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-oidc`, branch `claude/p3-oidc`. Never push, never deploy, never use real accounts or secrets (fixtures only: `you@example.com`, `FOLDER_ID`).
- **Read:** `docs/harness/WORKER.md`, this packet, `docs/specs/2026-10-04-worker-contract.md` ("Two things the deployment must get right", the calls table rows `/me`, `/auth/login`, `/auth/logout`, general codes), `docs/P3_DRAFT.md` "Reuse", and from `/Users/deluisp/Projects/bower/api/`: `src/google.ts`, `src/auth.ts`, `src/store.ts` (allowlist functions only), `test/auth.test.ts`.
- **Research first, cite:** OpenID Connect Core 3.1.3.7 (ID-token validation: `iss`, `aud`, `exp`, `iat`, `nonce`), Google's OIDC docs (issuer values, JWKS URL), RFC 7636 PKCE, `jose` (`createRemoteJWKSet`, `jwtVerify`), OWASP session management (rotate the session at login).
- **Acceptance contract:**
  - `GET /auth/login`: PKCE (S256) + `state` + `nonce`, kept in a short-lived signed cookie; redirect to Google with the contract's scopes (full `drive`, `openid email profile`), `access_type=offline`, `prompt=consent` only when needed.
  - `GET /auth/callback`: checks `state`; exchanges the code (injected fetch, as the original); validates the ID token with `jose` against Google's JWKS (issuer, audience = client id, expiry, nonce, `email_verified`); keys the person by `sub`; refuses an email not on the allowlist (KV, reused from the original store) with 403 `forbidden`; stores the encrypted refresh token (the `crypto.ts` envelope) in the person's Durable Object; issues the session cookie (`HttpOnly; Secure; SameSite=Lax`) and redirects to the app.
  - Session generation: the person object stores it; every authenticated request checks it with `assertCurrentGeneration`; `POST /auth/logout` bumps it (and clears the cookie, 204), so other cookies for that person stop working. `SESSION_SECRET_PREVIOUS` is read from env and accepted for verification only (rotation).
  - `GET /me`: `{ user: { name, email }, folderId: null }` for now (the folder pointer is a later entry); 401 `signed-out` without a valid session.
  - Errors reaching the person object answer `internal` with no cause (log only).
  - Named tests (api, the injected fetch and a local JWKS): `the callback refuses an ID token with the wrong audience or nonce`, `a person not on the allowlist is refused at the callback`, `logout retires every other cookie for that person`, `GET /me answers signed-out without a session`. Stub-first (METHOD step 6): commit stubs for new modules first so the tests fail on assertions, then the implementation.
  - New runtime dependency `jose` (approved in P3_DRAFT). Nothing else.
  - Files in scope: `api/src/**`, `api/test/**`, `api/package.json`, `pnpm-lock.yaml`, `api/wrangler.jsonc` (vars only, no secrets), `api/vitest.config.ts` (fixture values only).
- **Not here:** deploying, Google Cloud console changes, real secrets (the deploy step is separate and needs the owner).
- **Gates:** the verify, `pnpm check`. Never write `harness/` records or run `done.sh`.
- **Deliver, under 15 lines:** commit SHAs (stub commit first), files, red→green per named test, gates, sources, left out.
