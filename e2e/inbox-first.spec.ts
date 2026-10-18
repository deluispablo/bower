import { expect, isFake, test } from './fixtures';

// TL-P4-10 addendum 2. On the live folder's shape (a declared pile, a score of leftovers, a dozen changes, questions,
// an unseen finished tidy-up) with Drive at 300 ms a call and four calls at once, Home shows the Inbox from the
// folder listing first. Readiness, the last tidy-up's report and the questions fill in after it, and the list does not move.
test('the inbox shows before a slow report', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the pretend Drive is slow in the slow-report situation');
  test.setTimeout(90_000);
  allowConsole(/disposition was refused/, 'the made-up leftovers are not real dispositions');
  await page.goto('/?scenario=slow-report&time=instant');
  const tidy = page.getByRole('region', { name: 'Inbox' }).getByRole('button', { name: /^Tidy up \d+ things?$/ });
  // Within 3 s of the page starting: the pile names and their counts, from the listing alone. No Tidy up button and no
  // number yet: which piles are ready is not known, and a number that can drop is not shown (TL-P4-13).
  await expect(page.locator('section[aria-labelledby="inbox"] a[href^="/pile/"]').first()).toBeVisible({ timeout: 3000 });
  await expect(tidy).toHaveCount(0);
  // Readiness, the report and the questions come after, and the list does not move when the button arrives.
  const first = page.locator('section[aria-labelledby="inbox"] a[href^="/pile/"]').first();
  // The first tidy-up checklist (shown here: a run happened, its report not yet opened) can arrive after the Inbox when
  // the last run's record loads slowly; wait for it to settle. ux-loading-polish restores the strict no-shift check.
  // Settled means its current step's button is drawn too, which waits for the last run's record.
  const checklist = page.getByRole('region', { name: 'Your first tidy-up' });
  await expect(checklist.getByRole('button', { name: 'See the report' })).toBeVisible({ timeout: 60_000 });
  const before = await first.boundingBox();
  await expect(tidy).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Tidy-up finished/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#qs')).toBeVisible({ timeout: 60_000 });
  const after = await first.boundingBox();
  expect(after?.y).toBe(before?.y);
  expect(after?.x).toBe(before?.x);
});
