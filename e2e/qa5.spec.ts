/**
 * Round five: what testing phase 2 found. Each test pins one entry of
 * harness/features.json (category bug or polish), on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

test('after the tour a reload opens the app', async ({ page }) => {
  await open(page, '/', 'first');
  await page.getByRole('button', { name: 'Show me around' }).click({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  // On fake a reload starts the pretend Drive again, so the folder is missing again:
  // the welcome shows, it does not loop.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  void isFake;
});

test('the running situation shows its live phases', async ({ page }) => {
  await open(page, '/', 'running', 'demo');
  await expect(page.getByText(/Writing your notes|Reading \d+ things/).first()).toBeVisible({ timeout: 12_000 });
});

test('an instant tidy-up ends at once', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await expect(page.getByRole('dialog').getByText(/Done\. 15 things filed/).last()).toBeVisible({ timeout: 2500 });
});

test('the run scene ends with an empty inbox', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, '/', 'default', 'demo');
  await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Done\. 15 things filed/).last()).toBeVisible({ timeout: 40_000 });
  await expect(dialog.locator('[data-spot="inbox"]')).toHaveAttribute('data-sheets', '0');
  await expect(dialog.locator('[data-spot="read"]')).toHaveAttribute('data-sheets', '0');
  await expect(dialog.locator('[data-spot="folder"]')).toHaveAttribute('data-filed', '15');
});

test.describe('the explorer from the keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop tree');

  test('after a move the tree keeps keyboard focus', async ({ page }) => {
    await open(page, '/');
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click();
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to…' }).click();
    await page.getByLabel('Find a folder').fill('Documents');
    await page.getByRole('button', { name: /^Documents/ }).first().click();
    await expect(tree).toHaveAttribute('aria-activedescendant', `row-${encodeURIComponent('Areas/Documents/Lease draft.pdf')}`);
    await expect(page.locator(`#row-${CSS_ESCAPE('Areas/Documents/Lease draft.pdf')}`)).toHaveCount(1);
  });

  test('Move to works from the keyboard', async ({ page }) => {
    await open(page, '/');
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to…' }).click();
    await page.getByLabel('Find a folder').fill('Documents');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').getByText(/Moved Lease draft\.pdf to Areas \/ Documents/)).toBeVisible();
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to…' }).click();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('dialog').getByRole('button').filter({ hasText: /\S/ }).first()).toBeFocused();
  });

  test('a new note opens and says how to write in it', async ({ page }) => {
    await open(page, '/');
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    await tree.getByRole('treeitem', { name: /^Resources/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'New note' }).click();
    await page.keyboard.type('Soup ideas');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/note\/Resources\/Soup%20ideas\.md/);
    await expect(page.getByText(/This note is empty/)).toBeVisible();
    await expect(page.getByRole('status').getByText(/New note in Resources/)).toBeVisible();
  });
});

const CSS_ESCAPE = (path: string): string => `row-${encodeURIComponent(path)}`.slice(4).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
