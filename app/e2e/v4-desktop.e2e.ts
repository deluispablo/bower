/**
 * The folder on the desktop (#614, boards `Desktop-Explorer` and
 * `Desktop-Folder`): three panes from 1200 px, the preview following the
 * selected row, the keys the hint line lists, and the kind chips. Below
 * 1200 px the single column stays.
 */

import type { Page } from '@playwright/test';

import { expect, shot, test } from './demo.js';

const FLAT = '/folder/4-Archives/Flat%20hunt';

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
    page.getByRole('navigation', { name: 'Your folders' }),
  ).toBeVisible();
  const box = await page.locator('.folder-view').boundingBox();
  expect(box?.width).toBeLessThanOrEqual(561);

  // The first row is selected at first; its title is the preview's.
  const rows = page.locator('.folder-item');
  const first = rows.first();
  await expect(first).toHaveAttribute('data-selected', 'true');
  const firstTitle = (
    await first.locator('.list-row-title').innerText()
  ).trim();
  await expect(preview.locator('.quick-look-pane-title')).toHaveText(
    firstTitle,
  );
  await expect(
    preview.getByRole('link', { name: 'Open', exact: true }),
  ).toBeVisible();
  await expect(preview.getByText('Open in Drive')).toBeVisible();

  // The next row, by keyboard: the preview moves with it.
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('data-selected', 'true');
  const secondTitle = (
    await rows.nth(1).locator('.list-row-title').innerText()
  ).trim();
  await expect(preview.locator('.quick-look-pane-title')).toHaveText(
    secondTitle,
  );

  // #911: the meta line, the segments and the Filter & sort icon; the
  // dates on the right; no header actions, no hint line.
  await expect(page.locator('.page-header-meta')).toHaveText(
    /^Archives · (Active · )?\d+ things · updated /,
  );
  await expect(
    page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio'),
  ).toHaveText(['All', /^Originals \d+$/, /^By Bower \d+$/]);
  await expect(
    page.getByRole('button', { name: 'Filter and sort' }),
  ).toBeVisible();
  await expect(page.locator('.header-action')).toHaveCount(0);
  await expect(page.locator('.folder-row-date').first()).toHaveText(
    /^(\d\d:\d\d|\d+ [A-Z][a-z]{2}( \d{4})?)$/,
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
    .click();
  await expect(preview.locator('.quick-look-pane-title')).toContainText(
    'Arlington Road',
  );
  // The meta line describes the original; the note is rendered under it.
  await expect(preview.locator('.quick-look-pane-meta')).toHaveText(/^PDF · /);
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
  await expect(page).toHaveURL(/\/folder\/4-Archives$/);

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
  await expect(
    page.getByRole('button', { name: 'Filter and sort' }),
  ).toBeVisible();
  const box = await page.locator('.folder-view').boundingBox();
  expect(box?.width).toBeGreaterThan(600);
});

test('Filter & sort counts and filters by kind (#911, R-FILTER-3)', async ({
  page,
}) => {
  await open(page, 1280);
  await page.getByRole('button', { name: 'Filter and sort' }).click();
  const popover = page.getByRole('dialog', { name: 'Filter & sort' });
  const show = popover.getByRole('radiogroup', { name: 'Show' });
  await expect(show.getByRole('radio').first()).toHaveText('All kinds');
  const notes = show.getByRole('radio', { name: /^Notes \d+$/ });
  await expect(notes).toBeVisible();
  const count = Number((await notes.innerText()).replace(/\D+/g, ''));
  expect(count).toBeGreaterThan(0);
  await notes.click();
  // The count follows the draft and equals what will be shown (K-31).
  await popover
    .getByRole('button', {
      name: count === 1 ? 'Show 1 thing' : `Show ${count} things`,
    })
    .click();
  await expect(page.locator('.folder-item')).toHaveCount(count);
  await expect(
    page.getByRole('button', { name: /^Filter and sort \(notes only\)$/ }),
  ).toBeVisible();
});
