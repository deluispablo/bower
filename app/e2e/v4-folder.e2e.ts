/**
 * The folder screen's list mode (#611, boards `Phone-Folder-List` and
 * `Phone-Folder-ByBower`): path bar, counts, origin filter, tool row, date
 * groups, pairs as one row, and the filters remembered per folder. Runs on
 * the phone; Flat hunt is the demo's sample folder.
 */

import { expect, shot, test } from './demo.js';

const FLAT = '/folder/1-Projects/Flat%20hunt';

const PHONE_ONLY = 'the boards are the phone';

test('Flat hunt lists its things as the board does (#611)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  await expect(page.locator('.folder-item').first()).toBeVisible();

  // Path bar: the PARA mark, "Projects" a link, the current folder bold.
  const path = page.getByRole('navigation', { name: 'You are in' });
  await expect(path.locator('.folder-mark')).toBeVisible();
  await expect(path.getByRole('link', { name: 'Projects' })).toHaveAttribute(
    'href',
    '/folder/1-Projects',
  );
  await expect(path.locator('b')).toHaveText('Flat hunt');

  // Meta line and the origin filter with its counts.
  const counts = page.locator('.folder-counts');
  await expect(counts).toHaveText(/^\d+ things · \d+ originals, \d+ by Bower$/);
  await expect(page.locator('.folder-filed')).toHaveText(/^Last filed /);
  const seg = page.getByRole('group', { name: 'Show' });
  await expect(seg.getByRole('button')).toHaveText([
    'All',
    /^Originals \d+$/,
    /^By Bower \d+$/,
  ]);
  await expect(seg.getByRole('button', { name: 'All' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Tool row: sort and kind filter.
  await expect(page.getByLabel('Sort')).toHaveValue('newest');
  await expect(page.getByLabel('Kind')).toHaveValue('');

  // Date groups, newest first, and rows with their one-line detail.
  const groups = page.locator('.folder-group');
  await expect(groups.first()).toBeVisible();
  const pair = page
    .locator('.folder-item', { hasText: 'Arlington Road, 2 bed' })
    .first();
  await expect(pair).toContainText('note on the listing');
  await expect(pair.locator('.kind-badge')).toHaveText('PDF');
  await expect(
    page.locator('.folder-item', { hasText: 'Flat budget' }),
  ).toContainText('Spreadsheet (CSV) · copy of your Google Sheet');
  await expect(
    page.locator('.folder-item', { hasText: 'Notes from the viewing' }),
  ).toContainText('Note · written by you');

  // The list tip, the board's copy.
  await expect(page.locator('.folder-list-tip')).toContainText(
    'Bower marks what Bower wrote. Everything else is yours: what you added or wrote. An original and the note Bower wrote about it share one row.',
  );
  await shot(page, testInfo, 'folder-list');
});

test('By Bower shows only what Bower wrote, with its key facts (#611)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  await page.getByRole('button', { name: /^By Bower/ }).click();
  await expect(page.getByRole('button', { name: /^By Bower/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.folder-list-tip')).toHaveText(
    'Only what Bower wrote, with its key facts, so you can skim a folder without opening the originals. Tap All to see them again.',
  );
  const rows = page.locator('.folder-item');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    await expect(row.locator('.bower-tag')).toBeVisible();
  }
  const listing = page
    .locator('.folder-item', { hasText: 'note on the listing PDF' })
    .first();
  await expect(listing.locator('.key-facts')).toBeVisible();
  await expect(
    page.locator('.folder-item', { hasText: 'Flat budget' }),
  ).toHaveCount(0);
  await shot(page, testInfo, 'folder-bybower');

  // Originals shows the PDF on its own, without Bower's note.
  await page.getByRole('button', { name: /^Originals/ }).click();
  const original = page
    .locator('.folder-item', { hasText: 'Arlington Road, 2 bed' })
    .first();
  await expect(original).toContainText('PDF');
  await expect(original).not.toContainText('note on the listing');
});

test('sort, kind filter and origin filter survive a reload, per folder (#611)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  await expect(page.locator('.folder-item').first()).toBeVisible();

  await page.getByLabel('Sort').selectOption('name');
  await expect(page.locator('.folder-group')).toHaveCount(0);
  await page.getByRole('button', { name: /^Originals/ }).click();
  const kind = page.getByLabel('Kind');
  const first = await kind.locator('option').nth(1).getAttribute('value');
  expect(first).toBeTruthy();
  await kind.selectOption(first ?? '');
  const chosen = await kind.inputValue();
  expect(chosen).not.toBe('');

  // The write is asynchronous (IndexedDB): give it a moment before reloading.
  await page.waitForTimeout(300);
  await page.reload();

  await expect(page.getByLabel('Sort')).toHaveValue('name');
  await expect(page.getByLabel('Kind')).toHaveValue(chosen);
  await expect(
    page.getByRole('button', { name: /^Originals/ }),
  ).toHaveAttribute('aria-pressed', 'true');

  // Another folder is not affected.
  await page.goto('/folder/2-Areas/Cooking');
  await expect(page.locator('.folder-item').first()).toBeVisible();
  await expect(page.getByLabel('Sort')).toHaveValue('newest');
  await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
