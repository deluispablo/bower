/**
 * The folder on the desktop (#614, boards `Desktop-Explorer` and
 * `Desktop-Folder`): three panes from 1200 px, the preview following the
 * selected row, the keys the hint line lists, and the kind chips. Below
 * 1200 px the single column stays.
 */

import type { Page } from '@playwright/test';

import { expect, shot, test } from './demo.js';

const FLAT = '/folder/1-Projects/Flat%20hunt';

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(FLAT);
  await expect(page.locator('.folder-item').first()).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop layout');
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('1280 px: three panes, and the preview follows the selected row', async ({
  page,
}, testInfo) => {
  await open(page, 1280);
  const preview = page.getByRole('complementary', { name: 'Preview' });
  await expect(preview).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Your notes' }),
  ).toBeVisible();
  const box = await page.locator('.folder-view').boundingBox();
  expect(box?.width).toBeLessThanOrEqual(561);

  // The first row is selected at first; its title is the preview's.
  const rows = page.locator('.folder-item');
  const first = rows.first();
  await expect(first).toHaveAttribute('data-selected', 'true');
  const firstTitle = (
    await first.locator('.folder-row-name').innerText()
  ).trim();
  await expect(preview.locator('.quick-look-title')).toHaveText(firstTitle);
  await expect(
    preview.getByRole('link', { name: 'Open', exact: true }),
  ).toBeVisible();
  await expect(preview.getByText('Open in Drive')).toBeVisible();

  // The next row, by keyboard: the preview moves with it.
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('data-selected', 'true');
  const secondTitle = (
    await rows.nth(1).locator('.folder-row-name').innerText()
  ).trim();
  await expect(preview.locator('.quick-look-title')).toHaveText(secondTitle);

  // The header, the dates and the hint line.
  await expect(
    page.getByRole('button', { name: /^Pin to Home|^Pinned/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Ask Bower about it' }),
  ).toBeVisible();
  await expect(page.locator('.folder-counts')).toHaveText(
    /^\d+ things?( · \d+ new)? · \d+ originals?, \d+ by Bower$/,
  );
  await expect(page.locator('.folder-row-date').first()).toHaveText(
    /^(\d\d:\d\d|[A-Z][a-z]{2} \d+)$/,
  );
  await expect(page.locator('.folder-keys-hint')).toHaveText(
    '↑ ↓ move · Space quick look · Enter open · ⌫ up a folder',
  );
  await shot(page, testInfo, 'desktop-folder-panes');
});

test('the pair on the preview: Bower and the original, the note rendered', async ({
  page,
}) => {
  await open(page, 1280);
  const preview = page.getByRole('complementary', { name: 'Preview' });
  await page
    .locator('.folder-item', { hasText: 'Arlington Road, 2 bed' })
    .first()
    .hover();
  await expect(preview.locator('.quick-look-title')).toContainText(
    'Arlington Road',
  );
  await expect(preview.locator('.quick-look-kind')).toContainText(
    'Bower · Original: PDF',
  );
  await expect(preview.locator('.quick-look-pane-note')).toBeVisible();
});

test('the keys: Space quick look, Enter opens, Backspace goes up', async ({
  page,
}) => {
  await open(page, 1280);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press(' ');
  const dialog = page.getByRole('dialog', { name: /^Quick look:/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.keyboard.press('Backspace');
  await expect(page).toHaveURL(/\/folder\/1-Projects$/);

  await page.goBack();
  await expect(page.locator('.folder-item').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/(note|file)\//);
});

test('1100 px: the single column stays, with no preview pane', async ({
  page,
}) => {
  await open(page, 1100);
  await expect(
    page.getByRole('complementary', { name: 'Preview' }),
  ).toHaveCount(0);
  await expect(page.locator('.folder-keys-hint')).toHaveCount(0);
  await expect(page.getByLabel('Kind')).toBeVisible();
  const box = await page.locator('.folder-view').boundingBox();
  expect(box?.width).toBeGreaterThan(600);
});

test('the kind chips count and filter', async ({ page }) => {
  await open(page, 1280);
  const chips = page.getByRole('group', { name: 'Kind' });
  await expect(chips.getByRole('button').first()).toHaveText(/^All \d+$/);
  await expect(page.getByLabel('Kind')).toHaveCount(1);
  const all = Number(
    (await chips.getByRole('button').first().innerText()).replace(/\D+/g, ''),
  );
  const notes = chips.getByRole('button', { name: /^Notes \d+$/ });
  await expect(notes).toBeVisible();
  const count = Number((await notes.innerText()).replace(/\D+/g, ''));
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(all);
  await notes.click();
  await expect(notes).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.folder-item')).toHaveCount(count);
  await chips.getByRole('button', { name: /^All / }).click();
  await expect(page.locator('.folder-item')).toHaveCount(all);
});
