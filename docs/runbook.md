# Runbook

Everything an operator needs to deploy and run one Bower instance, written for someone opening this file with no other context. Follow the numbered sections in order for a first deploy; after that, jump to Operations, Pause, Teardown or Troubleshooting as needed. To verify an instance works end to end once deployed, run `docs/testing.md`. Before turning a private fork public, run `docs/release-checklist.md`.

Two repositories are involved throughout (see `ARCHITECTURE.md`): **this repository** (the public template, cloned once) and **the instance repo** (a private repo of the operator's own, created from this one, that runs the agent). Commands below say which repo they run against.

## Fast path: `scripts/deploy.sh`

`scripts/deploy.sh` takes you from a clone to a running instance and asks only for what it cannot work out; a few things only a browser can do stay manual, and it tells you which. Before running it, do sections 1 and 2 below (accounts, tools, the Google OAuth client) and create the fine-grained `GITHUB_TOKEN` (section 4; the token can only be scoped to a repo that exists, so if you have no instance repo yet, run `bash scripts/new-instance.sh OWNER/bower-home` first). Sections 3 to 5 are the manual, step-by-step reference for what the script does.

### Run it

```bash
bash scripts/deploy.sh
```

In order, it:

1. Checks the prerequisites: Node 22+, pnpm, git, openssl, gh; runs `pnpm install`; checks `wrangler whoami` and `gh auth status`. Anything missing stops it before it changes anything.
2. Reads `api/wrangler.local.toml`, or, the first time, creates it from `api/wrangler.toml` by asking for your API domain, app domain, instance repo (`owner/name`) and contact email. This file is git-ignored: your real domains, repo and KV id never reach the tracked `api/wrangler.toml`, which keeps its placeholders. It also gets the Worker's custom domain, at the top level: `workers_dev = false` and `routes = [{ pattern = "api.example.com", custom_domain = true }]`. Every `wrangler` call for the Worker passes `-c wrangler.local.toml`. To change a value later, edit that file and rerun.
3. Creates or updates your private instance repo with `scripts/new-instance.sh` (see "The instance repo" below). The first time, it asks for the runner's Claude credential.
4. Finds or creates the `BOWER_KV` namespace, writes its id into `api/wrangler.local.toml`, and deploys the Worker on its custom domain.
5. Sets the Worker's secrets (see "Every variable the Worker reads" below). It generates `SESSION_SECRET`, `TOKEN_ENC_KEY`, `BOWER_API_KEY`, `ADMIN_KEY` and the VAPID pair itself and pipes them straight into `wrangler secret put`, and asks (input hidden) for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GITHUB_TOKEN`; an empty answer is refused. `BOWER_API_KEY` is set in the Worker and in the instance repo in the same run. `ADMIN_KEY` is written to `api/.prod.secrets` (git-ignored, readable only by you): that file is the only place it is kept.
6. Builds the app with `VITE_API_URL` set to your `API_ORIGIN` and deploys it to Cloudflare Pages, creating the Pages project (`bower-app`, or whatever `PAGES_PROJECT` says) the first time.
7. Prints what is left to do by hand, with your real values filled in.

No secret value is ever printed to the terminal.

### Left to do by hand (once)

1. **App custom domain.** Wrangler cannot set it. Cloudflare dashboard → Workers & Pages → your Pages project (`bower-app`) → Custom domains → Set up a custom domain → add `app.example.com` (your real app domain).
2. **Google OAuth client.** Check the authorized redirect URI (`https://api.example.com/auth/callback`), the privacy policy URL (`https://app.example.com/privacy`) and the terms of service URL (`https://app.example.com/terms`) the script printed.
3. **Smoke check:** `curl https://api.example.com/health` (your real `API_ORIGIN`) should answer 200.
4. **Invite the first user:** see section 5 below; `ADMIN_KEY` is in `api/.prod.secrets`.

### Rerunning and updating

The script is idempotent. After `git pull` here, rerun `bash scripts/deploy.sh`: it redeploys the Worker and the app, re-copies the workflows and agent files into the instance repo (pushing only if they changed), reuses the KV namespace and the Pages project, and skips every secret that is already set.

`bash scripts/deploy.sh --rotate` sets every secret again, in the Worker and in the instance repo. It asks for the Google client id and secret, the GitHub token and the Claude credential again, and generates new values for the rest, so: everyone is signed out and has to sign in with Google again (new `SESSION_SECRET` and `TOKEN_ENC_KEY`), every device has to allow notifications again (new VAPID pair), and `api/.prod.secrets` gets the new `ADMIN_KEY`.

To update only the Worker: `bash scripts/deploy-api.sh` (or `pnpm -C api deploy`), and `bash scripts/deploy-api.sh secrets [--rotate]` (or `pnpm -C api secrets`) for its secrets. They read and create `api/wrangler.local.toml` the same way; `secrets` needs `gh` and the instance repo, because `BOWER_API_KEY` goes to both at once.

## 1. Accounts you need

- A **Cloudflare account** (free tier is enough) for the Worker, KV and Pages.
- A **Google Cloud project** (free) for the OAuth client and the Drive API.
- A **GitHub account**, plus a private repository for the instance (the agent's runner).
- Either a **Claude subscription** (`claude setup-token` gives you `CLAUDE_CODE_OAUTH_TOKEN`) or an **Anthropic API key** (`ANTHROPIC_API_KEY`), to run the agent.

## 2. Google OAuth client

1. In the Google Cloud Console, under **APIs & Services → Library**, enable the **Google Drive API**.
2. Under **APIs & Services → OAuth consent screen**: user type **External**. Scopes: `openid`, `email`, `https://www.googleapis.com/auth/drive`.
   - While the screen is left in **Testing**, only test users you list by hand can sign in, and their refresh tokens expire after **7 days** — the runner then fails every run for that user until they sign in again (see Troubleshooting). This is fine for the local sign-in test (appendix) but breaks a real instance.
   - **Publish** the app instead (Publish app button). Because the client asks for full `drive` scope and is not verified (see `ARCHITECTURE.md`, "Why not X"), Google keeps it **unverified**: every user sees a one-time "unverified app" warning on first sign-in, and the client is capped at **100 users**. Verification (a paid security assessment) is out of scope. Publishing lifts the Testing-only restrictions above.
   - Google requires a public privacy page and a public terms of service page to publish. The app serves `docs/privacy.md` at `/privacy` and `docs/terms.md` at `/terms`, so give Google `<APP_ORIGIN>/privacy` and `<APP_ORIGIN>/terms` — your real `APP_ORIGIN` — as the privacy policy URL and the terms of service URL. For brand verification, Google also checks that the app's homepage links to both: the Login screen does.
3. Under **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**: Authorized redirect URI is `<API_ORIGIN>/auth/callback` — your real `API_ORIGIN`, for example `https://api.example.com/auth/callback`. Copy the client id and secret; they become `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in step 3 below.
4. **Optional: the Google Picker**, for the "Choose a folder" button on onboarding (without it, onboarding falls back to pasting the folder link).
   - Under **APIs & Services → Library**, enable the **Google Picker API**.
   - Under **APIs & Services → Credentials → Create credentials → API key**, create one, then **Restrict key**: under "API restrictions" pick the Picker API only; under "Application restrictions" choose **Websites** and add your real `APP_ORIGIN` (for example `https://app.example.com/*`). The key is public by design — it ends up in the built app's JS — restricting it to the Picker API and to your origin is what keeps it from being useful anywhere else (see `docs/security.md`).
   - Set it at build time: `VITE_GOOGLE_API_KEY=<the key> VITE_API_URL=<API_ORIGIN> pnpm -C app exec vite build`. `scripts/deploy.sh` asks for it (optional; leave it blank to skip) and passes it the same way.

## 3. Cloudflare: Worker, KV, secrets, custom domain, and Pages

### Keep real values out of the tracked file

`api/wrangler.toml` is tracked and holds placeholders (`https://api.example.com`, `OWNER/bower-home`, `KV_NAMESPACE_ID`, ...) — real values never go there. Instead, copy it once to `api/wrangler.local.toml` (already git-ignored) and put your real `[vars]`, the real KV namespace id, and, at the top level (not inside `[vars]`), the Worker's custom domain:

```toml
workers_dev = false
routes = [{ pattern = "api.example.com", custom_domain = true }]
```

`workers_dev = false` turns off the default `*.workers.dev` URL; `routes` with `custom_domain = true` attaches your real domain without a dashboard step. Every `wrangler` command below takes `-c wrangler.local.toml` so it reads this file instead of the tracked one.

### Cloudflare account and KV

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) (free tier), then log the CLI in: `pnpm -C api exec wrangler login` (opens a browser).
2. Create the KV namespace: `pnpm -C api exec wrangler kv namespace create BOWER_KV -c wrangler.local.toml`. It prints the new namespace's id; paste it into `wrangler.local.toml`'s `[[kv_namespaces]]` block (`id = "..."`).

### `[vars]` and secrets

3. Edit `[vars]` in `wrangler.local.toml`: `APP_ORIGIN`, `API_ORIGIN` (your real domains), `GITHUB_REPO` (`owner/name` of the instance repo), `VAPID_SUBJECT` (a `mailto:` address you read). See the variable table below for what each one means, and adjust `DAILY_RUN_LIMIT` / `DEFAULT_MAX_TURNS` / `TEMPLATE_FOLDER_NAME` if you don't want their defaults.
4. Run `pnpm -C api gen-vapid` once and keep its two printed lines (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) at hand.
5. Set every secret from the table below by piping the value into `wrangler secret put`, from `api/`:

   ```bash
   printf '%s' "$value" | wrangler secret put NAME -c wrangler.local.toml
   ```

   An **empty** value here still "succeeds": it records an empty secret, and the Worker then answers `500 {"error":{"code":"config","message":"missing NAME"}}` on every request, including `/health` — see Troubleshooting. Double-check `$value` is actually set before piping it in.
6. Deploy: `pnpm -C api exec wrangler deploy -c wrangler.local.toml`. It prints the Worker's URL (the `*.workers.dev` one, unused once the custom domain from `routes` above is live).
7. Smoke check: `curl https://api.example.com/health` (your real `API_ORIGIN`) should answer `200`.

### Cloudflare Pages: the app

8. First time only, from `app/` (so wrangler does not pick up `api/wrangler.toml`, which is a Worker config): `../api/node_modules/.bin/wrangler pages project create NAME --production-branch main` (`NAME` is yours to pick, e.g. `bower-app`). If it fails with an npm error about delegating to Cloudflare Workers (wrangler 4.14x does this on some machines), re-run it once with `--force`, which creates the project on classic Pages; later commands need no flag. Re-running this once a project exists errors; skip it on later deploys.
9. Build the app with the Worker's real origin baked in: `VITE_API_URL=https://api.example.com pnpm -C app exec vite build` (your real `API_ORIGIN`; the output goes to `app/dist`).
10. Deploy it, from `app/`: `../api/node_modules/.bin/wrangler pages deploy dist --project-name NAME --branch main` (`pnpm -C api exec wrangler` would run inside `api/`, read `api/wrangler.toml` and refuse it as a non-Pages config).
11. Add the custom domain in the dashboard — there is no CLI command for it: **Workers & Pages → your Pages project → Custom domains → Set up a domain**, for example `app.example.com`.

`APP_ORIGIN` and `API_ORIGIN` **must share a registrable domain** (e.g. `app.example.com` and `api.example.com`): the session cookie is `SameSite=Lax`, so on the default `*.pages.dev` / `*.workers.dev` hostnames the browser never sends it and nobody can stay signed in. Full mechanics in `docs/security.md`.

### Every variable the Worker reads

`api/src/env.ts`'s `assertEnv` validates all of this on every request and fails loudly (`500 config`, naming the first missing one) if anything required is absent.

| Name | Secret or var | How to obtain | Example |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Secret | Google Cloud Console → APIs & Services → Credentials, the OAuth client (step 2) | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Secret | Same OAuth client | `GOCSPX-replace-me` |
| `SESSION_SECRET` | Secret | Generate: `openssl rand -base64 32` | `replace-me` |
| `TOKEN_ENC_KEY` | Secret | Generate: `openssl rand -base64 32` (must decode to exactly 32 bytes; encrypts stored Google refresh tokens) | `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=` |
| `BOWER_API_KEY` | Secret | Generate: `openssl rand -base64 32`; set the same value here and in the instance repo (step 4) | `replace-me` |
| `GITHUB_TOKEN` | Secret | GitHub → Settings → Developer settings → Fine-grained token, `contents: write` on the instance repo only | `github_pat_replace-me` |
| `ADMIN_KEY` | Secret | Generate: `openssl rand -base64 32`; bearer key for the admin endpoints | `replace-me` |
| `VAPID_PUBLIC_KEY` | Secret | `pnpm -C api gen-vapid`, once per instance: base64url of the raw 65-byte P-256 public key. Keep it — a new pair invalidates every browser's push subscription | `replace-me` |
| `VAPID_PRIVATE_KEY` | Secret | Same `gen-vapid` run as above: base64url of the 32-byte private key | `replace-me` |
| `APP_ORIGIN` | Var | The app's deployed origin (Cloudflare Pages) | `https://app.example.com` |
| `API_ORIGIN` | Var | The Worker's deployed origin (Cloudflare Workers) | `https://api.example.com` |
| `GITHUB_REPO` | Var | The operator's private instance repo, `owner/name` | `OWNER/bower-home` |
| `VAPID_SUBJECT` | Var | A contact URI for push, `mailto:` an address the operator reads | `mailto:you@example.com` |
| `DAILY_RUN_LIMIT` | Var (default `20`) | How many `/process` runs a vault may start per day | `20` |
| `DEFAULT_MAX_TURNS` | Var (default `30`) | Default `--max-turns` passed to the agent when a run doesn't set its own | `30` |
| `TEMPLATE_FOLDER_NAME` | Var (default `Bower`) | Name of the folder created in the user's Drive from `vault-template/` | `Bower` |
| `APP_VERSION` | Var | Set by `[vars]` in `wrangler.toml`; predates this contract (#6) | `0.1.0` |
| `BOWER_KV` | Binding | `wrangler kv namespace create BOWER_KV`, bound in `[[kv_namespaces]]` | `KV_NAMESPACE_ID` |

## 4. Instance repo from the template

The instance repo is a private repo of the operator's own that only holds the agent's workflows and its own secrets — never this repo's code, never a user's vault content (see "Two repositories per deployment" in `ARCHITECTURE.md`).

There are two ways to get one:

- **`scripts/new-instance.sh` (recommended).** `scripts/deploy.sh` runs it for you; on its own it is `bash scripts/new-instance.sh [OWNER/NAME] [--rotate]`. It creates `OWNER/NAME` as a private repo with `gh repo create --private` (or updates it if it exists), copies `agent/workflows/*.yml` into `.github/workflows/` and `agent/run.sh` and `agent/prompts/` into `agent/`, commits and pushes when something changed, asks for the Claude credential (skipped when one is set, unless `--rotate`) and sets `BOWER_API_URL`. The repo holds only what the runner needs.
- **"Use this template"** on this repository's GitHub page creates a private copy of the whole repository instead: code, docs, this repo's CI. The workflows still have to be in its `.github/workflows/` and the secrets set, so run `bash scripts/new-instance.sh OWNER/NAME` against it afterwards (it only adds and updates files, never removes any), or let `scripts/deploy.sh` do it with that repo as your instance repo. Marking this repository as a template is a GitHub setting (Settings → General → Template repository) that the maintainer turns on; until then, the button is not shown.

Either way, set these under the instance repo's **Settings → Secrets and variables → Actions**:

| Name | Kind | How to obtain |
| --- | --- | --- |
| `BOWER_API_KEY` | Secret | The exact same value as the Worker's `BOWER_API_KEY` above |
| `CLAUDE_CODE_OAUTH_TOKEN` | Secret (this or `ANTHROPIC_API_KEY`) | `claude setup-token`, using the operator's Claude subscription |
| `ANTHROPIC_API_KEY` | Secret (this or `CLAUDE_CODE_OAUTH_TOKEN`) | Claude Console → API keys |
| `BOWER_API_URL` | Variable | The Worker's deployed origin, same as `API_ORIGIN` | 
| `BOWER_MAX_TURNS` | Variable (optional) | Overrides the Worker's `DEFAULT_MAX_TURNS` for this instance |
| `BOWER_ALLOW_WEB` | Variable (optional) | Leave unset (the default): the agent gets no web access, so a clipped page cannot make it send notes anywhere. `1` gives it `WebSearch` and `WebFetch`; only set it if your users' rulebooks need the web, and tell them (`docs/privacy.md`). See "Tools and web access" in `agent/README.md` |

With the GitHub CLI, from the instance repo's checkout (or add `-R OWNER/bower-home`):

```bash
gh secret set BOWER_API_KEY
gh secret set CLAUDE_CODE_OAUTH_TOKEN   # or: gh secret set ANTHROPIC_API_KEY
gh variable set BOWER_API_URL --body "https://api.example.com"
```

`GITHUB_TOKEN` (the Worker secret from step 3) is a **separate**, fine-grained GitHub token — scoped to `contents: write` on this same instance repo only — that the Worker uses to fire `repository_dispatch` and start a run; it is not one of the instance repo's own secrets above.

## 5. First user, and inviting others

**Before any of this**, a signed-out visitor on `/` or `/login` who has never seen it on this device lands on **What is Bower** (`/welcome`): four swipeable pages (drop it and Bower files it, six things it does, a window onto your own Drive, what people use it for), Skip or the last page's Sign in with Google both moving on to the sign-in and remembering `bower:intro:seen` in that browser's `localStorage`, so later visits go straight there. It never interrupts a deep link (a shared note link, Privacy, Terms, Not invited) and never shows again to someone already signed in on this device. It is reachable again any time from Settings → Advanced → What is Bower and from the "What is Bower?" link on the sign-in, both opening `/welcome?from=settings` with Close and Done instead of Skip and Sign in.

Add an email to the allowlist (case-insensitive; the Worker lower-cases it). The `--remote` flag is required for a production write — without it, `wrangler kv key put` writes to the local dev store instead, and nobody can sign in:

```bash
pnpm -C api exec wrangler kv key put --binding BOWER_KV -c wrangler.local.toml --remote "allow:you@example.com" 1
```

Or through the admin endpoint (exists for a future admin page; the KV command above is enough on its own):

```bash
curl -X POST "https://api.example.com/admin/allow" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```

Answers `204` on success, `400 invalid_email` if `email` is missing, empty or has no `@`.

**What someone not on the allowlist sees:** after Google's consent screen, the Worker writes nothing to KV and sends them to the app's **Not invited** screen (`<APP_ORIGIN>/not-invited`), which names the address they used and says to ask you. The address never goes in the URL or the logs: the Worker hands it over in a `bower_not_invited` cookie (HttpOnly, five minutes, the address encrypted inside a signed token), and `GET /me` returns it once as `{ notInvited: true, email }` and deletes the cookie. After a reload the screen says "that account" instead. "Try another account" reopens Google's account picker (`/auth/login?prompt=select_account`).

**What a newly invited person sees:** after Google's consent screen, a short first run: **Welcome** (the bird says hello; "Show me around" or "Skip the tour"), **Where your notes live** (a new Bower folder, recommended, or a folder they already have, through the Drive picker or a pasted link), and **Building your bower** while the Worker creates or completes the folder, then "Continue" to Home. Unless they skipped it, a three-step tour over Home follows (Add, Tidy up, Tell Bower). Finishing or skipping it stores `tourSeenAt` on their user record, so it shows once per account, not once per device; they can replay it from Settings → Show me around again, which leaves `tourSeenAt` alone. Nothing for you to do; `GET /admin/users` does not show `tourSeenAt`.

**Remove someone**, once they can no longer sign in and (if they had already signed in) their data is deleted:

- `pnpm -C api exec wrangler kv key delete --binding BOWER_KV -c wrangler.local.toml --remote "allow:you@example.com"` removes only the invitation — an existing user's data is untouched, so prefer the admin endpoint below for anyone who has already signed in.
- The admin endpoint deletes the invitation **and** every user record for that email (profile, quota counters, cached Drive token, push subscriptions) and revokes Bower's Google access for them (best effort — a failed revoke is logged and does not stop the removal):

  ```bash
  curl -X DELETE "https://api.example.com/admin/allow/you@example.com" \
    -H "Authorization: Bearer $ADMIN_KEY"
  ```

  Answers `204` whether or not anyone had signed in with that email.

Either way, **the Drive folder itself is never touched** — the user keeps every note; only Bower's access and Worker-side records are removed.

To see who has signed in before removing them: `curl "https://api.example.com/admin/users" -H "Authorization: Bearer $ADMIN_KEY"` returns `[{ id, email, hasVault, createdAt }]` — never a token.

## 6. Operations

### Rotate the Claude token

Generate a new one (`claude setup-token` again, or a new API key in the Claude Console), then `gh secret set CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`) in the instance repo. Nothing on the Worker changes; the next run picks up the new value.

### Rotate keys

Each Worker secret is rotated the same way — pipe the new value into `wrangler secret put NAME -c wrangler.local.toml` from `api/` — but they don't all cost the same while the rotation is in flight:

| Secret | What rotating it breaks, until |
| --- | --- |
| `TOKEN_ENC_KEY` | Invalidates **every** stored refresh token at once (they were encrypted with the old key): every user sees `needsReauth: true` and must sign in again before their next run or Drive access. |
| `SESSION_SECRET` | Every existing session cookie stops verifying: every signed-in user is signed out immediately and must sign in again (no data loss — just a fresh sign-in). |
| `BOWER_API_KEY` | The runner's calls to `GET /runner/vaults/:id` and `POST /runner/vaults/:id/status` start answering `401` until the **same** new value is also set as the instance repo's `BOWER_API_KEY` secret (`gh secret set BOWER_API_KEY`, step 4) — rotate both together, or every run fails in between. |
| `GITHUB_TOKEN`, `ADMIN_KEY`, `VAPID_*` | No user-facing disruption: `GITHUB_TOKEN` and `ADMIN_KEY` are only used server-to-server on the next call; a new `VAPID_*` pair invalidates existing push subscriptions (already noted in the variable table) but sign-in and tidying up are unaffected. |

### Quotas

`DAILY_RUN_LIMIT` (default 20) caps `/process` runs per vault per day; `DEFAULT_MAX_TURNS` (default 30) caps how many turns the agent takes per run, unless the instance repo's `BOWER_MAX_TURNS` variable overrides it. Change either in `wrangler.local.toml`'s `[vars]` and redeploy (step 3.6 above).

### Weekly health check

The instance repo's `lint.yml` runs on its own every Sunday at 06:17 UTC: a first job lists every user with a Bower folder (`GET /runner/vaults`, authenticated with `BOWER_API_KEY`), then the check runs once per folder, one at a time. Each run rewrites `Lint Report.md` at the top of that user's folder; the app shows it under **Health**, with a badge when a new one arrives, and each user gets a push `Health check ready` (or `Health check failed`) that opens it. The check never shows up as a Tidy up run in the app: its status is kept apart, under `lintrun:<id>` in KV. A user whose Google access was revoked fails their own run (see Troubleshooting) without stopping the others. To check one folder by hand: instance repo → **Actions** → **Lint vault** → **Run workflow**, with the user id as `vault_id`. To stop the weekly run alone, disable that workflow in the Actions tab (**Lint vault** → **⋯** → **Disable workflow**).

`Lint Report.md`, like Bower's other own files (`CLAUDE.md`, `index.md`, `log.md`, `About-Me.md`, `README.md` and any `Bower - *.md` instruction note), stays out of the app's explorer, Recent, search and switcher by default. The explorer's footer button and Settings → Advanced → "Show Bower's own files" both reveal them, grouped at the bottom of the tree.

### Reading logs

- **Worker**: `pnpm -C api exec wrangler tail -c wrangler.local.toml` streams live requests (method, path, status, exceptions) — nothing here includes note content or credentials (see `CLAUDE.md`'s logging rule and `api/test/log-hygiene.test.ts`).
- **Agent runs**: the instance repo's **Actions** tab lists every `ingest` / `lint` run, with step names, timestamps and counts only. A failed run's reason is in `GET /status`'s `error` (for the weekly health check, in the `error` of the `lintrun:<id>` KV value instead); the full stderr and rclone output are the `bower-logs` artifact (`bower-logs-<n>` for each failed folder of the weekly health check), uploaded only `if: failure()`, kept 3 days (`agent/README.md`) — safe only because the instance repo is private.

### Security headers check

After deploying (`scripts/deploy.sh`, or any change to `app/public/_headers` or `api/src/security.ts`), check both origins at [securityheaders.com](https://securityheaders.com): enter `APP_ORIGIN`, then separately `API_ORIGIN`. Target **A** on the app. The Worker only ever serves JSON and the one "Not invited" HTML page, so the site's own scale doesn't quite apply to it; just confirm `Strict-Transport-Security` and `Content-Security-Policy: frame-ancestors 'none'` show up on its report.

A grade below A on the app usually means `app/public/_headers` didn't ship with the deploy — check the build actually generated it: `grep -n "" app/dist/_headers` (`pnpm -C app build` writes it from `VITE_API_URL` and, if set, `VITE_GOOGLE_API_KEY`; without `VITE_API_URL` it warns and falls back to `connect-src 'self'` alone, but a value that's set and not a URL fails the build outright rather than shipping a placeholder).

### Costs to watch

- **Cloudflare free tier**: Workers requests, KV reads/writes and Pages builds all have a free monthly allowance; the dashboard's Analytics tab for the Worker and the KV namespace shows current usage against it.
- **GitHub Actions minutes**: 2,000 free minutes a month on a private repo; each run is capped at 20 minutes (`timeout-minutes` in the workflows), and the weekly health check adds one run per user every Sunday — the Actions tab's usage view (or **Settings → Billing** on the account owning the instance repo) shows the month's total.
- **Anthropic usage**: a Claude subscription's own usage limits, or an API key's billed usage in the Claude Console — whichever the instance repo's `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` draws on.

## 7. Pause and teardown

### Pause (reversible; nobody loses data)

Disabling GitHub Actions on the instance repo is the one switch that stops runs without touching anything else: **instance repo → Settings → Actions → General → Disable actions**. Effect: `repository_dispatch` events the Worker sends on `/process` are simply not delivered — the app still lets people sign in, browse and add notes to the inbox, but nothing ever gets picked up until Actions is turned back on, at which point the queued work (whatever is sitting in `0-Inbox/` and `Clippings/`) runs the next time Tidy up is tapped. The Worker, Pages, KV, the allowlist and every user's Drive folder are all untouched.

### Teardown (destructive; irreversible past this point)

In order:

1. **Instance repo**: disable or delete it (GitHub → Settings → Danger Zone). This stops the agent for good.
2. **Cloudflare Pages**: from `app/`, `../api/node_modules/.bin/wrangler pages project delete NAME -y` — deletes the deployed app and its custom domain mapping.
3. **Cloudflare Worker**: `pnpm -C api exec wrangler delete -c wrangler.local.toml` — deletes the Worker (`--force` if something else depends on it, which nothing should).
4. **Cloudflare KV**: `pnpm -C api exec wrangler kv namespace delete --binding BOWER_KV -c wrangler.local.toml` — deletes the allowlist, every user's profile, quota counters, cached Drive tokens and push subscriptions. Do this last, since steps 2–3 don't need it gone first.
5. **Google Cloud**: optionally delete the OAuth client (Credentials) or the whole project, to stop it counting against any Google-side quota. Not required — an orphaned, disabled client is harmless.

**Never touched, at any step above:** every user's Drive folder and everything in it. Teardown removes the Worker's and Pages' ability to serve anyone and every record the Worker itself kept; it does not, and cannot, reach into a user's Google Drive. Users keep their notes.

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Every request, including `/health`, answers `500 {"error":{"code":"config","message":"missing NAME"}}` | That secret or var is missing, or was set to an empty value (an empty `printf` piped into `wrangler secret put` still "succeeds") | `printf '%s' "$value" | wrangler secret put NAME -c wrangler.local.toml` with a real, non-empty `$value`, then redeploy if it was a var in `[vars]` instead |
| Sign-in lands on the app's "Not invited" screen | The email isn't in the allowlist, or was typed with different case/whitespace than what the operator added | Add it: step 5's `wrangler kv key put ... --remote "allow:<email>" 1` (lower-case; the Worker lower-cases what it checks, but the KV key itself must already be lower-case) |
| Google shows `redirect_uri_mismatch` | The OAuth client's authorized redirect URI doesn't exactly match `<API_ORIGIN>/auth/callback` (scheme, host or trailing slash differs) | Google Cloud Console → Credentials → the OAuth client → fix the redirect URI to match `API_ORIGIN` exactly |
| Signed out on every page load, or the cookie is never kept | `APP_ORIGIN` and `API_ORIGIN` don't share a registrable domain (e.g. one is still `*.pages.dev` or `*.workers.dev`) — `SameSite=Lax` means the browser won't send the cookie cross-site | Give both custom domains under one domain you own (step 3.8–3.11), and make sure `[vars]` in `wrangler.local.toml` has the real `APP_ORIGIN`/`API_ORIGIN`, not the placeholders |
| A Tidy up run stays `queued` and never moves to `running` | The Worker's dispatch reached GitHub but the workflow didn't run: `GITHUB_TOKEN` lacks `contents: write` on the instance repo, or `GITHUB_REPO` doesn't match the instance repo's real `owner/name` | Check the instance repo's **Actions** tab for a run at all; if there's none, fix `GITHUB_REPO` (`[vars]`) or re-issue `GITHUB_TOKEN` with the right scope and repo. A run that stays `queued` past 25 minutes with no runner pickup unblocks itself for a retry (`QUEUED_STALE_MS`) |
| Push notifications never arrive | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` unset (falls out as `500 config`, same as any missing secret) or the user is on iOS without having installed the app to the home screen (iOS only delivers web push to an installed PWA) | Set the VAPID secrets (step 3.4–3.5); on iOS, tell the user to add the app to their home screen first |
| Everyone is signed out again after 7 days | The Google OAuth consent screen is still in **Testing** — refresh tokens issued to test users expire after 7 days there | Publish the app (step 2) |
| Pasting a link into Add saves a note but doesn't summarise it | Expected: the link becomes `Link - <host> <date> <time>.md` in the inbox right away, and the agent reads the page during the next Tidy up run, not when the note is saved | Run Tidy up to have Bower read it |
| A Tidy up run's log or a note the agent wrote suggests the model tried to reach the Drive API, the Worker, or read `BOWER_API_KEY`/an access token, and couldn't | By design: `claude -p` runs under `env -i` with an explicit allow-list (`agent/run.sh`), so the model's own process never has the Drive token, `BOWER_API_KEY` or any other `BOWER_*`/`RCLONE_CONFIG_*` value, even though the surrounding shell does the sync down/up and the status report. A prompt-injected note (untrusted text in `0-Inbox/` or `Clippings/`) asking the model to use one of those must fail | Nothing to fix; this is the runner's minimal-environment guarantee (`docs/security.md` §6) |

## What the app hides

The explorer, Recent, search and the switcher never show: any dot-folder at any depth (`.obsidian`, `.claude`, `.trash`, whatever another editor adds), anything under a `Processed/` folder, folder notes (`_*.md`) and dot-files (`.hidden.md`-style) — one rule, `isHidden` in `app/src/vault-index.ts`. Opening the folder in Obsidian, or any other editor, never changes what the app shows. With "Show Bower's own files" on, `.claude` alone reappears in the explorer's "Bower's files" group as "Agent settings" (read-only, opens in Drive); every other dot-folder stays hidden regardless of that setting.

## Extensions

Optional modules an operator can add on top of their own instance, kept out of the core deploy: `docs/extensions/email-in.md` (a Gmail-fed inbox), not built, design only.

## Appendix: local sign-in test

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
7. Open `http://localhost:8787/me` in the same browser: it returns `{ email, vault, quota: { used, limit }, needsReauth, hasApiKey }`, plus `tourSeenAt` once the first-run tour was finished or skipped. `curl -X POST http://localhost:8787/auth/logout` answers 204; after signing out in the browser, `/me` answers 401.
8. Sign in with a Google account that has no `allow:` key: you land on `http://localhost:5173/not-invited`, which shows that address (no address in the URL), and the key list from step 6 is unchanged. Reload: it now says "that account". "Try another account" opens Google's account picker.
9. Signed in, open `http://localhost:8787/drive/token`: it returns `{ accessToken, expiresAt, folderId }`. Then `curl -H "Authorization: Bearer <accessToken>" "https://www.googleapis.com/drive/v3/files?pageSize=1"` answers 200 with a `files` list.
10. Revoke Bower at myaccount.google.com → Security → Your connections to third-party apps (permissions), drop the cached token with `pnpm -C api exec wrangler kv key delete --local --binding BOWER_KV "drivetoken:<id>"` (or wait up to an hour for it to expire), then open `/drive/token`: it answers 401 `reauth`, and `/me` now reports `needsReauth: true`.
11. Create a vault (sign in again first if you did step 10). Copy the `bower_session` cookie value from the browser's developer tools, then run `curl -X POST -H "cookie: bower_session=<value>" -H "Origin: http://localhost:5173" -H "content-type: application/json" -d '{"mode":"create"}' http://localhost:8787/vault`. It answers 201 with `{ vault: { folderId, inboxFolderId, name } }`, and `/me` shows the same `vault`. In drive.google.com, My Drive now has a `Bower` folder holding `CLAUDE.md`, `index.md`, `log.md`, `About-Me.md` and the folders `0-Inbox` (with `Processed`), `1-Projects`, `2-Areas`, `3-Resources`, `4-Archives`, `Answers`, `Clippings`. Running the same command again answers 409 `vault_exists`. (The `Origin` header is required since #19: a state-changing session route without it, or with a different origin, answers 403 `forbidden`.)
12. Select an existing folder. In drive.google.com, pick a folder that already has notes (an Obsidian vault, or a copy of one) and note each file's "Last modified" time; the folder id is the last part of its URL. Run step 11's command with `-d '{"mode":"select","folderId":"<id>"}'`. It answers 200; no existing file changed (same modified times and content), only the template files and folders the folder lacked were added, and `0-Inbox` exists.
13. Signed in again, get the session cookie's value from the browser, then `curl -X DELETE http://localhost:8787/me -b "bower_session=<value>" -H "Origin: http://localhost:5173"` answers 204; `pnpm -C api exec wrangler kv key list --local --binding BOWER_KV` no longer lists that `user:<id>` or `email:<email>`, and drive.google.com still shows the folder the sign-in created.
14. Tidy up. Set `GITHUB_REPO` (your instance repo, `owner/name`) and `GITHUB_TOKEN` (fine-grained, `contents: write` on that repo only) in `api/.dev.vars`, restart the Worker, sign in and set up a vault (step 11). Run `curl -X POST http://localhost:8787/process -b "bower_session=<value>" -H "Origin: http://localhost:5173"` twice within a few seconds: both answer 202 with the same `run.runId`, and the instance repo's Actions tab shows a single `ingest` run (event `repository_dispatch`).
15. Runner endpoints. With the Worker running and a vault set up (step 11), take the user id from the `user:<id>` key (step 6) and `BOWER_API_KEY` from `api/.dev.vars`, then run `curl -H "Authorization: Bearer $BOWER_API_KEY" http://localhost:8787/runner/vaults/<user id>`. It answers 200 with `{ folderId, inboxFolderId, driveAccessToken, expiresAt, maxTurns }` (plus `apiKey` if the user set one); `curl -H "Authorization: Bearer <driveAccessToken>" "https://www.googleapis.com/drive/v3/files?pageSize=1"` answers 200. Without the header, or with another key, it answers 401. Then report progress: `curl -X POST -H "Authorization: Bearer $BOWER_API_KEY" -H "content-type: application/json" -d '{"state":"running"}' http://localhost:8787/runner/vaults/<user id>/status` answers 200 with the run in `running`; the same with `-d '{"state":"done","summary":"Test run."}'` answers 200 with the run in `done` and a `finishedAt`.
16. Push setup. Run `pnpm -C api gen-vapid` and put the two `VAPID_` lines it prints in `api/.dev.vars`, then restart the Worker. `curl http://localhost:8787/push/public-key` answers `{ publicKey }` with the same public key. (Manual, pending the owner.)
17. Push to a real browser. Signed in on the app in Chrome (Android, or desktop), allow notifications so the app posts its subscription to `POST /push/subscribe` (204; `wrangler kv key list --local --binding BOWER_KV` lists a `push:<id>:<hash>` key). Report a run done as in step 15 with `-d '{"state":"done","processed":["a.md","b.md"]}'`: the device shows "Bower: 2 files tidied up". Unsubscribe or clear the site's data in the browser and report again: the push service answers 410 and the `push:` key is gone. (Manual, pending the owner; needs the app side of push, #39.)
