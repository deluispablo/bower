/**
 * Round six: what the review of round five found. Each test pins one entry of
 * harness/features.json with "task": "qa-6", on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
void isFake;

test('one counting rule for folders', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the folder cards of the desktop');
  await open(page, '/files');
  const card = await page.getByRole('link', { name: /^Projects/ }).first().innerText();
  await page.getByRole('link', { name: /^Projects/ }).first().click();
  await expect(page.locator('main header p').first()).toHaveText(/\d+ things?/);
  const header = await page.locator('main header p').first().innerText();
  expect(card).toContain(header);
  const row = page.locator('main ul a').filter({ hasText: /^Flat hunt/ }).first();
  const rowCount = /(\d+ things?)/.exec(await row.innerText())?.[1] ?? '';
  await row.click();
  await expect(page.locator('main header p').first()).toHaveText(rowCount);
});

test('Enter in an empty Move to does nothing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('status').getByText(/Moved Lease draft/)).toHaveCount(0);
});

test('Enter moves only when one folder matches', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.getByLabel('Find a folder').fill('re');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText(/Several folders match/)).toBeVisible();
  await page.getByLabel('Find a folder').fill('Documents');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').getByText(/Moved Lease draft\.pdf to Areas \/ Documents/)).toBeVisible();
});

test('after a move or a Bin the tree keeps the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click();
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.getByLabel('Find a folder').fill('Documents');
  await page.keyboard.press('Enter');
  await expect(tree).toBeFocused();
  await tree.getByRole('treeitem', { name: /^Car/ }).click();
  await page.keyboard.press('Delete');
  await page.getByRole('dialog').getByRole('button', { name: 'Put it in the Bin' }).click();
  await expect(tree).toBeFocused();
});
