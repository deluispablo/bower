/**
 * Search on the phone (#593, boards `Phone-Search-Start`, `Phone-Search`,
 * `Phone-Search-None`): grouped results with chips and counts, the start
 * screen, scope, no results; v6 (#917): the SearchField, sentence-case
 * group labels, FileIcon rows and the tag search over a note.
 */

import type { Locator, Page } from '@playwright/test';

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
  // No time chip: no board draws one (SE-Query, #950 D-5).
  await expect(chips.getByRole('button', { name: 'Any time' })).toHaveCount(0);

  // Full screen below 900 px, and the chip row scrolls rather than clipping.
  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect(box).toMatchObject({
    x: 0,
    y: 0,
    width: viewport?.width,
    height: viewport?.height,
  });
  const last = chips.getByRole('button', { name: /^Files \d+$/ });
  await last.scrollIntoViewIfNeeded();
  const chipBox = await last.boundingBox();
  expect(chipBox).not.toBeNull();
  expect((chipBox?.x ?? 0) + (chipBox?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );
  expect(await chips.evaluate((el) => getComputedStyle(el).overflowX)).toBe(
    'auto',
  );

  // #917 (R-LABEL-1): sentence-case group labels, always plural.
  await expect(
    dialog.locator('.switcher-heading').filter({ hasText: /^Folders$/ }),
  ).toBeVisible();
  const headings = await dialog.locator('.switcher-heading').allTextContents();
  expect(headings.slice(0, 3)).toEqual(['Folders', 'Notes', 'Files']);

  // R-SE-3: FileIcon and "Folder · ● <parent> · <n> things".
  const folder = dialog.getByRole('option', { name: /Flat hunt/ }).first();
  await expect(folder).toContainText('Folder · Archives');
  await expect(folder).toContainText('things');
  await expect(folder.locator('.list-row-dot')).toBeVisible();
  await expect(dialog.locator('.switcher-match').first()).toBeVisible();
  await expect(dialog.locator('.kind-badge')).toHaveCount(0);
  await expect(dialog).toContainText(
    'Close enough counts: “flat hnt” finds Flat hunt.',
  );
  await shot(page, testInfo, 'search-results');

  // A chip narrows the list to one group.
  await chips.getByRole('button', { name: /^Folders/ }).click();
  await expect(dialog.locator('.switcher-heading')).toHaveText(['Folders']);
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
  await expect(
    page.getByRole('heading', { name: 'Flat hunt', level: 1 }),
  ).toBeVisible();
  const dialog = await openSearch(page);
  const field = dialog.getByRole('combobox');
  // #917: the field keeps its words (#910's SearchField); the chip names
  // the folder.
  const scope = dialog.getByRole('button', {
    name: 'Clear search in Flat hunt',
  });
  await expect(scope).toBeVisible();

  // Kentish Town is a listing in Flat hunt; the Lisbon trip is elsewhere.
  await field.fill('lisbon');
  await expect(
    dialog.getByText('Nothing called “lisbon” in Flat hunt.'),
  ).toBeVisible();
  // One way out, the primary one (R-SEARCH-7, #1004).
  await expect(
    dialog.getByRole('button', { name: 'Search everywhere' }),
  ).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Search everywhere' }).click();
  await expect(
    dialog.getByRole('option', { name: /Lisbon Trip/ }).first(),
  ).toBeVisible();
  await expect(scope).toHaveCount(0);
});

test('no results says so and offers Ask Bower where it is, prefilled', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const dialog = await openSearch(page);
  await dialog.getByRole('combobox').fill('quartz zeppelin');
  await expect(
    dialog.getByText(
      'Nothing matches “quartz zeppelin”. Try fewer words, or another folder.',
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

test('the field is the SearchField with its mic and Close Search (SE-Empty)', async ({
  page,
}) => {
  await openHome(page);
  const dialog = await openSearch(page);
  const field = dialog.locator('.switcher-field .search-field-input');
  await expect(field).toBeVisible();
  await expect(
    field.getByRole('button', { name: /^(Dictate|Dictation is off)$/ }),
  ).toBeVisible();
  await expect(dialog.locator('.switcher-bird')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close Search' }).click();
  await expect(dialog).toBeHidden();
});

test('a tag on a note opens the tag search over it; closing returns to the note (NO-Tag)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const tag = await firstTagLink(page);
  test.skip(tag === null, 'no note with a tag in the demo');
  if (tag === null) return;
  const notePath = new URL(page.url()).pathname;
  const name = (await tag.textContent())?.trim().replace(/^#/, '') ?? '';
  await tag.click();

  const dialog = page.getByRole('dialog', { name: 'Quick switcher' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox')).toHaveValue(`#${name}`);
  await expect(dialog.locator('.switcher-tag-line')).toContainText(
    `tagged #${name} · you stay on`,
  );
  await expect(dialog.getByRole('option').first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${notePath}$`));
  await shot(page, testInfo, 'search-tag');

  // NO-Tag-375: a sheet over the note; the browser's Back closes it and
  // stays on the note.
  await expect(dialog.locator('.switcher-panel.is-sheet')).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${notePath}$`));
});

/** The first tag link of a note reached from Search, or `null`. */
async function firstTagLink(page: Page): Promise<Locator | null> {
  // "Job offer, Northwind Data" is tagged work and summary in the demo.
  for (const query of ['Northwind', 'insights']) {
    const dialog = await openSearch(page);
    await dialog.getByRole('combobox').fill(query);
    await expect(dialog.getByRole('option').first()).toBeVisible();
    const note = dialog.locator('.switcher-row[data-kind="note"]').first();
    if ((await note.count()) === 0) {
      await dialog.getByRole('button', { name: 'Close Search' }).click();
      continue;
    }
    await note.click();
    await expect(page).toHaveURL(/\/note\//);
    // The note's tags render once its text is read.
    const link = page.locator('a[href^="/search?q=%23"]').first();
    await link.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
      /* no tag on this note */
    });
    if (await link.isVisible()) return link;
    await page.goto('/');
  }
  return null;
}
