/**
 * qa5-start-fail-focus (qa-5 Claude F2; WAI-ARIA APG modal dialog): when a tidy-up fails to start, the keyboard stays in
 * the sheet, on "Try again", in Chrome, which drops focus from a button that becomes disabled.
 */
import { expect, isFake, test } from './fixtures';

test('qa5-start-fail-focus: AC2 start-fail-focus: a failed start leaves the keyboard on Try again, inside the sheet', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the Worker answering 500 is the fake source');
  allowConsole(/Worker answered 500/, 'the Worker answers 500 to the first press, on purpose');
  await page.goto('/?scenario=start-fails&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await page.getByRole('button', { name: /^Tidy up \d+ things$/ }).first().click();
  const sheet = page.getByRole('dialog');
  const start = sheet.getByRole('button', { name: /^Tidy up \d+ things$/ });
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('alert')).toHaveText("Something went wrong on Bower's side. Try again later.");
  const again = sheet.getByRole('button', { name: 'Try again' });
  await expect(again).toBeFocused();
  expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  // Enter on it starts again from the keyboard, with no Tab first.
  await page.keyboard.press('Enter');
  await expect(sheet.getByText(/Done\. \d+ things filed/).last()).toBeVisible();
});
