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
