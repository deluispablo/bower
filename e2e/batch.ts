import { fileURLToPath } from 'node:url';
import type { ReporterDescription } from '@playwright/test';

/**
 * The one switch for batch and freeze runs of the e2e suites: `E2E_BATCH=1`. A batch run retries once
 * (https://playwright.dev/docs/api/class-testconfig#test-config-retries) and fails a test that passes only on retry
 * (https://playwright.dev/docs/api/class-testconfig#test-config-fail-on-flaky-tests); scripts/e2e-flaky.mjs names it and
 * honours testing/e2e-quarantine.json. A per-entry run (no switch) is unchanged.
 */
export function batchOptions(env: Record<string, string | undefined> = process.env): { retries: number; failOnFlakyTests: boolean; reporter: ReporterDescription[] } {
  if (env.E2E_BATCH !== '1') return { retries: 0, failOnFlakyTests: false, reporter: [['list']] };
  return { retries: 1, failOnFlakyTests: true, reporter: [['list'], [fileURLToPath(new URL('../scripts/e2e-flaky.mjs', import.meta.url))]] };
}
