import { resize } from './viewport';
/**
 * Round nine: what the review after round eight found. Each test pins one
 * entry of the QA list with "task": "qa-9", on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const toast = (page: Page, text: string | RegExp) => page.getByRole('status').getByText(text);

test('the rename name sheet keeps one note extension', async ({ page }) => {
  await resize(page, { width: 375, height: 900 });
  await open(page, '/note/Resources/Cooking/Lemon%20tart.md');
  await page.getByRole('button', { name: 'More for Lemon tart', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rename', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Rename', exact: true });
  await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill('Tyres.md');
  await sheet.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/note\/Resources\/Cooking\/Tyres\.md(?:\?|$)/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Tyres');
  await page.getByRole('button', { name: 'More for Tyres', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(sheet.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Tyres');
});

test('the New folder name sheet preserves dots and explains slashes', async ({ page }) => {
  await resize(page, { width: 375, height: 900 });
  await open(page, '/files/Resources/Cooking');
  await page.getByRole('button', { name: 'More for Cooking', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New folder', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'New folder', exact: true });
  const name = sheet.getByRole('textbox', { name: 'Name', exact: true });
  const make = sheet.getByRole('button', { name: 'Make the folder', exact: true });
  await name.fill('Tyres.md');
  await make.click();
  await expect(page).toHaveURL(/\/files\/Resources\/Cooking\/Tyres\.md(?:\?|$)/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Tyres.md');
  await page.getByRole('button', { name: 'More for Tyres.md', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New folder', exact: true }).click();
  await name.fill('a/b');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(sheet.getByText('Names cannot have slashes; Bower used a dash.', { exact: true })).toBeVisible();
  await make.click();
  await expect(page).toHaveURL(/\/files\/Resources\/Cooking\/Tyres\.md\/a-b(?:\?|$)/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('a-b');
  await expect(page.getByRole('status').getByText('Names cannot have slashes; Bower used a dash.', { exact: true })).toBeVisible();
});

test('on screen: answering a question is confirmed in the words of the choice', async ({ page }) => {
  await open(page, '/');
  const q = page.locator('section[aria-labelledby="qs"] li').filter({ hasText: /Keep both\?/ });
  await q.getByRole('button', { name: 'Keep one' }).click();
  await expect(toast(page, 'You chose "Keep one". Bower does it in the next tidy-up.')).toBeVisible();
});

test('on screen: Add points out an empty file', async ({ page }) => {
  await open(page, '/add');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) });
  await expect(page.getByRole('list', { name: 'In this pile' })).toContainText('This file is empty. Add it anyway, or take it out.');
});

// D02 supersedes the historical successful-omission case: retain the unresolved draft.
test('on screen: an unresolved Add draft stays until its missing file is chosen again', async ({ page }) => {
  await open(page, '/add');
  await page.locator('textarea').first().fill('Papers for the flat');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') });
  await expect(page.getByRole('list', { name: 'In this pile' })).toContainText('scan.pdf');
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('list', { name: 'In this pile' })).toContainText('Add this file again');
  await expect(page.getByRole('button', { name: 'Add to the inbox' })).toBeDisabled();
  await expect(page.locator('textarea').first()).toHaveValue('Papers for the flat');
  await expect(page).toHaveURL(/\/add(?:\?|$)/);
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') });
  await expect(page.getByRole('list', { name: 'In this pile' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'In this pile' })).not.toContainText('Add this file again');
  await page.getByRole('button', { name: 'Add 1 thing to the inbox' }).click();
  await expect(toast(page, '1 thing in the inbox')).toBeVisible();
  await expect(page).toHaveURL(/\/(?:\?|$)/);
});

test('on screen: the result of a tidy-up names the request it did', async ({ page }) => {
  await open(page, '/bower');
  await page.getByRole('radio', { name: 'A request' }).click();
  // qa7-refused-words: a request the run did nothing for is not done; a question it answers is.
  await page.getByLabel('Your request').fill('Which flat is closest to Ferrowick?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: /Let Bower do it now/ }).first().click();
  await expect(page.getByRole('dialog')).toContainText('"Which flat is closest to Ferrowick?" done', { timeout: 10_000 });
});

test('a link follows a rename through a tidy-up', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/note/Projects/Flat%20hunt/Flat%207%2C%20Cobble%20Row.md');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.focus();
  await page.keyboard.press('F2');
  const input = page.getByLabel(/New name for Flat 7/);
  await input.fill('Cobble Row flat');
  await input.press('Enter');
  await expect(tree.getByRole('treeitem', { name: /Cobble Row flat/ })).toBeVisible();
  await page.locator('footer').getByRole('button').first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await expect(page.getByRole('dialog').getByText(/15 things filed/).last()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await tree.getByRole('treeitem', { name: /Flat 3, 12 Larkspur Lane/ }).click();
  await page.getByRole('main').getByRole('link', { name: 'Cobble Row flat' }).first().click();
  await expect(page).toHaveURL(/\/note\/Projects\/Flat%20hunt\/Cobble%20Row%20flat\.md/);
  await expect(page.getByText('Flat 3, 12 Larkspur Lane').first()).toBeVisible();
});

test('Undo twice on the same thing gives its row the keyboard both times', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  for (let i = 0; i < 2; i++) {
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.keyboard.press('Escape');
    await expect(tree).toBeFocused();
    await page.keyboard.press('Delete');
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).last().click();
    await expect(tree, `time ${i + 1}`).toBeFocused();
    await expect(tree).toHaveAttribute('aria-activedescendant', 'row-Projects%2FFlat%20hunt%2FLease%20draft.pdf');
  }
});



test('Move to: Enter with no folder that matches says so', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.getByLabel('Find a folder').fill('zzz');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('No folder has that name. Type another, or clear the box to see them all.');
});
