/**
 * Round nine: what the review after round eight found. Each test pins one
 * entry of harness/features.json with "task": "qa-9", on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const toast = (page: Page, text: string | RegExp) => page.getByRole('status').getByText(text);

test('on screen: answering a question is confirmed in the words of the choice', async ({ page }) => {
  await open(page, '/');
  const q = page.locator('section[aria-labelledby="qs"] li').filter({ hasText: /Keep both\?/ });
  await q.getByRole('button', { name: 'Keep one' }).click();
  await expect(toast(page, 'You chose "Keep one". Bower does it in the next tidy-up.')).toBeVisible();
});

test('on screen: Add points out an empty file', async ({ page }) => {
  await open(page, '/add');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) });
  await expect(page.getByRole('list', { name: 'In this pile' })).toContainText('This file is empty. Add it anyway, or take it out.');
});

test('on screen: files not chosen again after a reload are named when the pile goes in', async ({ page }) => {
  await open(page, '/add');
  await page.locator('textarea').first().fill('Papers for the flat');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') });
  await expect(page.getByRole('list', { name: 'In this pile' })).toContainText('scan.pdf');
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('list', { name: 'In this pile' })).toContainText('Add this file again');
  await page.getByRole('button', { name: 'Put the note in the inbox' }).click();
  await expect(toast(page, 'scan.pdf was left out: choose it again to add it.')).toBeVisible();
});

test('on screen: the result of a tidy-up names the request it did', async ({ page }) => {
  await open(page, '/bower');
  await page.getByRole('radio', { name: 'A request' }).click();
  await page.getByLabel('Your request').fill('Put my visa papers together');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: /Let Bower do it now/ }).first().click();
  await expect(page.getByRole('dialog')).toContainText('"Put my visa papers together" done', { timeout: 10_000 });
});

test('a link follows a rename through a tidy-up', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/note/Projects/Flat%20hunt/Flat%207%2C%20Cobble%20Row.md');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.focus();
  await page.keyboard.press('F2');
  const input = page.getByLabel(/New name for Flat 7/);
  await input.fill('Cobble Row flat');
  await input.press('Enter');
  await expect(tree.getByRole('treeitem', { name: /Cobble Row flat/ })).toBeVisible();
  await page.locator('footer').getByRole('button').first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await expect(page.getByRole('dialog').getByText(/15 things filed/).last()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await tree.getByRole('treeitem', { name: /Flat 3, 12 Larkspur Lane/ }).click();
  await page.getByRole('main').getByRole('link', { name: 'Cobble Row flat' }).first().click();
  await expect(page).toHaveURL(/\/note\/Projects\/Flat%20hunt\/Cobble%20Row%20flat\.md/);
  await expect(page.getByText('Flat 3, 12 Larkspur Lane').first()).toBeVisible();
});

test('Undo twice on the same thing gives its row the keyboard both times', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  for (let i = 0; i < 2; i++) {
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.keyboard.press('Escape');
    await expect(tree).toBeFocused();
    await page.keyboard.press('Delete');
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).last().click();
    await expect(tree, `time ${i + 1}`).toBeFocused();
    await expect(tree).toHaveAttribute('aria-activedescendant', 'row-Projects%2FFlat%20hunt%2FLease%20draft.pdf');
  }
});
