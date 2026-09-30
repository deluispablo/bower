/**
 * PARA landmarks in the logic (#580): no screen leads a name with its
 * numeric prefix. Here, the phone's Back label on a folder inside Areas.
 */

import { expect, openHome, test } from './demo.js';

test('the phone back label on a folder inside Areas reads "Areas"', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the Back label is a phone bar');
  await page.setViewportSize({ width: 375, height: 812 });
  await openHome(page);

  await page.goto('/folder/2-Areas/Visa%20%26%20Immigration');
  await expect(
    page.getByRole('heading', { name: 'Visa & Immigration', level: 1 }),
  ).toBeVisible();
  const back = page.locator('.topbar-back');
  await expect(back).toHaveAttribute('aria-label', 'Back to Areas');
  await expect(back.locator('.topbar-back-label')).toHaveText('Areas');
});
