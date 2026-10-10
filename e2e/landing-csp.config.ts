import { defineConfig } from '@playwright/test';
import { batchOptions } from './batch';
import { e2ePort, ROOT } from './port';

const port = e2ePort('preview');
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: '.',
  testMatch: /landing-csp\.spec\.ts/,
  timeout: 30_000,
  forbidOnly: true,
  ...batchOptions(),
  use: { baseURL, channel: 'chrome' },
  projects: [
    { name: 'phone', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `node scripts/serve-dist-with-headers.mjs ${port}`,
    url: `${baseURL}/landing/index.html`,
    cwd: ROOT,
    reuseExistingServer: false,
  },
});
