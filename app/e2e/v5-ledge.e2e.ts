/**
 * Bower's ledge (#782, R-BIRD-4): a 66 px zone at the foot of the desktop
 * sidebar, outside the tree, with Bower perched at rest and flying during a
 * run. Nothing on the phone. The demo holds the current run in one state
 * through the `bower:demo:run` session-storage switch.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './demo.js';
import { MOTION_ON } from './motion.js';

test.use(MOTION_ON);

const FLAT = '/folder/1-Projects/Flat%20hunt';

async function holdRun(page: Page, state: string): Promise<void> {
  await page.addInitScript((held) => {
    sessionStorage.setItem('bower:demo:run', held);
  }, state);
}

test('desktop: Bower perches on a 66 px ledge below the tree and above nothing it covers', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the ledge is the computer');
  await page.goto(FLAT);
  const ledge = page.locator('.shell-ledge');
  await expect(ledge.locator('svg.p-perch')).toBeVisible();
  const box = await ledge.boundingBox();
  expect(Math.round(box?.height ?? 0)).toBe(66);
  await expect(ledge).toHaveAttribute('aria-hidden', 'true');
  const tree = await page.locator('.explorer-tree').boundingBox();
  expect(tree).not.toBeNull();
  expect((tree?.y ?? 0) + (tree?.height ?? 0)).toBeLessThanOrEqual(
    (box?.y ?? 0) + 1,
  );
});

test('desktop: Bower flies with a paper while a run goes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the ledge is the computer');
  await holdRun(page, 'running');
  await page.goto(FLAT);
  await expect(page.locator('.shell-ledge svg.p-fly')).toBeVisible();
});

test('phone: no ledge bird, the bar has its own', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the bar is the phone');
  await holdRun(page, 'running');
  await page.goto(FLAT);
  await expect(page.locator('.shell-ledge svg')).toHaveCount(0);
  await expect(
    page.locator('.shell-dock .run-chip-bird svg.p-fly'),
  ).toBeVisible();
});
