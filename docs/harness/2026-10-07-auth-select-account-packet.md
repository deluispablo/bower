# Packet: auth-select-account

Starting model: `bower-mechanical` (Haiku). Reason: a one-line change with a clear failing test (lead ruling).

- **Entry:** `auth-select-account` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-select`, branch `claude/p3-select`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `api/src/google.ts` (the auth URL builder), `api/src/auth.ts` (`/auth/login` and its `consent=1` path), `api/test/auth.test.ts`.
- **Research, cite:** Google OAuth 2.0 for web server apps, the `prompt` parameter (space-delimited `select_account consent`).
- **Acceptance contract:**
  - `/auth/login` always sends `prompt=select_account`; `/auth/login?consent=1` sends `prompt=select_account consent` (URL-encoded with a space or `+`).
  - Named tests in `api/test/auth.test.ts`: `sign-in always shows Google's account chooser` and `the consent re-prompt also shows the account chooser`, each parsing the redirect `location` and asserting the exact `prompt` value. Red first on the assertion.
  - Files in scope: `api/src/google.ts`, `api/src/auth.ts`, `api/test/auth.test.ts`.
- **Gates:** the verify, `pnpm check`. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 8 lines:** commit SHA, red→green, gates.
