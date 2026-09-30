/**
 * Search on the phone (#593, boards `Phone-Search-Start`, `Phone-Search`,
 * `Phone-Search-None`): grouped results with chips and counts, the start
 * screen, scope, no results, and the bird staying clear of the field.
 */

import type { Page } from '@playwright/test';

import { expect, openHome, shot, test } from './demo.js';

async function openSearch(page: Page) {
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Quick switcher' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox')).toBeFocused();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
});

test('"flat hnt" finds Flat hunt: chips with counts and the three groups in order', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const dialog = await openSearch(page);
  await dialog.getByRole('combobox').fill('flat hnt');

  const chips = dialog.locator('.switcher-chips');
  await expect(chips.getByRole('button', { name: /^All \d+$/ })).toBeVisible();
  await expect(
    chips.getByRole('button', { name: /^Folders 1$/ }),
  ).toBeVisible();
  await expect(
    chips.getByRole('button', { name: /^Notes \d+$/ }),
  ).toBeVisible();
  await expect(
    chips.getByRole('button', { name: /^Files \d+$/ }),
  ).toBeVisible();
  await expect(chips.getByRole('button', { name: 'Any time' })).toBeVisible();

  // Full screen below 900 px, and the chip row scrolls rather than clipping.
  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect(box).toMatchObject({
    x: 0,
    y: 0,
    width: viewport?.width,
    height: viewport?.height,
  });
  const time = chips.getByRole('button', { name: 'Any time' });
  await time.scrollIntoViewIfNeeded();
  const chipBox = await time.boundingBox();
  expect(chipBox).not.toBeNull();
  expect((chipBox?.x ?? 0) + (chipBox?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );
  expect(await chips.evaluate((el) => getComputedStyle(el).overflowX)).toBe(
    'auto',
  );

  await expect(
    dialog.locator('.switcher-heading').filter({ hasText: /^Folder$/ }),
  ).toBeVisible();
  const headings = await dialog.locator('.switcher-heading').allTextContents();
  expect(headings.slice(0, 3)).toEqual(['Folder', 'Notes', 'Files']);

  const folder = dialog.getByRole('option', { name: /Flat hunt/ }).first();
  await expect(folder).toContainText('Projects');
  await expect(folder).toContainText('things');
  await expect(folder.locator('.folder-mark')).toBeVisible();
  await expect(dialog.locator('.switcher-match').first()).toBeVisible();
  await expect(dialog.locator('.kind-badge').first()).toBeVisible();
  await expect(dialog).toContainText(
    'Close enough counts: “flat hnt” finds Flat hunt.',
  );
  await shot(page, testInfo, 'search-results');

  // A chip narrows the list to one group.
  await chips.getByRole('button', { name: /^Folders/ }).click();
  await expect(dialog.locator('.switcher-heading')).toHaveText(['Folder']);
});

test('the empty query shows the PARA chips, Opened lately, Filed in the last tidy-up and Searched before', async ({
  page,
}, testInfo) => {
  await openHome(page);
  // Something opened, and something searched, on this device.
  const first = await openSearch(page);
  await first.getByRole('combobox').fill('flat hnt');
  // The search is remembered once its debounce has fired.
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('bower.search.recent')),
    )
    .toContain('flat hnt');
  await first.locator('.switcher-row[data-kind="note"]').first().click();
  await expect(page).toHaveURL(/\/note\//);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).toBeVisible();

  const dialog = await openSearch(page);
  const chips = dialog.locator('.switcher-chips');
  for (const label of ['Projects', 'Areas', 'Resources', 'Archives']) {
    await expect(chips.getByRole('button', { name: label })).toBeVisible();
  }
  await expect(chips.getByRole('button', { name: 'Inbox' })).toHaveCount(0);
  await expect(dialog.getByText('Opened lately')).toBeVisible();
  await expect(dialog.getByText('Filed in the last tidy-up')).toBeVisible();
  await expect(dialog.getByText('Searched before')).toBeVisible();
  await expect(
    dialog
      .locator('.switcher-recent')
      .getByRole('button', { name: 'flat hnt' }),
  ).toBeVisible();
  await shot(page, testInfo, 'search-start');
});

test('search from the Flat hunt screen is scoped and can be widened', async ({
  page,
}) => {
  await openHome(page);
  await page.goto('/folder/4-Archives/Flat hunt');
  await expect(page.getByRole('heading', { name: 'Flat hunt' })).toBeVisible();
  const dialog = await openSearch(page);
  const field = dialog.getByRole('combobox');
  await expect(field).toHaveAttribute('placeholder', 'Search in Flat hunt');
  await expect(
    dialog.getByRole('button', { name: 'Clear search in Flat hunt' }),
  ).toBeVisible();

  // Kentish Town is a listing in Flat hunt; the Lisbon trip is elsewhere.
  await field.fill('lisbon');
  await expect(dialog.getByText(/^Nothing called/)).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Search all of Flat hunt instead' })
    .click();
  await expect(
    dialog.getByRole('option', { name: /Lisbon Trip/ }).first(),
  ).toBeVisible();
  await expect(field).toHaveAttribute(
    'placeholder',
    'Search folders, notes and files',
  );
});

test('no results offers Ask Bower where it is, prefilled', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const dialog = await openSearch(page);
  await dialog.getByRole('combobox').fill('quartz zeppelin');
  await expect(
    dialog.getByText('Nothing called “quartz zeppelin”'),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      'No folder, note or file has those words in its name or its text.',
    ),
  ).toBeVisible();
  await shot(page, testInfo, 'search-none');
  await dialog.getByRole('link', { name: 'Ask Bower where it is' }).click();
  await expect(page).toHaveURL(
    /\/bower\?text=Where(%20|\+)is(%20|\+)quartz(%20|\+)zeppelin%3F/,
  );
  await expect(page.getByRole('textbox').first()).toHaveValue(
    'Where is quartz zeppelin?',
  );
});

test('the bird never intersects the field or Close at 375 px', async ({
  page,
}) => {
  await openHome(page);
  const dialog = await openSearch(page);
  const field = await dialog.locator('.switcher-field').boundingBox();
  const close = await dialog
    .getByRole('button', { name: 'Close' })
    .boundingBox();
  const bird = dialog.locator('.switcher-bird');
  const birdBox = (await bird.isVisible()) ? await bird.boundingBox() : null;
  expect(field).not.toBeNull();
  expect(close).not.toBeNull();
  if (birdBox === null || field === null || close === null) return;
  for (const box of [field, close]) {
    const apart =
      birdBox.x + birdBox.width <= box.x ||
      box.x + box.width <= birdBox.x ||
      birdBox.y + birdBox.height <= box.y ||
      box.y + box.height <= birdBox.y;
    expect(apart).toBe(true);
  }
});
