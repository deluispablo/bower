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
5. Sets the Worker's secrets (see "Every variable the Worker reads" below). It generates `SESSION_SECRET`, `TOKEN_ENC_KEY`, `ADMIN_KEY` and the VAPID pair itself and pipes them straight into `wrangler secret put`, and asks (input hidden) for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GITHUB_TOKEN`; an empty answer is refused. `ADMIN_KEY` is written to `api/.prod.secrets` (git-ignored, readable only by you): that file is the only place it is kept.
6. Builds the app with `VITE_API_URL` set to your `API_ORIGIN` and deploys it to Cloudflare Pages, creating the Pages project (`bower-app`, or whatever `PAGES_PROJECT` says) the first time.
7. Prints what is left to do by hand, with your real values filled in.

No secret value is ever printed to the terminal.

### Left to do by hand (once)

1. **App custom domain.** Wrangler cannot set it. Cloudflare dashboard → Workers & Pages → your Pages project (`bower-app`) → Custom domains → Set up a custom domain → add `app.example.com` (your real app domain).
2. **Google OAuth client.** Check the authorized redirect URI (`https://api.example.com/auth/callback`), the privacy policy URL (`https://app.example.com/privacy`) and the terms of service URL (`https://app.example.com/terms`) the script printed.
3. **Smoke check:** `curl https://api.example.com/health` (your real `API_ORIGIN`) should answer 200.
4. **Invite the first user:** see section 5 below; `ADMIN_KEY` is in `api/.prod.secrets`.
5. **Harden your instance:** see section 9 below, once you're ready to invite people beyond yourself.

### Rerunning and updating

The script is idempotent. After `git pull` here, rerun `bash scripts/deploy.sh`: it redeploys the Worker and the app, re-copies the workflows and agent files into the instance repo (pushing only if they changed), reuses the KV namespace and the Pages project, and skips every secret that is already set.

`bash scripts/deploy.sh --rotate` sets every secret again, in the Worker and in the instance repo. It asks for the Google client id and secret, the GitHub token and the Claude credential again, and generates new values for the rest, so: everyone is signed out and has to sign in with Google again (new `SESSION_SECRET` and `TOKEN_ENC_KEY`), every device has to allow notifications again (new VAPID pair), and `api/.prod.secrets` gets the new `ADMIN_KEY`.

Update the Worker together with the instance repo, never the instance repo alone: the Worker checks the runner's reports strictly, so a newer `run.sh` can send a field an older Worker refuses. For example, since #375 a failed run reports a `reason` for people (Drive did not answer, took too long, Claude unavailable, the folder changed, or unknown); a Worker older than that answers the report with a 400 and the run shows no reason. `deploy.sh` does both in one go.

To update only the Worker: `bash scripts/deploy-api.sh` (or `pnpm -C api deploy`), and `bash scripts/deploy-api.sh secrets [--rotate]` (or `pnpm -C api secrets`) for its secrets. They read and create `api/wrangler.local.toml` the same way; `secrets` sets Worker secrets only: the instance repo holds no Worker key.

### Upgrading to run tickets

Since #259, no job that runs the agent holds `BOWER_API_KEY`. For every run, the Worker mints a ticket good for that one run of that one Bower folder and sends it with the run's `repository_dispatch`; the run's job hands it to `run.sh` and never sees `BOWER_API_KEY`. (Until #292 the weekly health check's `dispatch` job still held `BOWER_API_KEY`; see "Upgrading to the Worker-side weekly lint" below.) The workflows changed shape with it, so **an instance repo set up before this must be updated**: rerun `bash scripts/deploy.sh` (or `bash scripts/new-instance.sh` if you only update the instance repo). No new secret or variable is needed.

- A normal update (`git pull`, then `bash scripts/deploy.sh`) updates the Worker and the instance repo together; nothing else to do. A Tidy up pressed in the minute between the two may fail once; press it again.
- The Worker does not accept the old key on the runner routes (#291; the `RUNNER_ACCEPT_LEGACY_KEY` bridge is gone, and so is `GET /runner/vaults`). If you deploy the Worker on its own before updating the instance repo, its old workflows fail every run with `failed: fetch vault info: HTTP 401` until you rerun `bash scripts/deploy.sh` (or `bash scripts/new-instance.sh`).
- By hand: **Ingest** no longer has a **Run workflow** button (a manual run would have no ticket); press Tidy up in the app instead. **Lint vault** has no **Run workflow** button either (#292): to check one folder by hand, see "Weekly health check" in section 6.

### Upgrading to the Worker-side weekly lint

Since #292 the weekly health check starts from a Worker cron trigger (Sundays 06:17 UTC, `[triggers] crons` in `api/wrangler.toml`), not from a job in the instance repo, so nothing there holds a Worker key any more. To upgrade:

1. Redeploy the Worker (`git pull`, then `bash scripts/deploy-api.sh`, or `bash scripts/deploy.sh` for everything): the cron trigger takes effect with the deploy (an `api/wrangler.local.toml` from before #292 has no `[triggers]` block; the script adds it and says so).
2. Run `bash scripts/new-instance.sh` (`scripts/deploy.sh` does it for you) to copy the new `lint.yml`, which has no schedule and no `dispatch` job, into the instance repo.
3. Delete the `BOWER_API_KEY` secret from the instance repo by hand: `https://github.com/OWNER/bower-home/settings/secrets/actions` (your instance repo; **Settings** → **Secrets and variables** → **Actions** → **Repository secrets** → the bin icon next to `BOWER_API_KEY`). The script prints this link while the secret is still there. Then delete the Worker's copy too: `wrangler secret delete BOWER_API_KEY -c wrangler.local.toml` from `api/` (harmless if left: the Worker no longer reads it).

Until step 2, an old `lint.yml` in the instance repo still runs on its own schedule and its `dispatch` job gets a `401` from the Worker; that is harmless, and the Worker's own cron has already started the checks.

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
4. **Optional: the Google Picker**, for the "Choose a folder" button on onboarding and the "From your Drive" button on Add (without it, onboarding falls back to pasting the folder link and Add hides "From your Drive"). Both use the same key and the Drive access the app already has; nothing new to grant.
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

Settings' footer shows which commit is live (`Bower 0.1.0 · a1b2c3d`, #512): `vite.config.ts` bakes in Cloudflare Pages' own `CF_PAGES_COMMIT_SHA` when the build runs there, or `git rev-parse --short HEAD` otherwise (step 9's manual build, or `pnpm build` locally); neither available just drops the commit, not the whole line.

`APP_ORIGIN` and `API_ORIGIN` **must share a registrable domain** (e.g. `app.example.com` and `api.example.com`): the session cookie is `SameSite=Lax`, so on the default `*.pages.dev` / `*.workers.dev` hostnames the browser never sends it and nobody can stay signed in. Full mechanics in `docs/security.md`.

### Every variable the Worker reads

`api/src/env.ts`'s `assertEnv` validates all of this on every request and fails loudly (`500 config`, naming the first missing one) if anything required is absent.

| Name | Secret or var | How to obtain | Example |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Secret | Google Cloud Console → APIs & Services → Credentials, the OAuth client (step 2) | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Secret | Same OAuth client | `GOCSPX-replace-me` |
| `SESSION_SECRET` | Secret | Generate: `openssl rand -base64 32` | `replace-me` |
| `TOKEN_ENC_KEY` | Secret | Generate: `openssl rand -base64 32` (must decode to exactly 32 bytes; encrypts stored Google refresh tokens) | `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=` |
| `GITHUB_TOKEN` | Secret | GitHub → Settings → Developer settings → Fine-grained token on the instance repo only: `contents: write` (to start runs) and `actions: read` (to read how a run's job ended when the runner never reported, #315) | `github_pat_replace-me` |
| `ADMIN_KEY` | Secret | Generate: `openssl rand -base64 32`; bearer key for the admin endpoints | `replace-me` |
| `SESSION_SECRET_PREVIOUS` | Secret (optional) | Only set during a `SESSION_SECRET` rotation, so old session cookies keep verifying for a while — see "Hardening your instance" § Rotating `SESSION_SECRET` without signing everyone out | `replace-me` |
| `VAPID_PUBLIC_KEY` | Secret | `pnpm -C api gen-vapid`, once per instance: base64url of the raw 65-byte P-256 public key. Keep it — a new pair invalidates every browser's push subscription | `replace-me` |
| `VAPID_PRIVATE_KEY` | Secret | Same `gen-vapid` run as above: base64url of the 32-byte private key | `replace-me` |
| `APP_ORIGIN` | Var | The app's deployed origin (Cloudflare Pages) | `https://app.example.com` |
| `API_ORIGIN` | Var | The Worker's deployed origin (Cloudflare Workers) | `https://api.example.com` |
| `GITHUB_REPO` | Var | The operator's private instance repo, `owner/name` | `OWNER/bower-home` |
| `VAPID_SUBJECT` | Var | A contact URI for push, `mailto:` an address the operator reads | `mailto:you@example.com` |
| `DAILY_RUN_LIMIT` | Var (default `100`) | How many `/process` runs a vault may start per day | `100` |
| `DEFAULT_MAX_TURNS` | Var (default `60`) | Default `--max-turns` passed to the agent when a run doesn't set its own | `60` |
| `TEMPLATE_FOLDER_NAME` | Var (default `Bower`) | Name of the folder created in the user's Drive from `vault-template/` | `Bower` |
| `APP_VERSION` | Var | Set by `[vars]` in `wrangler.toml`; predates this contract (#6) | `0.1.0` |
| `BOWER_KV` | Binding | `wrangler kv namespace create BOWER_KV`, bound in `[[kv_namespaces]]` | `KV_NAMESPACE_ID` |

## 4. Instance repo from the template

The instance repo is a private repo of the operator's own that only holds the agent's workflows and its own secrets — never this repo's code, never a user's vault content (see "Two repositories per deployment" in `ARCHITECTURE.md`).

Each run installs what the runner needs on GitHub's `ubuntu-latest`: `rclone`, `pandoc`, `poppler-utils` (for `pdftotext`, which reads the text of PDFs so `run.sh` can append it to each document's text copy after the run) and Claude Code. `pandoc` stays even though the agent can no longer call it: `agent/run.sh` itself uses it, in sandbox mode, to turn the Word, OpenDocument, HTML, EPUB and RTF files waiting in the inbox into Markdown before the agent starts (see "Document conversion" in `agent/README.md`).

There are two ways to get one:

- **`scripts/new-instance.sh` (recommended).** `scripts/deploy.sh` runs it for you; on its own it is `bash scripts/new-instance.sh [OWNER/NAME] [--rotate]`. It creates `OWNER/NAME` as a private repo with `gh repo create --private` (or updates it if it exists), copies `agent/workflows/*.yml` into `.github/workflows/` and `agent/run.sh`, `agent/claude-settings.json` (the agent's permission policy) and `agent/prompts/` into `agent/`, commits and pushes when something changed, asks for the Claude credential (skipped when one is set, unless `--rotate`) and sets `BOWER_API_URL`. The repo holds only what the runner needs. `ingest.yml` and `lint.yml` pin every `uses:` to a commit SHA (Dependabot keeps this repo's copies current); rerun `scripts/new-instance.sh` after a `git pull` here to carry a bump into the instance repo, same as any other workflow change.
- **"Use this template"** on this repository's GitHub page creates a private copy of the whole repository instead: code, docs, this repo's CI. The workflows still have to be in its `.github/workflows/` and the secrets set, so run `bash scripts/new-instance.sh OWNER/NAME` against it afterwards (it only adds and updates files, never removes any), or let `scripts/deploy.sh` do it with that repo as your instance repo. Marking this repository as a template is a GitHub setting (Settings → General → Template repository) that the maintainer turns on; until then, the button is not shown.

Either way, set these under the instance repo's **Settings → Secrets and variables → Actions**:

| Name | Kind | How to obtain |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | Secret (this or `ANTHROPIC_API_KEY`) | `claude setup-token`, using the operator's Claude subscription |
| `ANTHROPIC_API_KEY` | Secret (this or `CLAUDE_CODE_OAUTH_TOKEN`) | Claude Console → API keys |
| `BOWER_API_URL` | Variable | The Worker's deployed origin, same as `API_ORIGIN` | 
| `BOWER_MAX_TURNS` | Variable (optional) | Overrides the Worker's `DEFAULT_MAX_TURNS` for this instance |
| `BOWER_ALLOW_WEB` | Variable (optional) | Leave unset (the default): the agent gets no web access, so a clipped page cannot make it send notes anywhere. This variable is the instance's half of the one way a run can reach the network: with `1`, a tidy-up gets `WebSearch` and `WebFetch` only for a user who also turned on **Let Bower look things up on the web** in Settings (stored by the Worker, sent as the dispatch's `allow_web`, #374). Unset, the Settings switch still shows and saves, but no run gets the web. Only set it if your users need the web, and tell them (`docs/privacy.md`). The weekly lint never gets the web tools. See "Tools and web access" in `agent/README.md` |

With the GitHub CLI, from the instance repo's checkout (or add `-R OWNER/bower-home`):

```bash
gh secret set CLAUDE_CODE_OAUTH_TOKEN   # or: gh secret set ANTHROPIC_API_KEY
gh variable set BOWER_API_URL --body "https://api.example.com"
```

`GITHUB_TOKEN` (the Worker secret from step 3) is a **separate**, fine-grained GitHub token — scoped to `contents: write` on this same instance repo only — that the Worker uses to fire `repository_dispatch` and start a run; it is not one of the instance repo's own secrets above.

## 5. First user, and inviting others

**Before any of this**, a signed-out visitor on `/` or `/login` who has never seen it on this device lands on **What is Bower** (`/welcome`): nine swipeable pages (drop it and Bower files it, where things go, what it does when you ask, a window onto your own Drive, one example for each of the four folders (a project, an area, a resource, the archive), and what to start with). Skip, or reaching the last page, remembers `bower:intro:seen` in that browser's `localStorage`, so later visits go straight to the sign-in; Skip and the last page's Sign in with Google both move on to it. It never interrupts a deep link (a shared note link, Privacy, Terms, Not invited) and never shows again to someone already signed in on this device. It is reachable again any time from Settings → Advanced → What is Bower and from the "What is Bower?" link on the sign-in, both opening `/welcome?from=settings` with Close and Done instead of Skip and Sign in.

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

**What Add from your Drive does and does not touch:** "From your Drive" on Add opens the Google Picker over the user's whole Drive (recent files, their own, shared with them, starred). Each file picked is copied into their `0-Inbox` with Drive's own copy (`files.copy`), under the same name (made unique in the inbox); the original keeps its id, its folder and its content. A picked folder gives its own files, not its subfolders, 50 at most per folder (the app says so when there are more). The Bower folder and what sits right in it are left out. Google Docs, Sheets and Slides are converted on the way in: Docs become Markdown, Sheets a table, Slides a PDF; everything else is copied as it is (#218). Nothing starts a Tidy up run; the Picker script only loads once the button is pressed.

**What a newly invited person sees:** after Google's consent screen, a short first run: **Welcome** (the bird says hello; "Show me around" or "Skip the tour"), **Where your notes live** (a new Bower folder, recommended, or a folder they already have, through the Drive picker or a pasted link), and **Building your bower** while the Worker creates or completes the folder, then "Continue". With `VITE_GOOGLE_API_KEY` set, "Continue" goes on to one more screen, **Start with what you have**: "Pick files from my Drive" opens the same Picker and copy-or-export-into-inbox path as Add's "From your Drive" (the queue shows on the same screen; "Continue" appears once it settles), or "Later" to skip it; without the key this screen is skipped and "Continue" goes straight to Home. Unless they skipped the tour on Welcome, a three-step tour over Home follows (Add, Tidy up, Tell Bower). Finishing or skipping it stores `tourSeenAt` on their user record, so it shows once per account, not once per device; they can replay it from Settings → Show me around again, which leaves `tourSeenAt` alone. Nothing for you to do; `GET /admin/users` does not show `tourSeenAt`.

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
| `SESSION_SECRET` | Every existing session cookie stops verifying: every signed-in user is signed out immediately and must sign in again (no data loss — just a fresh sign-in) — unless you rotate it with a grace window instead: "Hardening your instance" § Rotating `SESSION_SECRET` without signing everyone out. |
| `GITHUB_TOKEN`, `ADMIN_KEY`, `VAPID_*` | No user-facing disruption: `GITHUB_TOKEN` and `ADMIN_KEY` are only used server-to-server on the next call; a new `VAPID_*` pair invalidates existing push subscriptions (already noted in the variable table) but sign-in and tidying up are unaffected. |

### Quotas

`DAILY_RUN_LIMIT` (default 100) caps `/process` runs per vault per day; `DEFAULT_MAX_TURNS` (default 60, see "Rulebook v22 and the turn budget") caps how many turns the agent takes per run, unless the instance repo's `BOWER_MAX_TURNS` variable overrides it. Change either in `wrangler.local.toml`'s `[vars]` and redeploy (step 3.6 above). A waiting request's **Do it now** on the Bower tab is a run too (`POST /process` with `scope: "instructions"`) and counts the same; the dispatch carries `client_payload.scope`, which `ingest.yml` hands to `run.sh` (#373): Do it now runs only the instruction notes directly in `0-Inbox/` and leaves every other inbox file, `Clippings/` included, and Add's context notes where they are for the next Tidy up. An instance repo set up before #373 still has the old `ingest.yml`, which drops the field, so Do it now there tidies up the whole inbox: rerun `bash scripts/new-instance.sh OWNER/bower-home` to update it. A request sent from the Bower tab while a run is queued or running is left in `0-Inbox/` for the next run (#491): the runner compares the note's Drive modified time with the run's `requestedAt`, which the Worker hands it with the vault info; with a Worker deployed before #491 there is no `requestedAt` and such a request is taken by the run in flight, as before.

**Limits note.** At the default of 100 runs a day, one busy person can use a real share of the instance repo's 2,000 free GitHub Actions minutes a month (a run is capped at 20 minutes). The app shows no run count, so watch Actions usage in the repo's billing settings and lower `DAILY_RUN_LIMIT` if the minutes run short. The KV write budget (see "KV write budget") is shared by everyone on the instance too.

The runner also caps what one run may change: `BOWER_MAX_CHANGES` (default 200) is the most files a run may add or change. Above it, `agent/run.sh` reverts the whole run: nothing is uploaded or deleted, originals stay in the inbox, and the report's summary starts `Refused: too many changes`. The workflows do not pass it yet, so every instance uses the default; to change it, add `BOWER_MAX_CHANGES: <n>` to the `Run` step's `env:` in both workflows. Files the agent may not change (anything outside the vault's known folders, `CLAUDE.md`, `README.md`, `.claude/`) are reverted the same way, one by one; see "Protected paths and the post-run audit" in `agent/README.md`.

### Weekly health check

Every Sunday at 06:17 UTC the Worker's own cron trigger (`[triggers] crons` in `api/wrangler.toml`) starts one run of the instance repo's `lint` job per user with a Bower folder, each with its own ticket (a separate workflow run per folder, side by side). Nothing in the instance repo starts it or holds a key for it. A failed dispatch shows in the Worker's logs as `Weekly lint failed: dispatch`. Each run rewrites `Lint Report.md` at the top of that user's folder, its frontmatter carrying three figures the app's Health screen reads: `notes` (files listed in `index.md`), `findings` (items in the report's checklist, memory hygiene findings on `Rules.md` included) and `brokenLinks` (wikilinks with no target); the app shows the report under **Health**, with a badge when a new one arrives, and each user gets a push `Health check ready` (or `Health check failed`) that opens it. The check never shows up as a Tidy up run in the app: its status is kept apart, under `lintrun:<id>` in KV. A user whose Google access was revoked fails their own run (see Troubleshooting) without stopping the others. To check one folder by hand, with the admin key from `api/.prod.secrets`: `curl -X POST -H "Authorization: Bearer $ADMIN_KEY" -H 'Content-Type: application/json' --data '{"vaultId": "USER_ID"}' https://api.example.com/runner/lint/dispatch` (leave the body out, or `{}`, to check every folder). To stop the weekly run alone, remove the `[triggers]` block from `api/wrangler.local.toml` and redeploy the Worker (`bash scripts/deploy-api.sh`).

`Lint Report.md`, like Bower's other own files (`CLAUDE.md`, `Rules.md`, `index.md`, `log.md`, `About-Me.md`, `README.md` and any `Bower - *.md` instruction note), stays out of the app's explorer, Recent, search and switcher by default. The explorer's footer button and Settings → Advanced → "Show Bower's own files" both reveal them, grouped at the bottom of the tree, `Rules.md` as "Your rules" and `About-Me.md` as "About me".

### Updating Bower's rules

Each Bower folder holds three rule files with three owners: `CLAUDE.md` is Bower's rulebook, copied from `vault-template/CLAUDE.md` and never edited by the agent; `Rules.md` holds the user's own rules (a sentence sent from the Bower tab that starts with "From now on", "Always", "Never" or "Every time" is added by the app at once, under the topic heading it names, with no run; the agent adds the other permanent ones a user asks for); `About-Me.md` is the user's profile. The agent reads them in that order, and `Rules.md` wins over `CLAUDE.md` except for the rulebook's protected-path rules.

`CLAUDE.md` carries `bower_rules_version` in its frontmatter; one without it (every folder created before #197) counts as version 1. A deploy whose template has a higher number does not touch anyone's folder. Instead, each user sees **Settings → Advanced → "Update Bower's rules (v1 → v2)"** once the app has read their rulebook. Tapping it:

1. Appends to `Rules.md`, unchanged, everything the user had added to the old rulebook, creating `Rules.md` from the template if the folder has none. First the lines under its `## Rules` heading; then, under a `## Migrated from your old rulebook (v1)` heading, every `##` or `###` section the template has no heading for (a custom workflow such as `### Recipes`), whole, and for a section both have (`## Tags`, with the domain tags the user added), that section's heading and the lines the template lacks. A line counts as Bower's when the current template or any earlier version of it has it (`app/src/rulebook-retired.ts`), so outdated template wording is replaced, not copied. Folders already at version 2 or later have nothing to move.
2. Replaces `CLAUDE.md` with the template's, the one write the app ever makes to that file.

`About-Me.md` and every note are left alone. Both writes are checked against the file's last-modified time, so a run or another device writing at the same moment makes the update fail with a short message; trying again later is safe and never copies a line twice. Anything a user added before the first `##` heading (frontmatter, title, intro) is not carried over. Drive keeps the previous `CLAUDE.md` in the file's version history (in drive.google.com, right-click the file → **File information → Manage versions**) if anything needs to be copied back by hand.

When you change `vault-template/CLAUDE.md` in a way existing folders should receive, bump `bower_rules_version` by one in the same PR, and add every line you removed or reworded to `app/src/rulebook-retired.ts`; see `vault-template/README.md`.

### Rulebook v22 and the turn budget

Rulebook v22 (#790) adds "How Bower thinks": a score and a verdict first, the project note's `## Reference` reused, disagreements and next steps written to `.bower/checks.txt` and `.bower/next.txt`, and an append-only `## History` in each note Bower writes. The runner reads those two files and writes the History lines for filing, moves and status changes (#788). Deploy the runner (the instance repo's `run.sh`) and the Worker first, then let users apply v22 from Settings: a v22 folder on an older runner leaves the two files in `.bower/` unread.

Thinking costs turns, so `DEFAULT_MAX_TURNS` went from 30 to 60 after a measurement (#789). A fictional pile of 10 items (four flat listings, a job offer, a receipt, two short notes, a web clip and a photo caption, all as text) plus one context note was tidied up once per rulebook with the ingest prompt, `run.sh`'s tool flags, no web tools and `--max-turns 150`:

| Rulebook | Turns | Turns per item | Tool calls |
|---|---|---|---|
| v21 | 42 | 4.2 | 41 |
| v22 draft | 32 | 3.2 | 31 |

Turns vary from run to run as much as between the two rulebooks (a second setup gave 30 and 30), so the default is about 1.5 times the highest run, not the v22 one. The runs were local, not on the instance: the turn count depends only on the agent, the prompt and the rules, not on Drive. An instance with its own `DEFAULT_MAX_TURNS` in `wrangler.local.toml`, or a `BOWER_MAX_TURNS` variable, keeps that value: raise it to 60 by hand if it is lower.

### One tidy-up, phase by phase

`agent/run.sh` runs these in this order; each has its own bullet under "What a tidy-up does with each file" below. The log names each step and counts, never a file name.

1. **Reconcile** (#597). List the Bower folder with Drive ids and compare with `.bower/paths.json` from the last run: a file the person moved in Drive or Obsidian gets its `index.md` row rewritten and a `Moved by you:` line in `log.md`. Best effort.
2. **Agent.** Convert documents with pandoc, pre-scan and quarantine, set aside what Bower only keeps (`kept-not-read`, `too-large`, `unconvertible`, `quarantined`), then `claude -p` inside the folder, following its `CLAUDE.md`. The agent files, writes notes and companion notes; it never deletes.
3. **Audit and moves** (#595). Revert what the agent may not change; then move in Drive itself each file it moved or renamed (same content at a new path), so the file keeps its Drive id.
4. **Bookkeeping** (#596). Without AI, book each move in `index.md`, in the links that name the file and in `log.md`.
5. **Upload.** Copy up the accepted files the agent added or changed and did not move; delete only the pending originals the move phase did not move.
6. **File facts** (#610). Count PDF pages, Excel sheets and ZIP entries without AI into `.bower/file-facts.json`; write `.bower/paths.json` for the next reconcile.
7. **Report** (#598). Write `.bower/last-run.json` and one `log.md` line, then send the report (with `to`, `renamedFrom`, `setAside` and `added`) to the Worker, which keeps it for `GET /status` and `GET /runs`.

Known gap: the Add screen's sources line cannot say "email" yet, because `QueueItem` in `app/src/add-queue-store.ts` has no "shared" origin. Recorded here, not implemented.

### Deploy order for a v4 update

Worker first, then the runner, then the app:

1. **Worker**: `bash scripts/deploy-api.sh` (or `pnpm -C api deploy`). It accepts the new report fields (`to`, `renamedFrom`, `setAside`, `added`); one from before answers a report that carries them with a 400.
2. **Runner**: rerun `bash scripts/deploy.sh` (or `scripts/new-instance.sh`) so the instance repo gets the new `run.sh`, `prompts/` and workflows. `deploy.sh` does steps 1 and 2 in that order.
3. **App**: Cloudflare Pages builds it from `main`. An app deployed before the Worker still works: it treats a report without the new fields as an older runner's and falls back (New shows nothing, Just filed becomes Activity).

Each user then gets the new rulebook from **Settings → Advanced → "Update Bower's rules"** (`bower_rules_version` in `vault-template/CLAUDE.md` is the current number).

**Rulebook v21** (#732): `by: bower` on every note Bower writes, Bower's note on every note it generates, a text copy next to each document of no listed kind, notes rewritten to the present when a rule or fact changes (`bower_updated`, `bower_change`, `bower_before`), short note names, `pile_note`, rename requests, `.bower/updated.txt`, and finishing a tidy-up without writing a note twice. Deploy the runner first (it reads `.bower/updated.txt` and appends a text copy's `## The document`), then each owner applies v21 from **Settings → Advanced → "Update Bower's rules"**.

### Deploy order for the v5 update

Same order as v4: Worker, then runner, then app, and each owner applies the rulebook last.

1. **Worker**: `bash scripts/deploy-api.sh`. It accepts the report's new fields (`created`, `updated`, `left`, `phase`, `total`, `done`, `disagree`, `next`) and keeps the folder pointer's `missingAt` and `setAt`. It also raises the default `DAILY_RUN_LIMIT` to 100 (an instance that sets its own value keeps it).
2. **Runner**: rerun `bash scripts/deploy.sh` so the instance repo gets the new `run.sh`, `prompts/` and workflows (`ingest.yml` installs `poppler-utils` for the text copy of PDFs). It reads `.bower/updated.txt`, `.bower/checks.txt` and `.bower/next.txt`, and sends a running report only when the phase changes.
3. **App**: Cloudflare Pages builds it from `main`, including the public `/learn` route ("Learn Bower", readable signed out).
4. **Rulebooks**: each owner taps **Settings → Advanced → "Update Bower's rules"** once. The update replaces `CLAUDE.md` with the template's whole, so a folder on v20 or older goes straight to v22 in one tap: v21 (`by: bower` notes, text copies, `pile_note`) and v22 ("How Bower thinks", `## History`) arrive together. Apply v22 only after the runner is deployed: a v22 folder on an older runner leaves `.bower/checks.txt` and `.bower/next.txt` unread and writes no History lines. `DEFAULT_MAX_TURNS` is 60 (see "Rulebook v22 and the turn budget").

### What a tidy-up does with each file

Since rulebook version 7 (#368), Bower only files by default. Each original (a PDF, a photo, a spreadsheet) moves into its project, area or resource folder as it is, with one line in the folder's hub note, one row in `index.md` (`- [[<path>]] · <type> · filed by Bower`) and one `Filed:` line in `log.md`; no summary note, no copy, no translation. A note is still written for a web clip or saved link (the raw clip then goes to `0-Inbox/Processed/`), for an item an instruction note or a rule in `Rules.md` asks something for, and for a converted Word, OpenDocument, HTML, EPUB or RTF document, whose `.md` is filed next to the original. `0-Inbox/Processed/` now keeps only instruction notes, raw clips, unconvertible items and duplicates.

- **Names.** Since rulebook version 8 (#369) a meaningful name is kept; a name that says nothing (`IMG_4471.jpg`, `scan0001.pdf`) is replaced by one from the content, `<where or who>, <what it is>.<ext>` (`Arlington Road, window sign.jpg`), at most 60 characters, never with a person's name in it. `log.md` says `, renamed from <old name>`. The app reads the `index.md` file rows with `parseCatalogueFiles` (`app/src/vault-index.ts`): path (with the folder), type and origin.
- **Notes Bower writes when asked.** Since rulebook version 9 (#371) an answer, a job's result or what a rule asks for starts with `type: answer` and three sections: `## Bower's note` (bullets starting only with ✅, ⚠️ or ❌, which the app shows as a box: Fine, Check, Problem), `## Why`, and `## What Bower used` (each source with its origin in brackets: from the file, looked up on the web, from what you told me, reasoned).
- **What is this? (context notes).** Since rulebook version 10 (#370) the note Add's "What is this?" box writes (`0-Inbox/Bower - <date> <time> Context.md`, `kind: context`, the text then `## Applies to` with the file names) is handled before the rest of the inbox: the named files are filed and get, as one batch, what the text asks (a table, a summary, a translation) as a note from Bower; a sentence starting "from now on", "always" or "every time" also becomes a rule in `Rules.md` (a context note the app wrote counts as an instruction note, so the audit keeps that change); a named file that is not in the inbox gets a `Context: … is not in the inbox` line in `log.md`.
- **`Rules.md`'s shape.** Since rulebook version 11 (#376) the agent writes a new rule from an instruction note as one bullet `- <text> (owner's request, YYYY-MM-DD)` under its `## <Topic>` heading, or `## Everything else`; a struck-through rule, `- ~~<text>~~ (paused YYYY-MM-DD)`, is paused and the agent never applies, edits or resumes it (only the Rules screen does).
- **The weekly health check.** `agent/prompts/lint.md` skips paused rules (`~~text~~ (paused …)`) when it looks for rules that contradict each other, as an ingest ignores them (#376), and starts the title of every forbidden-content finding in `Rules.md` (a credential-shaped line, a personal identifier, a health or financial detail) with `Urgent:`: the app's Health screen reads that word (`hasUrgentFinding`, #524) and then leaves out its "good shape" sentence. The instance repo gets the new prompt when you rerun `scripts/deploy.sh`.
- **Apply a rule to what is already filed.** Since rulebook version 12 (#372) the job note a rule's menu sends (`Apply this rule to what is already filed: <rule>`) makes the agent walk the folders the rule names and move or rename what it covers, with one `Correction: <from> -> <to> (<date>)` line in `log.md` per move; it never changes `Rules.md` and those lines never become a proposal. The runner moves a file moved this way in Drive itself (see "Moves and Drive ids" below), so no copy stays at its old path.
- **Moves and Drive ids.** Since #595 the runner, not the agent, performs every move in Drive. After the run it finds each file the agent moved or renamed by its unchanged content (the same checksum and size at a new path, the old path gone) and moves it with `rclone moveto`, a server-side move after creating the new parent folder: the file keeps its Drive id (links, bookmarks and the app's New tags keep working) and no copy stays at the old path, whether it came from the inbox or from a PARA folder (#560). Only changed files that were not moved are copied up. When the same content is in two files, the runner does not guess: that file is copied up at its new path as before, an inbox original is still deleted from its inbox path (so it gets a new id, and a note moved out of a PARA folder keeps its old copy until the owner removes it), and the run log counts the case (`<n> moves not guessed: the same content twice`, never a name). A move Drive cannot do, for example because the file was moved or removed in Drive during the run, falls back the same way and is counted as `<n> moves copied up instead`. The run log counts the moves done as `<n> files moved in Drive`. Deploy: runner only (`scripts/new-instance.sh`).
- **Moves the person made (`.bower/paths.json`).** Since #597 every run ends by listing the Bower folder with Drive ids (`rclone lsjson -R`, system files, `.obsidian/`, `.claude/` and `.bower/` left out) and writing `.bower/paths.json` to the folder in Drive: a JSON object of Drive id to path. The next run, before the agent starts, lists the folder again and compares. An id whose path changed is a file the person moved in Drive or Obsidian: its `index.md` row is rewritten to the new path and `log.md` gets `- <date> <time> · Moved by you: <old> → <new>`. The rows of an id that is gone get ` (missing)` at their end; rows are never deleted. Links in other notes are left alone (Obsidian usually rewrites them itself). Both files go up to Drive before the agent starts. The first run, without `.bower/paths.json`, reconciles nothing and only writes the file; a run that cannot list the folder reconciles nothing and leaves the old file, so the next run catches up. The run log counts only: `<n> moves by you booked`, `<n> index rows marked missing`. The file lives in the Bower folder (the runner keeps nothing), and the app hides it with every dotted folder. Deploy: runner only (`scripts/new-instance.sh`).
- **File facts (`.bower/file-facts.json`).** Since #610 every finished run counts, without AI, what Drive's metadata does not say and the file screen shows: a PDF's `pages` (`pdfinfo`, used only when the runner image has it; otherwise PDFs are skipped), an Excel file's `sheets` (the `xl/worksheets/*.xml` entries of its archive listing) and a ZIP's `entries` (files, not folders). The runner writes a JSON object of path to `{ "k": "<checksum> <size>", "pages" | "sheets" | "entries": <n> }`; `k` lets a later run skip a file that did not change, so only new or changed files are counted again. Paths that no longer exist are dropped. Nothing but `pdfinfo` and an `unzip -Z1` listing (no extraction) touches file contents, each under a 20 second `timeout`; a corrupt file simply has no fact, and the log says `<n> file facts skipped`, never which. The step is best effort and never fails a run. The app reads the file once per index load and puts "42 pages", "3 sheets" or "14 files" in a file's meta line when the fact is there, and omits it when not (a companion note's page count wins for a PDF). Like `.bower/paths.json` it lives in the Bower folder and is hidden with every dotted folder. Deploy: runner only; the runner image needs `unzip` (present on GitHub's ubuntu runners), `pdfinfo` is optional (`poppler-utils`).
- **`BOWER_MAX_CHANGES`.** A move counts as one change: only the new path is a new file; the delete of the inbox path is not counted.
- **The report.** An ingest's summary is six lines: `Processed`, `Filed: <n> files` (originals moved into a folder), `Created` (notes written), `Updated`, `Rules`, `Problems`. A lint keeps five. The runner's log shows the filed count as `<n> originals filed`, a number only.
- **Formats.** Since rulebook version 15 (#598) Bower reads notes and text (`.md`, `.txt`, `.csv`, `.json`, `.eml`), PDFs, photos (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`) and the documents pandoc converts; every other kind (iPhone `.heic` photos, Excel, PowerPoint, audio, video, archives, anything else) is only kept: the agent files it by its name and date and never opens it. So is a file over 50 MB or a PDF over 300 pages (pages counted best effort, from the PDF's page objects): before the agent starts, the runner lists those in `.bower/too-large.txt` in the local copy for it, and removes the list before anything goes up.
- **Report v2 (the status report and `.bower/last-run.json`).** Since #598 a finished ingest's status report carries, next to the fields it had:
  - `processed[]`: `{ path, kind }` as before, plus `to` (the item's new path from the top of the folder) when the runner moved it (#595), and `renamedFrom` (its old file name) when the name changed too.
  - `setAside[]`: `{ path, reason }` for each item the run set aside, with `reason` one of `kept-not-read` (a kind Bower only keeps), `too-large` (over the limits above), `unconvertible` (pandoc could not read it) and `quarantined` (the pre-scan moved it to `0-Inbox/Quarantine/`). The `path` is where the item was picked up, as in `processed`, except for `quarantined`, whose path is the one under `0-Inbox/Quarantine/`. The existing `quarantined[]` list stays as it was, for older apps: it holds the same paths as the `quarantined` entries of `setAside`. `refused[]` is the post-run audit's list, not a set-aside item, and is unchanged.
  - `added`: one short clause about what Bower added besides filing ("I added bike times to the flats"). The agent writes it to `.bower/added.txt` at the end of the run; the runner reads the first non-empty line (at most 200 characters), removes the file from the local copy so it is never uploaded, and sends it. Absent when the agent wrote none.

  `.bower/last-run.json` carries the same three for a done run that saved its changes, as `items`, `setAside` and `added`; unlike the rest of that file they name paths, because the app shows where each thing went. The `log.md` outcome line still carries counts only. The Worker (`POST /runner/vaults/:id/status`) validates each new field's type (a wrong type or an unknown key is a 400), cuts each path to 2,000 characters, `setAside` to 200 entries and `added` to 200 characters, keeps them on the run and returns them unchanged from `GET /status` and `GET /runs`; all are optional, so an older runner keeps working. Deploy the Worker first (`scripts/deploy.sh`, or `wrangler deploy`), then the runner (rerun `scripts/deploy.sh` or `scripts/new-instance.sh` for the instance repo's `run.sh` and `prompts/ingest.md`): a Worker from before this change answers 400 to a report carrying the new fields. Each user gets rulebook version 15 from **Settings → Advanced → "Update Bower's rules"**.
- **Upgrading.** Rerun `scripts/deploy.sh` so the instance repo gets the new `prompts/ingest.md` and `run.sh`; each user gets the new rulebook from **Settings → Advanced → "Update Bower's rules"** (version 7). Until they update, their folder's old rulebook still asks for a summary note, and the new prompt defers to it.

### System and sync files

Since rulebook version 13 (#581), system and sync files are never downloaded, uploaded, deleted, read, filed, moved or listed by a run. `agent/run.sh` writes one filter file at the start and passes it (`--filter-from`, case-insensitive) to every rclone call that lists, copies, syncs, moves or deletes; the change manifest and the pending list skip the same names, so even a file that reaches the local copy is never uploaded, deleted or reported. The rulebook says the same to the agent. The patterns:

- `desktop.ini`, `Thumbs.db`, `ehthumbs.db`, `.DS_Store`
- `Icon` followed by a carriage return (macOS folder icons)
- `~$*` (Office lock files) and `.~lock.*#` (LibreOffice lock files)
- `.tmp.driveupload/**` (Drive's upload scratch folder)

They mirror `SYSTEM_FILE_PATTERNS` in `app/src/vault-index.ts`, which the app uses to leave them out of the explorer: change both together. A file like this stays in Drive exactly where it is.

### The first-run interview

Right after **Building your bower** and before **Start with what you have**, the bird asks four questions in the Tell Bower conversation (#198): what the user will keep here, which languages their notes come in, three areas of their life to start with, and how they like titles and tags written, with an example. Each is a chip or the user's own words.

The pure part (`app/src/interview.ts`'s `interviewToFiles`) turns the answers into `About-Me.md`'s and `Rules.md`'s new text and the area folder notes to create; `app/src/vault-store.tsx`'s `runInterview` does the writing, conflict-checked the same way as the rulebook update:

- `About-Me.md` and `Rules.md` each gain (or have replaced) a `## From the interview` section — created from an empty note if the folder has neither yet — and nothing else in either file changes.
- Every area answered gets its own folder under `2-Areas/` and a `_<name>.md` note inside it (the same "folder note" convention as `2-Areas/_Areas.md` itself), except one whose folder is already there — an area the user already started is never touched.

The step is skippable (writes nothing) and replayable any time from **Settings → Advanced → "Tell Bower about yourself again"**, which runs the same write and returns to Settings instead of going on to the Drive step or the tour. No agent run is needed for this to take effect: the next Tidy up reads the updated files like any other.

### Bower's suggestions

Bower never changes the user's rules on its own (#199). When it would like the user to decide something — a new rule, a workflow for a document it has seen three times, a domain tag it keeps using — it appends a section to `Answers/Bower - Proposals.md` (fields `id`, `kind: rule|workflow|tag`, `text`, `evidence`, `status: open`, `created`) and writes a one-line `Proposal: …` pointer to `log.md`; the format is in the rulebook's **Proposals** section. The **Bower** tab lists the open ones as the **Suggested** group on top of **Rules**, each with **Accept** and **Dismiss** (#346); **Health** keeps one line under the report, "2 suggested rules on the Bower tab", linking there. Accept appends the rule to `Rules.md` under `## From Bower's suggestions`, marked `(accepted suggestion, <date>)`, then sets `status: accepted` and a `decided` date in the proposals file; Dismiss only sets `status: dismissed` and `decided`. Both writes go through Drive, conflict-checked like the rulebook update: a run writing the proposals file at the same moment makes the tap fail with a short message, and trying again never adds the rule twice. The weekly health check removes sections that were accepted or dismissed more than 30 days ago and never touches an open one.

The runner's audit keeps this honest: `Answers/` is an ordinary place for the agent to write, while any change it makes to `Rules.md` in a run without an instruction note the app wrote is put back and reported as `refused` (#263), so an accepted suggestion is the only way a rule reaches `Rules.md` besides Tell Bower. Existing folders get the new rulebook text from **Settings → Advanced → "Update Bower's rules"** (version 5); the updated `prompts/ingest.md` already spells out the section format, so their proposals reach the Bower tab either way, and the new rulebook adds the rest (when to file a workflow or a tag proposal, and never to repeat a dismissed one).

### A folder's statuses (Compare)

The status select in a folder's Compare tab offers the folder's own list, read from `statuses: [..]` in its hub note (`<Folder>/<Folder>.md`); without one, or with a list that is not a non-empty list of short lower-case words, it falls back to the kind's list in `app/src/kinds.ts` (the console says why). A note whose status is not in the list keeps it as an extra option.

### Reading logs

- **Worker**: `pnpm -C api exec wrangler tail -c wrangler.local.toml` streams live requests (method, path, status, exceptions) — nothing here includes note content or credentials (see `CLAUDE.md`'s logging rule and `api/test/log-hygiene.test.ts`).
- **Agent runs**: the instance repo's **Actions** tab lists every `ingest` / `lint` run, with step names, timestamps and counts only. A failed run's reason is in `GET /status`'s `error` (for the weekly health check, in the `error` of the `lintrun:<id>` KV value instead); the full stderr, rclone output, pandoc's messages and the Drive listing's curl errors are the `bower-logs` artifact (`bower-logs-<n>` for each failed folder of the weekly health check), uploaded only `if: failure()`, kept 3 days (`agent/README.md`) — safe only because the instance repo is private.

### Security headers check

After deploying (`scripts/deploy.sh`, or any change to `app/public/_headers` or `api/src/security.ts`), check both origins at [securityheaders.com](https://securityheaders.com): enter `APP_ORIGIN`, then separately `API_ORIGIN`. Target **A** on the app. The Worker only ever serves JSON and the one "Not invited" HTML page, so the site's own scale doesn't quite apply to it; just confirm `Strict-Transport-Security` and `Content-Security-Policy: frame-ancestors 'none'` show up on its report.

A grade below A on the app usually means `app/public/_headers` didn't ship with the deploy — check the build actually generated it: `grep -n "" app/dist/_headers` (`pnpm -C app build` writes it from `VITE_API_URL` and, if set, `VITE_GOOGLE_API_KEY`; without `VITE_API_URL` it warns and falls back to `connect-src 'self'` alone, but a value that's set and not a URL fails the build outright rather than shipping a placeholder).

### Red-team the agent

Before a release, run the prompt-injection corpus once against a real model and fill in its outcome table: `docs/security.md` § "Prompt injection".

### Dynamic scan (ZAP baseline)

After deploying, or every so often after that: instance repo → **Actions → ZAP baseline → Run workflow**, and give it `app_url` and `api_url` (both `https://`, e.g. `https://app.example.com` and `https://api.example.com`). It runs the OWASP ZAP baseline scan against each in turn and uploads a report artifact per target; it fails if ZAP finds anything not already allowlisted in `.github/zap-rules.tsv`. See `docs/security.md` § Dynamic scan for what to do with a failure and the date of the last run.

### Costs to watch

- **Cloudflare free tier**: Workers requests, KV reads/writes and Pages builds all have a free allowance; the dashboard's Analytics tab for the Worker and the KV namespace shows current usage against it. KV writes are the tightest one: see the next section.
- **GitHub Actions minutes**: 2,000 free minutes a month on a private repo; each run is capped at 20 minutes (`timeout-minutes` in the workflows), and the weekly health check adds one run per user every Sunday — the Actions tab's usage view (or **Settings → Billing** on the account owning the instance repo) shows the month's total. At the default of 100 runs a day, one busy person can use a real share of the instance repo's 2,000 free Actions minutes a month.
- **Anthropic usage**: a Claude subscription's own usage limits, or an API key's billed usage in the Claude Console — whichever the instance repo's `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` draws on.

### Activity: what each tidy-up did

The Bower tab's Activity (#345) shows one card per tidy-up. The Worker keeps each user's last 20 finished tidy-ups (`GET /runs`; one KV key per run plus an index, see `docs/api.md`), and the app reads `log.md`'s `Filed:`, `Correction:`, `Applied rule:` and `Context:` lines for where things went. That costs two more KV writes per finished tidy-up (and one delete once a user has 20). The runner reports each item's kind (file, request, context) since this change: rerun `scripts/deploy.sh` so the instance repo gets the new `run.sh`; runs from an older runner still show, with requests and context notes told apart by their names.

### KV write budget

Workers KV's free tier allows **1,000 writes a day per Cloudflare account** (every namespace and every Worker of the account together; deletes and lists have their own 1,000 a day), reset at 00:00 UTC. Past it, every KV write fails until then: sign-ins, Bower folder setup, Tidy up, run status reports and settings all answer errors, for every user. What still writes:

- **Sign-in**: the user record and its email index (2 writes).
- **Tidy up** (`POST /process`): the run and the day's counter (2), plus 1 when a stale run is first recorded as failed; then one write per status report from the runner, and the same for the weekly health check, per user. Since #728 a tidy-up reports up to five times (`running`, then its `reading`, `writing` and `saving` phases, then `done` or `failed`); a `queued` phase report adds one more. With the run history (2 writes when it ends) and `POST /process` (2), one tidy-up spends about 10 writes: one person at the default limit of 100 tidy-ups a day could spend about 1,000 of the 1,000. In practice a tidy-up costs about 6 writes when the runner sends a running report only at each phase change (at most four) plus the final one, never one per file. The free tier's 1,000 writes a day is shared by every user of the instance, so lower `DAILY_RUN_LIMIT` if many people share one instance.
- **Drive access**: the cached Drive token, about one write per hour a user has the app open.
- **Settings and account**: a settings save that changes something, Bower folder setup, a push subscription per device, "Sign out everywhere" (1 each); deleting an account spends deletes, not writes.

Nothing else writes: the rate limits (the strict ones on `GET /auth/callback` and `POST /process` included) are counted in memory, and a request without a valid session or sign-in cookie writes nothing. A household of a few people uses well under a tenth of the budget. If the namespace's metrics (dashboard → Storage & Databases → KV → the namespace → Metrics) show writes climbing towards 1,000, look for a user or client stuck in a loop before anything else; Workers Paid lifts the limit if the instance outgrows it.

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
| A run finished its work but the app still says "Tidying up…" or shows it failed with no reason | The runner's last report never reached the Worker (a network or Worker error at the wrong moment) | The runner tries its final report three times (5 s, then 10 s apart; `BOWER_REPORT_BACKOFF`) and writes the outcome into the Bower folder anyway: `.bower/last-run.json` (state, counts, one sentence) and one line in `log.md`. If all three tries fail, `GET /status` settles the run from the GitHub job's own conclusion once it has had no news for five minutes, which needs `actions: read` on `GITHUB_TOKEN` (section 4); without it the run ends as `stale` after 30 minutes, at which point the app reads `.bower/last-run.json` itself and shows the outcome it finds there instead of "did not answer" (#564). Each run gets its own Drive token from the Worker, so signing in again or reconnecting Google during a run does not cut it off (#315) |
| Push notifications never arrive | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` unset (falls out as `500 config`, same as any missing secret) or the user is on iOS without having installed the app to the home screen (iOS only delivers web push to an installed PWA) | Set the VAPID secrets (step 3.4–3.5); on iOS, tell the user to add the app to their home screen first |
| Everyone is signed out again after 7 days | The Google OAuth consent screen is still in **Testing** — refresh tokens issued to test users expire after 7 days there | Publish the app (step 2) |
| Pasting a link into Add saves a note but doesn't summarise it | Expected: the link becomes `Link - <host> <date> <time>.md` in the inbox right away, and the agent reads the page during the next Tidy up run, not when the note is saved | Run Tidy up to have Bower read it |
| A Word, OpenDocument, HTML, EPUB or RTF file ends up in `0-Inbox/Processed/` with no note, and the run's summary mentions it under `Problems` | `pandoc` could not read it (a damaged or password-protected file), so it had no Markdown sibling; the run's log shows only `convert documents: <n> converted, <n> could not be converted`, and the agent has no converter of its own | Open the file on a computer; save it again (or as PDF) and add it to the inbox again. A run that fails for another reason keeps `pandoc.log` in the `bower-logs` artifact |
| A Tidy up run's log or a note the agent wrote suggests the model tried to reach the Drive API, the Worker, or read a run ticket/an access token, and couldn't | By design: `claude -p` runs under `env -i` with an explicit allow-list (`agent/run.sh`), so the model's own process never has the Drive token, the run ticket or any other `BOWER_*`/`RCLONE_CONFIG_*` value, even though the surrounding shell does the sync down/up and the status report. A prompt-injected note (untrusted text in `0-Inbox/` or `Clippings/`) asking the model to use one of those must fail | Nothing to fix; this is the runner's minimal-environment guarantee (`docs/security.md` §6) |
| The browser console shows `Executing inline script violates the following Content Security Policy directive 'script-src …'` on every page, and the page's HTML has an inline `<script>` loading `/cdn-cgi/challenge-platform/scripts/jsd/main.js` | Cloudflare's JavaScript detections: the zone injects that script into every HTML response. On the free plan it stays on even with Bot Fight Mode off and there is no switch for it, and the app's CSP (no `unsafe-inline`) blocks the inline loader | Nothing to fix: the error is harmless. The app works the same, and no rule on a free zone uses the detection's result. Do not add `unsafe-inline` or a fixed nonce to the CSP to silence it (#427) |
| A run fails at once with `failed: fetch vault info: HTTP 403, not answered by the Worker` (and `report failed: API unreachable`) | A security setting on the Cloudflare zone blocked the runner before the request reached the Worker: the Worker never answers `403` on its runner routes (a wrong ticket is a `401` with the Worker's JSON error, and the log then says only `HTTP 401`). Bot Fight Mode is the usual cause: it challenges the GitHub-hosted runner's curl calls to `/runner/*` with a `403`, and on the free plan it cannot be skipped for a path or hostname (section 9, step 3) | Cloudflare dashboard → the zone → Security → Events: find the blocked request to `/runner/vaults/…` at the run's time and the feature that blocked it. Turn that feature off (Security → Bots → Bot Fight Mode off, if that is the one), then run Tidy up again |
| Every run fails at once with `failed: fetch vault info: HTTP 401`, or the log says `missing setting BOWER_RUN_TICKET` | The Worker is updated to run tickets (#259) but the instance repo still has the old workflows, which send `BOWER_API_KEY` (the Worker refuses it) or no ticket | Rerun `bash scripts/new-instance.sh` (or `scripts/deploy.sh`) |
| A run's log starts with `warning: no runner settings file, BOWER_* settings come from the environment` | The instance repo's workflows predate the runner settings file: they still pass `BOWER_API_KEY` in the environment of the step that runs `run.sh`, where the agent could read it from its parent process (`docs/security.md` §6). Runs still work | `git pull` here, then rerun `bash scripts/deploy.sh` to copy the current workflows into the instance repo |
| A file the user added to `0-Inbox/` or `Clippings/` ends up moved to `0-Inbox/Quarantine/`, untouched by the agent, and the app says Bower "set aside" a file | The pre-scan (`agent/scan.sh`, spec A.5) matched an injection heuristic in it (an instruction aimed at an assistant, a role marker, hidden or zero-width characters, a long base64 blob) and moved it aside before Claude ran, so an untrusted note can't steer the agent; the run reports it under `quarantined` | Open the file in Drive; if it is a false positive, move it out of `Quarantine/` back into the folder it came from and run Tidy up again. The heuristics are intentionally narrow, so this should be rare |
| A note sent from Tell Bower (`Bower - <date> <time> <title>.md`) ends up in `0-Inbox/Quarantine/` instead of being carried out, and the run's log shows `instruction origin: <n> of <m> not written by the app` | Before Claude runs, the runner asks Drive which inbox notes the app itself wrote (the `bower=instruction` app property) and sets aside every other instruction-shaped note (#255). A note of that shape added through Add, copied from Drive or dropped in the folder by hand is set aside on purpose. When the log also says `listing failed, none trusted`, the Drive call failed and every such note was set aside; curl's message is in `drive.log` in the `bower-logs` artifact of a failed run | For a note that really came from Tell Bower: if the log says `listing failed` (a transient Drive error, or a Drive API outage), send the instruction again from Tell Bower once Drive answers; otherwise check that the app build in use sets the property (`createTextFile` with `appProperties` in `app/src/drive.ts`). Moving a set-aside note back by hand does not help: it will be set aside again, since only the app can mark a note |

### Your Bower folder was deleted

The app checks the Bower folder when it opens, when a tab comes back to the front after ten minutes, and when a tidy-up fails because the folder is gone. If the folder is in Drive's Bin, gone, or no longer reachable, the person sees one of three full-page screens instead of Home. Nothing is changed until they choose.

| Screen | What happened | What the person can do |
| --- | --- | --- |
| "Your Bower folder is in the Bin" | The folder is in Drive's Bin (Drive empties it after 30 days). | "Put it back" takes it out of the Bin and carries on where it was. Or start a new folder, or use another one. |
| "Your Bower folder is gone" | Drive answers 404: it was deleted, Bin included. | Start a new Bower folder, or use another folder. If it was emptied from the Bin, Google Drive support may still be able to get it back, so ask them before starting again. |
| "Bower can't open your folder" | The folder is in a shared drive, or someone stopped sharing it. | Ask for access and choose "Try again". Or use another folder, or start a new one (the old notes stay where they are). |

What you, the operator, can do:

- A person who asks for help with a missing folder: send them to the screen's own buttons. Do not edit their pointer in KV by hand.
- A tidy-up that finds the folder gone fails with the reason `vault_missing`. It uploads nothing, so a restored folder is not overwritten. The app then shows the screens above, not the failure sheet.
- The Worker marks the folder missing (`vault.missingAt` on `/me`) and skips it in the weekly health check until it is found again. "Put it back" and "Use another folder" clear the mark.
- A drive or Google Workspace admin can restore a deleted file for a limited time (Google says about 25 days). Ask before starting a new folder if the notes matter.
| A text box shows the microphone crossed out and "Dictation is off in this browser. Type instead." | The browser has no speech recognition (Firefox, some iPhone browsers); "The microphone is blocked" instead means the person refused the microphone for the site | Nothing to fix on the instance: typing works. For dictation, use Chrome, Edge or Safari, or allow the microphone in the browser's site settings and reload |

## 9. Hardening your instance

Optional, but recommended once your instance is running (sections 1–5) and before you invite anyone beyond yourself. Nothing below is automated: every step is a setting in someone else's dashboard (Cloudflare, GitHub, Google), not something a script can safely click for you — `scripts/deploy.sh` only prints a pointer to this section at the end of a run.

### Cloudflare zone

These live in the Cloudflare dashboard, under the domain (the "zone") that `APP_ORIGIN` and `API_ORIGIN` are subdomains of, for example `example.com`.

1. **DNSSEC.** Zone → DNS → Settings → enable DNSSEC, then add the DS record it shows you at your domain registrar (wherever you bought the domain). Why: it cryptographically signs your DNS answers, so an attacker on the network can't quietly redirect `app.example.com` or `api.example.com` to a server of their own. If you skip it: nothing about your instance changes day to day, but that particular protection is missing — safe to leave for later, but it costs nothing to turn on now.
2. **Managed WAF rules (free).** Zone → Security → WAF → Managed rules → turn on the free Cloudflare Managed Ruleset. Why: it blocks known attack patterns (SQL injection strings, common exploit payloads, known bad actors) at Cloudflare's edge, before they ever reach your Worker. If you skip it: the Worker's own code is the only thing standing between it and that traffic.
3. **Do not turn on Bot Fight Mode (free plan).** Zone → Security → Bots → leave Bot Fight Mode off. Why: it challenges the GitHub-hosted runner's curl calls to `/runner/*` with a `403`, so every Tidy up and lint run fails at once (`fetch vault info: HTTP 403, not answered by the Worker`, see Troubleshooting), and on the free plan it cannot be skipped for a path or hostname. The managed WAF ruleset (step 2) and the rate-limiting rule on `/auth/*` (step 4) are the edge protections to use instead, with the Worker's own rate limiting (`docs/security.md`) behind them. If it is already on: turn it off.
4. **A rate-limiting rule on `/auth/*`.** Zone → Security → WAF → Rate limiting rules → Create rule. Match: hostname equals your `API_ORIGIN`'s host (e.g. `api.example.com`) **and** URI path starts with `/auth`. Action: Block (or Challenge), threshold around 30 requests per minute from the same IP — the same number the Worker already enforces on `/auth/callback` (`docs/security.md`), so this adds a second line of defence rather than a stricter one. Why: a flood is stopped at Cloudflare's edge instead of costing you a Worker invocation for every request. If you skip it: the Worker's own per-IP limit (`rateLimit` in `api/src/security.ts`) still applies, just one layer later.

### GitHub

On the **instance repo** (never this public template — see `ARCHITECTURE.md`, "Two repositories per deployment"):

5. **Confirm it's private.** Instance repo → Settings → General: it should already say "Private" (`scripts/new-instance.sh` creates it that way) — check nobody made it public since. Why: the Actions logs it keeps (`bower-logs`, see § Reading logs above) are only safe to keep because the repo is private.
6. **Actions permissions, read-only by default.** Instance repo → Settings → Actions → General → "Workflow permissions": choose **Read repository contents permission** (not "Read and write"), and leave "Allow GitHub Actions to create and approve pull requests" unchecked. Why: the agent's workflows read the vault from Drive and report status to the Worker; they never need to push anything back to this repo, so the least access GitHub Actions itself is given, the less a compromised workflow or dependency could do. If you skip it: the default "Read and write" setting hands every workflow run more power than it uses.
7. **A secret rotation cadence.** Put a reminder (a calendar entry is enough) to rotate `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` every few months, and immediately if anyone who had access to your Cloudflare, GitHub or Google accounts stops being trusted with them. "Rotate the Claude token" and "Rotate keys" above cover the mechanics; for `SESSION_SECRET` specifically, see below.

### Google Cloud

8. **Restrict the OAuth client to the real redirect URI and origins.** Google Cloud Console → APIs & Services → Credentials → your OAuth client:
   - **Authorized redirect URIs**: only `https://api.example.com/auth/callback` (your real `API_ORIGIN`) should be listed. Remove the `http://localhost:8787/auth/callback` from the local sign-in test (appendix) once you no longer need it, and remove any other URI you don't recognise.
   - **Authorized JavaScript origins**: only `https://app.example.com` (your real `APP_ORIGIN`).
   Why: Google only ever sends a completed sign-in back to a URI on this list; a stale extra one — especially a `localhost` one — is a door nobody is watching any more. If you skip it: sign-in still works, but the client accepts redirects to addresses it no longer needs to.
9. **Consent screen published, not left in Testing.** The OAuth consent screen page should read **In production** (done in "Google OAuth client" above, step 2, "Publish"). If it still says "Testing", fix it now: refresh tokens for test users expire after 7 days, which is the single most common cause of "everyone signed out again" (§ Troubleshooting).

### Rotating `SESSION_SECRET` without signing everyone out

Every session cookie is signed with `SESSION_SECRET`, so replacing it the ordinary way (`wrangler secret put SESSION_SECRET`, or `scripts/deploy.sh --rotate`) invalidates every cookie at once: everyone is signed out immediately and has to sign in again (see "Rotate keys" above). `SESSION_SECRET_PREVIOUS` is an optional Worker secret that avoids that: while it's set, a session cookie signed with the *previous* secret still verifies, so people who are already signed in stay signed in for the rest of the grace window instead of being dropped the instant you rotate. New sign-ins are always signed with the current secret only — `SESSION_SECRET_PREVIOUS` is only ever checked, never signed with.

**Cloudflare secrets can only be written, never read back** — `wrangler secret put` has no matching "get". So this only works if you kept your own copy of the value you're about to replace. From now on, every time you set `SESSION_SECRET` by hand, save the value somewhere private (a password manager) before you overwrite it — `scripts/deploy.sh`'s own generation deliberately never shows or saves it ("No secret value is ever printed to the terminal", above), so this is the one secret worth keeping your own note of. If you don't already have the current value saved, you cannot grace-rotate this time: fall back to the ordinary rotation and start saving it from here on.

With the old value at hand as `$OLD_SESSION_SECRET`, from `api/`:

```bash
NEW=$(openssl rand -base64 32)
printf '%s' "$OLD_SESSION_SECRET" | wrangler secret put SESSION_SECRET_PREVIOUS -c wrangler.local.toml
printf '%s' "$NEW" | wrangler secret put SESSION_SECRET -c wrangler.local.toml
```

Save `$NEW` the same way, for next time. After **24 hours** — long enough for anyone who opened the app in that window to have quietly picked up a cookie signed with the new secret — close the window:

```bash
wrangler secret delete SESSION_SECRET_PREVIOUS -c wrangler.local.toml
```

Anyone who hasn't opened the app in those 24 hours is signed out at that point and has to sign in again — the same outcome as an ordinary rotation, just for a smaller, slower group instead of everyone at once. Leaving `SESSION_SECRET_PREVIOUS` set indefinitely keeps a retired secret able to sign people in forever, so don't skip the delete step.

## 10. Demo

The public demo is retired (owner decision, 28 September 2026): the Cloudflare Pages project `bower-demo` was deleted and nothing links to it. The demo build itself stays in the code, because the end-to-end tests run on it: `pnpm -C app build:demo` builds the app with `VITE_DEMO=1`, a scripted, in-memory sample folder (an invented person, "Alex"), with no Worker, no Drive and no Claude.

### The demo world (v6)

The demo runs locally only (owner ruling, 30 September 2026): `pnpm -C app build:demo`, or `pnpm -C app dev` with `VITE_DEMO=1`; it is not deployed. It holds the world the v6 boards draw (`app/src/demo/fixture.ts`, #903): Alex (`alex@example.com`, so the avatar reads "A") has moved to Melbourne. Projects holds **Housing Search Australia** (pinned; its **Moonee Ponds** folder has a **Listings** subfolder of six saved listings and six flat notes Bower wrote, comparable in "Compare 6 flats") and **Job Search Australia** ("Cover Letter - Alex", "CV insights", "Resume Australia" and two profiles, plus **Applications** with nine notes by Bower, four of them job offers). Areas holds **Visa & Immigration** (a note and "Passport copy"). Alex's London folders (the flat hunt, the Lisbon trip, the kitchen, the old job) are in Archives, the household notes in Resources. The hub notes of Moonee Ponds and Applications carry the folder's own `statuses:` list. The times follow the viewer's own clock: the last tidy-up ran yesterday 15:01 to 15:03 local time and filed "Passport copy", and the six flat notes were written today at 06:44 to 06:54. The end-to-end tests pin that clock to Wednesday 30 September 2026, 12:10 London time (`app/e2e/demo.ts`). The demo starts with three things in the inbox; setting `bower:demo:inbox` to `empty` in the tab's session storage and reloading starts it with none, as Home looks after a tidy-up.

To publish it again one day, build it and push `app/dist` to a Pages project of its own:

```bash
pnpm -C app build:demo
npx wrangler pages deploy app/dist --project-name bower-demo --branch main
```

## What the app hides

The explorer, Recent, search and the switcher never show: any dot-folder at any depth (`.obsidian`, `.claude`, `.trash`, whatever another editor adds), anything under a `Processed/` folder, folder notes (`_*.md`) and dot-files (`.hidden.md`-style) — one rule, `isHidden` in `app/src/vault-index.ts`. Opening the folder in Obsidian, or any other editor, never changes what the app shows. With "Show Bower's own files" on, `.claude` alone reappears in the explorer's "Bower's files" group as "Agent settings" (read-only, opens in Drive); every other dot-folder stays hidden regardless of that setting.

## Folder screen

A folder opens at `/folder/<path>` (issue #214) — the path relative to the Bower folder, each segment percent-encoded on its own so a name with a `/`-unsafe character still round-trips (`app/src/navigation.ts#folderHref`, `app/src/routes/folder.tsx`). Reached from the Home Answers card, a note's breadcrumb, the desktop sidebar's tree (a folder's name opens it; the chevron still only expands or collapses it) and another Folder screen's own subfolder rows. The old `#folder=` hash, which only the tree understood, is gone.

### On the folder screen (v4)

- **List and grid.** Files show as rows in a list, or as tiles with thumbnails in a grid. The grid is chosen by the person, or comes up by itself when most of the folder is photos.
- **Originals and By Bower.** A segmented control above the list: **All**, **Originals** (what you put there) and **By Bower** (what Bower wrote, each with the first line of its text), each with its count. The origin comes from `index.md`.
- **Sort and kind.** **Sort** offers Newest first, Oldest first, Name and Kind, and is remembered. The kind filter is a select on a phone and a row of chips with counts on a desktop; picking an origin resets it.
- **Quick look.** Tapping a file, or pressing Space on a desktop, opens it over the folder without leaving it; Enter opens the full screen.
- **Empty state.** A folder with nothing in it says "Nothing in <name> yet", with **Add something** and **Ask Bower to move things here** (the Bower box prefilled). If the files are in subfolders, it says how many and where instead.
- **Compare.** When the folder's notes name a kind (flats, jobs, and so on) a **Compare N <kind>** tab appears beside the list, and a button on a desktop. Its code loads only then.
- **Desktop, three panes.** From 1200 px the folder screen shows the tree, the folder and a preview side by side. Keys, listed on the screen's bottom line: arrows move the selection, Space quick look, Enter open, Backspace up a folder, `/` or Ctrl K (Cmd K on a Mac) search. Below 1200 px it is one column; below 900 px the tree is the Folders tab.

### Folder views (v6, issue #911)

This replaces the v4 list above where they differ.

- **Header.** The folder's name once, with ⋯ beside it (pin, ask, rename, move live there; no Pin, Ask or Drive buttons on the page, no (i)). Under it the meta line, "Projects · 7 things · updated today", whose count is always Originals plus By Bower; a folder of folders reads "Areas · 1 folder" and adds its purpose line. A root's back link and breadcrumb read "Your folders" and open the tree at it.
- **Tabs.** "List" and "Compare <n> <things>", only when the folder has comparable notes. Compare's panel is an empty slot until #916.
- **In this folder.** All / Originals <n> / By Bower <n> (a zero stays), and a Filter & sort icon on the same row. Filter & sort holds Sort by, Show (kinds with counts) and Layout (List or Grid); nothing changes until **Show <n> things**. A dot on the icon, and its name "Filter and sort (grid layout on)", say when the choice is not the folder's default. There are no List/Grid buttons, kind chips or "Showing only" box any more, and no "Try asking" card.
- **Rows.** Subfolders first, then day groups "Today", "Yesterday", "29 Sep"; each row shows only its icon, title, kind and date. On desktop one click selects, a double click or Enter opens.
- **Folder of folders.** A root with subfolders shows "Folders" as cards (count, last change, "1 new", the first three things), then "Recently changed in <folder>". On desktop it opens with nothing selected.
- **Preview column.** From 1200 px: "Select something to see it here." until something is selected; then its title, Open, Open in Drive, the meta line and Bower's note box, which folds as on the note page (a PDF shows its first page, a spreadsheet a table, a folder "Inside" and its rows).

## Pins

A note is pinned when its frontmatter has `pinned: <ISO 8601 time>` — the time it was pinned, not a boolean. A folder is pinned the same way, through its own folder note (`_<Folder>.md`, created with frontmatter only if the folder had none yet, and already hidden from the tree above); unpinning removes the key and deletes that note again if pinning was the only reason it existed. Order everywhere is pin time, newest first; there is no manual reorder.

This means a `pinned` line can show up if you open a note straight in Obsidian or another editor — it's expected, not a stray field, and the agent's `CLAUDE.md` tells it to leave `pinned` as it is when it rewrites a note. Removing the line by hand unpins the note the same way the app would.

The UI (issue #216): Home shows a Pinned section above Recent, hidden while there is nothing pinned — up to 8 tiles, "All pinned" past that, an Edit toggle turning tiles into rows with an unpin button. The desktop sidebar shows the same items as a Pinned group above the tree, up to 5. Four entry points pin or unpin: the note's own menu (More → Pin to Home), opening a Notes-tab row's context menu (a sheet: Pin to Home, Open the folder, Ask Bower about it, Open in Drive, Cancel), a tree row's hover pin button on desktop with the same items on right-click or the keyboard's Menu key, and the Folder screen's Pinned chip. Every one of them shows the same toast, "Pinned to Home" or "Unpinned"; a failure shows one sentence instead and changes nothing. The quick switcher has no filter mode of its own yet, so "All pinned" opens it with `pinned:` already typed in the field rather than actually narrowing the list — a real filter is left for a later issue.

## Extensions

Optional modules an operator can add on top of their own instance, kept out of the core deploy: `docs/extensions/email-in.md` (a Gmail-fed inbox), not built, design only.

## Appendix: local sign-in test

Checks Google sign-in end to end on `wrangler dev` with a real Google OAuth client. The automated tests mock Google; this is the manual check. In production the same client needs `${API_ORIGIN}/auth/callback` as an authorized redirect URI.

1. Google Cloud Console → APIs & Services:
   - Library: enable the **Google Drive API**.
   - OAuth consent screen: user type External; scopes `openid`, `email`, `profile` and `https://www.googleapis.com/auth/drive`. `profile` (#323, for the app's greeting) is a basic, non-sensitive OIDC scope like `openid` and `email` — Google grants it with no extra listing or review, only `drive` needs the sensitive-scope justification. A client left in *Testing* expires refresh tokens after 7 days (add your account as a test user if you keep it there for this check); a real instance must be *In production*.
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
11. Create a vault (sign in again first if you did step 10). Copy the `bower_session` cookie value from the browser's developer tools, then run `curl -X POST -H "cookie: bower_session=<value>" -H "Origin: http://localhost:5173" -H "content-type: application/json" -d '{"mode":"create"}' http://localhost:8787/vault`. It answers 201 with `{ vault: { folderId, inboxFolderId, name } }`, and `/me` shows the same `vault`. In drive.google.com, My Drive now has a `Bower` folder holding `CLAUDE.md` (with `bower_rules_version` in its frontmatter), `Rules.md`, `index.md`, `log.md`, `About-Me.md` and the folders `0-Inbox` (with `Processed`), `1-Projects`, `2-Areas`, `3-Resources`, `4-Archives`, `Answers`, `Clippings`. Running the same command again answers 409 `vault_exists`. (The `Origin` header is required since #19: a state-changing session route without it, or with a different origin, answers 403 `forbidden`.)
12. Select an existing folder. In drive.google.com, pick a folder that already has notes (an Obsidian vault, or a copy of one) and note each file's "Last modified" time; the folder id is the last part of its URL. Run step 11's command with `-d '{"mode":"select","folderId":"<id>"}'`. It answers 200; no existing file changed (same modified times and content), only the template files and folders the folder lacked were added, and `0-Inbox` exists.
13. Signed in again, get the session cookie's value from the browser, then `curl -X DELETE http://localhost:8787/me -b "bower_session=<value>" -H "Origin: http://localhost:5173"` answers 204; `pnpm -C api exec wrangler kv key list --local --binding BOWER_KV` no longer lists that `user:<id>` or `email:<email>`, and drive.google.com still shows the folder the sign-in created.
14. Tidy up. Set `GITHUB_REPO` (your instance repo, `owner/name`) and `GITHUB_TOKEN` (fine-grained, `contents: write` on that repo only) in `api/.dev.vars`, restart the Worker, sign in and set up a vault (step 11). Run `curl -X POST http://localhost:8787/process -b "bower_session=<value>" -H "Origin: http://localhost:5173"` twice within a few seconds: both answer 202 with the same `run.runId`, and the instance repo's Actions tab shows a single `ingest` run (event `repository_dispatch`).
15. Runner endpoints. The runner's credential is a run ticket that only reaches the instance repo's `repository_dispatch`, so it cannot be tried by hand from a local Worker; `pnpm -C api test` covers the ticketed calls. What you can check is that no operator key works there (#291, #292). With the Worker running and a vault set up (step 11), take the user id from the `user:<id>` key (step 6) and `ADMIN_KEY` from `api/.dev.vars`, then run `curl -i -H "Authorization: Bearer $ADMIN_KEY" http://localhost:8787/runner/vaults/<user id>`. It answers 401 `unauthorized`, as does the same call without the header, and `POST /runner/vaults/<user id>/status` with the key. `POST /runner/lint/dispatch` is the reverse: it answers 401 without `ADMIN_KEY` (or with a run ticket) and, with it, starts the dispatch. `GET /runner/vaults` answers 404.
16. Push setup. Run `pnpm -C api gen-vapid` and put the two `VAPID_` lines it prints in `api/.dev.vars`, then restart the Worker. `curl http://localhost:8787/push/public-key` answers `{ publicKey }` with the same public key. (Manual, pending the owner.)
17. Push to a real browser. Signed in on the app in Chrome (Android, or desktop), allow notifications so the app posts its subscription to `POST /push/subscribe` (204; `wrangler kv key list --local --binding BOWER_KV` lists a `push:<id>:<hash>` key). Report a run done as in step 15 with `-d '{"state":"done","processed":["a.md","b.md"]}'`: the device shows "Bower: 2 files tidied up". Unsubscribe or clear the site's data in the browser and report again: the push service answers 410 and the `push:` key is gone. (Manual, pending the owner; needs the app side of push, #39.)
