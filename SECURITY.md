# Security Policy

## Supported versions

Bower has no releases yet: each operator deploys from `main`, and only `main` is supported. Security fixes land on `main`; operators pull and redeploy (`scripts/deploy.sh`). A fix that needs something from operators (a new secret, a changed workflow in the instance repo, a rotated key) says so under **Operator action required** in its pull request and in `docs/changelog.md`.

| Version | Supported |
| --- | --- |
| `main` (latest commit) | Yes |
| Any older commit, or a fork that has not pulled the fix | No: update to `main` |

Once releases exist, the latest release will be supported as well, and this table will say for how long.

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion for a vulnerability.** Report it privately through GitHub's [private vulnerability reporting](../../security/advisories/new): the "Report a vulnerability" button in the repository's **Security** tab. The repository owner keeps this switched on (Settings → Code security → Private vulnerability reporting); if the button is missing, open an issue that says only that you have a security report and need a private channel, with no details, and the maintainer will reply.

Include:

- what part is affected: `app/`, `api/`, `agent/`, the vault template, the deployment scripts or the CI workflows;
- a description of the issue and what an attacker gains;
- steps to reproduce, against your own instance or a local one (`pnpm -C api dev`, `pnpm -C app dev`), never against someone else's.

Please do not access, change or delete anyone else's notes or account while testing, and do not run automated scans against an instance you do not operate.

## What to expect

This is a single-maintainer project, so these are targets, not guarantees:

| Step | Target |
| --- | --- |
| Acknowledge the report | Within 7 days |
| Confirm or decline, with a severity (critical, high, medium, low) | Within 14 days |
| Fix on `main` | Critical and high: within 30 days. Medium: within 90 days. Low: best effort |
| Publish the advisory | Once the fix is on `main`, with credit to you unless you prefer otherwise |

You will hear back at each step, including when a fix is taking longer than planned. Please give the fix time to land before disclosing publicly: 90 days from the report, or the day the advisory is published, whichever comes first, unless we agree otherwise. There is no bug bounty.

## Scope

Of particular interest, given what Bower does:

- **Credential leaks**: a Google refresh or access token, a Claude token or API key, `BOWER_API_KEY`, a session secret or an encryption key appearing in logs, responses, error messages, the Actions log, or anywhere the agent can read it.
- **Cross-user access**: any way for one signed-in user of an instance to read or write another user's vault, run, or settings, through the Worker or through the runner.
- **Bypassing the allowlist, the quota or a sign-out**: signing in without being invited, triggering more runs than the operator allows, or keeping a session alive after Sign out everywhere or account deletion.
- **Vault content leaving its expected path**: notes or originals persisted anywhere other than the user's Drive and the ephemeral runner (for example in KV, in the app beyond its read cache, or in a log).
- **Unsafe rendering**: HTML or scripts inside a note executing in the app.
- **Prompt injection with an effect**: a note or file that makes the agent send vault content out, persist instructions for later runs, or change files outside the places a run may write, despite the controls in `docs/security.md`.

Out of scope: the trust the operator has by design (they run the Worker and can read every vault of their instance; see `docs/privacy.md`), Google's "unverified app" warning, denial of service by volume against Cloudflare or GitHub themselves, and the agent's judgement on note content (misfiling a note is a regular bug).

The threat model, the security checklist and the latest independent review are in `docs/security.md` and `docs/security-review-2026-09-28.md`.
