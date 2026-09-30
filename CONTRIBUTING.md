# Contributing

Thanks for your interest in Bower. Bug reports, fixes, documentation and ideas are welcome. By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). For security issues, see [SECURITY.md](SECURITY.md) instead of opening an issue.

## Before you start

- **Open an issue first** for anything beyond a small fix, using the [issue templates](../../issues/new/choose), so the approach can be agreed before you invest time in it. The [milestones](../../milestones) are the plan; new work should fit one of them or say why not.
- Read [ARCHITECTURE.md](ARCHITECTURE.md): what lives where, how the pieces talk, and the policies that keep the system free to run and safe to operate.
- If you use an AI coding assistant, it reads [CLAUDE.md](CLAUDE.md) automatically. The rules there apply to humans too; they are just written tersely.

## Development setup

You need Node 22 and [pnpm](https://pnpm.io/) 9 (`corepack enable` gives you pnpm).

```bash
git clone https://github.com/deluispablo/bower
cd bower
pnpm install                              # every workspace + dev tools, from pnpm-lock.yaml
cp api/.dev.vars.example api/.dev.vars    # fill in local secrets (see docs/runbook.md)
cp app/.env.example app/.env
pnpm -C api dev                           # Worker on http://localhost:8787
pnpm -C app dev                           # app on http://localhost:5173
```

Running the whole loop locally needs a Google OAuth client of your own (the runbook explains how) and, for the agent, a Claude subscription or API key. Tests need none of that.

## Checks

CI runs these on every pull request and on every push to `main`; run them locally first.

```bash
pnpm lint          # ESLint + Prettier, whole repository
pnpm typecheck     # tsc --noEmit, every workspace
pnpm test          # Vitest per workspace + the agent smoke test with stubbed rclone and claude
pnpm build         # app build + wrangler deploy --dry-run for the Worker
```

The test suites are **hermetic**: no network, no real Google, no real Claude. Google and GitHub endpoints are mocked; the agent smoke test stubs `rclone` and `claude`. What tests deliberately do not cover is the agent's judgement on real notes; that is checked by hand with [docs/testing.md](docs/testing.md).

## Code standards

- TypeScript `strict`, no `any`, explicit return types on exported functions. Files `kebab-case.ts`, types `PascalCase`.
- Errors are never swallowed. The Worker answers `{ error: { code, message } }` with the right status; the app tells the user one short sentence and logs details to the console.
- No personal data and no secrets anywhere in the repository, including tests, fixtures and commit messages. CI fails on email addresses, Drive folder ids and token-shaped strings.
- Dependencies are a cost. Add one only with a one-line reason in the pull request. Free tiers only; nothing that needs a server.
- Everything in English: code, comments, docs, UI copy. UI copy avoids jargon.
- Google-style doc comments on exported functions when the name does not say it all.

## Pull requests

- Branch from `main` with a prefix and the issue number: `feat/12-oauth-login`, `fix/`, `docs/`, `chore/`.
- One pull request, one purpose. Commits follow [Conventional Commits](https://www.conventionalcommits.org/) with an imperative subject: `feat(api): reject sign-in when email is not allowlisted`.
- The body follows [the template](.github/pull_request_template.md): what and why (`Closes #12`), how it was verified, the checklist, and what was left out and why.
- Add tests for every behaviour change. A bug fix starts with a test that fails without it.
- If the change alters how an operator deploys or how a user acts, update `docs/runbook.md` or the UI copy in the same pull request.
- Label the PR `needs-review`. Merges are squash merges by the maintainer once CI is green.

## License of contributions

Bower is licensed under `FSL-1.1-MIT` (see `LICENSE`). By opening a pull request you agree that your contribution is licensed under the same terms, and that the maintainer may relicense it together with the rest of the project.

## Releases

Bower is deployed, not published. Operators pull `main` into their instance and redeploy; `docs/runbook.md` says how. Breaking changes for operators (new secret, renamed variable) are listed under **Operator action required** in the pull request and in `docs/changelog.md`.
