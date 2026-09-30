/**
 * Compare's Sort sheet on a phone (#764, R-CMP-1): the button names the
 * sort, the sheet opens on Overlay, and choosing a field reorders the cards.
 */

import { expect, openHome, test } from './demo.js';

test.describe('Compare Sort sheet (R-CMP-1)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('sorting from the sheet changes the card order', async ({ page }) => {
    await openHome(page);
    await page.goto('/folder/4-Archives/Flat%20hunt');
    await page.getByRole('tab', { name: /^Compare \d+ / }).click();

    const titles = page.locator('.compare-card-title');
    await expect(titles.first()).toBeVisible();
    const before = await titles.allTextContents();

    const button = page.locator('.compare-sort-btn');
    await expect(button).toHaveText(/^Sort: Fit, high first$/);
    await button.click();

    const dialog = page.getByRole('dialog', { name: /^Sort .* by$/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: /^Rent a month/ }).click();
    await dialog.getByRole('radio', { name: 'Low first' }).click();
    await dialog.getByRole('button', { name: /^Show \d+ / }).click();
    await expect(dialog).toBeHidden();

    await expect(button).toHaveText(/^Sort: Rent a month, low first$/);
    const after = await titles.allTextContents();
    expect(after).not.toEqual(before);
    expect(after[0]).toContain('Camden Mews');
  });
});
