# Technical-lead decision TL-P3-2026-10-06-06: the first staging deploy of the Worker

**Coordinator question, 2026-10-06:** who does what for the first staging deploy of the Worker (P3-4), and on which hostname.

## Hostname: one origin

Staging serves the app and the Worker from **one Worker on one origin**, the existing `bower-staging`. Its static assets are the app build, and `assets.run_worker_first` lists the Worker's paths (`/auth/*`, `/me`, `/drive/*`, `/vault`, `/process`, `/status`, `/session`), so only those run the script. Everything else is served as the single-page app ([Workers static assets, Worker script routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)).

- **Why.** The contract allows one origin and says what it needs: the service worker's `navigateFallbackDenylist` lists those paths. One origin needs no CORS or cross-site cookie, and one deploy covers both.
- **Same site.** `workers.dev` is on the [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat), so `*.<account>.workers.dev` hosts already share a site. One origin is simply the smaller choice.
- **The real source on staging** uses its own origin as the API base (`VITE_API_URL` empty, or the origin). Demo and fake keep working through `?source=`.
- **Production** keeps the contract's `api.<app domain>` option, decided in P4 when the original is replaced.

## Who does what

| Step | Who | How |
| --- | --- | --- |
| The redirect URI `https://<staging host>/auth/callback` and the JavaScript origin on the existing OAuth client | **Owner** | Google Cloud console. It is the owner's account. |
| `GOOGLE_CLIENT_SECRET` | **Owner** | `wrangler secret put GOOGLE_CLIENT_SECRET --name bower-staging`, typed by the owner. No session handles it. |
| `SESSION_SECRET` (32 random bytes or more) and `TOKEN_ENC_KEY` (base64 of 32 random bytes, AES-256) | **Lead** | Generated with `openssl rand` and piped straight into `wrangler secret put`, never printed or logged. |
| The KV namespace bound as `BOWER_KV`, and the two test addresses in the allowlist key format of the original store | **Lead** | `wrangler kv namespace create`, then one key per address. The addresses never enter the repository, a commit or a message. |
| `GOOGLE_CLIENT_ID` | **Owner** | `wrangler secret put GOOGLE_CLIENT_ID --name bower-staging`. It is not secret, but it is specific to the owner's Google project, so it stays out of the repository like `FOLDER_ID`. |
| `APP_ORIGIN` and `API_ORIGIN` | The deploy | Both are the staging origin, passed as `--var` at deploy time, because the account's subdomain stays out of the repository (STAGING.md). The repository keeps placeholders. |
| The deploy | `bower-mechanical`, after the OIDC review | The updated STAGING runbook: build the app, then `wrangler deploy` from `api/` with `assets.directory` set to the app's `dist/`. |
| The first sign-in with both accounts | **Owner** | In the browser, when the lead asks. |

[STAGING.md](STAGING.md) is updated by the lead in the same batch: staging stops being a static preview at P3-4.

**Done by the lead, 2026-10-07:**

- A new KV namespace, `bower-staging-kv`, holds the two allowlist keys. The original app's own `BOWER_KV` namespace is production's and is never touched.
- `SESSION_SECRET` (48 random bytes) and `TOKEN_ENC_KEY` (32 random bytes, standard base64) are set on `bower-staging`.
