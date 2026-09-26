# Changelog

Operator-facing changes, newest first. Entries under **Operator action required** need a manual step on redeploy.

## Unreleased

- Notes show attachments: embedded images inline (cached on the device), links to PDFs and other files open in Google Drive in a new tab, and `![[Other note]]` shows that note inline once.
- **Operator action required:** the app and the Worker must be served from one registrable domain (for example `app.example.com` and `api.example.com`); the default `*.pages.dev` and `*.workers.dev` hostnames do not carry the session cookie. See `docs/security.md`.
- Deploying the API: `pnpm -C api deploy` and `pnpm -C api secrets` (or `scripts/deploy-api.sh`) create the KV namespace, walk through the secrets, and deploy the Worker. See "Deploy the API" in `docs/runbook.md`.
- Project created: plan in milestones and issues.
