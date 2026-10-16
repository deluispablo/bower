/**
 * qa4-empty-listbox (qa-4 Codex F4, accessibility): Search (phone) and the command palette (desktop) with nothing found
 * pass axe WCAG 2.2: the "Nothing by that name" message is a status outside the listbox of suggestions.
 */
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';

test('qa4-empty-listbox: AC3 empty-search-axe: nothing found is said in a status, and the dialog passes axe', async ({ page }) => {
  await page.goto('/?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await page.getByRole('button', { name: /Search your notes/ }).first().click();
  const dialog = page.getByRole('dialog');
  // Positive control: a word that is there gives an option in the listbox.
  await dialog.getByRole('combobox').fill('curry');
  await expect(dialog.getByRole('listbox').getByRole('option').first()).toBeVisible();
  await dialog.getByRole('combobox').fill('zzzz-no-such-note-qa4');
  await expect(dialog.getByText('Nothing by that name or in your notes.')).toBeVisible();
  await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
  await expect(dialog.getByRole('status')).toHaveText('Nothing by that name or in your notes.');
  await expect(dialog.getByRole('listbox').getByText('Nothing by that name or in your notes.')).toHaveCount(0);
});
