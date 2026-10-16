/**
 * qa4-request-reload (qa-4 Codex F2): a request shown as waiting for the next tidy-up is still there after a reload
 * made at once, as Google Drive keeps what it answered. Made-up words only.
 */
import { expect, isFake, test } from './fixtures';

test('qa4-request-reload: AC3 waiting-survives-reload: a request shown as waiting survives an immediate reload', async ({ page }) => {
  test.skip(!isFake, 'the pretend Drive keeps the folder across a reload; the demo starts again');
  const words = 'Compare the three flats for Alex by commute';
  await page.goto('/bower?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const main = page.getByRole('main');
  await main.getByRole('textbox', { name: 'Your request' }).fill(words);
  await main.getByRole('button', { name: 'Send' }).click();
  const bubble = main.getByRole('region', { name: 'What you asked' }).locator('div').filter({ hasText: words }).last();
  await expect(bubble.getByText('Waiting for the next tidy-up.', { exact: true })).toBeVisible();
  // At once: no wait for any delayed save.
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('region', { name: 'What you asked' }).getByText(words, { exact: true })).toHaveCount(1);
});
