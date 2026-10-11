import { defineConfig } from '@playwright/test';
import { batchOptions } from './batch';
import { e2eServer } from './port';

const { baseURL, webServer } = e2eServer('preview');

// The installable app exists only in a production build, so this runs on `vite preview`.
export default defineConfig({
  testDir: '.',
  testMatch: /pwa\.spec\.ts/,
  timeout: 30_000,
  // All deployment cases share the preview directory and must swap it serially.
  workers: 1,
  // A committed test.only would silently run one test (https://playwright.dev/docs/api/class-testconfig#test-config-forbid-only).
  forbidOnly: true,
  // E2E_BATCH=1: batch and freeze runs retry once and fail what passes only on retry (e2e/batch.ts).
  ...batchOptions(),
  use: { baseURL, channel: 'chrome' },
  webServer,
});
