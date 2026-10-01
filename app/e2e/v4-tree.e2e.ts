/**
 * The v4 tree (#588): files as rows, the five landmarks with marks, 44 px
 * chevrons, expansion that survives a reload and the "New" tags. Runs on
 * the demo's sample folder.
 */

import type { Locator, Page } from '@playwright/test';

import { expect, navigate, openHome, test, visible } from './demo.js';

/** The tidy-up sheet, whichever of its states it is in (#752). */
const SHEET_NAME = /^(Tidying up|Tidy-up (done|partly done|did not finish))$/;

/** The tree the Notes tab shows (phone) or the sidebar (desktop). */
function tree(page: Page): Locator {
  return visible(page.locator('[role="tree"]'));
}

async function openTree(page: Page): Promise<Locator> {
  await openHome(page);
  await page.goto('/notes');
  const list = tree(page);
  await expect(list).toBeVisible();
  return list;
}

async function expand(list: Locator, name: string): Promise<void> {
  await list.getByRole('button', { name: `Expand ${name}` }).click();
  await expect(
    list.getByRole('button', { name: `Collapse ${name}` }),
  ).toBeVisible();
}

// #909: the tree has no counts or kind badges (K-1); the row link is the
// treeitem. The intent stays: the PDF and the photo are rows of their own.
test('Flat hunt lists its PDF and photo as rows', async ({ page }) => {
  const list = await openTree(page);
  await expand(list, 'Archives');
  await expand(list, 'Flat hunt');

  // The rows directly under Flat hunt: everything after it until the next
  // row that is not deeper.
  const under = await list.locator('[role="treeitem"]').evaluateAll((items) => {
    const at = items.findIndex(
      (item) => item.getAttribute('href') === '/folder/4-Archives/Flat%20hunt',
    );
    if (at === -1) return null;
    const level = Number(items[at]?.getAttribute('aria-level'));
    const out: { folder: boolean; file: boolean }[] = [];
    for (const item of items.slice(at + 1)) {
      if (Number(item.getAttribute('aria-level')) <= level) break;
      out.push({
        folder: item.closest('.tree-folder') !== null,
        file: (item.getAttribute('href') ?? '').startsWith('/file/'),
      });
    }
    return out;
  });
  if (under === null) throw new Error('Flat hunt is not in the tree');

  expect(under.filter((row) => row.file).length).toBeGreaterThanOrEqual(2);
  expect(under.some((row) => row.folder)).toBe(false);
  await expect(list.locator('.kind-badge')).toHaveCount(0);
  await expect(list.locator('.tree-count')).toHaveCount(0);
});

test('the five landmarks show their marks, a divider follows, the others are neutral', async ({
  page,
}) => {
  const list = await openTree(page);
  await expect(list.locator('.folder-mark')).toHaveCount(5);
  // #909: no divider and no meaning lines (K-1); Answers and Clippings are
  // rows under the tree, not in it.
  await expect(list.locator('.tree-divider')).toHaveCount(0);
  await expect(list.locator('.tree-meaning')).toHaveCount(0);
});

test('chevrons measure at least 44 x 44 on the phone and carry their names', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the 44 px target is the phone');
  await page.setViewportSize({ width: 375, height: 812 });
  const list = await openTree(page);
  // The demo opens Projects and Areas on a first visit (#950).
  const chevron = list.getByRole('button', { name: 'Expand Archives' });
  // #909: the chevron is drawn 14 px (PF-Drawer); on touch its hit area
  // (::after) is 44 x 44 (#950 F-10).
  const hit = await chevron.evaluate((el) => {
    const after = getComputedStyle(el, '::after');
    return { w: parseFloat(after.width), h: parseFloat(after.height) };
  });
  expect(hit.h).toBeGreaterThanOrEqual(44);
  expect(hit.w).toBeGreaterThanOrEqual(44);
  await chevron.click();
  await expect(
    list.getByRole('button', { name: 'Collapse Archives' }),
  ).toBeVisible();
});

test('expanded folders survive a reload on the same device', async ({
  page,
}) => {
  const list = await openTree(page);
  // The demo opens Projects and Areas on a first visit (#950); what the
  // person changes is saved and wins on the next load.
  await expect(
    list.locator('a[href^="/folder/1-Projects/"]').first(),
  ).toBeVisible();
  await list.getByRole('button', { name: 'Collapse Areas' }).click();
  await expect(
    list.getByRole('button', { name: 'Expand Areas' }),
  ).toBeVisible();
  // Let the debounced save reach IndexedDB.
  await page.waitForTimeout(500);

  await page.reload();
  const again = tree(page);
  await expect(
    again.getByRole('button', { name: 'Collapse Projects' }),
  ).toBeVisible();
  await expect(
    again.getByRole('button', { name: 'Expand Areas' }),
  ).toBeVisible();
});

// #909: no "n new" or New tags in the tree (K-1); what the tidy-up filed
// is still in the tree, untagged.
test('after a tidy-up, what it filed is in the tree, with no new tags', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: 'Tidy up', exact: true }),
  ).click();
  await page
    .getByRole('dialog', { name: 'Is that everything?' })
    .getByRole('button', { name: 'Yes, tidy up' })
    .click();
  const sheet = page.getByRole('dialog', { name: SHEET_NAME });
  await expect(sheet.getByRole('heading', { name: 'Done' })).toBeVisible({
    timeout: 20_000,
  });
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  // The phone's notifications prompt follows a first tidy-up.
  const gotIt = page.getByRole('button', { name: 'Got it' });
  // #774: the prompt now waits for the run sheet on the overlay queue, so it
  // shows a moment after the sheet closes, not with it.
  const prompted = await gotIt
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (prompted) await gotIt.click();
  // In-app navigation: a reload would forget the run.
  // On desktop the sidebar is the tree already.
  if (testInfo.project.name === 'phone') await navigate(page, /^Folders$/);
  const list = tree(page);
  await expect(list).toBeVisible();

  // Resources holds the two items the run filed (Garden and Home).
  await expect(list.locator('.new-tag')).toHaveCount(0);
  await expand(list, 'Resources');
  await expand(list, 'Garden');
  await expect(
    list.locator('a[href^="/note/"]', { hasText: 'Tomato seedlings' }),
  ).toBeVisible();
  await expect(list.locator('.new-tag')).toHaveCount(0);
});
