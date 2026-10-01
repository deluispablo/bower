/**
 * The folder screen's list mode (#611, boards `Phone-Folder-List` and
 * `Phone-Folder-ByBower`): path bar, counts, origin filter, tool row, date
 * groups, pairs as one row, and the filters remembered per folder. Runs on
 * the phone; Flat hunt is the demo's sample folder.
 */

import type { Page } from '@playwright/test';

import { expect, shot, test } from './demo.js';

const FLAT = '/folder/4-Archives/Flat%20hunt';

const PHONE_ONLY = 'the boards are the phone';

/** The phone's one Filter & sort button (R-FOLD-6): opens its sheet. */
function filterButton(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('button', { name: /^Filter and sort/ });
}

async function openFilterSheet(
  page: Page,
): Promise<ReturnType<Page['getByRole']>> {
  await filterButton(page).click();
  return page.getByRole('dialog', { name: 'Filter & sort' });
}

/** Picks `name` in the sheet's `group` ("Sort by", "Show", "Layout"). */
async function pick(
  page: Page,
  group: string,
  name: string | RegExp,
): Promise<void> {
  const sheet = await openFilterSheet(page);
  await sheet
    .getByRole('radiogroup', { name: group })
    .getByRole('radio', { name })
    .first()
    .click();
  // The chips change a draft; "Show <n> things" applies it (§3.34).
  await sheet.getByRole('button', { name: /^Show \d+ things?$/ }).click();
}

async function expectLayout(page: Page, name: 'List' | 'Grid'): Promise<void> {
  const sheet = await openFilterSheet(page);
  await expect(
    sheet
      .getByRole('radiogroup', { name: 'Layout' })
      .getByRole('radio', { name }),
  ).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Close Filter and sort' }).click();
}

test('Flat hunt lists its things as the board does (#611)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  await expect(page.locator('.folder-item').first()).toBeVisible();

  // #911: back to the parent on the phone, the meta line from the segment
  // sums (K-31), then h2 "In this folder" and the segments.
  await expect(
    page.getByRole('link', { name: 'Back to Archives' }),
  ).toBeVisible();
  await expect(page.locator('.page-header-meta')).toHaveText(
    /^Archives · (Active · )?\d+ things · updated /,
  );
  await expect(
    page.getByRole('heading', { level: 2, name: 'In this folder' }),
  ).toBeVisible();
  const seg = page.getByRole('radiogroup', { name: 'Show' });
  await expect(seg.getByRole('radio')).toHaveText([
    'All',
    /^Originals \d+$/,
    /^By Bower \d+$/,
  ]);
  await expect(seg.getByRole('radio', { name: 'All' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // The Filter & sort icon on the segments row, default: no dot.
  await expect(filterButton(page)).toHaveAccessibleName('Filter and sort');
  await expect(page.locator('.filter-sort-dot')).toHaveCount(0);

  // Date groups, newest first, and rows with their one-line detail.
  const groups = page.locator('.folder-group');
  await expect(groups.first()).toBeVisible();
  const pair = page
    .locator('.folder-item', { hasText: 'Arlington Road, 2 bed' })
    .first();
  // One row, the kind in words, no kind badge (#908, R-FILEICON-2).
  await expect(pair.locator('.list-row-meta')).toHaveText('Bower note');
  await expect(pair.locator('.kind-badge')).toHaveCount(0);

  // The header is the title and ⋯ (R-PF-1): no chip row, no P mark.
  await expect(page.locator('.header-action')).toHaveCount(0);
  await expect(page.locator('.page-header-more')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.folder-demo-note')).toHaveCount(0);
  // The kind in words is the row's meta (#908, R-META-1).
  await expect(
    page
      .locator('.folder-item', { hasText: 'Flat budget' })
      .locator('.list-row-meta'),
  ).toHaveText('Spreadsheet');
  await expect(
    page
      .locator('.folder-item', { hasText: 'Notes from the viewing' })
      .locator('.list-row-meta'),
  ).toHaveText('Note');

  // No (i) on the list any more (PF-Info shows PF-Help).
  await expect(
    page.getByRole('button', { name: 'What By Bower means' }),
  ).toHaveCount(0);
  await shot(page, testInfo, 'folder-list');
});

test('By Bower shows only what Bower wrote, with its key facts (#611)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  await page.getByRole('radio', { name: /^By Bower/ }).click();
  await expect(page.getByRole('radio', { name: /^By Bower/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // No "Showing only" box (R-PF-5): the segment itself says it.
  await expect(page.getByText('Showing only')).toHaveCount(0);
  const rows = page.locator('.folder-item');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    await expect(row.locator('.file-icon')).toHaveAttribute(
      'data-mark',
      'bird',
    );
  }
  // No scores or facts on a row (G-18).
  await expect(page.locator('.folder-list .key-facts')).toHaveCount(0);
  await expect(
    page.locator('.folder-item', { hasText: 'Flat budget' }),
  ).toHaveCount(0);
  await shot(page, testInfo, 'folder-bybower');

  // Originals shows the PDF on its own, without Bower's note.
  await page.getByRole('radio', { name: /^Originals/ }).click();
  const original = page
    .locator('.folder-item', { hasText: 'Arlington Road, 2 bed' })
    .first();
  await expect(original.locator('.list-row-meta')).toHaveText('PDF');
});

test('sort, kind filter and origin filter survive a reload, per folder (#611)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  await expect(page.locator('.folder-item').first()).toBeVisible();

  await pick(page, 'Sort by', 'Name');
  await expect(page.locator('.folder-group')).toHaveCount(0);
  await page.getByRole('radio', { name: /^Originals/ }).click();
  await pick(page, 'Show', /^(?!All kinds)/);
  const chosen = await filterButton(page).getAttribute('aria-label');
  expect(chosen).toMatch(/^Filter and sort \(sorted name, \w+ only\)$/);
  await expect(page.locator('.filter-sort-dot')).toBeVisible();

  // The write is asynchronous (IndexedDB): give it a moment before reloading.
  await page.waitForTimeout(300);
  await page.reload();

  await expect(filterButton(page)).toHaveAccessibleName(chosen ?? '');
  await expect(page.getByRole('radio', { name: /^Originals/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // Another folder is not affected.
  await page.goto('/folder/4-Archives/Kitchen%20Refresh');
  await expect(page.locator('.folder-item').first()).toBeVisible();
  await expect(filterButton(page)).toHaveAccessibleName('Filter and sort');
  await expect(
    page.getByRole('radio', { name: 'All', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
});

const GARDEN = '/folder/3-Resources/Garden';
const EMPTY = '/folder/3-Resources/Car';

test('a folder of photos opens in Grid and the toggle is remembered (#613)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(GARDEN);
  await expect(page.locator('.folder-grid-groups')).toBeVisible();
  await expectLayout(page, 'Grid');

  await pick(page, 'Layout', 'List');
  await expect(page.locator('.folder-grid-groups')).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.reload();
  await expectLayout(page, 'List');
  await expect(page.locator('.folder-grid-groups')).toHaveCount(0);

  // Flat hunt is mostly not photos: List, until it is switched to Grid.
  await page.goto(FLAT);
  await expect(page.locator('.folder-item').first()).toBeVisible();
  await expect(page.locator('.folder-grid-groups')).toHaveCount(0);
  await pick(page, 'Layout', 'Grid');
  await expect(page.locator('.folder-grid-groups')).toBeVisible();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.locator('.folder-grid-groups')).toBeVisible();
  await shot(page, testInfo, 'folder-grid');
});

test('tiles show thumbnails online and the kind icon offline (#613)', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  await pick(page, 'Layout', 'Grid');
  // A tile is the kind line, the title and the date (#908, R-TILE-1):
  // no excerpt, no picture, no score.
  const pair = page
    .locator('.grid-tile', { hasText: 'Arlington Road, 2 bed' })
    .first();
  await pair.scrollIntoViewIfNeeded();
  await expect(pair.locator('.grid-tile-kind-word')).toHaveText('Bower note');
  await expect(pair.locator('.note-line, .thumb')).toHaveCount(0);
  await page.getByRole('radio', { name: /^Originals/ }).click();
  const sign = page.locator('.grid-tile', { hasText: 'window sign' });
  await expect(sign.locator('.grid-tile-kind-word')).toHaveText('Photo');
  // Offline, inside the app (no reload): the tiles are drawn again.
  await context.setOffline(true);
  await pick(page, 'Layout', 'List');
  await pick(page, 'Layout', 'Grid');
  await expect(sign).toBeVisible();
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
    'Archives › Flat hunt',
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
  await pick(page, 'Layout', 'Grid');
  // By its name, not its text: once Bower's note lines load, another tile
  // mentions the lease too.
  const tile = page.locator('.grid-tile').filter({
    has: page.locator('.grid-tile-title', {
      hasText: /^Lease agreement 2026$/,
    }),
  });
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
  // R-SYS-4: the looking bird, "Nothing here yet." and the two ways on.
  const empty = page.locator('.empty-folder');
  await expect(empty).toContainText('Nothing here yet.');
  await expect(empty).toContainText(
    'Add something, or ask Bower to write about this folder.',
  );
  await expect(empty.locator('svg.b')).toBeVisible();
  await expect(empty.getByRole('link', { name: 'Add' })).toHaveAttribute(
    'href',
    '/add',
  );
  await expect(empty.getByRole('button', { name: 'Ask Bower' })).toBeVisible();
  await shot(page, testInfo, 'folder-empty');
});

test('Flat hunt has the Compare tab on the phone (#613)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', PHONE_ONLY);
  await page.goto(FLAT);
  const tabs = page.getByRole('tablist', { name: 'Folder views' });
  await expect(tabs.getByRole('tab')).toHaveText(['List', 'Compare 4 flats']);
  await expect(tabs.getByRole('tab', { name: 'List' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await tabs.getByRole('tab', { name: 'Compare 4 flats' }).click();
  // The Compare panel is an empty slot until #916 fills it.
  await expect(page.locator('.compare-slot')).toBeAttached();
  // The list stays mounted under Compare, hidden (its counts feed the meta).
  await expect(page.locator('#folder-panel-list')).toBeHidden();
  await shot(page, testInfo, 'folder-compare');
  await tabs.getByRole('tab', { name: 'List' }).click();
  await expect(page.locator('.folder-item').first()).toBeVisible();
});

test('Flat hunt has the Compare tab on the desktop too (#911, R-TABS-1)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the desktop layout');
  await page.goto(FLAT);
  await page.getByRole('tab', { name: 'Compare 4 flats' }).click();
  await expect(
    page.getByRole('tab', { name: 'Compare 4 flats' }),
  ).toHaveAttribute('aria-selected', 'true');
  // The Compare panel is an empty slot until #916 fills it.
  await expect(page.locator('.compare-slot')).toBeAttached();
  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.locator('.folder-item').first()).toBeVisible();
});
