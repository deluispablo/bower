# Runbook

Operating notes for a Bower instance. This page currently covers configuration; deploy, pause and tear-down steps land with the issues that need them.

## API configuration

Every variable `api/src/env.ts` reads, secret or var, with where it comes from and a placeholder example. Secrets are set with `wrangler secret put NAME` (production) or a line in `api/.dev.vars` (local, git-ignored — copy `api/.dev.vars.example`). Vars live in `[vars]` in `api/wrangler.toml`.

| Name | Secret or var | How to obtain | Example |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Secret | Google Cloud Console → APIs & Services → Credentials, OAuth client (Web application) | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Secret | Same OAuth client as `GOOGLE_CLIENT_ID` | `GOCSPX-replace-me` |
| `SESSION_SECRET` | Secret | Generate: `openssl rand -base64 32` | `replace-me` |
| `TOKEN_ENC_KEY` | Secret | Generate: `openssl rand -base64 32` (must decode to exactly 32 bytes; encrypts stored Google refresh tokens) | `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=` |
| `BOWER_API_KEY` | Secret | Generate: `openssl rand -base64 32`; set the same value in the Worker and in the instance repo | `replace-me` |
| `GITHUB_TOKEN` | Secret | GitHub → Settings → Developer settings → Fine-grained token, `contents: write` on the instance repo only | `github_pat_replace-me` |
| `ADMIN_KEY` | Secret | Generate: `openssl rand -base64 32`; bearer key for admin endpoints (see #11) | `replace-me` |
| `VAPID_PUBLIC_KEY` | Secret | Generate a VAPID key pair (`npx web-push generate-vapid-keys`, or `api/scripts/gen-vapid.ts`) | `replace-me` |
| `VAPID_PRIVATE_KEY` | Secret | Same VAPID key pair as `VAPID_PUBLIC_KEY` | `replace-me` |
| `APP_ORIGIN` | Var | The app's deployed origin (Cloudflare Pages) | `https://app.example.com` |
| `API_ORIGIN` | Var | The Worker's deployed origin (Cloudflare Workers) | `https://api.example.com` |
| `GITHUB_REPO` | Var | The operator's private instance repo, `owner/name` | `OWNER/bower-home` |
| `VAPID_SUBJECT` | Var | A contact URI for push, `mailto:` an address the operator reads | `mailto:you@example.com` |
| `DAILY_RUN_LIMIT` | Var (default `20`) | How many `/process` runs a vault may start per day | `20` |
| `DEFAULT_MAX_TURNS` | Var (default `30`) | Default `--max-turns` passed to the agent when a run doesn't set its own | `30` |
| `TEMPLATE_FOLDER_NAME` | Var (default `Bower`) | Name of the folder created in the user's Drive from `vault-template/` | `Bower` |
| `APP_VERSION` | Var | Set by `[vars]` in `wrangler.toml`; predates this contract (#6) | `0.1.0` |
| `BOWER_KV` | Binding | `wrangler kv namespace create BOWER_KV`, bound in `[[kv_namespaces]]` in `wrangler.toml` | `KV_NAMESPACE_ID` |

`assertEnv` (`api/src/env.ts`) validates all of the above on every request and fails with `{ error: { code: 'config', message: 'missing <NAME>' } }` (HTTP 500) naming the first missing secret or var without a default, so a bad deploy fails loudly instead of surfacing as a cryptic error later.

## Local sign-in test

Checks Google sign-in end to end on `wrangler dev` with a real Google OAuth client. The automated tests mock Google; this is the manual check. In production the same client needs `${API_ORIGIN}/auth/callback` as an authorized redirect URI.

1. Google Cloud Console → APIs & Services:
   - Library: enable the **Google Drive API**.
   - OAuth consent screen: user type External; scopes `openid`, `email` and `https://www.googleapis.com/auth/drive`. A client left in *Testing* expires refresh tokens after 7 days (add your account as a test user if you keep it there for this check); a real instance must be *In production*.
   - Credentials → Create credentials → OAuth client ID → Web application. Authorized redirect URI: `http://localhost:8787/auth/callback`. Copy the client id and secret.
2. `cp api/.dev.vars.example api/.dev.vars` and set, in `api/.dev.vars`:
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from step 1.
   - `SESSION_SECRET` and `TOKEN_ENC_KEY`: each from `openssl rand -base64 32`.
   - `APP_ORIGIN=http://localhost:5173` and `API_ORIGIN=http://localhost:8787` (values in `.dev.vars` override `[vars]` in `wrangler.toml` under `wrangler dev`).
3. Allow your Google account in the local KV (lower-case email):
   `pnpm -C api exec wrangler kv key put --local --binding BOWER_KV "allow:you@example.com" 1`
4. Start the Worker with `pnpm -C api dev` (and the app with `pnpm -C app dev` if you want to land on it).
5. Open `http://localhost:8787/auth/login` and accept the consent screen. You should land on `http://localhost:5173`.
6. Check KV: `pnpm -C api exec wrangler kv key list --local --binding BOWER_KV` lists `user:<id>` and `email:<email>`; `pnpm -C api exec wrangler kv key get --local --binding BOWER_KV "user:<id>"` shows an `encRefreshToken` starting with `v1.` (encrypted, never the plain token).
7. Open `http://localhost:8787/me` in the same browser: it returns `{ email, vault, quota: { used, limit }, needsReauth, hasApiKey }`. `curl -X POST http://localhost:8787/auth/logout` answers 204; after signing out in the browser, `/me` answers 401.
8. Sign in with a Google account that has no `allow:` key: you see the "Not invited" page, and the key list from step 6 is unchanged.
9. Signed in, open `http://localhost:8787/drive/token`: it returns `{ accessToken, expiresAt, folderId }`. Then `curl -H "Authorization: Bearer <accessToken>" "https://www.googleapis.com/drive/v3/files?pageSize=1"` answers 200 with a `files` list.
10. Revoke Bower at myaccount.google.com → Security → Your connections to third-party apps (permissions), drop the cached token with `pnpm -C api exec wrangler kv key delete --local --binding BOWER_KV "drivetoken:<id>"` (or wait up to an hour for it to expire), then open `/drive/token`: it answers 401 `reauth`, and `/me` now reports `needsReauth: true`.
11. Signed in again, get the session cookie's value from the browser, then `curl -X DELETE http://localhost:8787/me -b "bower_session=<value>"` answers 204; `pnpm -C api exec wrangler kv key list --local --binding BOWER_KV` no longer lists that `user:<id>` or `email:<email>`, and drive.google.com still shows the folder the sign-in created.
