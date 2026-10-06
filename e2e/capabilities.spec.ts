/**
 * One scripted journey per capability (TL-P2-38, TL-P2-40): the app asks,
 * the tidy-up changes real notes, and the app shows the result with links to
 * them. `run-result-links` runs on demo and fake; the C04, C05 and C11
 * journeys run on the pretend Drive, where the effects are files.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const NOTE_WORDS = 'Ask the landlord about the heating';

const open = async (page: Page, path: string, scenario = 'empty', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const inbox = (page: Page) => page.getByRole('region', { name: 'Inbox' });

/** Puts a note with no things in the inbox, from Add. */
async function addNote(page: Page, words: string): Promise<void> {
  await open(page, '/add');
  await page.getByRole('textbox', { name: 'What is this?' }).fill(words);
  await page.getByRole('button', { name: 'Put the note in the inbox' }).click();
  await expect(inbox(page).getByRole('link', { name: new RegExp(words) })).toBeVisible();
}

/** Tidies up from Home and waits, with the sheet open, for the result. */
async function tidyUp(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Tidy up \d+ things?$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things?$/ }).click();
  await expect(page.getByRole('dialog').getByText(/^Done\./).last()).toBeVisible({ timeout: 20_000 });
}

test('the result links what it made', async ({ page }) => {
  test.setTimeout(60_000);
  await addNote(page, NOTE_WORDS);
  await tidyUp(page);
  const sheet = page.getByRole('dialog');
  const made = sheet.getByRole('list', { name: 'New notes' });
  const updated = sheet.getByRole('list', { name: 'Brought up to date' });
  await expect(made.getByRole('link', { name: NOTE_WORDS, exact: true })).toBeVisible();
  await expect(updated.getByRole('link')).toHaveText(['Flat hunt', 'Job hunt']);
  // A link opens its note and closes the sheet.
  await updated.getByRole('link', { name: 'Flat hunt', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Flat hunt' })).toBeVisible();
  // Home's result card lists the same links until it is put away.
  await page.getByRole('link', { name: /^Home/ }).first().click();
  const card = page.getByRole('region', { name: /filed/ });
  await expect(card.getByRole('list', { name: 'New notes' }).getByRole('link')).toHaveText([NOTE_WORDS]);
  await expect(card.getByRole('list', { name: 'Brought up to date' }).getByRole('link')).toHaveText(['Flat hunt', 'Job hunt']);
  await card.getByRole('link', { name: NOTE_WORDS, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: NOTE_WORDS })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Written from a note you added.');
});
