# Contributing and implementation guide

This file is written for whoever implements an issue, human or model. Read it before touching code.

## Ground rules

1. **One issue, one branch, one PR.** Branch `issue-<n>-<slug>` from `main`. The PR title is the issue title; the body starts with `Closes #<n>` and lists what was done and what was left out, with reasons.
2. **Do what the issue says, no more.** Acceptance criteria are the definition of done. Anything you think is missing becomes a comment on the issue or a new issue, not silent extra code.
3. **No personal data, ever.** No emails, folder ids, tokens, names or vault content in code, tests, fixtures, docs or commit messages. Use `you@example.com`, `FOLDER_ID`, `Alex`.
4. **No secrets in the repo.** Secrets come from environment variables or Cloudflare/GitHub secrets. `.dev.vars` and `.env*` are ignored by git.
5. **Small and boring.** Prefer the standard library and one well-known dependency over three clever ones. Every dependency added must be justified in the PR.
6. **Tests where logic lives.** Pure functions (crypto, quota, markdown, path handling) get unit tests. Handlers get at least a happy path and one failure path. UI gets smoke tests only when cheap.
7. **Docs travel with code.** If a change alters how the operator deploys or how a user acts, update `docs/runbook.md` or the user-facing copy in the same PR.

## Stack (do not change without an issue)

| Area | Stack |
| --- | --- |
| Repo | pnpm workspaces, TypeScript strict, ESLint + Prettier, GitHub Actions CI (lint, typecheck, test, build) |
| `api/` | Cloudflare Workers, Hono, KV, Web Crypto (AES-GCM for tokens at rest), Vitest with `@cloudflare/vitest-pool-workers` |
| `app/` | Vite, Preact (with `preact/compat`), TypeScript, `marked` for Markdown, `idb-keyval` for cache, plain CSS with custom properties, `vite-plugin-pwa` |
| `agent/` | Bash (`set -Eeuo pipefail`), `rclone`, Claude Code CLI (`claude -p`), GitHub Actions workflows |
| Docs | Markdown; diagrams as SVG in `docs/assets/` or Mermaid in Markdown |

## Conventions

- **TypeScript:** `strict: true`, no `any` (use `unknown` and narrow), explicit return types on exported functions, `readonly` where possible.
- **Errors:** never swallow. In the Worker, map errors to JSON `{ error: { code, message } }` with the right HTTP status. In the app, show the user a short sentence and log details to the console.
- **Naming:** files `kebab-case.ts`, types `PascalCase`, functions and variables `camelCase`, constants `UPPER_SNAKE` only for true constants.
- **Commits:** imperative, one line, optional body explaining why. Example: `api: reject sign-in when email is not allowlisted`.
- **Logging in the agent:** never print vault content, file names or agent summaries to the Actions log. They go to the status callback only.
- **Language:** everything in the repo is in English: code, comments, docs, UI copy.

## How the pieces talk

```
app (browser) ──cookie session──▶ api (Worker) ──repository_dispatch──▶ agent (Actions runner)
app (browser) ──Drive access token from api──▶ Google Drive (read vault, write to 0-Inbox/)
agent ──Bearer BOWER_API_KEY──▶ api (get Drive token, report status)
agent ──rclone with that token──▶ Google Drive (sync vault down, copy results up)
api ──web push──▶ app (notification)
```

The vault folder in Drive is the only state that matters. The Worker keeps credentials and pointers, never content. The runner keeps nothing.

## Local development

- `pnpm install` at the root.
- `pnpm -C api dev` runs the Worker locally with `wrangler dev`; secrets in `api/.dev.vars` (see `api/.dev.vars.example`).
- `pnpm -C app dev` runs the app against the local Worker.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` at the root run everything.

## Definition of done for a PR

- [ ] Acceptance criteria of the issue met, each one checked in the PR body.
- [ ] CI green.
- [ ] No personal data, no secrets.
- [ ] Docs updated if behaviour visible to operator or user changed.
- [ ] Left-outs and follow-ups written as issue comments or new issues.
