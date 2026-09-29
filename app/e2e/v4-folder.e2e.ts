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
  await expect(pair.locator('.bower-tag')).toHaveText('Bower');
  await expect(pair.locator('.kind-badge')).toHaveText('PDF');

  // The phone header is the path bar and the meta line: no large title, no
  // chip row, no demo sentence (#702). The heading stays for screen readers.
  await expect(page.locator('.folder-head > .icon')).toBeHidden();
  await expect(page.locator('.folder-chips')).toBeHidden();
  await expect(page.locator('.folder-demo-note')).toBeHidden();
  const title = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(title?.width ?? 0).toBeLessThanOrEqual(1);
  await expect(
    page.locator('.folder-item', { hasText: 'Flat budget' }),
  ).toContainText('Spreadsheet (CSV) · 3 KB');
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
  await page.goto('/folder/1-Projects/Kitchen%20Refresh');
  await expect(page.locator('.folder-item').first()).toBeVisible();
  await expect(page.getByLabel('Sort')).toHaveValue('newest');
  await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

const GARDEN = '/folder/2-Areas/Garden';
const EMPTY = '/folder/2-Areas/Car';

test('a folder of photos opens in Grid and the toggle is remembered (#613)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(GARDEN);
  const view = page.getByRole('group', { name: 'View' });
  await expect(page.locator('.folder-grid')).toBeVisible();
  await expect(view.getByRole('button', { name: 'Grid' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await view.getByRole('button', { name: 'List' }).click();
  await expect(page.locator('.folder-grid')).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.reload();
  await expect(
    page
      .getByRole('group', { name: 'View' })
      .getByRole('button', { name: 'List' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.folder-grid')).toHaveCount(0);

  // Flat hunt is mostly not photos: List, until it is switched to Grid.
  await page.goto(FLAT);
  await expect(page.locator('.folder-item').first()).toBeVisible();
  await expect(page.locator('.folder-grid')).toHaveCount(0);
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Grid' })
    .click();
  await expect(page.locator('.folder-grid')).toBeVisible();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.locator('.folder-grid')).toBeVisible();
  await shot(page, testInfo, 'folder-grid');
});

test('tiles show thumbnails online and the kind icon offline (#613)', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Grid' })
    .click();
  // A pair shows Bower's note: its name and its first lines.
  const pair = page
    .locator('.folder-tile', { hasText: 'Arlington Road, 2 bed' })
    .first();
  await expect(pair).toContainText('Bower’s note');
  await expect(pair.locator('.note-line').first()).toBeVisible();
  // Originals: the photo alone, with Drive's picture.
  await page.getByRole('button', { name: /^Originals/ }).click();
  const sign = page.locator('.folder-tile', { hasText: 'window sign' });
  await expect(sign).toContainText('Photo');
  await expect(sign.locator('img.thumb-img')).toBeVisible();

  // Offline, inside the app (no reload): the tiles are drawn again and show
  // the kind icon instead of the picture.
  const view = page.getByRole('group', { name: 'View' });
  await context.setOffline(true);
  await view.getByRole('button', { name: 'List' }).click();
  await view.getByRole('button', { name: 'Grid' }).click();
  await expect(sign).toBeVisible();
  await expect(sign.locator('img.thumb-img')).toHaveCount(0);
  await expect(sign.locator('.folder-row-icon .icon')).toBeVisible();
  await context.setOffline(false);
});

test('holding a row or a tile opens quick look (#613)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  const row = page.locator('.folder-item', { hasText: 'Lease agreement' });
  await row.hover();
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();

  const sheet = page.getByRole('dialog', { name: /^Quick look/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading')).toHaveText(/Lease agreement/);
  await expect(sheet.locator('.quick-look-kind')).toHaveText(
    /^PDF · .* [KM]B$/,
  );
  await expect(sheet.locator('.quick-look-path')).toContainText(
    'Projects › Flat hunt',
  );
  await expect(sheet.locator('.quick-look-filed')).toHaveText(
    /^Filed by Bower /,
  );
  // The demo's files are not in a real Drive: the button says so.
  await expect(
    sheet.getByRole('button', { name: 'Open in Drive' }),
  ).toBeDisabled();
  await shot(page, testInfo, 'folder-quicklook');

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // The held row did not open.
  await expect(page).toHaveURL(/\/folder\//);

  // A tile the same way, then Open.
  await page
    .getByRole('group', { name: 'View' })
    .getByRole('button', { name: 'Grid' })
    .click();
  const tile = page.locator('.folder-tile', { hasText: 'Lease agreement' });
  await tile.hover();
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('link', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(/\/(file|note)\//);
});

test('Space opens quick look on the desktop (#613)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the keyboard is desktop');
  await page.goto(FLAT);
  await page.locator('.folder-item', { hasText: 'Lease agreement' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog', { name: /^Quick look/ })).toBeVisible();
});

test('an empty folder invites adding things (#613)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(EMPTY);
  const empty = page.locator('.folder-empty');
  await expect(empty).toContainText('Nothing in Car yet');
  await expect(empty).toContainText(
    'Add tickets, bookings or ideas and Bower files them here at the next tidy-up.',
  );
  await expect(empty.locator('svg.b')).toBeVisible();
  await expect(
    empty.getByRole('link', { name: 'Add something' }),
  ).toHaveAttribute('href', '/add');
  await expect(
    empty.getByRole('link', { name: 'Ask Bower to move things here' }),
  ).toHaveAttribute('href', /^\/bower\?text=/);
  await shot(page, testInfo, 'folder-empty');
});

test('Flat hunt has the Compare tab on the phone (#613)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  const tabs = page.getByRole('tablist', { name: 'Folder content' });
  await expect(tabs.getByRole('tab')).toHaveText([
    'Everything',
    'Compare 4 flats',
  ]);
  await expect(tabs.getByRole('tab', { name: 'Everything' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await tabs.getByRole('tab', { name: 'Compare 4 flats' }).click();
  await expect(page.getByRole('region', { name: 'Compare' })).toBeVisible();
  await expect(page.locator('.folder-item')).toHaveCount(0);
  await shot(page, testInfo, 'folder-compare');
  await tabs.getByRole('tab', { name: 'Everything' }).click();
  await expect(page.locator('.folder-item').first()).toBeVisible();
});

test('Flat hunt has the Compare button on the desktop (#613)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the button is desktop');
  await page.goto(FLAT);
  await page.getByRole('button', { name: 'Compare 4 flats' }).click();
  await expect(page.locator('table').first()).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Everything' })).toBeVisible();
});
