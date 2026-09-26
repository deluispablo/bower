# CLAUDE.md

Guide for AI coding sessions in this repo. Caveman style on purpose. Under 5 KB: loaded every turn.

## Behaviour

- Ultra-concise chat replies. No greetings, no change summaries, no long prose.
- Commits, PRs, code comments, docs: normal English prose.
- Do what the issue says. Nothing more. Missing or wrong → say so in the PR "Left out", never improvise.
- Unsure → ask in the PR or issue. Never guess a secret, an id, a scope.

## Context optimization

- Module map, data flows, policies: `ARCHITECTURE.md` (single source; do not copy here).
- Read only files the task needs. `git diff --stat`, `rg -l`, `| head`. Show only changed blocks, never whole files.
- `pnpm-lock.yaml`: never read. Regenerate with `pnpm install`.
- `app/public/icons/`, `docs/assets/`: binary/SVG, never read unless the task is about them.

## Layout

```
app/             PWA (Vite + Preact + TS)            → Cloudflare Pages
api/             Worker (Hono + KV + Web Crypto)     → Cloudflare Workers
agent/           run.sh, prompts/, workflows/         → operator's private instance repo (GitHub Actions)
vault-template/  the vault every user starts from     → copied into the user's Drive
docs/            runbook, decisions, brand, testing
scripts/         deploy.sh, new-instance.sh, checks
```

## Commands

```bash
pnpm install                       # root, all workspaces
pnpm lint && pnpm typecheck        # whole repo
pnpm test                          # vitest per package + agent/test/smoke.sh
pnpm build                         # app build + wrangler deploy --dry-run
pnpm -C api dev                    # Worker on localhost with api/.dev.vars
pnpm -C app dev                    # app on localhost, VITE_API_URL from app/.env
```

CI runs the same four on every PR. Merge only green.

## Rules

- **No personal data, ever.** No emails, folder ids, tokens, names, vault content: not in code, tests, fixtures, docs, commits. Use `you@example.com`, `FOLDER_ID`, `Alex`. CI grep gate fails otherwise.
- **No secrets in the repo.** Env vars and Cloudflare/GitHub secrets only. `.dev.vars`, `.env*` are git-ignored.
- **Cost first.** No new runtime dependency without a one-line reason in the PR. Free tiers only; no servers.
- TypeScript strict, no `any` (`unknown` + narrow), explicit return types on exports. Files `kebab-case.ts`.
- Errors never swallowed. Worker → JSON `{ error: { code, message } }` + right status. App → one short sentence to the user, details to console.
- Agent logs: never print vault file names, summaries or paths. Status callback only.
- Vault in Drive = the only state. Worker keeps credentials and pointers, never content. Runner keeps nothing.
- Tests where logic lives: pure functions unit-tested; handlers happy path + one failure; UI smoke only when cheap. Hermetic: no network, no real Google, no real Claude.
- Everything in English: code, comments, docs, UI copy. UI copy: no jargon ("your notes", "Bower folder"; never "vault").
- Docs travel with code: operator- or user-visible change → same PR updates `docs/runbook.md` or UI copy.

## Workflow

- Issue first (milestones + issues are the plan). Branch from `main`: `feat/<n>-<slug>`, `fix/`, `docs/`, `chore/`.
- Conventional Commits, imperative subject: `feat(api): reject sign-in when email not allowlisted`.
- One issue, one PR. Title = issue title. Body per `.github/pull_request_template.md`, starts `Closes #<n>`, acceptance criteria ticked, "Left out" section. Label `needs-review`. Do not merge.
- Lead reviews, may open or edit issues. Merge = squash.
