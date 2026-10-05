/** Regression checks from the independent P2 closure review. */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}?scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

test('Open in Drive explains the pretend source', async ({ page, isMobile }) => {
  await open(page, '/settings');
  const pages = page.context().pages().length;
  await page.getByRole('button', { name: 'Open in Drive', exact: true }).click();
  await expect(page.getByRole('status').getByText('This demo has no folder in Google Drive.')).toBeVisible();
  expect(page.context().pages()).toHaveLength(pages);
  await open(page, '/note/Projects/Flat%20hunt/Lease%20draft.pdf');
  if (isMobile) {
    await page.getByRole('button', { name: /^More for Lease draft(?:\.pdf)?$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Open in Drive', exact: true }).click();
  } else {
    await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /^Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open in Drive', exact: true }).click();
  }
  await expect(page.getByRole('status').getByText('This demo has no folder in Google Drive.')).toBeVisible();
  expect(page.context().pages()).toHaveLength(pages);
});
