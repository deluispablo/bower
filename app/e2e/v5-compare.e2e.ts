/**
 * Compare's Sort by sheet on a phone (#764, rebuilt by #916, PF-Sort-375):
 * the chip names the sort, the sheet opens on Overlay, and choosing a
 * criterion and a direction reorders the cards.
 */

import { expect, openHome, test } from './demo.js';

test.describe('Compare Sort by sheet (PF-Sort-375)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('sorting from the sheet changes the card order', async ({ page }) => {
    await openHome(page);
    await page.goto(
      '/folder/1-Projects/Housing%20Search%20Australia/Moonee%20Ponds',
    );
    await page.getByRole('tab', { name: /^Compare \d+ / }).click();

    const titles = page.locator('.compare-card-title');
    await expect(titles.first()).toBeVisible();
    const before = await titles.allTextContents();

    const button = page.locator('.compare-sort-btn');
    await expect(button).toHaveText('Fit, high first');
    await button.click();

    const dialog = page.getByRole('dialog', { name: 'Sort by' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.compare-sheet-row')).toHaveText([
      'Fit',
      'Rent a week',
      'Available',
      'Against the area',
      'Status',
      'Name',
    ]);
    await dialog.getByRole('radio', { name: 'Rent a week' }).click();
    await dialog.getByRole('radio', { name: 'Low first' }).click();
    await dialog.getByRole('button', { name: 'Show 6 flats' }).click();
    await expect(dialog).toBeHidden();

    await expect(button).toHaveText('Rent a week, low first');
    const after = await titles.allTextContents();
    expect(after).not.toEqual(before);
    expect(after[0]).toBe('6-20 Mantell St, Moonee Ponds');

    // Esc cancels a draft: the sort stays as it was (T-23).
    await button.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: 'Fit' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toHaveText('Rent a week, low first');
  });
});
