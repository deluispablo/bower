# Private main backup

Owner authorization, 2026-10-05: development remains local; changes accepted into local main are copied to a new private GitHub repository, `deluispablo/bower-app`. This narrow exception supersedes older blanket no-remote/no-push instructions. `bower-home` and the deployed instance are separate and untouched by this backup.

## Scope and process

- Only the main integrator owns backup pushes. Workers, design experiments, candidate branches and uncommitted work remain local. A push is not deployment or phase acceptance. Never merge incomplete work merely to back it up. Since 2026-10-06 ([TL-P2-39](2026-10-06-tl-p2-39-main-and-staging.md)) every green integration batch goes to main and is pushed; main means "latest green integrated app", not an accepted phase.
- Use a named backup remote pointing exactly to `https://github.com/deluispablo/bower-app.git`; verify the repository is private and owner is correct. Do not replace another remote or embed credentials in its URL.
- After an authorized main integration and its required gates, inspect the actual main commit and newly reachable history for secrets/personal data. Do not upload environment files, secret files, credentials, generated private evidence or another branch's content.
- Push one explicit ref: `git push backup refs/heads/main:refs/heads/main`. Never use --all, --mirror, --tags, --force or implicit current-branch pushes. Verify remote main equals the intended local SHA. If remote history diverges, stop and investigate; never overwrite it.
- Preserve authentication outside the repo. Read existing credentials through secure local mechanisms; do not print them or put them in command arguments/logs. Missing access is a reported backup blocker, not a reason to undo a local merge.
- Check future `.github/workflows` changes before pushing: backup authorization does not authorize deployment, model jobs or paid Actions execution. Keep the backup repository free of automatic deployment workflows unless separately authorized.
- Record verified backed-up SHA and pending backup failures in the integration handoff. The owner additionally requested periodic backups during unattended work. Back up after each validated main integration and check hourly for pending main changes; a thread heartbeat may remind the coordinator, but it does not independently push or change checkout ownership. The main integrator performs the push and verifies its result. No Git hook is required.

## Recovery and limitations

Clone the private repository into a new directory and check out main to recover the backed-up Git history. Run shared startup before work. Git backup does not preserve uncommitted files, local-only branches, secrets, ignored files, cloud configuration or Drive content. Keep those separately when needed; never treat a successful main push as a complete machine backup.

## Historical initial setup

Target is authorized; creation/push require authenticated access. The existing project token was accepted for GitHub identity but returned 403 when creating a repository. Browser sign-in is pending at the time of this planning change. No successful backup is claimed here; the operator must verify remote privacy and exact SHA before reporting completion.

## Current continuation policy

The backup remote is configured. Its presence alone does not prove authentication, private visibility or a successful upload. Verify these facts and remote main at each backup checkpoint. P2 and P3 validated releases may be integrated into main under GOVERNANCE. Until then only already accepted main content is eligible; active feature work remains local.
