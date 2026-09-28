/**
 * Compare on the Flat hunt folder (#612): the status writes the note's
 * frontmatter and survives a reload, and the column order is remembered per
 * folder. The tab is mounted on the folder screen by #613; until it is, the
 * tests skip themselves (the same behaviour is covered against a stubbed
 * Drive in `test/compare-view.test.tsx`).
 */

import type { Page } from '@playwright/test';

import { expect, openHome, test } from './demo.js';

async function openCompare(page: Page): Promise<boolean> {
  await openHome(page);
  await page.goto('/folder/1-Projects/Flat%20hunt');
  const tab = page.getByRole('tab', { name: /^Compare/ });
  if ((await tab.count()) === 0) return false;
  await tab.click();
  return true;
}

test.describe('Compare (#612)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a changed status survives a reload', async ({ page }) => {
    test.skip(!(await openCompare(page)), 'Compare tab not mounted yet (#613)');
    const select = page.getByLabel(/^Status of Arlington Road/);
    await select.selectOption('viewed');
    await expect(select).toHaveValue('viewed');

    await page.reload();
    await page.getByRole('tab', { name: /^Compare/ }).click();
    await expect(page.getByLabel(/^Status of Arlington Road/)).toHaveValue(
      'viewed',
    );
  });

  test('a moved column keeps its place for the folder', async ({ page }) => {
    test.skip(!(await openCompare(page)), 'Compare tab not mounted yet (#613)');
    const headers = page.locator('th[scope="col"] .compare-th-sort');
    await page.getByRole('button', { name: 'Move Fit' }).click();
    await page.getByRole('button', { name: 'Move left' }).click();
    await expect(headers.nth(5)).toHaveText(/^Fit/);

    await page.reload();
    await page.getByRole('tab', { name: /^Compare/ }).click();
    await expect(headers.nth(5)).toHaveText(/^Fit/);
  });
});
