import { expect, isFake, test } from './fixtures';

// TL-P4-10 addendum 2. On the live folder's shape (a declared pile, a score of leftovers, a dozen changes, questions,
// an unseen finished tidy-up) with Drive at 300 ms a call and four calls at once, Home shows the Inbox from the
// folder listing first. The last tidy-up's report and the questions fill in after it, and the button does not move.
test('the inbox shows before a slow report', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the pretend Drive is slow in the slow-report situation');
  test.setTimeout(90_000);
  allowConsole(/disposition was refused/, 'the made-up leftovers are not real dispositions');
  await page.goto('/?scenario=slow-report&time=instant');
  const tidy = page.getByRole('region', { name: 'Inbox' }).getByRole('button', { name: /^Tidy up \d+ things?$/ });
  // Within 3 s of the page starting: the pile names, their counts and the button.
  await expect(page.locator('section[aria-labelledby="inbox"] a[href^="/pile/"]').first()).toBeVisible({ timeout: 3000 });
  await expect(tidy).toBeVisible({ timeout: 3000 });
  const before = await tidy.boundingBox();
  // The report and the questions come after, and nothing moves under the person's finger.
  await expect(page.getByText(/Tidy-up finished/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#qs')).toBeVisible({ timeout: 60_000 });
  const after = await tidy.boundingBox();
  expect(after?.y).toBe(before?.y);
  expect(after?.x).toBe(before?.x);
});
