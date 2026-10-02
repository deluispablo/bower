/**
 * Note tables (#1002): a Markdown table sits in a box that scrolls sideways,
 * and its cells never break a word to fit a narrow column.
 */

import { expect, test } from './demo.js';

test.describe('note tables', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('scroll instead of breaking words', async ({ page }) => {
    await page.goto('/folder/1-Projects/Job%20Search%20Australia/Applications');
    await page
      .locator('.folder-item', { hasText: 'Job ratings' })
      .press('Enter');
    await expect(page).toHaveURL(/\/note\//);

    const box = page.locator('.markdown .markdown-table').first();
    await expect(box).toBeVisible();
    await expect(box).toHaveCSS('overflow-x', 'auto');
    const header = box.locator('th').first();
    await expect(header).toHaveCSS('overflow-wrap', 'normal');
    await expect(header).toHaveCSS('word-break', 'keep-all');
    // The table never spills out of the column: its box scrolls instead.
    const fits = await box.evaluate(
      (el) =>
        el.getBoundingClientRect().width <=
        (el.parentElement?.clientWidth ?? 0),
    );
    expect(fits).toBe(true);
  });
});
