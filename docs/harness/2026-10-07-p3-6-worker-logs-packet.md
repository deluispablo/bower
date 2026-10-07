# Packet: worker-logs-and-version (P3-6)

Starting model: `bower-mechanical` (Haiku). Reason: two config and doc lines with a sensor test ([TL-P3-10](2026-10-07-tl-p3-10-r2-result.md) ruling 4).

- **Entry:** `worker-logs-and-version` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-logs`, branch `claude/p3-logs`. Never push or deploy, never run `wrangler`.
- **Read:** `docs/harness/WORKER.md`, this packet, `api/wrangler.jsonc`, `src/docs.test.ts` (the TL-P3-08 sensor), the deploy paragraph at the top of `docs/harness/STAGING.md`.
- **Research, cite:** [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) (`"observability": { "enabled": true }`), and `wrangler deploy --var` in the Wrangler commands docs.
- **Acceptance contract:**
  - `api/wrangler.jsonc` gains `"observability": { "enabled": true }` with a one-line comment: logs for sign-in failures, free tier.
  - The deploy command in `STAGING.md`'s top paragraph adds `--var APP_VERSION:<main short SHA>`, and its check list says `/health` must name that SHA. `APP_VERSION` stays `"0.1.0"` in `vars` as the local default.
  - Named test in `src/docs.test.ts`: `the staging Worker keeps its logs and names its build`. It asserts both lines above. Red first on an assertion.
  - Files in scope: `api/wrangler.jsonc`, `docs/harness/STAGING.md` (that paragraph only), `src/docs.test.ts`. Never write the staging origin anywhere.
- **Gates:** the verify, `pnpm check`. Never write `harness/` records or run `done.sh`.
- **Deliver, under 8 lines:** commit SHA, red→green, gates, sources.
