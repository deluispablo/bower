/** ux-first-desktop: the first desktop is focused (right panel collapsed, rail labelled) and deliberate choices are kept. */
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { resize } from './viewport';

const start = '/?scenario=default&time=instant';
const right = (page: Page) => page.getByRole('complementary', { name: 'Right panel', exact: true });
const rail = (page: Page) => page.getByRole('navigation', { name: 'Main', exact: true });

async function firstDesktop(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = (): void => {
      if (document.querySelector('aside[aria-label="Right panel"]')) Reflect.set(window, '__rightSeen', true);
    };
    new MutationObserver(seen).observe(document, { childList: true, subtree: true });
  });
  await resize(page, { width: 1280, height: 900 });
  await page.goto(start);
  await expect(page.locator('#boot')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Your first tidy-up' })).toBeVisible();
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop rail and right panel');

  test('AC1 first_desktop_is_focused', async ({ page }) => {
    await firstDesktop(page);
    await expect(right(page)).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, '__rightSeen'))).toBeFalsy();
    const nav = rail(page);
    await expect(nav.getByRole('link', { name: 'Home', exact: true })).toHaveText('Home');
    await expect(nav.getByRole('link', { name: 'Add a pile', exact: true })).toHaveText('Add');
    await expect(nav.getByRole('link', { name: 'Ask', exact: true })).toHaveText('Ask');
    await expect(nav.getByRole('button', { name: 'Search, command palette', exact: true })).toHaveText('Search');
  });

  test('AC1 deliberate_open_is_kept', async ({ page }) => {
    await firstDesktop(page);
    await page.getByRole('button', { name: 'Show the right panel' }).click();
    await expect(right(page)).toBeVisible();
    await page.reload();
    await expect(page.locator('#boot')).toHaveCount(0);
    await expect(right(page)).toBeVisible();
    await page.getByRole('button', { name: 'Hide the right panel' }).click();
    await page.reload();
    await expect(page.locator('#boot')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Your first tidy-up' })).toBeVisible();
    await expect(right(page)).toHaveCount(0);
  });

  test('AC3 labels_fit_the_rail', async ({ page }) => {
    await page.goto(start);
    for (const width of [900, 1024, 1280, 1440]) {
      await resize(page, { width, height: 900 });
      await expect(page.locator('#boot')).toHaveCount(0);
      const nav = rail(page);
      await expect(nav).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const box = await nav.boundingBox();
      if (!box) throw new Error('Missing rail');
      expect(Math.abs(box.width - 52), `${width} px rail`).toBeLessThanOrEqual(1);
      const spans = await nav.evaluate((el) => {
        const names = ['Home', 'Add a pile', 'Ask', 'Search, command palette'];
        return names.map((name) => {
          const span = el.querySelector(`[aria-label="${name}"] span`);
          if (!(span instanceof HTMLElement)) return null;
          const r = span.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, scroll: span.scrollWidth, client: span.clientWidth };
        });
      });
      expect(spans.every(Boolean), `${width} px: four labels`).toBe(true);
      const boxes = spans.filter((b): b is NonNullable<typeof b> => b !== null);
      for (const b of boxes) {
        expect(b.left).toBeGreaterThanOrEqual(box.x);
        expect(b.right).toBeLessThanOrEqual(box.x + box.width);
        expect(b.scroll).toBeLessThanOrEqual(b.client);
      }
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) {
          const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          expect(overlap, `${width} px: labels apart`).toBe(false);
        }
      }
    }
  });
});

test('AC3 phone_navigation_unchanged (guard)', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone tab bar');
  await page.goto(start);
  await expect(page.locator('#boot')).toHaveCount(0);
  const links = rail(page).getByRole('link');
  await expect(links).toHaveText(['Home', 'Files', 'Add', 'Ask']);
  await expect(links).toHaveCount(4);
});
