/**
 * The switcher and the tidy-up sheet load on first use (#834). Their code is
 * fetched when the browser is idle, so by the time a person opens one it
 * appears at once: the dialog is there within a short wait, with nothing
 * empty shown first.
 */

import { expect, openHome, test } from './demo.js';

const FAST = { timeout: 400 };

test('the switcher opens at once after the page has settled', async ({
  page,
}) => {
  await openHome(page);
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Quick switcher' });
  await expect(dialog).toBeVisible(FAST);
  await expect(dialog.getByRole('combobox')).toBeFocused(FAST);
});

test('the tidy-up sheet opens at once from its chip', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('bower:demo:run', 'partial');
  });
  await page.goto('/folder/1-Projects/Flat%20hunt');
  await page.waitForLoadState('networkidle');
  await page.locator('.run-chip-button').click();
  await expect(
    page.getByRole('dialog', { name: 'Tidy-up partly done' }),
  ).toBeVisible(FAST);
});
