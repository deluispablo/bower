/**
 * Setup file for every api test. The staging limits in `wrangler.jsonc` are real bindings, and the suites share one
 * client address and many sign-ins, so they would trip them. The suites run without the bindings (a missing binding is
 * skipped unless `RATE_LIMIT_REQUIRED` is "true"); `test/rate-limits.test.ts` injects its own deterministic doubles.
 */
import { env } from 'cloudflare:test';

const bindings = env as unknown as Record<string, unknown>;
for (const name of ['AUTH_RATE_LIMIT', 'DRIVE_RATE_LIMIT', 'VAULT_RATE_LIMIT']) Reflect.deleteProperty(bindings, name);
