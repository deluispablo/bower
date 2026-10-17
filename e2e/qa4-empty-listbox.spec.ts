/**
 * qa4-empty-listbox (qa-4 Codex F4, accessibility): Search (phone) and the command palette (desktop) with nothing found
 * pass axe WCAG 2.2: the "Nothing called" message is a status outside the listbox of suggestions, and its "Clear the
 * search" button (qa6-search-help) sits outside both.
 */
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';

const NOTHING = 'Nothing called "zzzz-no-such-note-qa4" in your notes or their names. Try fewer letters.';

test('qa4-empty-listbox: AC3 empty-search-axe: nothing found is said in a status, and the dialog passes axe', async ({ page }) => {
  await page.goto('/?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await page.getByRole('button', { name: /Search your notes/ }).first().click();
  const dialog = page.getByRole('dialog');
  // Positive control: a word that is there gives an option in the listbox.
  await dialog.getByRole('combobox').fill('curry');
  await expect(dialog.getByRole('listbox').getByRole('option').first()).toBeVisible();
  await dialog.getByRole('combobox').fill('zzzz-no-such-note-qa4');
  await expect(dialog.getByText(NOTHING)).toBeVisible();
  await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
  await expect(dialog.getByRole('status')).toHaveText(NOTHING);
  await expect(dialog.getByRole('listbox').getByText(NOTHING)).toHaveCount(0);
  const clear = dialog.getByRole('button', { name: 'Clear the search' });
  await expect(dialog.getByRole('status').getByRole('button')).toHaveCount(0);
  await clear.click();
  await expect(dialog.getByRole('combobox')).toHaveValue('');
  await expect(dialog.getByRole('combobox')).toBeFocused();
  // By keyboard: Tab to the button, Enter clears (cmdk must not swallow it) and the box has the keyboard back.
  await dialog.getByRole('combobox').fill('zzzz-no-such-note-qa4');
  await expect(clear).toBeVisible();
  await page.keyboard.press('Tab');
  if (!(await clear.evaluate((el) => el === document.activeElement))) await page.keyboard.press('Tab'); // the phone has Cancel first
  await expect(clear).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('combobox')).toHaveValue('');
  await expect(dialog.getByRole('combobox')).toBeFocused();
});
