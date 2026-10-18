import { resize } from './viewport';
/**
 * Round seven: what the review of round six found. Each test pins one entry of
 * the QA list with "task": "qa-7", on demo and on fake.
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
  await page.addInitScript(() => localStorage.setItem('bower:prefs', JSON.stringify({ rightOpen: true })));
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
  await page.addInitScript(() => localStorage.setItem('bower:prefs', JSON.stringify({ rightOpen: true })));
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
  await expect(page.getByRole('status').getByText(/Moved Lease draft to Areas$/)).toBeVisible();
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

test('New folder in an empty folder asks for a name, then opens the folder', async ({ page }) => {
  await resize(page, { width: 375, height: 900 });
  await open(page, '/files/Resources/Cooking');
  await page.getByRole('button', { name: 'More for Cooking', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New folder', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'New folder', exact: true });
  const name = sheet.getByRole('textbox', { name: 'Name', exact: true });
  const make = sheet.getByRole('button', { name: 'Make the folder', exact: true });
  await expect(name).toBeFocused();
  await page.keyboard.type('Empty garden');
  await expect(name).toHaveValue('Empty garden');
  await make.click();
  await expect(page).toHaveURL(/\/files\/Resources\/Cooking\/Empty%20garden(?:\?|$)/);
  await expect(page.getByText('Nothing in here yet.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More for Empty garden', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New folder', exact: true }).click();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('');
  await expect(make).toBeDisabled();
  await expect(page).toHaveURL(/\/files\/Resources\/Cooking\/Empty%20garden(?:\?|$)/);
  await page.keyboard.type('Plans');
  await expect(name).toHaveValue('Plans');
  await make.click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/files\/Resources\/Cooking\/Empty%20garden\/Plans(?:\?|$)/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Plans');
  await expect(page.getByText('Nothing in here yet.', { exact: true })).toBeVisible();
});

test('New folder from the tree keeps the first letters typed', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/files?source=fake');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.locator('[data-path="Resources"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
  // Type immediately: waiting for the textbox or filling it would hide lost first letters.
  await page.keyboard.type('Garden plans');
  await page.keyboard.press('Enter');
  const folder = tree.locator('[data-path="Resources/Garden plans"]');
  await expect(folder).toBeVisible();
  await expect(folder.getByText('Garden plans', { exact: true })).toBeVisible();
});
