/**
 * #826: an overlay is portalled out of the inert page, so the "Is that
 * everything?" confirm can be used with mouse and Tab, and focus goes back
 * to the Tidy up button when it closes.
 */

import { expect, openHome, test, visible } from './demo.js';

test('the tidy-up confirm is operable and returns focus to Tidy up', async ({
  page,
}) => {
  await openHome(page);
  const tidy = visible(page.getByRole('button', { name: 'Tidy up' }));
  await tidy.focus();
  await tidy.click();

  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await expect(confirm).toBeVisible();
  // Not inside the inert page.
  await expect(confirm.locator('xpath=ancestor::*[@inert]')).toHaveCount(0);
  await expect(confirm.locator(':focus')).toHaveCount(1);

  // Tab stays inside the dialog.
  await page.keyboard.press('Tab');
  expect(
    await confirm.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);

  await confirm.getByRole('button', { name: 'Add more first' }).click();
  await expect(confirm).toBeHidden();
  await expect(tidy).toBeFocused();
});
