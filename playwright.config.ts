import { defineConfig, devices } from '@playwright/test';
import { batchOptions } from './e2e/batch';
import { e2eServer } from './e2e/port';

const { baseURL, webServer } = e2eServer('dev');

// Uses the Chrome already on the machine (no browser download).
export default defineConfig({
  testDir: 'e2e',
  // pwa.spec.ts needs a production build: pnpm e2e:pwa (e2e/pwa.config.ts).
  // The landing CSP test uses dist with real headers (e2e/landing-csp.config.ts).
  testIgnore: [/_explore-/, /pwa\.spec\.ts/, /landing-csp\.spec\.ts/],
  timeout: 30_000,
  // A committed test.only would silently run one test (https://playwright.dev/docs/api/class-testconfig#test-config-forbid-only).
  forbidOnly: true,
  fullyParallel: true,
  // A share of the cores (https://playwright.dev/docs/api/class-testconfig#test-config-workers).
  workers: '75%',
  // E2E_BATCH=1: batch and freeze runs retry once and fail what passes only on retry (e2e/batch.ts).
  ...batchOptions(),
  // One port per worktree and a server reused only if it is this worktree's (e2e/port.ts).
  use: { baseURL, channel: 'chrome' },
  webServer,
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, channel: 'chrome' } },
  ],
});
