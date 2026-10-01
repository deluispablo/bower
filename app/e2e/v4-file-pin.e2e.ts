/**
 * Pin to Home on a file (#688, board Phone-More): the More menu of a PDF has
 * the row, the pinned file shows on Home as a tile that opens it, and
 * unpinning from the same menu takes the tile away.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './demo.js';

/** Home through the app's own link: the demo's vault lives in memory, so a
 * full page load would forget the pin. */
async function goHome(page: Page): Promise<void> {
  await page.locator('a[href="/"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
  // The demo's first-run tour opens on Home the first time it shows.
  const skip = page
    .getByRole('dialog', { name: 'Home' })
    .getByRole('button', { name: 'Skip' });
  const shown = await skip.waitFor({ state: 'visible', timeout: 3000 }).then(
    () => true,
    () => false,
  );
  if (shown) await skip.click();
}

const FOLDER = '/folder/4-Archives/Kitchen%20Refresh';

test('a PDF can be pinned to Home from its More menu and unpinned again (#688)', async ({
  page,
}) => {
  await page.goto(FOLDER);
  await page
    .locator('.folder-item', { hasText: 'Shelves and tap quote' })
    .press('Enter');
  await expect(page).toHaveURL(/\/file\//);
  const fileUrl = page.url();

  await page
    .getByRole('button', {
      name: 'More for Shelves and tap quote',
      exact: true,
    })
    .filter({ visible: true })
    .click();
  const menu = page.getByRole('menu', { name: 'File actions' });
  await menu.getByRole('menuitem', { name: 'Pin to Home' }).click();
  await expect(page.getByText('Pinned to Home')).toBeVisible();

  await goHome(page);
  const tile = page.locator('a.home-pinned-tile', {
    hasText: 'Shelves and tap quote',
  });
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page).toHaveURL(fileUrl);

  await page
    .getByRole('button', {
      name: 'More for Shelves and tap quote',
      exact: true,
    })
    .filter({ visible: true })
    .click();
  await page
    .getByRole('menu', { name: 'File actions' })
    .getByRole('menuitem', { name: 'Unpin from Home' })
    .click();
  await expect(page.getByText('Unpinned').first()).toBeVisible();

  await goHome(page);
  await expect(
    page.locator('a.home-pinned-tile', { hasText: 'Shelves and tap quote' }),
  ).toHaveCount(0);
});
