import type { Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}?source=fake&scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

async function atLeast(loc: Locator, min: number): Promise<void> {
  const count = await loc.count();
  expect(count, 'controls found').toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await loc.nth(i).scrollIntoViewIfNeeded();
    const box = await loc.nth(i).boundingBox();
    if (!box) throw new Error('no box');
    expect(box.height, `control #${i} height`).toBeGreaterThanOrEqual(min - 0.01);
  }
}

const axeTargets = async (page: Page, within: string): Promise<void> => {
  const axe = await new AxeBuilder({ page })
    .include(within)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .options({ rules: { 'target-size': { enabled: true } } })
    .analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
};

test('the folder view toggle is the one segmented control', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 375 : 1440, height: 812 });
  await open(page, '/settings');
  const appearance = page.getByRole('radiogroup', { name: 'Appearance' });
  const groupClass = await appearance.getAttribute('class');
  const radioClass = await appearance.getByRole('radio').first().getAttribute('class');

  await open(page, '/files/Projects/Flat%20hunt');
  const view = page.getByRole('radiogroup', { name: 'View', exact: true });
  const list = view.getByRole('radio', { name: 'List', exact: true });
  const table = view.getByRole('radio', { name: 'Table', exact: true });
  await expect(view).toHaveAttribute('class', groupClass ?? '');
  for (const radio of [list, table]) {
    await expect(radio).toHaveAttribute('class', radioClass ?? '');
    await expect(radio.locator('svg')).toHaveCount(1);
  }
  await atLeast(view.getByRole('radio'), isMobile ? 44 : 24);
  await axeTargets(page, '[role="radiogroup"][aria-label="View"]');

  await list.click();
  await expect(list).toHaveAttribute('tabindex', '0');
  await expect(table).toHaveAttribute('tabindex', '-1');
  await list.press('ArrowRight');
  await expect(table).toBeFocused();
  await expect(table).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('main').getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('bower:folder-view'))).toBe('table');
  await page.reload();
  await expect(table).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('main').getByRole('table')).toBeVisible();
  await table.press('ArrowRight');
  await expect(list).toBeFocused();
  await expect(list).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('main').getByRole('table')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('bower:folder-view'))).toBe('list');
});

test('the files bookmark chips are at least 44 px on the phone', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bower:bookmarks', JSON.stringify(['Projects/Flat hunt', 'Resources/Cooking/Lemon tart.md']));
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, '/files');
  const bookmarks = page.getByRole('region', { name: 'Bookmarks', exact: true });
  const chips = bookmarks.getByRole('button');
  await expect(chips).toHaveCount(2);
  await atLeast(chips, 44);
  await axeTargets(page, 'section[aria-label="Bookmarks"]');
  await chips.getByText('Flat hunt', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Flat hunt', exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/files');
  await expect(bookmarks).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your Bower folder', exact: true })).toBeVisible();
});
