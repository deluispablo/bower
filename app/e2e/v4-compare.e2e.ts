/**
 * Compare on the Flat hunt folder (#612): the status writes the note's
 * frontmatter and survives a reload, and the column order is remembered per
 * folder. Opened from the folder screen (#613) with the desktop's Compare
 * button; the same behaviour is covered against a stubbed Drive in
 * `test/compare-view.test.tsx`.
 */

import type { Page } from '@playwright/test';

import { expect, openHome, test } from './demo.js';

async function openCompare(page: Page): Promise<void> {
  await openHome(page);
  await page.goto('/folder/1-Projects/Flat%20hunt');
  // The desktop's button beside the kind filter (#613); the phone's tab is
  // covered in `v4-folder.e2e.ts`.
  const button = page.getByRole('button', { name: /^Compare \d+ / });
  await expect(page.locator('.folder-item').first()).toBeVisible();
  await button.click();
}

async function reopenCompare(page: Page): Promise<void> {
  await expect(page.locator('.folder-item').first()).toBeVisible();
  await page.getByRole('button', { name: /^Compare \d+ / }).click();
}

test.describe('Compare (#612)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // The demo's Drive starts over on a reload, so a status surviving one is
  // covered against a stubbed Drive (`test/compare-view.test.tsx`); here the
  // change is saved without an error and the table shows it.
  test('a changed status is saved and shown', async ({ page }) => {
    await openCompare(page);
    const select = page.getByLabel(/^Status of Arlington Road/);
    await select.selectOption('viewed');
    await expect(select).toHaveValue('viewed');
    await expect(page.getByText(/couldn.t save that status/)).toHaveCount(0);
  });

  test('a moved column keeps its place for the folder', async ({ page }) => {
    await openCompare(page);
    const headers = page.locator('th[scope="col"] .compare-th-sort');
    await page.getByRole('button', { name: 'Move Fit' }).click();
    await page.getByRole('button', { name: 'Move left' }).click();
    await expect(headers.nth(5)).toHaveText(/^Fit/);

    await page.reload();
    await reopenCompare(page);
    await expect(headers.nth(5)).toHaveText(/^Fit/);
  });
});
