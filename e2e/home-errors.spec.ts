import { expect, isFake, test } from './fixtures';

// TL-P4-13 (home-errors-shown). The full read of the piles fails after the listing answered: Home says why where the
// Inbox is, lists nothing it cannot vouch for, and a retry brings the piles back.
test('a failed inbox read says why on Home', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the pretend Drive fails the full read in this situation');
  allowConsole(/inbox read failed/, 'the situation fails the full read on purpose');
  await page.goto('/?scenario=inbox-read-fails&time=instant');
  const inbox = page.getByRole('region', { name: 'Inbox' });
  await expect(inbox.getByRole('alert')).toContainText('Bower could not read your inbox. Try again.');
  await expect(inbox.getByRole('button', { name: /^Tidy up/ })).toHaveCount(0);
  await expect(inbox.locator('a[href^="/pile/"]')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __healInboxRead: () => void }).__healInboxRead());
  await inbox.getByRole('button', { name: 'Try again' }).click();
  await expect(inbox.locator('a[href^="/pile/"]').first()).toBeVisible();
  await expect(inbox.getByRole('alert')).toHaveCount(0);
});
