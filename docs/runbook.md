# Runbook

How the owner sets up, deploys, rotates and recovers the Bower staging Worker. It is adapted from the original app's runbook and trimmed to what P3 runs. Commands run from the repository root unless a section says `api/`.

No real values live here. `<staging origin>` is the staging address (an `https://` origin with no path), `FOLDER_ID` is a Drive folder id, and the only address is `you@example.com`. The owner's own GitHub names (`deluispablo`, `bower-home`) are the one exception the project allows.

Not covered yet, because they arrive in P4: the Claude credential for the runner, the production Worker's name and its deploy, and rate limits.

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
| `ADMIN_KEY` | not used yet | Reserved for an admin route. Leave unset. |
| `VAPID_PUBLIC_KEY` | not used yet | Reserved for push messages. Leave unset. |
| `VAPID_PRIVATE_KEY` | not used yet | Reserved for push messages. Leave unset. |

### Variables (`--var` or `api/wrangler.jsonc`)

Variables are not secret. `deploy-staging.sh` passes the first four with `--var` on every deploy; the rest come from `api/wrangler.jsonc`.

| Name | Set how | Meaning |
| --- | --- | --- |
| `APP_ORIGIN` | `--var` | `<staging origin>`; where sign-in sends the person back to. |
| `API_ORIGIN` | `--var` | `<staging origin>` too, since staging is one origin; builds the OAuth redirect address. |
| `APP_VERSION` | `--var` | The short commit SHA deployed; `/health` reports it. |
| `GITHUB_REPO` | `--var` | The instance repository as `OWNER/NAME`; `BOWER_GITHUB_REPO` overrides the default for one deploy. |
| `VAPID_SUBJECT` | config | A contact URI for push, here `mailto:you@example.com`. |
| `DAILY_RUN_LIMIT` | config | Tidy-ups allowed per person per day. Default 100. |
| `DEFAULT_MAX_TURNS` | config | The longest a run may go on. Default 60. |
| `TEMPLATE_FOLDER_NAME` | config | The name of the folder Bower creates. Default `Bower`. |

To list what is set without showing values, run `npx wrangler secret list` from `api/`.

## The instance repository

Tidy-ups run as GitHub Actions in a private repository of the owner's, for example `deluispablo/bower-home`.

1. **Create or update it** with `scripts/new-instance.sh OWNER/NAME <staging origin>`. It builds the runner, creates the private repository when missing, replaces the original app's workflows with `.github/workflows/tidy.yml` and `runner/dist/runner.mjs` in one commit, and pushes. Needs `gh` logged in, `git` and `pnpm`. It sets no secret.
2. **`BOWER_API_URL`** is a repository variable the script sets to `<staging origin>`, only when it differs. The workflow hands it to the runner so the runner knows which Worker to call. Check it under the repository's settings, Secrets and variables, Actions, Variables.
3. **`GITHUB_TOKEN` on the Worker** is a fine-grained personal access token created by the owner in GitHub's settings. Scope it to the instance repository only, with Contents read and write (needed to start a run) and Actions read (needed to look a run up). Set it with `npx wrangler secret put GITHUB_TOKEN` from `api/`. It is not the repository's own Actions token and is never stored in the repository.
4. The runner needs no secret of its own: the Worker gives each run a one-time ticket in the dispatch.

Run `scripts/new-instance.sh` again whenever `runner/` changed.

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
- **Restoring the code from the backup.** Only accepted `main` is copied to the private repository `deluispablo/bower-app`. To recover, clone that repository into a new directory, check out `main`, run `pnpm install --frozen-lockfile`, and redeploy with `deploy-staging.sh` once `main` is local again. The backup holds code only: not secrets, ignored files, Cloudflare configuration or anyone's Drive. Set the secrets above again with `wrangler secret put`.
