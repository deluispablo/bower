/**
 * qa6-a11y (qa-6 Claude F2; WCAG 2.4.1 Bypass blocks, 2.4.3 Focus order): on desktop, the first Tab after a page load
 * reaches "Skip to content". Keeping the active tab in sight must not move the browser's sequential focus navigation
 * starting point (https://html.spec.whatwg.org/#sequential-focus-navigation). Unlike skip-link.spec.ts, nothing resets
 * that starting point here: the page is as a fresh load leaves it.
 */
import { expect, test } from './fixtures';

for (const path of ['/', '/settings']) {
  test(`qa6-a11y: AC1 qa6-a11y-first-tab: the first Tab after loading ${path} reaches Skip to content`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the tab strip is desktop only; skip-link.spec.ts covers the phone');
    await page.goto(`${path}?scenario=default&time=instant`);
    await expect(page.locator('#boot')).toHaveCount(0);
    await expect(page.locator('#main')).toBeVisible();
    // Positive control: the tab strip that keeps the active tab in sight is on screen.
    await expect(page.getByRole('navigation', { name: 'Open tabs' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
  });
}
