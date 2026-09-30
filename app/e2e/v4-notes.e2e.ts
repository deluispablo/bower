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

  // The five landmarks in their fixed order, each with a mark and a meaning
  // line, before the one divider; the other folders come after it.
  const order = await box
    .locator('.tree')
    .evaluate((list) =>
      Array.from(list.children).map((child) =>
        child.classList.contains('tree-divider')
          ? 'divider'
          : (child.querySelector('.folder-mark')?.getAttribute('data-kind') ??
            (child.querySelector('.tree-folder') !== null ? 'other' : 'row')),
      ),
    );
  expect(order.slice(0, 6)).toEqual([
    'inbox',
    'projects',
    'areas',
    'resources',
    'archives',
    'divider',
  ]);
  expect(order.slice(6).every((kind) => kind === 'other')).toBe(true);
  await expect(box.locator('.tree-meaning').first()).toBeVisible();
  // The Inbox row always carries its count (a count of 0 is unit-tested).
  await expect(
    box.locator('a[href="/folder/0-Inbox"] .tree-count'),
  ).toBeVisible();

  // Pinned comes before the folders, the Health row and the hidden-files
  // line come after the tree.
  const positions = await box.evaluate((el) => {
    const at = (selector: string): number =>
      Array.from(el.querySelectorAll('*')).indexOf(
        el.querySelector(selector) as Element,
      );
    return [
      at('.explorer-pinned'),
      at('.explorer-tree'),
      at('.explorer-health-row'),
      at('.explorer-hidden'),
    ];
  });
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);

  // No sort anywhere on the tab.
  await expect(page.getByRole('button', { name: /^Sort by/ })).toHaveCount(0);
});

test('Expand all folders toggles to Collapse all folders and back', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'phone',
    'the button is in the phone bar',
  );
  const list = await openNotes(page);
  const button = visible(page.getByRole('button', { name: /all folders$/ }));

  await expect(button).toHaveAccessibleName('Expand all folders');
  await button.click();
  await expect(button).toHaveAccessibleName('Collapse all folders');
  await expect(
    list.getByRole('button', { name: 'Collapse Projects' }),
  ).toBeVisible();
  await expect(
    list.getByRole('button', { name: 'Collapse Areas' }),
  ).toBeVisible();

  await button.click();
  await expect(button).toHaveAccessibleName('Expand all folders');
  await expect(
    list.getByRole('button', { name: 'Expand Projects' }),
  ).toBeVisible();
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

  const box = explorer(page);
  const status = box.getByRole('status');
  await expect(status).toContainText(
    'Reading your Bower folder for the first time on this phone. Next time it opens at once.',
  );
  await expect(box.locator('.explorer-skeleton-row')).toHaveCount(5);
  await expect(box.locator('.folder-mark')).toHaveCount(5);
  await shot(page, testInfo, 'notes-first-load');

  // The listing lands: the real tree replaces the skeletons.
  await expect(tree(page)).toBeVisible({ timeout: DELAY_MS + 5000 });
  await expect(status).toHaveCount(0);
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

  const search = sidebar.getByRole('button', { name: 'Search' });
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

  // Short meaning lines: the sidebar says "Things to keep", the phone the
  // longer "Things to keep: articles, recipes, manuals".
  await expect(
    sidebar.getByText('Things to keep', { exact: true }),
  ).toBeVisible();
  await expect(sidebar.getByText(/articles, recipes/)).toHaveCount(0);
  await expect(sidebar.locator('.folder-mark')).toHaveCount(5);
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
