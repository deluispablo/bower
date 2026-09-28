/**
 * Search on the desktop (#594, board `Desktop-Search`): two columns at
 * 1280 px, the preview following the highlighted result, chips that count
 * by kind, and the keyboard flow (Tab to the chips, Enter opens, `/` opens
 * search).
 */

import type { Locator, Page } from '@playwright/test';

import { expect, openHome, shot, test } from './demo.js';

async function openSearch(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Quick switcher' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox')).toBeFocused();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('the overlay has two columns and the preview follows the highlighted result', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const dialog = await openSearch(page);
  await dialog.getByRole('combobox').fill('lease');

  const rows = dialog.getByRole('option');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(1);

  const list = await dialog.locator('.switcher-body').boundingBox();
  const preview = dialog.getByRole('complementary', { name: 'Preview' });
  await expect(preview).toBeVisible();
  const previewBox = await preview.boundingBox();
  expect(list).not.toBeNull();
  expect(previewBox).not.toBeNull();
  if (list === null || previewBox === null) return;
  // Side by side: the preview starts where the list ends.
  expect(previewBox.x).toBeGreaterThanOrEqual(list.x + list.width - 1);

  const title = preview.locator('.switcher-preview-title');
  const highlighted = dialog.locator('.switcher-row[data-highlighted="true"]');
  await expect(title).toHaveText(
    (await highlighted.locator('.switcher-row-name').textContent()) ?? '',
  );
  await shot(page, testInfo, 'search-desktop');

  const first = await highlighted.getAttribute('href');
  await page.keyboard.press('ArrowDown');
  await expect(highlighted).not.toHaveAttribute('href', first ?? '');
  await expect(title).toHaveText(
    (await highlighted.locator('.switcher-row-name').textContent()) ?? '',
  );
});

test('the kind chips count each kind and filter the list', async ({ page }) => {
  await openHome(page);
  const dialog = await openSearch(page);
  await dialog.getByRole('combobox').fill('lease');

  const chips = dialog.locator('.switcher-chips');
  const all = chips.getByRole('button', { name: /^All \d+$/ });
  await expect(all).toBeVisible();
  const total = Number(((await all.textContent()) ?? '').replace(/\D/g, ''));
  const pdfs = chips.getByRole('button', { name: /^PDFs \d+$/ });
  await expect(pdfs).toBeVisible();
  const pdfCount = Number(
    ((await pdfs.textContent()) ?? '').replace(/\D/g, ''),
  );
  expect(pdfCount).toBeGreaterThan(0);
  expect(pdfCount).toBeLessThan(total);
  await expect(chips.getByRole('button', { name: 'Any time' })).toBeVisible();

  await pdfs.click();
  await expect(pdfs).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('option')).toHaveCount(pdfCount);
  await expect(dialog.locator('.switcher-heading')).toHaveText(['Files']);

  await all.click();
  await expect(dialog.getByRole('option')).toHaveCount(total);
});

test('Tab reaches the chips, Enter opens the highlighted result, / opens search', async ({
  page,
}) => {
  await openHome(page);
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: 'Quick switcher' });
  await expect(dialog).toBeVisible();
  const field = dialog.getByRole('combobox');
  await expect(field).toBeFocused();
  await expect(dialog).toContainText('Tab');
  await expect(dialog).toContainText('filters');

  // A slash typed into the field stays a slash.
  await field.fill('lease');
  await expect(dialog.getByRole('option').first()).toBeVisible();
  const firstHref = await dialog
    .locator('.switcher-row[data-highlighted="true"]')
    .getAttribute('href');

  await page.keyboard.press('Tab');
  await expect(
    dialog.locator('.switcher-chips .switcher-chip').first(),
  ).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  expect(firstHref).not.toBeNull();
  await expect.poll(() => page.url()).toContain(firstHref ?? '');
});
