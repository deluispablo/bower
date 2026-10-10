/**
 * Setup file for every api test. The staging limits in `wrangler.jsonc` are real bindings, and the suites share one
 * client address and many sign-ins, so they would trip them. Inject an accepting binding for unrelated suites;
 * `test/rate-limits.test.ts` replaces these with deterministic counters or explicitly missing/throwing bindings.
 * The Worker still takes its production binding path: no missing-binding fallback or test-only config switch.
 */
import { env } from 'cloudflare:test';

const bindings = env as unknown as Record<string, unknown>;
for (const name of ['AUTH_RATE_LIMIT', 'DRIVE_RATE_LIMIT', 'VAULT_RATE_LIMIT']) {
  bindings[name] = { limit: async () => ({ success: true }) } satisfies RateLimit;
}
