import { defineConfig, devices } from '@playwright/test';
import { batchOptions } from './e2e/batch';

// Uses the Chrome already on the machine (no browser download).
export default defineConfig({
  testDir: 'e2e',
  // pwa.spec.ts needs a production build: pnpm e2e:pwa (e2e/pwa.config.ts).
  testIgnore: [/_explore-/, /pwa\.spec\.ts/],
  timeout: 30_000,
  // A committed test.only would silently run one test (https://playwright.dev/docs/api/class-testconfig#test-config-forbid-only).
  forbidOnly: true,
  fullyParallel: true,
  // E2E_BATCH=1: batch and freeze runs retry once and fail what passes only on retry (e2e/batch.ts).
  ...batchOptions(),
  use: { baseURL: 'http://localhost:5191', channel: 'chrome' },
  webServer: { command: 'pnpm exec vite --port 5191 --strictPort', port: 5191, reuseExistingServer: true },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, channel: 'chrome' } },
  ],
});
