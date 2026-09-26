# Changelog

Operator-facing changes, newest first. Entries under **Operator action required** need a manual step on redeploy.

## Unreleased

- **Operator action required:** the app and the Worker must be served from one registrable domain (for example `app.example.com` and `api.example.com`); the default `*.pages.dev` and `*.workers.dev` hostnames do not carry the session cookie. See `docs/security.md`.
- Project created: plan in milestones and issues.
