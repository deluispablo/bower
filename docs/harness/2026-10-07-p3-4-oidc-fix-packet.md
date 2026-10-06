# Packet: worker-google-oidc fix round (P3-4)

Starting model: `bower-implementer` (Sonnet), fresh. Reason: bounded fixes after a CLEAN Opus review; TL-P3-07 adds one behaviour.

- **Checkout:** `/private/tmp/bower-p3-oidc2`, branch `claude/p3-oidc2`, from `ba89861` (the reviewed head). Never push or deploy, no real accounts or secrets.
- **Read:** `docs/harness/WORKER.md`, this packet, the implementation packet [2026-10-06-p3-4-oidc-packet.md](2026-10-06-p3-4-oidc-packet.md), `docs/specs/2026-10-04-worker-contract.md` (the `/auth/login` row as updated by TL-P3-07), `api/src/{auth,google,store,person,person-schema,errors,env}.ts`, `api/test/{auth,person,env}.test.ts`, `api/wrangler.jsonc`, and the app's sign-in screen under `src/features/auth/`.
- **Acceptance contract:**
  1. **TL-P3-07.** A failed or cancelled callback never answers JSON. Google's `error=access_denied` → 302 to the app's sign-in with `?signin=cancelled`; a state, PKCE, token or ID-token failure, an unverified address or one not on the allowlist → `?signin=failed`. The `bower_oauth` cookie is cleared on every such path. Details go to `console.error` only. Named tests: `a cancelled sign-in returns to the app saying so`, `a failed sign-in returns to the app saying so`. The app's sign-in screen reads the parameter and shows "Sign-in was cancelled." or "Bower couldn't sign you in. Try again." (a unit test for each), then drops the parameter from the address.
  2. **Schema v1 → v2 migration test:** a person object holding a v1 database (the P3-3 tables, a version row of 1) migrates to v2 on start, keeps its rows, and gains the account table.
  3. **No address in logs:** when `jose` refuses a token, log only the error code, never the claims (drop jose's error as `cause`). A test asserts the logged text holds no address or `sub`.
  4. **A Google key-endpoint failure answers `internal`,** not `signed-out` (or, on the callback, `?signin=failed` with the cause logged as an outage). Test it.
  5. **Tests for:** an expired ID token, an `HS256` or `none` token, and an allowlisted address given in another case. Compare addresses after an ASCII-only lowercase (no Unicode case mapping).
  6. **Wiring:** `/health` joins `run_worker_first`; `APP_ORIGIN` and `API_ORIGIN` in `api/wrangler.jsonc` are the same placeholder origin for the one-origin staging (or one var), so the logout origin check and CORS hold.
  - Red first on assertions for each new test.
  - Files in scope: `api/src/**`, `api/test/**`, `api/wrangler.jsonc`, `src/features/auth/**` and its tests.
- **Gates:** the verify of `worker-google-oidc` (query `harness/features.json`), `pnpm check`, and the sign-in screen's e2e on a private Playwright config on port 5195. Never write `harness/` records or run `done.sh`.
- **Deliver, under 15 lines:** commit SHAs, files, red→green per item, gates, left out.
