# Technical-lead decision TL-P3-2026-10-06-02: where the Worker and the shared core live

**Coordinator question, 2026-10-06:** batch P3-2 needs a layout for the Worker and the shared domain core. The coordinator proposed a `worker/` workspace package and no new package for the core.

## Ruling

1. **The Worker is a pnpm workspace package in `api/`**, as in the original app (reuse first). The name `worker/` is not used: it would be confused with `src/data/worker/`, the app's client for it.
   - Add `pnpm-workspace.yaml` with `.` and `api`. Root `pnpm check` also runs the `api` lint, typecheck and tests, so one gate still covers everything.
   - The stack is reused from the original `api/`: Hono, `@cloudflare/vitest-pool-workers` with an injected `fetch` stub, and the `security.ts`, `errors.ts` and `env.ts` modules as they are. The runtime dependency is `hono`, because the original Worker is built on it. The development dependencies are `wrangler` and `@cloudflare/vitest-pool-workers`.
   - **Configuration in `api/wrangler.jsonc`**, not TOML. Cloudflare recommends JSON for new projects, and some newer settings exist only there ([Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)). The staging preview already uses it. Set a current `compatibility_date`, and add `nodejs_compat` only when a reused module needs it.
   - `worker-skeleton` scope: `GET /health`, the error format `{ "error": { "code", "message" } }` with a contract test from the [Worker contract](../specs/2026-10-04-worker-contract.md), CORS for the app's origin only, and a test for each. It is not deployed. Deployment starts with `worker-google-oidc`, under `deploy-and-migrations`.
2. **The shared core stays inside `src/`; no package is published** ([ARCHITECTURE](../ARCHITECTURE.md#reusable-deterministic-core)).
   - `src/data/contracts` becomes pure: no DOM, storage, network, credentials or environment globals, with time and IDs passed in.
   - An architecture test enforces the direction. Files in `src/data/contracts` import only each other and allowlisted pure libraries. `api/` may import `src/data/contracts` and nothing else from `src/`.
   - The Worker imports it by a relative path, or a `tsconfig` path alias, compiled by its own bundler. The runner does the same later.

Both entries go to `bower-implementer` with these points as their acceptance contracts. The architecture test is the sensor for point 2.
