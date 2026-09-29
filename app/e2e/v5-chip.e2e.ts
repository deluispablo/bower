/**
 * The tidy-up bar and chip (#751, R-CHIP-2, R-CHIP-6, D31): docked above the
 * tab bar on the phone without covering the last row, a pill in the top bar
 * on desktop, gone on Home, and hidden on a phone while a text field has
 * focus. The demo holds the current run in one state through the
 * `bower:demo:run` session-storage switch (`demo/server.ts`).
 */

import type { Page } from '@playwright/test';

import { expect, test } from './demo.js';

const FLAT = '/folder/1-Projects/Flat%20hunt';

async function holdRun(page: Page, state: string): Promise<void> {
  await page.addInitScript((held) => {
    sessionStorage.setItem('bower:demo:run', held);
  }, state);
}

test('phone: the bar sits above the tab bar and never covers the last row (R-CHIP-2)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the bar is the phone');
  await holdRun(page, 'running');
  await page.goto(FLAT);
  const bar = page.locator('.shell-dock');
  await expect(bar.getByRole('status')).toBeVisible();
  await expect(
    bar.getByRole('button', {
      name: /^Tidying up 2 things, \d+ minutes? so far\. Show progress$/,
    }),
  ).toBeVisible();

  const tabs = page.locator('.bottom-nav');
  const barBox = await bar.boundingBox();
  const tabBox = await tabs.boundingBox();
  expect(barBox).not.toBeNull();
  expect(tabBox).not.toBeNull();
  // Within 2 px: the dock's sticky offset is 60 px, the tab bar 61.
  expect((barBox?.y ?? 0) + (barBox?.height ?? 0)).toBeLessThanOrEqual(
    (tabBox?.y ?? 0) + 2,
  );

  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const last = page.locator('.folder-item').last();
  await last.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const lastBox = await last.boundingBox();
  const dockBox = await bar.boundingBox();
  expect(lastBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(
    (dockBox?.y ?? 0) + 1,
  );
});

test('phone: the bar hides while a text field has focus and comes back (R-CHIP-6)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the bar is the phone');
  await holdRun(page, 'running');
  await page.goto(FLAT);
  await expect(page.locator('.shell-dock')).toBeVisible();

  await page.evaluate(() => {
    const field = document.createElement('input');
    field.id = 'probe-field';
    field.type = 'text';
    document.body.append(field);
    field.focus();
  });
  await expect(page.locator('.shell-dock')).toHaveCount(0);

  await page.evaluate(() => {
    document.getElementById('probe-field')?.blur();
  });
  await expect(page.locator('.shell-dock')).toBeVisible();
});

test('there is no bar and no chip on Home (D31)', async ({ page }) => {
  await holdRun(page, 'running');
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Tidying up' }),
  ).toHaveCount(0);
  await expect(page.locator('.run-chip')).toHaveCount(0);
});

test('desktop: the chip is in the top bar, and opening the sheet takes a done result away', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the chip is desktop');
  await holdRun(page, 'done');
  await page.goto(FLAT);
  const chip = page.locator('.topbar .run-chip');
  await expect(chip).toBeVisible();
  await expect(chip.getByRole('status')).toHaveCount(0);
  const button = chip.getByRole('button', {
    name: /^Tidy-up done: .* See what changed$/,
  });
  await expect(button).toBeVisible();
  await expect(chip.locator('.run-chip-title')).toHaveText('Done');
  await expect(page.locator('.shell-dock')).toHaveCount(0);

  await button.click();
  await expect(page.locator('.run-chip')).toHaveCount(0);
  const seen = await page.evaluate(() =>
    Object.keys(localStorage).some((key) => key.startsWith('bower:run-seen:')),
  );
  expect(seen).toBe(true);
});

test('desktop: partly done and did not finish read as the board says', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the chip is desktop');
  await holdRun(page, 'partial');
  await page.goto(FLAT);
  const chip = page.locator('.topbar .run-chip');
  await expect(chip.locator('.run-chip-title')).toHaveText('Partly done');
  await expect(chip.locator('.run-chip-detail')).toHaveText(
    '1 still in your inbox',
  );
  await expect(chip.getByRole('button')).toHaveAccessibleName(
    'Tidy-up partly done, 1 thing still in your inbox. Finish it',
  );
});
