# Packet: worker-drive-token (P3-5)

Starting model: `bower-implementer` (Sonnet). Reason: adapting the original's token minting ([TL-P3-09](DECISIONS.md)); one Opus review covers P3-5.

- **Entry:** `worker-drive-token` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-dtoken`, branch `claude/p3-dtoken`. Never push or deploy, no real accounts or secrets.
- **Read:** `docs/harness/WORKER.md`, this packet, the contract `docs/specs/2026-10-04-worker-contract.md` (`GET /drive/token`, `DELETE /me` for the pointer's meaning, general codes), `api/src/{auth,google,person,person-schema,store,errors}.ts`, and from `/Users/deluisp/Projects/bower/api/src/drive.ts` (`getAccessToken`, `mintAccessToken`, the routes).
- **Research first, cite:** Google OAuth 2.0 refresh-token flow and `invalid_grant` handling; access-token lifetime (`expires_in`).
- **Acceptance contract:**
  - Stub-first (METHOD step 6): commit `api/src/drive-token.ts` with the exported signatures returning wrong values, plus the failing tests; then implement.
  - `GET /drive/token`: requires a session; 409 `no-folder` while the person object has no folder pointer; otherwise decrypts the stored refresh token, refreshes with Google (injected fetch), answers `{ accessToken, expiresAt }` (epoch ms, at most 1 h ahead); caches the access token in the person object until shortly before expiry; `?fresh=1` refreshes regardless. `invalid_grant` (revoked) → 401 `signed-out` and the session generation bumps. Export `accessTokenFor(env, sub, { fresh })` for `worker-vault-pointer`.
  - **Schema step 3** of the person object: a `folder_id` column (pointer only) with a tested v2→v3 migration, and typed get/set accessors (the setter is used by `worker-vault-pointer`).
  - **Allowlist on every session** (TL-P3-09): `requireSession` re-reads `allow:<address>` (one KV read); a removed address answers 401 `signed-out`.
  - Named tests: `drive token answers no-folder before a folder exists`, `drive token is minted from the stored refresh token and lasts at most an hour`, `a fresh drive token skips the cache`, `removing someone from the allowlist ends their sessions`. Never log tokens; a test asserts the log holds no token.
  - Files in scope: `api/src/**`, `api/test/**`.
- **Gates:** the verify, `pnpm check`. Never write `harness/` records or run `done.sh`.
- **Deliver, under 15 lines:** commit SHAs (stub first), files, red→green, gates, sources, left out.
