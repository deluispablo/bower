/**
 * Round ten: what the evaluator found after round eight. Each test pins one
 * entry of harness/features.json with "task": "qa-10", on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

test('a situation opened by its address starts clean: no earlier tabs, main folders alike', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop tabs and tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open in a new tab' }).click();
  await expect(page.locator('[data-tab]')).toHaveCount(2);
  await open(page, '/', 'first');
  await page.getByRole('button', { name: 'Show me around' }).click({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('[data-tab]')).toHaveCount(1);
  for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) {
    await expect(tree.getByRole('treeitem', { name: new RegExp(`^${name}`) }), name).toHaveAttribute('aria-expanded', 'false');
  }
});
