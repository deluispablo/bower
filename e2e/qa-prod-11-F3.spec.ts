/**
 * qa-prod-11-F3: on the phone, a pile added while the last tidy-up stopped and was not seen leaves the stopped card's
 * Try again as the one launch on Home: the saved message offers no Tidy up now, even for a moment (phone-stopped-launch;
 * NN/g consistency and standards). Made-up words only.
 */
import { expect, openTidy, test } from './fixtures';

const WORDS = 'Saltmere quiz night on Friday';

test('AC2 qa11 no tidy-up offer beside an unseen stop', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone, where it was found');
  test.setTimeout(60_000);
  await page.goto('/?scenario=fail-run&time=demo');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await openTidy(page);
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
  await expect(page.getByRole('dialog').getByText('The tidy-up stopped').first()).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Escape');
  const card = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: 'The tidy-up stopped' }) });
  await expect(card.getByRole('button', { name: 'Try again', exact: true }), 'setup: the stopped card').toBeVisible();
  // Every button that shows from here on is recorded, so a message that comes and goes is caught.
  await page.evaluate(() => {
    const seen = new Set<string>();
    Object.assign(window, { qa11Seen: seen });
    new MutationObserver(() => document.querySelectorAll('button').forEach((b) => seen.add(b.textContent?.trim() ?? ''))).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  // Home and Add only: a reload would replace the pretend Drive's run.
  await page.getByRole('region', { name: 'Inbox' }).getByRole('button', { name: 'Add a pile', exact: true }).click();
  await page.getByRole('textbox', { name: 'What is this? (optional)', exact: true }).fill(WORDS);
  await page.getByRole('button', { name: 'Add to the inbox', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Inbox' }).getByRole('link', { name: new RegExp(`^${WORDS}`) })).toBeVisible();
  // Positive control: the saved message shows.
  await expect(page.getByTestId('dock-stack').getByText('Your note is in the inbox')).toBeVisible();
  const seen = await page.evaluate(() => [...(window as unknown as { qa11Seen: Set<string> }).qa11Seen]);
  expect(seen, 'AC2: no Tidy up now was ever shown beside the stop').not.toContain('Tidy up now');
  await expect(page.getByRole('button', { name: 'Tidy up now' }), 'AC2: none now').toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Try again', exact: true }), 'AC2: Try again stays').toBeVisible();
});
