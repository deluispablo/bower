import { defineConfig, devices } from '@playwright/test';
import { e2eServer } from './port';

const { baseURL, webServer } = e2eServer('dev');

// For exploratory testing, on this worktree's own e2e dev server (e2e/port.ts).
export default defineConfig({
  testDir: '.',
  testMatch: /_explore-.*\.spec\.ts/,
  timeout: 120_000,
  reporter: 'list',
  use: { baseURL, channel: 'chrome' },
  webServer,
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, channel: 'chrome' } },
  ],
});
