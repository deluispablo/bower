# Changelog

Operator-facing changes, newest first. Entries under **Operator action required** need a manual step on redeploy.

## Unreleased

- An email-in inbox is documented as an optional, not-built extension an operator could add on their own instance: `docs/extensions/email-in.md`.
- `docs/runbook.md` is now one document covering deploy from zero, day-to-day operations (rotating keys, quotas, logs, costs), pausing and tearing down an instance, and adding or removing a user; see it for the full deploy walkthrough.
- **Operator action required:** `scripts/deploy.sh` deploys everything in one run (instance repo, KV, Worker, secrets, app on Pages) and reruns cleanly; `scripts/new-instance.sh` creates or updates the private instance repo. Your real `[vars]`, KV id and custom domain now live in the git-ignored `api/wrangler.local.toml`: if you edited `api/wrangler.toml`, move those values there (or delete your edits and let the script ask) and put `api/wrangler.toml` back to its placeholders. See "Deploy" in `docs/runbook.md`.
- Notes show attachments: embedded images inline (cached on the device), links to PDFs and other files open in Google Drive in a new tab, and `![[Other note]]` shows that note inline once.
- `docs/privacy.md` is written and served by the app at `/privacy`; give Google that URL (`<APP_ORIGIN>/privacy`) on the OAuth consent screen. See "Deploy" in `docs/runbook.md`.
- **Operator action required:** the app and the Worker must be served from one registrable domain (for example `app.example.com` and `api.example.com`); the default `*.pages.dev` and `*.workers.dev` hostnames do not carry the session cookie. See `docs/security.md`.
- Deploying the API: `pnpm -C api deploy` and `pnpm -C api secrets` (or `scripts/deploy-api.sh`) create the KV namespace, walk through the secrets, and deploy the Worker. See "Deploy" in `docs/runbook.md`.
- Project created: plan in milestones and issues.
