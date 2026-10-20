import { expect, isFake, test } from './fixtures';

// TL-P4-10 addendum 2. On the live folder's shape (a declared pile, a score of leftovers, a dozen changes, questions,
// an unseen finished tidy-up) with Drive at 300 ms a call and four calls at once, Home opens by 8 s with the Inbox, from
// the folder listing at least. Whatever is still on its way fills in after it, and the list does not move.
test('the inbox shows before a slow report', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the pretend Drive is slow in the slow-report situation');
  test.setTimeout(90_000);
  allowConsole(/disposition was refused/, 'the made-up leftovers are not real dispositions');
  await page.goto('/?scenario=slow-report&time=instant');
  // The phone Inbox keeps its Tidy up; on desktop the top bar launches, so readiness is the Inbox's count (ux-home-priorities R2-2).
  const inbox = page.getByRole('region', { name: 'Inbox' });
  const tidy = test.info().project.name === 'desktop' ? inbox.getByText(/^\d+ things? waiting/) : inbox.getByRole('button', { name: /^Tidy up \d+ things?$/ });
  // The start-up screen holds Home until its first reads land, at most 8 s from the start (ux-home-opening); then the
  // Inbox is on screen, from the listing at least. A number that can drop is never shown (TL-P4-13).
  await expect(page.locator('section[aria-labelledby="inbox"] a[href^="/pile/"]').first()).toBeVisible({ timeout: 10_000 });
  // Readiness, the report and the questions may come after, and the list does not move when the button arrives.
  const first = page.locator('section[aria-labelledby="inbox"] a[href^="/pile/"]').first();
  // The first tidy-up checklist (shown here: a run happened, its report not yet opened) can arrive after the Inbox when
  // the last run's record loads slowly; wait for it to settle. ux-loading-polish restores the strict no-shift check.
  // Settled means its current step's button is drawn too, which waits for the last run's record.
  const checklist = page.getByRole('region', { name: 'Your first tidy-up' });
  await expect(checklist.getByRole('button', { name: 'See the report' })).toBeVisible({ timeout: 60_000 });
  // The questions now sit above the Inbox: wait for them too. ux-loading-polish restores the strict no-shift check.
  await expect(page.locator('#qs')).toBeVisible({ timeout: 60_000 });
  const before = await first.boundingBox();
  await expect(tidy).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Tidy-up finished/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#qs')).toBeVisible({ timeout: 60_000 });
  const after = await first.boundingBox();
  expect(after?.y).toBe(before?.y);
  expect(after?.x).toBe(before?.x);
});
