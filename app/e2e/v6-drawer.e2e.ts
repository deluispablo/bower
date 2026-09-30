/**
 * The drawer "Your folders" and the sidebar (#909): the files button and a
 * real left-edge swipe (CDP touch events, as Chrome on a phone sends them)
 * open the drawer; the desktop sidebar's tree sits 12 px in and Health check
 * is a nav item. Runs on the demo's sample folder.
 */

import { expect, openHome, test, visible } from './demo.js';

test('the files button opens the drawer and ✕ closes it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the drawer is the phone');
  await openHome(page);
  await page.goto('/folder/1-Projects/Flat%20hunt');
  await visible(
    page.getByRole('button', { name: 'Open your folders' }),
  ).click();
  const drawer = page.getByRole('dialog', { name: 'Your folders' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('tree')).toBeVisible();
  await drawer.getByRole('button', { name: 'Close your folders' }).click();
  await expect(drawer).toHaveCount(0);
});

test('a touch swipe from the left edge opens the drawer', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the drawer is the phone');
  await openHome(page);
  await page.goto('/folder/1-Projects/Flat%20hunt');
  await expect(page.locator('h1', { hasText: 'Flat hunt' })).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  const touch = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    x: number,
  ): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y: 400 }],
    });
  };
  await touch('touchStart', 6);
  for (const x of [20, 40, 80, 140, 200]) await touch('touchMove', x);
  await touch('touchEnd', 200);

  await expect(
    page.getByRole('dialog', { name: 'Your folders' }),
  ).toBeVisible();
});

test('the sidebar tree sits 12 px in and Health check is a nav item', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the sidebar is desktop');
  await openHome(page);
  const sidebar = page.getByRole('navigation', { name: 'Your folders' });
  await expect(
    sidebar.getByRole('navigation', { name: 'Main' }).getByRole('link', {
      name: 'Health check',
    }),
  ).toBeVisible();
  const row = await sidebar.locator('.tree-row').first().boundingBox();
  if (row === null) throw new Error('no tree row');
  expect(Math.round(row.x)).toBe(12);
  expect(row.x + row.width).toBeGreaterThan(245);
  expect(row.x + row.width).toBeLessThan(256);
});

test('on desktop, Answers lines up with the root discs, and the open Bower note wears the bird', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the sidebar is desktop');
  await openHome(page);
  const sidebar = page.getByRole('navigation', { name: 'Your folders' });
  const disc = await sidebar
    .locator('.tree .folder-mark')
    .first()
    .boundingBox();
  const answers = await sidebar
    .locator('.explorer-below a[href="/folder/Answers"] svg')
    .first()
    .boundingBox();
  if (disc === null || answers === null) throw new Error('no icons');
  expect(Math.abs(disc.x - answers.x)).toBeLessThanOrEqual(1);

  // A note Bower wrote: its selected row draws the bird, not a document,
  // and is in view on load.
  await page.goto('/note/demo-75');
  const selected = sidebar.locator('.tree-link[aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  await expect(selected.locator('svg.mark')).toHaveCount(1);
  await expect(selected).toBeInViewport();
});
