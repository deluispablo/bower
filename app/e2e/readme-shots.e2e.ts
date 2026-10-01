/**
 * The README screenshots (#923): six main screens of the demo in the dark
 * theme at 1280 × 800, written to `docs/assets/screenshots/`. Runs only
 * with `BOWER_README_SHOTS=1` (`pnpm -C app e2e:shots`) and only in the
 * desktop project; in every other run it is skipped, so the e2e suite
 * never rewrites the README's images.
 */

import type { Page, TestInfo } from '@playwright/test';

import { expect, test, visible } from './demo.js';

// No `@types/node` in this repo; `process` is a real Node global here.
declare const process: { env: Record<string, string | undefined> };

test.use({ colorScheme: 'dark' });

/** `sessionStorage` key of the demo's tour-seen flag (`src/demo/store.ts`). */
const TOUR_SEEN_KEY = 'bower:demo:tourSeenAt';

const JOB_SEARCH = '/folder/1-Projects/Job%20Search%20Australia';

/** Lets fonts, lazy panes and the tree settle before a shot. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(600);
}

/** Saves the screen where the README reads it, `docs/assets/screenshots/`. */
async function save(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await settle(page);
  await page.screenshot({
    path: `${testInfo.project.testDir}/../../docs/assets/screenshots/${name}.png`,
    animations: 'disabled',
    caret: 'hide',
  });
}

/** Opens `path` and waits for its page title. */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('h1:visible').first()).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    process.env.BOWER_README_SHOTS !== '1' ||
      testInfo.project.name !== 'desktop',
    'README shots: only with BOWER_README_SHOTS=1, desktop project',
  );
  await page.addInitScript((key: string) => {
    sessionStorage.setItem(key, '2026-09-30T08:00:00.000Z');
  }, TOUR_SEEN_KEY);
});

test('README screenshots, dark, 1280', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await open(page, '/');
  await save(page, testInfo, 'home');

  await page.goto(JOB_SEARCH);
  const link = page
    .locator('a[href^="/note/"]', { hasText: 'CV insights' })
    .first();
  await expect(link).toBeAttached();
  const href = await link.getAttribute('href');
  if (href === null) throw new Error('no link to CV insights');
  await open(page, href);
  await save(page, testInfo, 'note');

  await open(page, '/add');
  await save(page, testInfo, 'add');

  await open(page, '/bower');
  await save(page, testInfo, 'bower');

  await open(page, '/settings');
  await save(page, testInfo, 'settings');

  // The demo's scripted tidy-up, to its Done sheet.
  await page.goto('/');
  const inbox = visible(page.locator('.stat-tile', { hasText: 'Inbox' }));
  await inbox.getByRole('button', { name: 'Tidy up', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible({
    timeout: 30_000,
  });
  await save(page, testInfo, 'tidy-up');
});
