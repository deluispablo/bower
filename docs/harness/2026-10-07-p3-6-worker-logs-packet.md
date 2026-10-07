# Packet: worker-logs-and-version (P3-6)

Starting model: `bower-mechanical` (Haiku). Reason: two config and doc lines with a sensor test ([TL-P3-10](2026-10-07-tl-p3-10-r2-result.md) ruling 4), plus one stand-in route ([TL-P3-11](2026-10-07-tl-p3-11-drive-suite-findings.md) F3).

- **Entry:** `worker-logs-and-version` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-logs`, branch `claude/p3-logs`. Never push or deploy, never run `wrangler`.
- **Read:** `docs/harness/WORKER.md`, this packet, `api/wrangler.jsonc`, `src/docs.test.ts` (the TL-P3-08 sensor), the deploy paragraph at the top of `docs/harness/STAGING.md`; for the route, `api/src/drive-token.ts`, `api/src/index.ts`, the person object and `api/test/drive-token.test.ts` as the pattern.
- **Research, cite:** [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) (`"observability": { "enabled": true }`), and `wrangler deploy --var` in the Wrangler commands docs.
- **Acceptance contract:**
  - `api/wrangler.jsonc` gains `"observability": { "enabled": true }` with a one-line comment: logs for sign-in failures, free tier.
  - The deploy command in `STAGING.md`'s top paragraph adds `--var APP_VERSION:<main short SHA>`, and its check list says `/health` must name that SHA. `APP_VERSION` stays `"0.1.0"` in `vars` as the local default.
  - Named test in `src/docs.test.ts`: `the staging Worker keeps its logs and names its build`. It asserts both lines above. Red first on an assertion.
  - **Added by TL-P3-11 F3:** `GET /status` with a session answers 200 `{ "run": null }`, read from the person object: a `currentRun()` method that returns `null` until runs exist; `worker-status-revision` replaces its body. Without a session it answers 401 `signed-out` (reuse `requireSession`, as `GET /drive/token` does in `api/src/drive-token.ts`). Mount it in `api/src/index.ts`. Named api tests: `status answers no run for a signed-in person` and `status without a session answers signed-out`, red first.
  - Files in scope: `api/wrangler.jsonc`, `docs/harness/STAGING.md` (that paragraph only), `src/docs.test.ts`, a new `api/src/status.ts`, `api/src/index.ts`, the person object's file (one method), a new `api/test/status.test.ts`. Never write the staging origin anywhere.
- **Gates:** the verify (both parts), `pnpm check`. Never write `harness/` records or run `done.sh`.
- **Deliver, under 8 lines:** commit SHA, red→green, gates, sources.
