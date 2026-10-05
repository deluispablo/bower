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

const notBody = (page: Page) => expect.poll(() => page.evaluate(() => document.activeElement !== document.body && !!document.activeElement));

test('the keyboard stays in the page after closing, answering, removing or saying no', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard use');
  await open(page, '/');
  await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await notBody(page).toBe(true);
  await open(page, '/');
  await page.locator('section[aria-labelledby="qs"] li').first().getByRole('button').first().click();
  await notBody(page).toBe(true);
  await open(page, '/');
  await page.getByRole('region', { name: 'Bower suggests' }).getByRole('button', { name: 'No thanks' }).first().click();
  await notBody(page).toBe(true);
  await open(page, '/bower');
  await page.getByRole('button', { name: /^Remove the rule/ }).first().click();
  await notBody(page).toBe(true);
});

const toast = (page: Page, text: string | RegExp) => page.getByRole('status').getByText(text);

test('every Undo says what came back: a move and a removed rule', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.getByLabel('Find a folder').fill('Documents');
  await page.keyboard.press('Enter');
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).last().click();
  await expect(toast(page, /Lease draft(\.pdf)? is back in Projects \/ Flat hunt/)).toBeVisible();
  await open(page, '/bower');
  await page.getByRole('button', { name: /^Remove the rule/ }).first().click();
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).last().click();
  await expect(toast(page, 'The rule is back.')).toBeVisible();
});

test('No thanks can be taken back', async ({ page }) => {
  await open(page, '/');
  const box = page.getByRole('region', { name: 'Bower suggests' });
  const title = (await box.locator('[class*="suggestTitle"]').first().textContent()) ?? '';
  await box.getByRole('button', { name: 'No thanks' }).first().click();
  await expect(toast(page, "Bower won't suggest it again.")).toBeVisible();
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.getByText(title).first()).toBeVisible();
});
