/**
 * qa5-panel-request-clamp (qa-5 Claude F5): in the desktop panel a long "You asked" request takes two lines at most,
 * as each rule does (design-rules-block AC5); its whole text stays in the page and shows whole on the Bower screen.
 */
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';

const LONG = 'Alex would like every receipt from the flat move kept together with the lease papers, sorted by month, '
  + 'with the deposit letters first, the removal company quotes after them, and anything about the old address '
  + 'kept apart until the landlord sends the final statement, which should arrive before the end of the year.';

test('qa5-panel-request-clamp: AC1 panel-request-two-lines: a long request is two lines at most in the panel', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the right panel exists on the desktop only');
  await page.goto('/bower?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const main = page.getByRole('main');
  await main.getByRole('textbox', { name: 'Your request' }).fill(LONG);
  await main.getByRole('button', { name: 'Send' }).click();
  // Positive control: the Bower screen shows it whole.
  await expect(main.getByRole('region', { name: 'What you asked' }).getByText(LONG, { exact: true })).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'Right panel', exact: true });
  const section = panel.locator('section', { has: page.getByRole('heading', { name: 'You asked', exact: true }) });
  const item = section.getByRole('listitem').filter({ hasText: LONG });
  await expect(item).toHaveCount(1);
  // The request's own height: the item's, less the "Waits for the next tidy-up" line under it.
  const fit = await item.evaluate((li, long) => {
    const waits = li.lastElementChild;
    const below = waits ? waits.getBoundingClientRect().height + parseFloat(getComputedStyle(waits).marginTop) : 0;
    const line = parseFloat(getComputedStyle(li).lineHeight);
    return { lines: (li.getBoundingClientRect().height - below) / line, whole: li.textContent?.includes(long) ?? false };
  }, LONG);
  expect(fit.whole, 'the whole request stays in the page').toBe(true);
  expect(fit.lines).toBeLessThanOrEqual(2.05);
  await expectAxeClean(page, { include: 'aside[aria-label="Right panel"]', wcag22: true });
});
