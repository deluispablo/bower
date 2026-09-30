import { defineConfig, devices } from '@playwright/test';

// No `@types/node` in this repo (see `vite.config.ts`); `process` is a real
// Node global when Playwright loads this file.
declare const process: { env: Record<string, string | undefined> };

/**
 * End-to-end tests (#196): the six main flows against a `vite preview` of
 * the demo build (`VITE_DEMO=1`), which answers every call from an
 * in-memory fixture — no network, no Google, no Claude. Chromium only, on a
 * phone and a desktop viewport. See `docs/testing.md`.
 */

const CI = process.env.CI !== undefined && process.env.CI !== '';

// An unusual port, so `reuseExistingServer` never picks up another app's
// preview on Vite's default 4173. `E2E_PORT` gives parallel worktrees each
// their own server.
const PORT = Number(process.env.E2E_PORT ?? '4196');
const BASE_URL = `http://localhost:${PORT}`;

// `E2E_PREBUILT=1` serves an existing `dist/` (built once by CI's
// `demo-build` job and shared by the shards) instead of building it again.
const PREBUILT = process.env.E2E_PREBUILT === '1';
const PREVIEW = `pnpm exec vite preview --port ${PORT} --strictPort`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.e2e.ts',
  outputDir: './e2e/results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // Both cores of a GitHub runner, per shard.
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    // The service worker would cache the shell between tests; the flows
    // test the app, not the offline behaviour.
    serviceWorkers: 'block',
    // Instant scrolling and no looping bird animations: steadier clicks and
    // screenshots.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    // A fake webcam, so Add's "Take a photo" door (#339, issue 21.7) shows
    // up the same way on every machine and in CI, never depending on
    // whether the box actually running the tests has a camera.
    launchOptions: { args: ['--use-fake-device-for-media-stream'] },
  },
  projects: [
    {
      name: 'phone',
      use: {
        ...devices['iPhone X'],
        viewport: { width: 375, height: 812 },
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: PREBUILT ? PREVIEW : `pnpm build:demo && ${PREVIEW}`,
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
