# Packet: worker-skeleton (P3-2)

Starting model: `bower-implementer` (Sonnet). Reason: scaffolding from the original api with fixed contracts ([TL-P3-02](DECISIONS.md), main 54620a9). An independent review follows (security middleware and CORS; Opus fallback per TL-P2-46 while Codex is out).

- **Entry:** `worker-skeleton` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-worker`, branch `claude/p3-worker`. Never push, never deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `docs/specs/2026-10-04-worker-contract.md` (the error format and calls sections only), and from the original repo `/Users/deluisp/Projects/bower/api/`: `src/security.ts`, `src/errors.ts`, `src/env.ts`, `src/index.ts` (structure only), `vitest.config.ts`, `package.json`, `wrangler.toml`.
- **Research first:** cite Cloudflare's guidance for `wrangler.jsonc` and `@cloudflare/vitest-pool-workers`, and Hono's CORS middleware docs.
- **Acceptance contract:**
  - `pnpm-workspace.yaml` with `.` and `api`; `api/package.json`, `api/tsconfig.json`, `api/wrangler.jsonc` (no secrets, no real ids: placeholders such as `FOLDER_ID`), `api/vitest.config.ts` (pool-workers), `api/src/index.ts`, and `security.ts`, `errors.ts`, `env.ts` copied as they are from the original (adjust only imports; say what you adjusted).
  - Routes: `GET /health` → 200 JSON; unknown path → 404 `{ error: { code, message } }`; a thrown error → 500 same format, no stack or internals. CORS: only the configured app origin (an env var, e.g. `APP_ORIGIN`) gets CORS headers, credentials allowed; other origins get none.
  - Named tests in `api/test/skeleton.test.ts`: `GET /health answers ok`, `an unknown path answers the JSON error format`, `CORS allows only the app origin` (plus a thrown-error case). Red first on an assertion.
  - Root `pnpm check` runs the api lint, typecheck and tests (extend the root script; keep the app's gates unchanged). `pnpm install` regenerates `pnpm-lock.yaml`.
  - Dependencies: runtime `hono`; dev `wrangler`, `@cloudflare/vitest-pool-workers` (and the vitest version it needs). One-line reason each in the delivery. Nothing else.
  - api imports nothing from `src/` (the shared contracts come later).
  - Files in scope: `pnpm-workspace.yaml`, `package.json` (scripts only), `pnpm-lock.yaml`, `api/**`, `eslint.config.js` and root `tsconfig*.json` only if needed to include or exclude `api/`. Do not touch `src/architecture.test.ts` (the other P3-2 worker owns it).
- **Gates:** the verify, `pnpm check`. No Playwright.
- **Deliver, under 15 lines:** commit SHAs, files, dependencies with reasons, red→green evidence, gate results, sources, left out.
