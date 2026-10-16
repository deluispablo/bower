import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';

// qa-2-F2 (WCAG 2.4.1 Bypass Blocks): the first Tab on every screen in the shell reaches "Skip to content", shown
// while it has focus; pressing it puts the keyboard on the main landmark and leaves the address as it was.
const SCREENS = ['/', '/files', '/add', '/bower', '/settings', '/note/Resources/Cooking/Lemon%20tart.md', '/nowhere-at-all'];

/** Hidden: outside the viewport, or no bigger than one pixel. */
async function hidden(link: Locator): Promise<boolean> {
  return link.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth || r.width <= 1 || r.height <= 1;
  });
}

async function startOfPage(page: Page, path: string): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0);
  await expect(page.locator('#main')).toBeVisible();
  // From the document start, as a fresh load leaves it: a focused marker at the top of the body, then gone, puts the
  // browser's sequential focus starting point there (https://html.spec.whatwg.org/#sequential-focus-navigation).
  await page.evaluate(() => {
    const mark = document.createElement('span');
    mark.tabIndex = -1;
    document.body.prepend(mark);
    mark.focus();
    mark.remove();
  });
}

for (const path of SCREENS) {
  test(`qa-2-F2: the first Tab reaches Skip to content, which moves to the main content, on ${path}`, async ({ page }) => {
    await startOfPage(page, path);
    const before = page.url();
    const link = page.getByRole('link', { name: 'Skip to content', exact: true });
    // expected: a missing link is the assertion below, not a query error.
    await expect(link).toHaveCount(1);
    expect(await hidden(link), 'hidden until it has focus').toBe(true);
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport({ ratio: 1 });
    expect(await hidden(link)).toBe(false);
    // Not under the phone's tab bar or the dock, and not covered by anything.
    const box = await link.boundingBox();
    expect(box && box.height >= 24 && box.width >= 24, 'a target of at least 24 px').toBe(true);
    if (box) expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.textContent ?? null, [box.x + box.width / 2, box.y + box.height / 2])).toBe('Skip to content');
    await expectAxeClean(page, { include: 'a[href="#main"]', wcag22: true });
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
    expect(page.url()).toBe(before);
    expect(await hidden(link), 'hidden again once focus leaves it').toBe(true);
    // The next Tab goes into the page, past every navigation before it.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#main'))).toBe(true);
  });
}
