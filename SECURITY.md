# Security Policy

## Supported versions

Bower is deployed from `main` by each operator; there are no releases yet. Security fixes land on `main` and operators pull and redeploy. Operator-visible changes are announced under **Operator action required** in the pull request and in `docs/changelog.md`.

## Reporting a vulnerability

**Do not open a public issue.** Report it privately through GitHub's [private vulnerability reporting](../../security/advisories/new) ("Report a vulnerability" in the repository's **Security** tab).

Include what part is affected (`app/`, `api/`, `agent/`, the vault template or the deployment scripts), a description of the issue and its impact, and steps to reproduce. This is a single-maintainer project: the aim is to acknowledge a report within a week and keep you updated until it is resolved. Once a fix is on `main`, the advisory is published with credit to the reporter, unless you prefer otherwise.

## Scope

Of particular interest, given what Bower does:

- **Credential leaks**: a Google refresh token, a Claude token or API key, `BOWER_API_KEY`, a session secret or an encryption key appearing in logs, responses, error messages or the Actions log.
- **Cross-user access**: any way for one signed-in user of an instance to read or write another user's vault, run, or settings through the Worker.
- **Bypassing the allowlist or the quota**: signing in without being invited, or triggering more runs than the operator allows.
- **Vault content leaving its expected path**: notes or originals persisted anywhere other than the user's Drive and the ephemeral runner (for example in KV, in the app beyond its read cache, or in a log).
- **Unsafe rendering**: HTML or scripts inside a note executing in the app.

Out of scope: the trust the operator has by design (they run the Worker and can read every vault of their instance; see `docs/privacy.md`), Google's "unverified app" warning, and the judgement of the agent on note content, which is a regular bug.
