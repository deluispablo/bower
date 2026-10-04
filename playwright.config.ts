import { defineConfig, devices } from '@playwright/test';

// Uses the Chrome already on the machine (no browser download).
export default defineConfig({
  testDir: 'e2e',
  testIgnore: /_explore-/,
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5191', channel: 'chrome' },
  webServer: { command: 'pnpm exec vite --port 5191 --strictPort', port: 5191, reuseExistingServer: true },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, channel: 'chrome' } },
  ],
});
