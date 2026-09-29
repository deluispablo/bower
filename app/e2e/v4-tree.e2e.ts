/**
 * The v4 tree (#588): files as rows, the five landmarks with marks, 44 px
 * chevrons, expansion that survives a reload and the "New" tags. Runs on
 * the demo's sample folder.
 */

import type { Locator, Page } from '@playwright/test';

import { expect, navigate, openHome, test, visible } from './demo.js';

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

test('Flat hunt lists its PDF and photo as rows, and its count equals its rows', async ({
  page,
}) => {
  const list = await openTree(page);
  await expand(list, 'Projects');
  await expand(list, 'Flat hunt');

  // The rows directly under Flat hunt: everything after it until the next
  // row that is not deeper.
  const under = await list.locator('[role="treeitem"]').evaluateAll((items) => {
    const at = items.findIndex(
      (item) =>
        item.querySelector('a[href="/folder/1-Projects/Flat%20hunt"]') !== null,
    );
    if (at === -1) return null;
    const level = Number(items[at]?.getAttribute('aria-level'));
    const out: { folder: boolean; file: boolean; badge: string }[] = [];
    for (const item of items.slice(at + 1)) {
      if (Number(item.getAttribute('aria-level')) <= level) break;
      out.push({
        folder: item.querySelector('.tree-folder') !== null,
        file: item.querySelector('a[href^="/file/"]') !== null,
        badge: item.querySelector('.kind-badge')?.textContent ?? '',
      });
    }
    const count = items[at]?.querySelector('.tree-count')?.textContent ?? '';
    return { rows: out, count: Number(count) };
  });
  if (under === null) throw new Error('Flat hunt is not in the tree');

  // A PDF and a photo are rows, each with its grey badge.
  const badges = under.rows.filter((row) => row.file).map((row) => row.badge);
  expect(badges).toContain('PDF');
  expect(badges.some((badge) => ['JPG', 'PNG'].includes(badge))).toBe(true);

  // The count on the folder row is the number of rows it holds.
  expect(under.rows.some((row) => row.folder)).toBe(false);
  expect(under.count).toBe(under.rows.length);
});

test('the five landmarks show their marks, a divider follows, the others are neutral', async ({
  page,
}) => {
  const list = await openTree(page);
  await expect(list.locator('.folder-mark')).toHaveCount(5);
  await expect(list.locator('.tree-divider')).toHaveCount(1);
  await expect(list.locator('.tree-meaning').first()).toBeVisible();
});

test('chevrons measure at least 44 x 44 on the phone and carry their names', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the 44 px target is the phone');
  await page.setViewportSize({ width: 375, height: 812 });
  const list = await openTree(page);
  const chevron = list.getByRole('button', { name: 'Expand Projects' });
  const box = await chevron.boundingBox();
  if (box === null) throw new Error('the chevron has no box');
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await chevron.click();
  await expect(
    list.getByRole('button', { name: 'Collapse Projects' }),
  ).toBeVisible();
});

test('expanded folders survive a reload on the same device', async ({
  page,
}) => {
  const list = await openTree(page);
  await expand(list, 'Projects');
  await expect(
    list.locator('a[href^="/folder/1-Projects/"]').first(),
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

test('after a tidy-up, the folder it filed into shows "<n> new" and its new rows show New', async ({
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
  const sheet = page.getByRole('dialog', { name: 'Tidying up status' });
  await expect(sheet.getByText('6 files processed')).toBeVisible({
    timeout: 20_000,
  });
  await sheet.getByRole('button', { name: 'Close' }).click();
  // The phone's notifications prompt follows a first tidy-up.
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.isVisible()) await gotIt.click();
  // In-app navigation: a reload would forget the run.
  // On desktop the sidebar is the tree already.
  if (testInfo.project.name === 'phone') await navigate(page, /^Notes$/);
  const list = tree(page);
  await expect(list).toBeVisible();

  // Areas holds the two items the run filed (Garden and Home).
  const areas = list.locator('a[href="/folder/2-Areas"]');
  await expect(areas.locator('.new-tag')).toHaveText('2 new');
  await expand(list, 'Areas');
  await expand(list, 'Garden');
  const garden = list.locator('a[href="/folder/2-Areas/Garden"]');
  await expect(garden.locator('.new-tag')).toHaveText('1 new');
  await expect(
    list
      .locator('a[href^="/note/"]', { hasText: 'Tomato seedlings' })
      .locator('.new-tag'),
  ).toHaveText('New');
});
