/** Regression checks from the independent P2 review and phone evaluation. */
import { expect, test } from './fixtures';

for (const type of ['note', 'folder'] as const) {
  test(`phone creation refuses a leading dot and retries a dotted name (${type})`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the phone page menu and NameSheet');
    await page.goto('/files/Resources/Cooking?scenario=default&time=instant');
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    const title = type === 'note' ? 'New note' : 'New folder';
    const make = type === 'note' ? 'Make the note' : 'Make the folder';
    await page.getByRole('button', { name: 'More for Cooking', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: title, exact: true }).click();
    const sheet = page.getByRole('dialog', { name: title, exact: true });
    await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill(type === 'note' ? '.Garden.md' : '.Garden');
    await sheet.getByRole('button', { name: make, exact: true }).click();
    await expect(page.getByRole('status').getByText('A name cannot start with a dot.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/files\/Resources\/Cooking(?:\?|$)/);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Cooking');
    await expect(sheet).toBeHidden();
    // NameSheet closes before saving; reopen the existing menu to retry.
    await page.getByRole('button', { name: 'More for Cooking', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: title, exact: true }).click();
    await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill('Garden.2026');
    await sheet.getByRole('button', { name: make, exact: true }).click();
    await expect(page).toHaveURL(type === 'note' ? /\/note\/Resources\/Cooking\/Garden\.2026\.md(?:\?|$)/ : /\/files\/Resources\/Cooking\/Garden\.2026(?:\?|$)/);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Garden.2026');
  });
}
