# Technical-lead decision TL-P3-2026-10-07-08: the Worker config never targets production

**Found by the lead, 2026-10-07, before the first Worker deploy.** `api/wrangler.jsonc` named the Worker `bower-api`. That is the original app's production Worker in the same Cloudflare account, last deployed 2026-09-29. A `wrangler deploy` from `api/` would have replaced production, which the owner's P3 decision forbids. The config also lacked `not_found_handling`, so deep links into the app would have answered 404.

**Ruling and fix (lead, one commit, because it protects production):**

- `api/wrangler.jsonc` names the Worker `bower-staging`, and its assets use `"not_found_handling": "single-page-application"`.
- A sensor in `src/docs.test.ts` fails if the config ever names `bower-api`, names anything other than `bower-staging`, or drops the single-page fallback, and pins `BOWER_KV` to the staging namespace (never production's `BOWER_KV`, suggested by the coordinator). Production gets its own name and configuration only in P4, by an explicit ruling.
- `pnpm-workspace.yaml` gains `allowBuilds` for `esbuild` and `workerd`. Without it pnpm 12 refuses a fresh install of the workspace with `ERR_PNPM_IGNORED_BUILDS`, so a new checkout, `init.sh` and the deploy could not install.
- **Shared Cloudflare resources** in this account that belong to the original production (the `bower-api` Worker and the `BOWER_KV` namespace) are never written in P3. Staging uses only `bower-staging` and `bower-staging-kv`.
