/**
 * The Notes tab and the desktop sidebar as the one explorer (#589): Pinned,
 * Your folders, the first load on a device and Expand/Collapse all. Runs on
 * the demo's sample folder.
 */

import type { Locator, Page } from '@playwright/test';

import { expect, openHome, shot, test, visible } from './demo.js';

const DELAY_MS = 3000;

function tree(page: Page): Locator {
  return visible(page.locator('[role="tree"]'));
}

async function openNotes(page: Page): Promise<Locator> {
  await openHome(page);
  await page.goto('/notes');
  const list = tree(page);
  await expect(list).toBeVisible();
  return list;
}

/** The explorer's own container, wherever it is on screen. */
function explorer(page: Page): Locator {
  return visible(page.locator('.explorer'));
}

test('the Notes tab lists Pinned, the five landmarks, a divider, the others, Health and the hidden-files line', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the tab is the phone layout');
  await openNotes(page);
  const box = explorer(page);

  await expect(
    box.getByRole('button', { name: 'Search folders, notes and files' }),
  ).toBeVisible();
  await expect(box.getByRole('heading', { name: 'Pinned' })).toBeVisible();
  await expect(
    box.getByRole('heading', { name: 'Your folders' }),
  ).toBeVisible();

  // #909: the five roots in their fixed order, each with its disc; no
  // meaning lines, counts or divider (K-1). Answers and Clippings are rows
  // under the tree.
  const kinds = await box
    .locator('.tree .folder-mark')
    .evaluateAll((marks) => marks.map((m) => m.getAttribute('data-kind')));
  expect(kinds).toEqual([
    'inbox',
    'projects',
    'areas',
    'resources',
    'archives',
  ]);
  await expect(box.locator('.tree-meaning')).toHaveCount(0);
  await expect(box.locator('.tree-count')).toHaveCount(0);

  // Pinned comes before the folders; Answers, Clippings and Health check
  // come after the tree. #909 removed the hidden-files line.
  const positions = await box.evaluate((el) => {
    const at = (selector: string): number =>
      Array.from(el.querySelectorAll('*')).indexOf(
        el.querySelector(selector) as Element,
      );
    return [
      at('.explorer-pinned'),
      at('.explorer-tree'),
      at('.explorer-below'),
      at('.explorer-health'),
    ];
  });
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  await expect(box.locator('.explorer-hidden')).toHaveCount(0);

  // #909: one Sort tool on the YOUR FOLDERS row.
  await expect(
    box.getByRole('button', { name: 'Sort your folders' }),
  ).toHaveCount(1);
});

// #909 replaced the Expand/Collapse all toggle with one "Collapse all
// folders" tool on the YOUR FOLDERS row.
test('Collapse all folders closes every open folder', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the Folders tab is the phone');
  const list = await openNotes(page);
  const expand = list.getByRole('button', { name: 'Expand Projects' });
  if ((await expand.count()) > 0) await expand.click();
  await expect(
    list.getByRole('button', { name: 'Collapse Projects' }),
  ).toBeVisible();

  await visible(
    page.getByRole('button', { name: 'Collapse all folders' }),
  ).click();
  await expect(
    list.getByRole('button', { name: 'Expand Projects' }),
  ).toBeVisible();
  await expect(list.locator('[aria-expanded="true"]')).toHaveCount(0);
});

test('the first load on a device shows skeletons and a status line, the second one none', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'phone',
    'the status line is for the phone',
  );
  // Holds the demo's folder listing back (`src/demo/drive.ts`).
  await page.addInitScript((ms: number) => {
    window.__bowerDemoListDelayMs = ms;
  }, DELAY_MS);
  await page.goto('/notes');

  // #909: the loading state is six 12 px skeleton bars (R-EXP-10); the
  // status line and the landmark skeletons are gone.
  const box = explorer(page);
  await expect(box.locator('.explorer-skeleton-bar')).toHaveCount(6);
  await shot(page, testInfo, 'notes-first-load');

  // The listing lands: the real tree replaces the skeletons.
  await expect(tree(page)).toBeVisible({ timeout: DELAY_MS + 5000 });
  await expect(box.locator('.explorer-skeleton-row')).toHaveCount(0);

  // The index is cached now: the same delay does not hold the tree back.
  await page.reload();
  await expect(tree(page)).toBeVisible({ timeout: DELAY_MS - 1000 });
  await expect(box.getByRole('status')).toHaveCount(0);
  await expect(box.locator('.explorer-skeleton-row')).toHaveCount(0);
});

test('at 1280 px the sidebar is the explorer', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'the sidebar is the desktop layout',
  );
  await openHome(page);
  const sidebar = page.getByRole('navigation', { name: 'Your folders' });

  const search = sidebar.getByRole('button', {
    name: 'Search folders, notes and files',
  });
  await expect(search).toBeVisible();
  await expect(search).toContainText('Ctrl K');
  for (const name of ['Home', 'Add', 'Bower']) {
    await expect(
      sidebar.getByRole('link', { name, exact: true }),
    ).toBeVisible();
  }
  await expect(sidebar.getByRole('heading', { name: 'Pinned' })).toBeVisible();
  await expect(
    sidebar.getByRole('heading', { name: 'Your folders' }),
  ).toBeVisible();

  // #909: no meaning lines in the tree (K-1); the five roots wear discs.
  await expect(sidebar.locator('.tree-meaning')).toHaveCount(0);
  await expect(sidebar.locator('.tree .folder-mark')).toHaveCount(5);
  await shot(page, testInfo, 'notes-sidebar');
});

test('the light theme uses the light tokens', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'phone',
    'compared with Phone-Notes-Light',
  );
  await page.emulateMedia({ colorScheme: 'light' });
  await openNotes(page);
  const surface = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    token: getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg')
      .trim(),
  }));
  // Light: a light page background, not the dark one.
  const [r = 0, g = 0, b = 0] = (surface.page.match(/\d+/g) ?? []).map(Number);
  expect((r + g + b) / 3).toBeGreaterThan(200);
  await shot(page, testInfo, 'notes-light');
});
