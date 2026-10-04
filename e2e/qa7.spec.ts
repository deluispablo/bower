/**
 * Round seven: what the review of round six found. Each test pins one entry of
 * harness/features.json with "task": "qa-7", on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

const stopARun = async (page: Page): Promise<void> => {
  await open(page, '/', 'fail-run');
  await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await expect(page.getByRole('dialog').getByText('The tidy-up stopped').first()).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('Escape');
};

test("the panel's put away is Got it: one stopped run, one way to dismiss it", async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop side panel');
  await stopARun(page);
  const panel = page.getByRole('complementary').filter({ hasText: 'Tell Bower something' });
  const home = page.getByRole('alert').getByRole('heading', { name: 'The tidy-up stopped' });
  await expect(home).toBeVisible();
  await panel.getByRole('button', { name: 'Put it away' }).click();
  await expect(panel.getByText(/tidy-up stopped/)).toHaveCount(0);
  await expect(home).toHaveCount(0);
  await expect(page.locator('footer').getByText(/The tidy-up stopped/)).toHaveCount(0);
});

test("Home's Got it puts the panel's card away too", async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop side panel');
  await stopARun(page);
  const panel = page.getByRole('complementary').filter({ hasText: 'Tell Bower something' });
  await expect(panel.getByText(/tidy-up stopped/).first()).toBeVisible();
  await page.getByRole('alert').getByRole('button', { name: 'Got it' }).click();
  await expect(panel.getByText(/tidy-up stopped/)).toHaveCount(0);
});

test('Move to: an exact folder name is picked with Enter, even when others match', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.getByLabel('Find a folder').fill('areas');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').getByText(/Moved Lease draft\.pdf to Areas$/)).toBeVisible();
});

test('Move to: Enter in an empty box says what to do', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Type a folder name, or pick one with the arrows.');
});
