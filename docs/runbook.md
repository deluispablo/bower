# Runbook

How the owner sets up, deploys, rotates and recovers the Bower staging Worker. It is adapted from the original app's runbook and trimmed to what P3 runs. Commands run from the repository root unless a section says `api/`.

No real values live here. `<staging origin>` is the staging address (an `https://` origin with no path), `FOLDER_ID` is a Drive folder id, and the only address is `you@example.com`. The owner's own GitHub names (`deluispablo`, `bower-home`) are the one exception the project allows.

The last part, "Production", covers the replaced production: deploy and rollback, the read-only precheck, rate limits, the OAuth publishing state and incidents. `<production origin>` is the production address.

## Accounts

You need four accounts, all the owner's:

- **Cloudflare.** Hosts the staging Worker, its one KV namespace and its person objects. Sign in once with `wrangler login`.
- **Google Cloud.** Holds the OAuth client (next section). Two Google test accounts sign in to staging.
- **GitHub.** Holds this repository's private backup and the private instance repository whose Actions run tidy-ups.
- **A Drive per person.** Bower works in each person's own Drive. Nothing of theirs is kept on the Worker beyond what "Deletion" lists.

Never type a secret into a chat, a file in the repository or a command's arguments you will keep in shell history. Pipe it in or paste it at the prompt.

## The Google OAuth client

Reuse the existing OAuth client in the Google Cloud console and add the staging origin to it:

1. Under authorized redirect URIs, add `<staging origin>/auth/callback`. The Worker builds this address from `API_ORIGIN`, so the two must match exactly.
2. Under authorized JavaScript origins, add `<staging origin>`.
3. The scopes the app asks for are `openid`, `email`, `profile` and `https://www.googleapis.com/auth/drive`. Full Drive is deliberate: Bower's marks are file properties, and a narrower scope would hide what a person adds some other way.
4. While the consent screen is in testing, add the two test accounts as test users.

The client id and client secret become the Worker secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## The staging Worker on one origin

The app and the Worker are served from one origin by the Worker named `bower-staging`, configured in `api/wrangler.jsonc`. That file holds the staging KV namespace and the variable defaults. It must never name `bower-api`, the original app's production Worker, and the deploy script refuses if it does.

### KV and person objects

- **`BOWER_KV`** is the single KV namespace. It is already bound in `api/wrangler.jsonc`. Create a new one with `npx wrangler kv namespace create` only when starting a fresh environment, then put its id in that file.
- **`PERSON`** is the Durable Object namespace, one SQLite-backed object per person. It needs no setup.

### Secrets (`wrangler secret put`)

Run each from `api/`, and paste the value at the prompt: `npx wrangler secret put NAME`. Required ones come first. The Worker answers 500 `internal` until all four are set.

| Name | Required | What it is |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | yes | The OAuth client id. |
| `GOOGLE_CLIENT_SECRET` | yes | The OAuth client secret. |
| `SESSION_SECRET` | yes | Signs the session cookie. At least 32 bytes; make one with `openssl rand -base64 32`. |
| `TOKEN_ENC_KEY` | yes | Encrypts each person's stored Google refresh token. Exactly 32 bytes, standard base64: `openssl rand -base64 32`. |
| `GITHUB_TOKEN` | for tidy-ups | Lets the Worker start a run in the instance repository. See the next section. |
| `SESSION_SECRET_PREVIOUS` | only while rotating | The old `SESSION_SECRET`, so existing sessions keep working for a while. See "Rotation". |

### Variables (`--var` or `api/wrangler.jsonc`)

Variables are not secret. `deploy-staging.sh` passes the first four with `--var` on every deploy; the rest come from `api/wrangler.jsonc`.

| Name | Set how | Meaning |
| --- | --- | --- |
| `APP_ORIGIN` | `--var` | `<staging origin>`; where sign-in sends the person back to. |
| `API_ORIGIN` | `--var` | `<staging origin>` too, since staging is one origin; builds the OAuth redirect address. |
| `APP_VERSION` | `--var` | The short commit SHA deployed; `/health` reports it. |
| `GITHUB_REPO` | `--var` | The instance repository as `OWNER/NAME`; `BOWER_GITHUB_REPO` overrides the default for one deploy. |
| `DAILY_RUN_LIMIT` | config | Tidy-ups allowed per person per day. Default 100. |
| `TEMPLATE_FOLDER_NAME` | config | The name of the folder Bower creates. Default `Bower`. |

To list what is set without showing values, run `npx wrangler secret list` from `api/`.

## The instance repository

Tidy-ups run as GitHub Actions in a private repository of the owner's, for example `deluispablo/bower-home`.

1. **Create or update it** with `scripts/new-instance.sh OWNER/NAME <staging origin>`. It builds the runner, creates the private repository when missing, replaces the original app's workflows with `.github/workflows/tidy.yml` and `runner/dist/runner.mjs` in one commit, and pushes. Needs `gh` logged in, `git` and `pnpm`. It sets no secret.
2. **`BOWER_API_URL`** is a repository variable: a comma-separated list of the Worker origins this repository serves. The script adds `<staging origin>` to it when missing and keeps every other entry, so one instance repository may serve staging and production: run the script once for each origin. Each dispatch names its Worker's origin (`api_url`), and the runner calls only a listed one; otherwise it refuses and exits non-zero. A dispatch without `api_url` (an older Worker) is served only when the list has one origin. The workflow hands the variable to the runner. Check it under the repository's settings, Secrets and variables, Actions, Variables.
3. **`GITHUB_TOKEN` on the Worker** is a fine-grained personal access token created by the owner in GitHub's settings. Scope it to the instance repository only, with Contents read and write (needed to start a run) and Actions read (needed to look a run up). Set it with `npx wrangler secret put GITHUB_TOKEN` from `api/`. It is not the repository's own Actions token and is never stored in the repository.
4. The runner needs no secret of its own: the Worker gives each run a one-time ticket in the dispatch.

Run `scripts/new-instance.sh` again whenever `runner/` changed.

## The CI gate

GitHub Actions runs the merge gate: `.github/workflows/gate.yml` runs every step of `pnpm check` as parallel jobs and the `pnpm e2e` suites (fake on phone and desktop, demo on desktop) in shards, on Linux runners only. Only the coordinator runs the two commands; workers never push.

1. **Run it:** `scripts/ci-gate.sh sdd/batch-N`. It accepts only a branch named `sdd/batch-<name>`, pushes it to `backup` (the public `deluispablo/bower`) without force, finds the run of that commit, waits for it, and prints one line, `ci-gate: sdd/batch-N <conclusion> (run <id>)`. It exits 0 only when the conclusion is `success`. On any other conclusion it also prints the last 150 lines of the failing log and exits 1. If no run appears within about two minutes it says so and exits 1. Two batches can be in flight: each branch has its own run.
2. **After `sdd integrate`:** `scripts/ci-gate.sh --cleanup sdd/batch-N` deletes the remote branch (`git push backup --delete`). Only accepted `main` stays on `backup`.
3. **A batch push is not a backup.** The rule "`pnpm e2e:full` before a backup or deployment" is for backing up `main`. For that, run the workflow by hand with `full` on (Actions, gate, Run workflow, `full`), which also runs the demo on phone, or run `pnpm e2e:full` locally.
4. **Read a failure.** The terminal shows the failing log tail. For the whole run open it on GitHub (`gh run view <id> --web`). A failed e2e shard uploads its blob report, and the `e2e-report` job merges them into one artifact, `playwright-report`, kept 7 days: download it (`gh run download <id> -n playwright-report`), then `pnpm exec playwright show-report playwright-report` shows each failure with its trace. Passing runs upload nothing.
5. **Until the first green run, the local gate stays in force** (`pnpm check` plus `pnpm e2e`). A failure only seen on Linux (a script or test that assumes macOS) is fixed at its cause in a follow-up task, never worked around in the workflow. Watch the run's billable minutes (Settings, Billing) and tune the shard counts in the workflow if the longest job is far from about 10 minutes.

## Deploys

Only the technical lead deploys, from a clean checkout of the new local `main`.

1. **First choice:** `scripts/deploy-staging.sh <main SHA> <staging origin>`. It refuses a dirty checkout, a SHA that is not local `main`'s tip, and any config but `bower-staging` with the staging KV. Then it installs, builds, scans, deploys, checks `/health` names the SHA (rerunning once), waits for `/status` to answer 401 JSON, and builds and scans the runner bundle. It does not run `new-instance.sh`.
2. **Fallback, by hand**: `pnpm install --frozen-lockfile`, then `env -u VITE_API_URL pnpm build`, scan `dist/`, and from `api/` run `npx wrangler deploy --var APP_ORIGIN:<staging origin> --var API_ORIGIN:<staging origin> --var APP_VERSION:<main short SHA> --var GITHUB_REPO:OWNER/NAME`. The output must name `bower-staging`, never `bower-api`.
3. **Check:** `/`, `/?source=fake`, a deep link, `/landing/`, `/health` (names the SHA), `/me` and `/runner/runs/x/token` (401 JSON, never the app page).
4. **Version skew.** After a deploy, a Worker on the new version can still reach a person object running the old one for seconds to minutes. Wait for one 200 from a method that was added before reading results. If a failure keeps on, redeploy the same version to restart the objects. The Worker answers this with 503 and `Retry-After`, never 500.

Logs: `npx wrangler tail bower-staging --format json`, with no status filter. A handled 500 shows outcome "ok" and is missed by `--status error`.

## Rotation

Rotate a secret by running `npx wrangler secret put NAME` from `api/` with the new value.

- **`SESSION_SECRET`, without signing everyone out.**
  1. Copy the current value into `SESSION_SECRET_PREVIOUS` first.
  2. Put the new value in `SESSION_SECRET`. New sessions are signed with it; old cookies still verify against the previous one.
  3. After the longest session has expired, delete the previous one with `npx wrangler secret delete SESSION_SECRET_PREVIOUS`.
  Setting `SESSION_SECRET` alone signs every person out at once; nothing is lost, they sign in again.
- **`TOKEN_ENC_KEY`.** Every stored refresh token was encrypted with the old key, so after rotating it none can be read. The Worker treats an unreadable token as one Google refused: the person's first call that needs Drive forgets it, retires their sessions and answers 401 `signed-out`, so the app asks them to sign in again. A tidy-up running then gets the same answer at its token call and stops without reporting ("This tidy-up is no longer allowed to change your folder"). Signing in again forgets an unreadable token too and asks Google for consent, so a new token is kept; nobody has to remove Bower's access by hand. Their folder and notes are untouched. There is no grace window, so rotate it only if the key may have leaked, and say so to the two test accounts first.
- **`GITHUB_TOKEN`.** Create the new token, run `wrangler secret put GITHUB_TOKEN`, then revoke the old token in GitHub. A run already started keeps its ticket and is not affected.
- **`GOOGLE_CLIENT_SECRET`.** Add a new secret in the Google console, put it with `wrangler secret put`, then delete the old one.

## Deletion

"Delete my account" calls `DELETE /me`. The Worker forgets the person: their encrypted tokens, settings, runs and the pointer to their folder, and it clears the session cookie.

What stays: the folder in the person's own Drive, and everything in it. Bower never deletes in Drive and never touches the folder on deletion. If the person signs in again, they start at the folder step and Bower finds the folder it had. The person can revoke Bower's access in their Google account settings, and can move the folder to the Bin themselves.

The person's invitation stays after deletion: their address remains on the operator's allowlist in KV as an `allow:<address>` key. The operator removes the invitation by hand with `npx wrangler kv:key delete allow:<address> --namespace-id=<id>`.

The instance repository keeps its run history, which holds no folder content.

## Recovery

- **A stale run.** A run nobody has started or reported on is marked failed by the person object's alarm, so the person sees a plain failure and can press again. Before it fails the run, the alarm looks the run up by its name in GitHub Actions and, if no job holds it, dispatches it once more as the next attempt with a new ticket. A second stale deadline fails it. This needs a working `GITHUB_TOKEN`; see "A lost dispatch". The runner never repeats work already saved: it checks the folder for that run's report before writing.
- **Version skew.** See "Deploys". Wait, then redeploy the same version if it persists.
- **A lost dispatch.** If a press is admitted but no job ever starts because `GITHUB_TOKEN` is missing, wrong or expired, nothing is dispatched again: the alarm's lookup on GitHub needs the same token, so at the stale deadline, 17 minutes after the press, the run ends failed with "This tidy-up took too long and stopped. Try again." The Worker's log says why. With no token: `tidy dispatch is not configured: no GitHub token`, then `tidy recovery is not configured: no GitHub token`. With a wrong or expired one: `tidy dispatch failed: status 401`, then `tidy lookup failed: status 401` (403 or 404 for a token without access to the instance repository). Check `GITHUB_TOKEN`, check the Actions tab of the instance repository for a run named `tidy <run id> <attempt>`, fix the cause and press again.
- **A failed `saving`.** The run reached its last phase but the report did not land. The run ends failed with the cause, and nothing is repeated: a new press reads the folder first and skips what is already there. Check the run's log in the instance repository's Actions tab.
- **Restoring the code from the backup.** Only accepted `main` is copied to the public repository `deluispablo/bower`. To recover, clone that repository into a new directory, check out `main`, run `pnpm install --frozen-lockfile`, and redeploy with `deploy-staging.sh` once `main` is local again. The backup holds code only: not secrets, ignored files, Cloudflare configuration or anyone's Drive. Set the secrets above again with `wrangler secret put`.

## Production

Production is the Worker named `bower-api`, which holds the app and the Worker on one origin, `<production origin>`. It replaces the original app. `scripts/deploy-staging.sh` refuses it on purpose, so a production deploy is always by hand, by the technical lead, after the owner has approved the moment and the rollback. Nothing here is run on production without that approval.

### Before the first deploy

1. **Secrets.** Set the four required secrets and `GITHUB_TOKEN` on `bower-api` as in "Secrets", each with `npx wrangler secret put NAME` from `api/`. Use new values, never staging's. The original app's `SESSION_SECRET` and `TOKEN_ENC_KEY` are not reused: nobody is signed in on the new app, and people sign in once.
2. **OAuth client.** Add `<production origin>/auth/callback` and `<production origin>` to the client, as in "The Google OAuth client". See "The OAuth publishing state" below.
3. **Instance repository.** Run `scripts/new-instance.sh OWNER/NAME <production origin>` for the repository production uses. Then set the Claude credential there: run `claude setup-token`, then `gh secret set CLAUDE_CODE_OAUTH_TOKEN -R OWNER/NAME` and paste the value at the prompt. It is the one secret the workflow reads. Set the repository variable `BOWER_PROVIDER` to `claude`, and optionally `BOWER_MODEL` and `BOWER_MAX_TURNS`, under Settings, Secrets and variables, Actions, Variables.
4. **Rate limits.** They must be in place before the first deploy. See "Rate limits at the cutover".
5. **The precheck.** It runs after the deploy and before any tidy-up. See "The read-only precheck".

### Deploy

From a clean checkout of the accepted local `main`, by the technical lead, never by an agent. `scripts/cutover.sh` does the guards, the build, the scan, the deploy to `bower-api` and the `/health` and `/status` checks, and prints the rollback line. Its header is the detailed reference. It reads `api/wrangler.production.jsonc`, which holds the production name, its own KV namespace and its own rate-limit namespace ids; the owner makes that file, and the script checks it.

1. Run the dry run first and read what it would do: `scripts/cutover.sh --dry-run <main short SHA> <production origin> api/wrangler.production.jsonc`.
2. Then the same without `--dry-run`: `scripts/cutover.sh <main short SHA> <production origin> api/wrangler.production.jsonc`. Write down the rollback line it prints: it names the version that was live before.
3. Run `scripts/new-instance.sh OWNER/NAME <production origin>` again whenever `runner/` changed.
4. Watch `npx wrangler tail bower-api --format json` while the first real sign-in and tidy-up go through.

### Rollback

The app is served by the Worker, so one rollback returns both the app and the Worker.

1. **Return to the last good version.** Dry run first: `scripts/rollback.sh --dry-run <version id> <production origin>`. Then the same without `--dry-run`: `scripts/rollback.sh <version id> <production origin>`, with the version id the cutover printed. It makes exactly that version live and checks that the origin answers 200. Then check that `/health` names the old SHA.
2. **If Cloudflare refuses the rollback**, usually because a person-object schema step was added since (steps are only ever appended), do not undo the schema. The script only runs from the tip of local `main`, and the real `main` stays where it is, so work in a scratch clone: `git clone . ../bower-last-good`, `cd ../bower-last-good`, `git reset --hard <last good SHA>`, `pnpm install --frozen-lockfile`. From there run `scripts/cutover.sh --dry-run <last good SHA> <production origin> <path to api/wrangler.production.jsonc>`, then the same without `--dry-run`, as in "Deploy". The old code must still read the stored data, so a release that adds a step is tested against that before it ships (see the compatibility rule in `docs/ARCHITECTURE.md`).
3. **The runner.** A rollback of the Worker does not change the instance repository. If the runner changed too, run `scripts/new-instance.sh OWNER/NAME <production origin>` from the checkout of the last good commit.
4. **Back to the original app.** The original's version stays listed in `npx wrangler deployments list` for `bower-api`. Run `scripts/rollback.sh --dry-run <version id> <production origin>` and then `scripts/rollback.sh <version id> <production origin>` with the original's version id. People signed in to the new app sign in again; their folders and notes are untouched. A tidy-up running at that moment stops without reporting.
5. **Rehearse it.** Before the cutover, practise steps 1 and 2 on staging: deploy an older SHA with `scripts/deploy-staging.sh`, then the newer one, and write down how long it took. Also run both scripts with `--dry-run`.

### The read-only precheck

The precheck is the first time the new app reads the owner's real folder, so it only reads. Run it after the production deploy and before any tidy-up is pressed.

1. Make a short-lived token by hand with the `drive.readonly` scope only (for example in the Google OAuth Playground). Never paste it into a chat, an issue or a file.
2. Run `BOWER_DRIVE_TOKEN=<token> pnpm -C runner precheck FOLDER_ID`. It reads the folder once and prints the report as JSON on stdout.
3. Read the exit code. Exit `0`: the folder was checked. Exit `1`: a read failed or a pile's note was not checked. Exit `2`: wrong arguments or token, so fix them and run it again.
4. Read the JSON. Any `refused` or `notChecked` entry, or exit `1`, means stop and roll back as above.
5. Afterwards, in Drive, open the Bower folder's version history. Nothing should show a change made at the time of the precheck.
6. If anything reads wrongly, stop, roll back as above and note what you saw. Do not fix data by hand.

### Rate limits at the cutover

Three per-minute limits guard the Worker, set under `ratelimits` in `api/wrangler.jsonc`: `AUTH_RATE_LIMIT` (20 for `/auth/login`, per client address), `DRIVE_RATE_LIMIT` (30 for `/drive/token`, per person) and `VAULT_RATE_LIMIT` (60 for `/vault`, per person). Tidy-ups keep their own daily quota, `DAILY_RUN_LIMIT`. Over a limit the Worker answers 429 `rate-limited` with `Retry-After`, and the app shows its existing plain sentence.

1. **Give production its own bindings.** The namespace ids in the file are made up for this repository. In the production config, give each of the three a namespace id that no other binding in the Cloudflare account uses (Cloudflare's Rate Limiting binding needs one per counter).
2. **A missing binding fails closed**, with a 500 `internal` on that route, never an open door. So after the deploy, check that sign-in, `/drive/token` and `/vault` answer for a signed-in person and that the tail shows no `missing` or `failed` line for a limit.
3. **Limits are approximate.** The count is per Cloudflare location and eventually consistent, so a person near a limit may pass or be refused a little early.
4. **If real use hits a limit,** raise the number in the config and redeploy. Do not remove a binding.

### The OAuth publishing state

The client's publishing status decides who can sign in and how long a sign-in lasts. Before the cutover, check it in the Google Cloud console under Google Auth platform, Audience, and write the answer down.

- **Testing.** Only listed test users can sign in, and Google expires their refresh tokens after 7 days (https://developers.google.com/identity/protocols/oauth2#expiration). Each person then meets the signed-out screen about once a week and signs in again. Nothing is lost. This suits the owner's own accounts and nobody else.
- **In production.** Tokens stay valid. The `drive` scope is restricted, so people beyond the owner's own accounts need Google's verification before it is right to invite them; an unverified client shows a warning and has a cap on new users. The owner decides who uses Bower, and that decides whether to start verification.
- **A change of state** is made in the console by the owner only, and is followed by one fresh sign-in with each test account to confirm it works.

### Incidents

First read `npx wrangler tail bower-api --format json` with no status filter (a handled 500 shows as "ok"), and the Actions tab of the instance repository for runs named `tidy <run id> <attempt>`. Never paste a token or a folder's content into a chat or an issue.

- **Revoked access.** A person (or Google) revoked Bower's access. The first call that needs Drive forgets the stored token, retires their sessions and answers 401 `signed-out`, and a running tidy-up stops without reporting. Nothing in their folder changes. They sign in again and Google asks for consent. If many people hit this at once, it is not them: check the OAuth publishing state (a Testing client expires tokens after 7 days), then `GOOGLE_CLIENT_SECRET`, then whether `TOKEN_ENC_KEY` was changed (see "Rotation").
- **Drive outage.** Check Google's status dashboard (https://www.google.com/appsstatus/dashboard/). While Drive fails, calls get 5xx or time out, the app says plainly that a change could not be confirmed, and a tidy-up that cannot finish ends failed ("This tidy-up took too long and stopped. Try again.") at the stale deadline at the latest. Nothing needs fixing and nothing should be redeployed: the runner never repeats work already saved, so people press again once Drive is back. If a tidy-up stays stuck well past 17 minutes, see "Recovery".
- **What a run offered and picked.** The run's one timing output in the Actions log ends, after its `model-call:` rows, with one `selection:` row per source of the accepted selection: `selection: source=<h> candidates=<h:tag,...|none> cut=<n> wants=<h,...|none> required=<n>/<limit> destination=<h|none> of=<i|none> new=<0|1>`. Every `<h>` is the first six hex characters of the SHA-256 of a Drive file id (`printf %s ID | shasum -a 256 | cut -c1-6`): a hint to match rows to ids you already hold, which may collide, never a name. `tag` is `p` (pinned), `f` (profile) or `nK` (place K in the expanded neighbourhood, maps before their members, not a BM25 score rank). `cut` counts what the provider left out of the source's list, which for a request is every ranked note past the first 40 (pins never cut); for a pile or thing the ranking itself stops at 12. `wants` are the notes the model picked, `required` the validator's own count (picked notes, pins, the destination's hub and a profile; the limit is 5, or 20 for a request). `of` is the first candidate whose folder is the destination (a coincidence of folders, not the model's reasoning); `new=1` is a new folder under the hashed parent. A source the selection left out shows its candidates and `wants=none required=0/<limit> destination=none`. A refused selection prints no row; a run that recovers a saved plan makes no selection and prints none.
- **Model outage.** Check the provider's status page (https://status.claude.com). A model that fails or is overloaded ends the run failed with a plain sentence, and the log in the instance repository's Actions tab shows the cause. If the credential is refused or expired, make a new one with `claude setup-token`, set it with `gh secret set CLAUDE_CODE_OAUTH_TOKEN -R OWNER/NAME`, and press again. Do not set `BOWER_PROVIDER` back to the scripted provider on production to keep tidy-ups "working": it files by a fixed script that means nothing, so a failed run is the honest answer. During a long outage, tell people rather than changing code.
- **A bad release.** If `/health` or sign-in breaks right after a deploy, roll back first ("Rollback"), then look for the cause.
- **After any incident**, write down the time, what people saw, what you did and what you changed, with no folder content in it.
