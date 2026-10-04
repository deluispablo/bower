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
