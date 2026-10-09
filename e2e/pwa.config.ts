import { defineConfig } from '@playwright/test';

// The installable app exists only in a production build, so this runs on `vite preview`.
export default defineConfig({
  testDir: '.',
  testMatch: /pwa\.spec\.ts/,
  timeout: 30_000,
  // A committed test.only would silently run one test (https://playwright.dev/docs/api/class-testconfig#test-config-forbid-only).
  forbidOnly: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5192', channel: 'chrome' },
  webServer: { command: 'pnpm exec vite preview --port 5192 --strictPort', cwd: '..', port: 5192, reuseExistingServer: true },
});
