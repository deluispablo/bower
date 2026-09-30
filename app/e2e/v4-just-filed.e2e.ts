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
  if (phone) await navigate(page, /^Folders$/);
  await expect(row(page)).toContainText('Just filed · 1');
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
    'What each tidy-up did: what is new, what changed, where things went.',
  );
  await expect(
    list.getByRole('heading', { name: /^Yesterday, 15:03$/ }),
  ).toBeVisible();
  // Rows are grouped by action, each group a role="table". Yesterday's
  // last tidy-up filed one thing and needs nothing from you (JF-Main).
  await expect(
    list.getByRole('heading', { name: /^Filed · 1$/ }),
  ).toBeVisible();
  await expect(list.getByRole('table')).not.toHaveCount(0);
  await expect(
    list.getByRole('button', { name: 'Mark all seen' }),
  ).toBeVisible();

  const first = list.locator('.just-filed-item', {
    hasText: 'Passport copy',
  });
  await expect(first).toContainText('Areas › Visa & Immigration');
  // No New chip on a filed row (#819, #829: the chip is only for a new note
  // Bower wrote).
  await expect(first.locator('.new-tag')).toHaveCount(0);
  await expect(first.locator('.kind-badge')).toHaveText('PDF');
  // Old names and the set-aside video belong to an earlier tidy-up now
  // (the London flat hunt, #903): renamedFrom and setAside are covered by
  // the demo's unit tests (`test/demo-v4.test.ts`).

  // Earlier tidy-ups, each with its own lines.
  await expect(
    list.getByRole('heading', { name: 'Earlier tidy-ups' }),
  ).toBeVisible();
  await expect(
    list.getByText('The last 20, each with what it did'),
  ).toBeVisible();
  await expect(list.locator('.just-filed-details').first()).toBeVisible();
  await shot(page, testInfo, 'just-filed-phone');
});

test('Mark all seen clears the Notes row', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the phone list');
  await openJustFiled(page, true);
  const list = screen(page);
  // The demo's rows are all Filed, so no New chips show (#819, #829); Mark all
  // seen still clears what is unseen.
  await expect(list.locator('.new-tag')).toHaveCount(0);

  await list.getByRole('button', { name: 'Mark all seen' }).click();
  await expect(list.locator('.new-tag')).toHaveCount(0);
  await expect(list.getByRole('button', { name: 'Mark all seen' })).toHaveCount(
    0,
  );

  await navigate(page, /^Folders$/);
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
    list.getByRole('heading', { name: /^Yesterday, 15:03$/ }),
  ).toBeVisible();
  await expect(
    list.getByRole('button', { name: 'Mark all seen' }),
  ).toBeVisible();
  const table = list.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'What Bower did',
    'Now called',
    'You added',
    'Where it is',
    'What changed',
  ]);
  const first = table.getByRole('row').filter({ hasText: 'Passport copy' });
  await expect(first).toContainText('Areas › Visa & Immigration');
  // A Filed row carries its Filed tag, not a New chip (#819, #829).
  await expect(first).toContainText('Filed');
  await expect(first.locator('.new-tag')).toHaveCount(0);
  await expect(
    list.getByRole('heading', { name: 'Earlier tidy-ups' }),
  ).toBeVisible();
  await expect(list.locator('.just-filed-details').first()).toBeVisible();
  await shot(page, testInfo, 'just-filed-desktop');
});
