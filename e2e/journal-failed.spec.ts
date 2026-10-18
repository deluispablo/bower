/**
 * c2-create-by-id round 5 (DECISIONS main e1c4a22, TL-P4-14 addendum 15): a journal line Drive refuses while nobody
 * waits on it is shown once in what failed, on a phone too, through the same component as the desktop's side panel.
 */
import { expect, isFake, test } from './fixtures';

test('a journal line refused in the background shows once in what failed on a phone', async ({ page, isMobile, allowConsole }) => {
  test.skip(!isFake, 'the pretend Drive refuses the line in this situation');
  test.skip(!isMobile, 'the phone layout');
  allowConsole(/offline|Google Drive didn't answer|refused/i, 'the situation keeps the line waiting, then Drive refuses it');
  await page.goto('/bower?scenario=journal-refused&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await page.getByRole('radio', { name: 'A rule' }).click();
  await page.getByRole('button', { name: 'anything from the dentist goes in health' }).click();
  await page.getByRole('button', { name: 'Keep this rule' }).click();
  // The line waits on this device; then, back online, Drive refuses it for good while nobody waits on it.
  await page.evaluate(() => {
    (window as unknown as { __refuseJournal?: () => void }).__refuseJournal?.();
    window.dispatchEvent(new Event('online'));
  });
  const main = page.locator('main');
  await expect(main.getByText("Bower couldn't keep that rule.")).toHaveCount(1, { timeout: 8000 });
  await expect(main.getByText('New rule: "anything from the dentist goes in health"')).toBeVisible();
  await main.getByRole('button', { name: 'Put it away' }).click();
  await expect(main.getByText("Bower couldn't keep that rule.")).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('heading', { name: 'Ask Bower' })).toBeVisible();
  await expect(main.getByText("Bower couldn't keep that rule.")).toHaveCount(0);
});
