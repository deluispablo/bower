# Changelog

Operator-facing changes, newest first. Entries under **Operator action required** need a manual step on redeploy.

## Unreleased

- An email-in inbox is documented as an optional, not-built extension an operator could add on their own instance: `docs/extensions/email-in.md`.
- Weekly health check: the instance repo's `lint.yml` now runs every Sunday at 06:17 UTC over every user's Bower folder (listed with the new `GET /runner/vaults`), and the app shows the result under **Health**, with a badge when a new one arrives. Rerun `scripts/deploy.sh` (or `scripts/new-instance.sh`) to copy the new workflow into the instance repo; see "Weekly health check" in `docs/runbook.md`.
- A file added to `0-Inbox/` or `Clippings/` while a run is in progress is no longer sent to the Drive Trash when the run finishes; the runner now deletes only the originals it processed.
- Semantic search spike (`docs/spikes/semantic-search.md`, #51): recommends embedding notes locally in the runner; implementation decision still open.
- Onboarding's "I already have a folder" step can open the Google Picker to choose a folder visually, instead of pasting a link; the paste-a-link form still works and is the fallback when `VITE_GOOGLE_API_KEY` isn't set or the Picker fails to load. Optional: see "Google OAuth client" in `docs/runbook.md`.
- Sign-out and delete-account now clear the device: cached notes and images (IndexedDB), the `bower-api` and share caches, the Drive token, and per-user preferences (theme kept) — so a shared device shows nothing of the previous user afterwards.
- `docs/runbook.md` is now one document covering deploy from zero, day-to-day operations (rotating keys, quotas, logs, costs), pausing and tearing down an instance, and adding or removing a user; see it for the full deploy walkthrough.
- **Operator action required:** `scripts/deploy.sh` deploys everything in one run (instance repo, KV, Worker, secrets, app on Pages) and reruns cleanly; `scripts/new-instance.sh` creates or updates the private instance repo. Your real `[vars]`, KV id and custom domain now live in the git-ignored `api/wrangler.local.toml`: if you edited `api/wrangler.toml`, move those values there (or delete your edits and let the script ask) and put `api/wrangler.toml` back to its placeholders. See "Deploy" in `docs/runbook.md`.
- Notes show attachments: embedded images inline (cached on the device), links to PDFs and other files open in Google Drive in a new tab, and `![[Other note]]` shows that note inline once.
- `docs/privacy.md` is written and served by the app at `/privacy`; give Google that URL (`<APP_ORIGIN>/privacy`) on the OAuth consent screen. See "Deploy" in `docs/runbook.md`.
- **Operator action required:** the app and the Worker must be served from one registrable domain (for example `app.example.com` and `api.example.com`); the default `*.pages.dev` and `*.workers.dev` hostnames do not carry the session cookie. See `docs/security.md`.
- Deploying the API: `pnpm -C api deploy` and `pnpm -C api secrets` (or `scripts/deploy-api.sh`) create the KV namespace, walk through the secrets, and deploy the Worker. See "Deploy" in `docs/runbook.md`.
- Project created: plan in milestones and issues.
