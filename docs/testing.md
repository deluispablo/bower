# Testing

This checklist is the regression suite until there is automation: it walks one full ingest through every service — app, Worker, instance repo, Drive — with a throwaway Google account. Run it against a deployed instance, or locally with `wrangler dev` plus the app on `localhost` per `docs/runbook.md`'s "Local sign-in test".

## Before you start

You need:

- An operator account: the Google Cloud project holding the OAuth client (`docs/runbook.md`, "Local sign-in test", step 1), and either a deployed instance or `wrangler dev` running.
- A throwaway test Google account, never a real personal one: create a fresh Gmail address (Google Account → Create account → "For myself"), and add it as a test user on the OAuth consent screen if the client is still in *Testing* status.
- The operator's instance repo checked out, with its Actions secrets already set (`docs/runbook.md`, "Runner").
- `ADMIN_KEY` and `BOWER_API_KEY` at hand (from `api/.dev.vars` locally, or `wrangler secret list` plus your own notes for a deployed instance).

Allowlist the throwaway account before signing in, either directly in KV:

```bash
# Local (wrangler dev)
pnpm -C api exec wrangler kv key put --local --binding BOWER_KV "allow:test-user@example.com" 1
# Production
pnpm -C api exec wrangler kv key put --binding BOWER_KV "allow:test-user@example.com" 1
```

or through the admin endpoint:

```bash
curl -X POST "https://api.example.com/admin/allow" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-user@example.com"}'
```

## Happy path

- [ ] **Sign in.** Open `/login`, sign in with the allowlisted throwaway account. Expected: redirected to the app's home, no "Not invited" page. Look: `GET /me` returns `{ email, vault: null, ... }` before onboarding.
- [ ] **Onboarding creates the Bower folder.** Follow onboarding, choose "Create a new folder". Expected: 201, `{ vault: { folderId, inboxFolderId, name } }`. Look: My Drive of the test account has a `Bower` folder with `CLAUDE.md`, `index.md`, `log.md`, `About-Me.md`, `0-Inbox/` (with `Processed/`), and the PARA folders.
- [ ] **Onboarding selects a folder with the Picker (#53).** Pending the owner: on both a desktop and a mobile browser, with `VITE_GOOGLE_API_KEY` set, follow onboarding, choose "I already have a folder", then "Choose a folder". Expected: the Google Picker opens listing only folders, selecting one lands the app on the home screen with that folder as the vault. Look: the folder picked in the Picker matches the vault's `folderId`.
- [ ] **Upload a PDF.** Either drop a PDF into `0-Inbox/` directly in the Drive app, or use the **Add** screen in the Bower app (drag-and-drop or the file picker) and press "Add to Bower". Expected: the file appears in `0-Inbox/` under a unique name. Look: Drive's `0-Inbox` folder, or the Add screen's per-file progress turning to done.
- [ ] **Process.** Once the Process button lands (#37), press it in the app; until then, `curl -X POST -b "bower_session=<value>" -H "Origin: https://app.example.com" https://api.example.com/process` (the `Origin` header must match `APP_ORIGIN`, or the same-origin check answers 403 `forbidden`). Expected: 202 with `{ run: { state: "queued", runId, requestedAt } }`. Look: the response body.
- [ ] **Status moves queued → running → done.** Poll `curl -b "bower_session=<value>" https://api.example.com/status` a few times over the next minutes. Expected: `state` goes `queued` → `running` → `done`, the final response carrying `processed` (the file names picked up) and `summary` (the agent's own few-line report). Look: the `/status` response; the instance repo's Actions tab shows one `ingest` run in progress, then green.
- [ ] **The vault is updated.** Expected, in Drive: a new note exists under the PARA folder the agent chose, the original PDF has moved to `0-Inbox/Processed/`, and `index.md` and `log.md` both have a new entry. Look: Drive, the note's own content, `index.md`, `log.md`.
- [ ] **Push notification.** (Once #39 lands.) With notifications allowed on a phone or desktop Chrome signed in as the test account, the device shows "Bower: 1 file processed" shortly after the run above finishes. Look: the device's notification tray.
- [ ] **Attachments in a note.** In the test account's Bower folder, put a PNG and a PDF next to a note (for example `3-Resources/Attachments.md`) and write in it: `![[photo.png]]`, `[[scan.pdf]]` and `![[About-Me]]`. Open the note in the app. Expected: the image shows inline; the PDF is a link that opens Drive's viewer in a new tab; `About-Me` appears inline in an indented block with a link to it at the top, once, with no nested copies. Look: the note view; offline (DevTools → Network → Offline) and reloaded, the image still shows from the cache.
- [ ] **Tell Bower with a rule.** Open **Tell Bower**, type a rule such as "From now on, file recipes under Cooking and tag them #recipe", and send. Expected: "Sent. Bower is on it." Look: a new `Bower - <date> <time> <title>.md` file in `0-Inbox/`; the app calls `/process` on its own after sending.
- [ ] **The rule takes effect.** Wait for that run to finish (as above), then check `CLAUDE.md` at the top of the vault. Expected: a new dated entry describing the rule, in plain English, and the instruction note moved to `0-Inbox/Processed/`.
- [ ] **Weekly health check.** Pending the owner: after a Sunday 06:17 UTC run (or instance repo → **Actions** → **Lint vault** → **Run workflow** for one user id), the `list` job logs only a count and one `lint` job runs per user with a Bower folder, one at a time. Expected: every one of those folders has a fresh `Lint Report.md` at the top; in the app, **Health** shows a "New" badge until opened, then the report; a user with no report yet sees "No health check yet. Bower runs one every Sunday." Look: the Actions run, each folder in Drive, the app's sidebar and menu.
- [ ] **Sign out clears the device.** Pending the owner. Signed in with notes loaded and at least one open, open DevTools → Application, then press "Sign out". Expected: IndexedDB (`keyval-store`) and Cache Storage (`bower-api`, and `bower-share` if a share was in progress) hold nothing; `localStorage`'s `bower:pref:*` keys are gone except `theme`. Signing in again re-fetches everything from a clean slate.
- [ ] **Two devices appending within seconds both end up in the note.** (Pending the owner.) Open the same note (for example `About-Me`) on two devices signed in as the test account. Under the note, type a different line on each in **Add to this note** and press **Add** on both within a few seconds of each other. Expected: both show "Added to this note."; if one shows "This note changed somewhere else at the same moment. Try again.", pressing **Add** again succeeds. Look: the note in Drive ends with both lines, each its own paragraph, and nothing earlier in it was lost; in DevTools → Network, note whether the `alt=media` download carries an `ETag` header the PATCH then sends back as `If-Match`.
- [ ] **Two devices appending within seconds both end up in the note.** (Pending the owner.) Open the same note (for example `About-Me`) on two devices signed in as the test account. Under the note, type a different line on each in **Add to this note** and press **Add** on both within a few seconds of each other. Expected: both show "Added to this note."; if one shows "This note changed somewhere else at the same moment. Try again.", pressing **Add** again succeeds. Look: the note in Drive ends with both lines, each its own paragraph, and nothing earlier in it was lost.

## Negative paths

- [ ] **Not allowlisted.** Sign in with a Google account that has no `allow:` key. Expected: the "Not invited" page, HTTP 403. Look: `pnpm -C api exec wrangler kv key list --local --binding BOWER_KV` (or without `--local` for production) shows no new `user:` or `email:` key for that account — nothing is written for someone who was not invited.
- [ ] **Quota exceeded.** Locally, add `DAILY_RUN_LIMIT=1` to `api/.dev.vars` (it overrides `wrangler.toml`'s `[vars]` under `wrangler dev`) and restart the Worker. Sign in, create or select a vault, then `POST /process` twice within the same UTC day. Expected: the first answers 202; the second answers 429 `quota` with a `retryAfter` (seconds to next UTC midnight), also sent as the `Retry-After` header.
- [ ] **Stale run.** Seed a run stuck in `running` with an old `startedAt`:

  ```bash
  pnpm -C api exec wrangler kv key put --local --binding BOWER_KV "run:USER_ID" \
    '{"state":"running","requestedAt":"2020-01-01T00:00:00.000Z","startedAt":"2020-01-01T00:00:00.000Z","runId":"test"}'
  ```

  Then `curl -b "bower_session=<value>" https://api.example.com/status`. Expected: `{ "run": { "state": "failed", "error": "stale", ... }, "stale": true }` — a `running` run with no news for 30 minutes is stale, and `/status` marks it `failed` rather than leaving it stuck. Look: the `/status` response; `POST /process` right after also unblocks and starts a new run.
- [ ] **Revoked Google access.** With the test account signed in and a vault set up, go to myaccount.google.com → Security → Your connections to third-party apps → Bower → remove access. Then either wait up to an hour for the cached Drive token to expire, or drop it now: `pnpm -C api exec wrangler kv key delete --local --binding BOWER_KV "drivetoken:USER_ID"`. Expected: `GET /drive/token` answers 401 `reauth`; `GET /me` reports `needsReauth: true`; the app shows the "Google access needs to be renewed" banner with a "Reconnect Google" link.
- [ ] **Wrong runner key.** `curl -H "Authorization: Bearer wrong-key" https://api.example.com/runner/vaults/USER_ID`. Expected: 401 `unauthorized`.
- [ ] **Delete account.** Signed in as the test account, `curl -X DELETE -b "bower_session=<value>" -H "Origin: https://app.example.com" https://api.example.com/me`. Expected: 204. Look: `wrangler kv key list` (add `--local` for local) no longer lists `user:USER_ID` or `email:test-user@example.com`, any `run:`, `quota:`, `push:` or `drivetoken:` key for that user is gone, but the `Bower` folder is still in the test account's Drive, untouched — the vault is never deleted.

## Where to look

- **Cloudflare `wrangler tail`** (`pnpm -C api exec wrangler tail`, or the dashboard for a deployed instance): what the Worker logs — request ids and `error.code` values, never a token, a refresh token or an email.
- **The instance repo's Actions run**: step names only (`Install rclone`, `Run ingest`, …) and their pass/fail state. On failure, the `bower-logs` artifact (3-day retention) can hold vault content — file names, `claude`'s error text — so only open it in the private instance repo, never here.
- **Drive activity**: `drive.google.com` → the `Bower` folder → "Show activity" confirms what moved or changed, and when.
- **KV key list**: `wrangler kv key list --binding BOWER_KV` (add `--local` for `wrangler dev`) to confirm what a step wrote or deleted; `wrangler kv key get --binding BOWER_KV "<key>"` to inspect one value.

## Acceptance

- [ ] Pending the lead: the lead runs this checklist end to end on a deployed instance (#20) and every step passes.
