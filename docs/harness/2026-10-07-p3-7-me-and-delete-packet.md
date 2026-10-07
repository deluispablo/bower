# Packet: worker-me-and-delete (P3-7)

Starting model: `bower-implementer` (Sonnet). Reason: one route over existing pieces (session, lease fence, Google client, person object), with a deletion that must stay truthful (C01).

- **Entry:** `worker-me-and-delete` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-delete`, branch `claude/p3-delete`. Never push or deploy.
- **Read:**
  - `docs/harness/WORKER.md`, this packet;
  - the `DELETE /me` row and "One active session" in `docs/specs/2026-10-04-worker-contract.md`;
  - `api/src/auth.ts` (`requireSession`, `/auth/logout`, `retireSessions`, `clearSessionCookie`);
  - `api/src/session-lease.ts` (`requireLease`);
  - `api/src/google.ts` (token calls and their error mapping);
  - `api/src/person.ts` and its schema;
  - `api/src/index.ts`;
  - `api/test/auth.test.ts` and `api/test/session-lease.test.ts` as patterns;
  - `src/data/worker/worker-http.ts` (`deleteAccount`, which already sends the fence headers and expects 204).
- **Research, cite:**
  - [Google OAuth 2.0, revoking a token](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke) (`POST https://oauth2.googleapis.com/revoke`, `token=` form body);
  - Cloudflare Durable Objects storage `deleteAll()`.
- **Acceptance contract:**
  - **Route:** `DELETE /me` with `requireSameOrigin`, `requireSession` and `requireLease`, in that order.
    - Without the lease's place and epoch it answers 409 `stale-session`, and nothing is forgotten.
    - Named test: `delete me needs the session epoch`.
  - **The deletion, in this order:**
    1. Read the encrypted refresh token, decrypt it and revoke it at Google with an injectable fetch, as other Google calls are injected.
       - A failed or refused revoke is logged by status only, never with the token, and the deletion continues.
       - Named test: `delete me revokes the Google grant even if Google fails`. It asserts the revoke call's form body carries the token once, and that a 500 from Google still ends in 204.
    2. Empty the person object (`ctx.storage.deleteAll()` or equivalent): account, tokens, folder pointer, claim, reserved ids, lease and leave rows.
    3. Answer 204 with `clearSessionCookie()`.
    - Named test: `delete me forgets the person and clears the cookie`.
      - Status 204 and a cleared cookie.
      - The old cookie on `GET /me` then answers 401 `signed-out`.
      - The person object reports no account and no folder.
  - **After deletion:** a later `signIn` for the same `sub` starts fresh at schema v6, with no folder pointer. The app's folder step then calls `POST /vault`, which finds the folder by its marker.
    - Named test: `signing in again after delete me starts at the folder step`. It checks the fresh person object: account present, `folderId()` null.
    - `DELETE /me` makes no Drive call at all. Assert the injected fetch saw no `googleapis.com/drive` URL.
  - **Errors:** any failure reaching the person object answers 500 `internal` with no cause. No code other than the contract's.
  - **Files in scope:** a new `api/src/me.ts` (or the route in `api/src/auth.ts` if that is smaller), `api/src/person.ts` (one `forget()` method), `api/src/index.ts`, `api/src/google.ts` (a `revokeToken` helper if none exists), a new `api/test/me.test.ts`.
- **Out of scope:** the app's Settings screen and copy (already wired), KV allowlist rows (the operator's), `/process`.
- **Gates:**
  - the verify, red first on assertions (stub-first for a new module);
  - `pnpm check` in full, quoting its last line;
  - never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 12 lines:** commit SHA, red→green, gates, sources cited, anything left out.
