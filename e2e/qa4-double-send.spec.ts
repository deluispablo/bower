/**
 * qa4-double-send (qa-4, both testers): a real double-click on Send in Tell Bower records one request, shown once and,
 * on the pretend Drive, kept once across a reload. Made-up words only.
 */
import { expect, isFake, test } from './fixtures';
import { expectAxeClean } from './axe';

test('qa4-double-send: AC5 double-click-one-request: a double-click on Send records one request', async ({ page }) => {
  const words = 'Put the lease papers for Alex together';
  await page.goto('/bower?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const main = page.getByRole('main');
  await main.getByRole('textbox', { name: 'Your request' }).fill(words);
  await main.getByRole('button', { name: 'Send' }).dblclick();
  const asked = main.getByRole('region', { name: 'What you asked' });
  await expect(asked.getByText(words, { exact: true })).toHaveCount(1);
  await expect(main.getByRole('textbox', { name: 'Your request' })).toHaveValue('');
  // Any second save would have landed by now: the composer emptied after the first one ended.
  await page.waitForTimeout(600);
  await expect(asked.getByText(words, { exact: true })).toHaveCount(1);
  await expectAxeClean(page, { include: 'main', wcag22: true });
  if (!isFake) return;
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('region', { name: 'What you asked' }).getByText(words, { exact: true })).toHaveCount(1);
});
