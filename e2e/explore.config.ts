import { defineConfig, devices } from '@playwright/test';

// For exploratory testing against the dev server already running on 5190.
export default defineConfig({
  testDir: '.',
  testMatch: /_explore-.*\.spec\.ts/,
  timeout: 120_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5190', channel: 'chrome' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, channel: 'chrome' } },
  ],
});
