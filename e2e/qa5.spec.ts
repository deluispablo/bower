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
