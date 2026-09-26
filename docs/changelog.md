# Changelog

Operator-facing changes, newest first. Entries under **Operator action required** need a manual step on redeploy.

## Unreleased

- `docs/runbook.md` is now one document covering deploy from zero, day-to-day operations (rotating keys, quotas, logs, costs), pausing and tearing down an instance, and adding or removing a user; see it for the full deploy walkthrough.
- Notes show attachments: embedded images inline (cached on the device), links to PDFs and other files open in Google Drive in a new tab, and `![[Other note]]` shows that note inline once.
- `docs/privacy.md` is written and served by the app at `/privacy`; give Google that URL (`<APP_ORIGIN>/privacy`) on the OAuth consent screen. See "Deploy the API" in `docs/runbook.md`.
- **Operator action required:** the app and the Worker must be served from one registrable domain (for example `app.example.com` and `api.example.com`); the default `*.pages.dev` and `*.workers.dev` hostnames do not carry the session cookie. See `docs/security.md`.
- Deploying the API: `pnpm -C api deploy` and `pnpm -C api secrets` (or `scripts/deploy-api.sh`) create the KV namespace, walk through the secrets, and deploy the Worker. See "Deploy the API" in `docs/runbook.md`.
- Project created: plan in milestones and issues.
