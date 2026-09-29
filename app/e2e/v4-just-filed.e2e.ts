/**
 * Just filed (#616, boards `Phone-JustFiled` and `Desktop-JustFiled`): after
 * the demo's tidy-up of the flat listings the Notes tab and the sidebar show
 * "Just filed · 6"; the screen lists old names, new names and folders (a
 * table on the desktop), what was set aside and the earlier tidy-ups; "Mark
 * all seen" clears every New tag and the row.
 */

import type { Locator, Page } from '@playwright/test';

import { expect, navigate, openHome, shot, test, visible } from './demo.js';

function screen(page: Page): Locator {
  return page.locator('.just-filed-screen');
}

/** The row in the Notes tab (phone) or the sidebar (desktop). */
function row(page: Page): Locator {
  return visible(page.locator('a.just-filed-row'));
}

async function openJustFiled(page: Page, phone: boolean): Promise<void> {
  await openHome(page);
  if (phone) await navigate(page, /^Notes$/);
  await expect(row(page)).toContainText('Just filed · 6');
  await row(page).click();
  await expect(screen(page)).toBeVisible();
}

test('the Notes tab row opens the list of old names, new names and folders', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the phone list');
  await openJustFiled(page, true);
  const list = screen(page);

  await expect(list).toContainText(
    'What you added, and where Bower put each thing. New marks what you have not opened yet.',
  );
  await expect(
    list.getByRole('heading', { name: /^Today, 10:42 · 6 things$/ }),
  ).toBeVisible();
  await expect(
    list.getByRole('button', { name: 'Mark all seen' }),
  ).toBeVisible();

  const first = list.locator('.just-filed-item', {
    hasText: 'Arlington Road, 2 bed',
  });
  await expect(
    list.locator('.just-filed-item', { hasText: 'Kentish Town, 2 bed' }),
  ).toContainText('was “Kentish Town flat.pdf”');
  await expect(first).toContainText('Projects › Flat hunt');
  await expect(first.locator('.new-tag')).toHaveText('New');
  await expect(first.locator('.kind-badge')).toHaveText('PDF');
  await expect(
    list.locator('.just-filed-item', { hasText: 'Kentish Town photos' }),
  ).toContainText('Resources › Links');

  // The set-aside video, with its reason and the way to say what it is.
  await expect(
    list.getByRole('heading', { name: 'Set aside · 1' }),
  ).toBeVisible();
  const aside = list.locator('.just-filed-aside');
  await expect(aside).toContainText(
    "Kept in Projects › Flat hunt by its date. Bower can't watch videos.",
  );
  await expect(
    aside.getByRole('link', { name: 'Say what it is' }),
  ).toBeVisible();

  // Earlier tidy-ups, each with its own lines.
  await expect(
    list.getByRole('heading', { name: 'Earlier tidy-ups' }),
  ).toBeVisible();
  await expect(
    list.getByText('The last 20, each with where things went'),
  ).toBeVisible();
  await expect(list.locator('.just-filed-details')).toHaveCount(3);
  await shot(page, testInfo, 'just-filed-phone');
});

test('Mark all seen clears every New tag and the Notes row', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the phone list');
  await openJustFiled(page, true);
  const list = screen(page);
  await expect(list.locator('.new-tag').first()).toBeVisible();

  await list.getByRole('button', { name: 'Mark all seen' }).click();
  await expect(list.locator('.new-tag')).toHaveCount(0);
  await expect(list.getByRole('button', { name: 'Mark all seen' })).toHaveCount(
    0,
  );

  await navigate(page, /^Notes$/);
  await expect(visible(page.locator('[role="tree"]'))).toBeVisible();
  await expect(page.locator('a.just-filed-row')).toHaveCount(0);
});

test('at 1280 px the list is a table with Earlier tidy-ups', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the desktop table');
  await openJustFiled(page, false);
  const list = screen(page);

  await expect(
    list.getByRole('heading', {
      name: /^Today, 10:42 · 6 things · \d+ new to you$/,
    }),
  ).toBeVisible();
  const table = list.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'You added',
    'Now called',
    'Where it went',
    "Bower's note",
  ]);
  const first = table
    .getByRole('row')
    .filter({ hasText: 'Arlington Road, 2 bed' });
  await expect(first).toContainText('Arlington Road, 2 bed.pdf');
  await expect(first).toContainText('Projects › Flat hunt');
  await expect(first.locator('.new-tag')).toHaveText('New');
  // A saved link's "You added" cell is its address, not the old file name.
  await expect(
    table.getByRole('row').filter({ hasText: 'Kentish Town photos' }),
  ).toContainText('rightmove.example.com/…/kentish-town');

  await expect(list.getByRole('heading', { name: /^Set aside/ })).toBeVisible();
  await expect(
    list.getByRole('heading', { name: 'Earlier tidy-ups' }),
  ).toBeVisible();
  await expect(list.locator('.just-filed-details')).toHaveCount(3);
  await expect(list.getByText(/^26 Sep, 18:10 · 3 things$/)).toBeVisible();
  await shot(page, testInfo, 'just-filed-desktop');
});
