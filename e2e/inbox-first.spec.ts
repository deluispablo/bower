import { expect, isFake, test } from './fixtures';

// TL-P4-10 addendum 2: on a slow Drive the Inbox is the first thing Home shows; the last tidy-up's report and
// the questions fill in after it, and nothing under the person's finger moves.
test('the inbox shows before a slow report', async ({ page }) => {
  test.skip(!isFake, 'the pretend Drive delays the report and the questions');
  test.setTimeout(60_000);
  await page.goto('/?scenario=slow-report&time=instant');
  const tidy = page.getByRole('button', { name: /^Tidy up \d+ things?$/ });
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible({ timeout: 3000 });
  await expect(tidy).toBeVisible({ timeout: 3000 });
  await expect(page.locator('section[aria-labelledby="inbox"] a[href^="/pile/"]').first()).toBeVisible();
  // The report and the questions are still on their way.
  await expect(page.getByText(/Tidy-up finished/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /questions? for you/ })).toHaveCount(0);
  const before = await tidy.boundingBox();
  // They fill in later, and the button has not moved.
  await expect(page.getByText(/Tidy-up finished/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /questions? for you/ })).toBeVisible({ timeout: 15_000 });
  const after = await tidy.boundingBox();
  expect(after?.y).toBe(before?.y);
  expect(after?.x).toBe(before?.x);
});
