/**
 * app-small-fixes (backlog triage 2026-10-20, group 2), the two lines a unit test cannot see: Home's section headings have
 * one computed size (21 px), and pressing the Inbox folder row on Home keeps the same mounted Home and adds no history
 * entry (React Router's Link replaces on the current location; a client redirect costs a remount and an entry).
 * Made-up words only.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

test('AC4 Home\'s section headings have one size', async ({ page }) => {
  await open(page, '/');
  await expect(page.locator('main h2#inbox')).toBeVisible();
  await expect(page.locator('main h2#recent')).toBeVisible();
  const sizes = await page.locator('main h2').evaluateAll((hs) => hs.map((h) => `${h.id || h.textContent}: ${getComputedStyle(h).fontSize}`));
  expect(sizes.length, 'setup: Home shows more than one section').toBeGreaterThan(1);
  expect(sizes.filter((s) => !s.endsWith(': 21px')), 'AC4: every Home section heading is 21px').toEqual([]);
});

test('AC5 the Inbox row opens Home without a redirect', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree next to Home');
  await open(page, '/');
  const region = page.getByRole('region', { name: 'Inbox' });
  await expect(region.getByRole('link').first()).toBeVisible();
  // The same Inbox card element afterwards means Home was never unmounted.
  await region.evaluate((el) => Object.assign(window, { smallFixesInbox: el }));
  const before = await page.evaluate(() => history.length);
  const row = page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /^Inbox/ });
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect(region.getByRole('link').first()).toBeVisible();
  expect(await page.evaluate(() => history.length), 'AC5: no dead history entry').toBe(before);
  expect(await page.evaluate(() => (window as unknown as { smallFixesInbox: Element }).smallFixesInbox.isConnected), 'AC5: Home was not remounted').toBe(true);
});

test('AC5 guard: a typed address of the Inbox still lands on Home', async ({ page }) => {
  await open(page, '/files/Inbox');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
});
