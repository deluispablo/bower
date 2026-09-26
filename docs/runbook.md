# Runbook

Operating notes for a Bower instance. This page currently covers configuration; deploy, pause and tear-down steps land with the issues that need them. To verify an instance works end to end, run `docs/testing.md`.

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
| `VAPID_PUBLIC_KEY` | Secret | Generate the VAPID key pair once per instance with `pnpm -C api gen-vapid`: base64url of the raw 65-byte P-256 public key. Keep it: a new pair invalidates every browser's push subscription | `replace-me` |
| `VAPID_PRIVATE_KEY` | Secret | Same `pnpm -C api gen-vapid` run as `VAPID_PUBLIC_KEY`: base64url of the 32-byte private key | `replace-me` |
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

`APP_ORIGIN` and `API_ORIGIN` must share a registrable domain (for example `https://app.example.com` and `https://api.example.com`): the session cookie is `SameSite=Lax`, so on the default `*.pages.dev` and `*.workers.dev` hostnames the browser will not send it and nobody can stay signed in. Give the Pages project and the Worker custom domains under one domain you own (see `docs/security.md`). Only `APP_ORIGIN` may call the API from a browser.

## Runner

The instance repo runs `agent/run.sh <vault_id> <ingest|lint>` in GitHub Actions, via `agent/workflows/ingest.yml` and `agent/workflows/lint.yml` copied into its `.github/workflows/` by the setup script (see `agent/README.md`). Set these in the instance repo under Settings → Secrets and variables → Actions:

| Name | Secret or variable | How to obtain | Example |
| --- | --- | --- | --- |
| `BOWER_API_KEY` | Secret | The same value as the Worker's `BOWER_API_KEY` | `replace-me` |
| `CLAUDE_CODE_OAUTH_TOKEN` | Secret (this or `ANTHROPIC_API_KEY`) | `claude setup-token` on the operator's machine, with their Claude subscription | `replace-me` |
| `ANTHROPIC_API_KEY` | Secret (this or `CLAUDE_CODE_OAUTH_TOKEN`) | Claude Console → API keys | `sk-ant-replace-me` |
| `BOWER_API_URL` | Variable | The Worker's deployed origin, same as `API_ORIGIN` | `https://api.example.com` |
| `BOWER_MAX_TURNS` | Variable (optional) | Overrides the Worker's `DEFAULT_MAX_TURNS` for this instance | `30` |

Set them with the GitHub CLI, from the instance repo's checkout (or add `-R OWNER/bower-home`):

```bash
gh secret set BOWER_API_KEY
gh secret set CLAUDE_CODE_OAUTH_TOKEN   # or: gh secret set ANTHROPIC_API_KEY
gh variable set BOWER_API_URL --body "https://api.example.com"
```

A user who set their own API key in Settings runs with that key instead: the script exports it as `ANTHROPIC_API_KEY` and unsets `CLAUDE_CODE_OAUTH_TOKEN` for that run only.

The Actions log shows timestamps, step names and counts only. When a run fails, the reason is in the `error` of `GET /status`; the agent's stderr and rclone's output are in `$RUNNER_TEMP/bower-logs/` on the runner, uploaded as the `bower-logs` artifact only on failure (3-day retention; it can hold vault content, which is fine because the instance repo is private).

To start a run by hand instead of through the app's Process button, from the instance repo:

```bash
gh workflow run ingest.yml -f vault_id=<id>
```

(`<id>` is the user's id, the same one `GET /runner/vaults/:id` takes — see step 15 below.) `gh workflow run lint.yml -f vault_id=<id>` runs a lint the same way.

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
11. Create a vault (sign in again first if you did step 10). Copy the `bower_session` cookie value from the browser's developer tools, then run `curl -X POST -H "cookie: bower_session=<value>" -H "content-type: application/json" -d '{"mode":"create"}' http://localhost:8787/vault`. It answers 201 with `{ vault: { folderId, inboxFolderId, name } }`, and `/me` shows the same `vault`. In drive.google.com, My Drive now has a `Bower` folder holding `CLAUDE.md`, `index.md`, `log.md`, `About-Me.md` and the folders `0-Inbox` (with `Processed`), `1-Projects`, `2-Areas`, `3-Resources`, `4-Archives`, `Answers`, `Clippings`. Running the same command again answers 409 `vault_exists`.
12. Select an existing folder. In drive.google.com, pick a folder that already has notes (an Obsidian vault, or a copy of one) and note each file's "Last modified" time; the folder id is the last part of its URL. Run step 11's command with `-d '{"mode":"select","folderId":"<id>"}'`. It answers 200; no existing file changed (same modified times and content), only the template files and folders the folder lacked were added, and `0-Inbox` exists.
13. Signed in again, get the session cookie's value from the browser, then `curl -X DELETE http://localhost:8787/me -b "bower_session=<value>"` answers 204; `pnpm -C api exec wrangler kv key list --local --binding BOWER_KV` no longer lists that `user:<id>` or `email:<email>`, and drive.google.com still shows the folder the sign-in created.
14. Process. Set `GITHUB_REPO` (your instance repo, `owner/name`) and `GITHUB_TOKEN` (fine-grained, `contents: write` on that repo only) in `api/.dev.vars`, restart the Worker, sign in and set up a vault (step 11). Run `curl -X POST http://localhost:8787/process -b "bower_session=<value>"` twice within a few seconds: both answer 202 with the same `run.runId`, and the instance repo's Actions tab shows a single `ingest` run (event `repository_dispatch`).
15. Runner endpoints. With the Worker running and a vault set up (step 11), take the user id from the `user:<id>` key (step 6) and `BOWER_API_KEY` from `api/.dev.vars`, then run `curl -H "Authorization: Bearer $BOWER_API_KEY" http://localhost:8787/runner/vaults/<user id>`. It answers 200 with `{ folderId, inboxFolderId, driveAccessToken, expiresAt, maxTurns }` (plus `apiKey` if the user set one); `curl -H "Authorization: Bearer <driveAccessToken>" "https://www.googleapis.com/drive/v3/files?pageSize=1"` answers 200. Without the header, or with another key, it answers 401. Then report progress: `curl -X POST -H "Authorization: Bearer $BOWER_API_KEY" -H "content-type: application/json" -d '{"state":"running"}' http://localhost:8787/runner/vaults/<user id>/status` answers 200 with the run in `running`; the same with `-d '{"state":"done","summary":"Test run."}'` answers 200 with the run in `done` and a `finishedAt`.
16. Push setup. Run `pnpm -C api gen-vapid` and put the two `VAPID_` lines it prints in `api/.dev.vars`, then restart the Worker. `curl http://localhost:8787/push/public-key` answers `{ publicKey }` with the same public key. (Manual, pending the owner.)
17. Push to a real browser. Signed in on the app in Chrome (Android, or desktop), allow notifications so the app posts its subscription to `POST /push/subscribe` (204; `wrangler kv key list --local --binding BOWER_KV` lists a `push:<id>:<hash>` key). Report a run done as in step 15 with `-d '{"state":"done","processed":["a.md","b.md"]}'`: the device shows "Bower: 2 files processed". Unsubscribe or clear the site's data in the browser and report again: the push service answers 410 and the `push:` key is gone. (Manual, pending the owner; needs the app side of push, #39.)

## Invite someone

Add their email to the allowlist (case-insensitive; the Worker lower-cases it before storing or checking it). Either way works; the `wrangler kv` command is enough on its own — the admin endpoint exists for a future admin page.

Directly in KV:

```bash
# Production
pnpm -C api exec wrangler kv key put --binding BOWER_KV "allow:you@example.com" 1
# Local (wrangler dev)
pnpm -C api exec wrangler kv key put --local --binding BOWER_KV "allow:you@example.com" 1
```

Or through the admin endpoint (`ADMIN_KEY` is the secret from the table above, `API_ORIGIN` the Worker's origin):

```bash
curl -X POST "https://api.example.com/admin/allow" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```

Answers `204` with no body on success, `400 invalid_email` if `email` is missing, empty or has no `@`.

## Remove someone

Removing someone drops their invitation so they can no longer sign in. If they had already signed in, the admin endpoint also deletes all of their data (their user record, quota counters, push subscriptions, cached Drive token) and revokes Bower's access to their Google account at Google (best effort: a failed revoke is logged by its error code only and does not stop the removal). The vault itself, in their Drive, is never touched.

The plain `wrangler kv key delete` only removes the invitation; it never touches an existing user's data. Prefer the admin endpoint below for someone who has signed in.

Directly in KV (invitation only):

```bash
# Production
pnpm -C api exec wrangler kv key delete --binding BOWER_KV "allow:you@example.com"
# Local (wrangler dev)
pnpm -C api exec wrangler kv key delete --local --binding BOWER_KV "allow:you@example.com"
```

Or through the admin endpoint, which also deletes their data and revokes Google access:

```bash
curl -X DELETE "https://api.example.com/admin/allow/you@example.com" \
  -H "Authorization: Bearer $ADMIN_KEY"
```

Answers `204` with no body, whether or not anyone had signed in with that email.

To see who has signed in before removing them: `curl "https://api.example.com/admin/users" -H "Authorization: Bearer $ADMIN_KEY"` returns `[{ id, email, hasVault, createdAt }]` — never a token.
