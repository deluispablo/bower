import { resize } from './viewport';
/**
 * Round six: what the review of round five found. Each test pins one entry of
 * the QA list with "task": "qa-6", on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
void isFake;

test("Escape on a new folder's name takes it back", async ({ page }) => {
  await resize(page, { width: 1280, height: 900 });
  await open(page, '/files');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  const resources = tree.locator('[data-path="Resources"]');
  await expect(resources).toBeVisible();
  const openerId = await resources.getAttribute('id');
  expect(openerId).toBeTruthy();
  await resources.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
  const name = tree.getByRole('textbox', { name: 'New folder in Resources', exact: true });
  const draft = tree.getByRole('treeitem').filter({
    has: page.getByRole('textbox', { name: 'New folder in Resources', exact: true }),
  });
  await expect(name).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('');
  await expect(name).toHaveAttribute('placeholder', 'Name');
  await expect(draft).toHaveCount(1);
  const rowsWithoutDraft = await tree.getByRole('treeitem').count() - 1;
  await expect(tree.locator('[data-path="Resources/New folder"]')).toHaveCount(0);
  await name.fill('Soup ideas');
  await name.press('Escape');
  await expect(draft).toHaveCount(0);
  await expect(tree.getByRole('treeitem')).toHaveCount(rowsWithoutDraft);
  await expect(tree.locator('[data-path="Resources/New folder"]')).toHaveCount(0);
  await expect(tree.locator('[data-path="Resources/Soup ideas"]')).toHaveCount(0);
  await expect(tree.getByRole('textbox')).toHaveCount(0);
  await expect(tree).toBeFocused();
  await expect(tree).toHaveAttribute('aria-activedescendant', openerId ?? '');
  await expect(page).toHaveURL(/\/files(?:\?|$)/);
  await expect(page.getByRole('main').getByRole('heading', { name: 'Your Bower folder', exact: true })).toBeVisible();
  // Positive control: the same entry makes the named folder when Enter confirms it.
  await resources.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
  await expect(name).toBeFocused();
  await name.fill('Soup ideas');
  await name.press('Enter');
  await expect(tree.locator('[data-path="Resources/Soup ideas"]')).toHaveCount(1);
  await expect(tree.getByRole('treeitem')).toHaveCount(rowsWithoutDraft + 1);
  await expect(tree.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('heading', { name: 'Soup ideas', exact: true })).toBeVisible();
});

test('one counting rule for folders', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the folder cards of the desktop');
  await open(page, '/files');
  const card = await page.getByRole('link', { name: /^Projects/ }).first().innerText();
  await page.getByRole('link', { name: /^Projects/ }).first().click();
  await expect(page.locator('main header p').first()).toHaveText(/\d+ things?/);
  const header = await page.locator('main header p').first().innerText();
  expect(card).toContain(header);
  const row = page.locator('main ul a').filter({ hasText: /^Flat hunt/ }).first();
  const rowCount = /(\d+ things?)/.exec(await row.innerText())?.[1] ?? '';
  await row.click();
  await expect(page.locator('main header p').first()).toHaveText(rowCount);
});

test('Enter in an empty Move to does nothing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('status').getByText(/Moved Lease draft/)).toHaveCount(0);
});

test('Enter moves only when one folder matches', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.getByLabel('Find a folder').fill('re');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText(/Several folders match/)).toBeVisible();
  await page.getByLabel('Find a folder').fill('Documents');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').getByText(/Moved Lease draft to Areas \/ Documents/)).toBeVisible();
});

test('after a move or a Bin the tree keeps the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click();
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.getByLabel('Find a folder').fill('Documents');
  await page.keyboard.press('Enter');
  await expect(tree).toBeFocused();
  await tree.getByRole('treeitem', { name: /^Car/ }).click();
  await page.keyboard.press('Delete');
  await page.getByRole('dialog').getByRole('button', { name: 'Put it in the Bin' }).click();
  await expect(tree).toBeFocused();
});

test("Shift+F10 opens the row's menu", async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Move to…' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tree).toBeFocused();
  await page.keyboard.press('ContextMenu');
  await expect(page.getByRole('menuitem', { name: 'Move to…' })).toBeVisible();
});

test('signing out and in sticks', async ({ page }) => {
  await open(page, '/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  // Back into the app by its address: still signed out.
  await page.goto('/settings');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  // Signing in goes back where you were going: Settings.
  await expect(page.getByText('you@example.com')).toBeVisible();
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByText('you@example.com')).toBeVisible();
});

test('first sign-in can be chosen again', async ({ page }) => {
  await open(page, '/', 'first');
  await page.getByRole('button', { name: 'Show me around' }).click({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Demo situations' }).click();
  await page.getByLabel('Alex, with piles waiting').click();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await page.getByRole('button', { name: 'Demo situations' }).click();
  await page.getByLabel('First sign-in: no Bower folder yet').click();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('heading', { name: 'Your folder is ready' })).toBeVisible({ timeout: 10_000 });
});

test('the bookmark toast says where bookmarks are', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Bookmark' }).click();
  await expect(page.getByRole('status').getByText('Bookmarked. Find it in the Bookmarks tab.')).toBeVisible();
});

test('the tree names piles as Home does', async ({ page, isMobile }) => {
  await open(page, isMobile ? '/files' : '/');
  const tree = page.getByRole('tree').first();
  await tree.getByRole('treeitem', { name: /^Inbox/ }).click();
  await expect(tree.getByRole('treeitem', { name: /^Receipts from the Saltmere weekend/ })).toBeVisible();
  await expect(tree.getByRole('treeitem', { name: /^\d{4}-\d{2}-\d{2} / })).toHaveCount(0);
});

for (const how of ['Escape', 'Close'] as const) {
  test(`closing a stopped tidy-up is the same however you close it (${how})`, async ({ page }) => {
    await open(page, '/', 'fail-run');
    await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
    await expect(page.getByRole('dialog').getByText('The tidy-up stopped').first()).toBeVisible({ timeout: 8000 });
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // However it was closed, Home keeps the card with Try again until "Got it".
    await expect(page.getByRole('alert').getByRole('heading', { name: 'The tidy-up stopped' }), how).toBeVisible();
  });
}

test('a stopped tidy-up can be put away', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop side panel');
  await open(page, '/', 'fail-run');
  await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await expect(page.getByRole('dialog').getByText('The tidy-up stopped').first()).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('Escape');
  const panel = page.getByRole('complementary').filter({ hasText: 'Tell Bower something' });
  await panel.getByRole('button', { name: 'Put it away' }).click();
  await expect(panel.getByText(/tidy-up stopped/)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(panel.getByText(/tidy-up stopped/)).toHaveCount(0);
});

test('a saved link in the timeline is a link', async ({ page }) => {
  await open(page, '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md');
  const link = page.locator('section[aria-labelledby="tl"]').getByRole('link', { name: 'flat-listing.example' });
  await expect(link).toHaveAttribute('href', 'https://flat-listing.example');
  await expect(link).toHaveAttribute('target', '_blank');
});



test('the notifications row says when they are blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', { value: { permission: 'denied', requestPermission: () => Promise.resolve('denied') } });
  });
  await open(page, '/settings');
  await expect(page.getByText('Blocked in this browser. Allow them in its settings to turn this on.')).toBeVisible();
});

test('a file added again after a reload is not doubled', async ({ page }) => {
  await open(page, '/add', 'empty', 'instant');
  const file = { name: 'Boiler service.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF made up') };
  await page.locator('input[type=file][multiple]').setInputFiles(file);
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByText('Add this file again')).toBeVisible();
  await page.locator('input[type=file][multiple]').setInputFiles(file);
  await expect(page.getByText('Add this file again')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'In this pile' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Put 1 thing in the inbox/ })).toBeVisible();
});

test("the run's end shows one bird and no stray card", async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Done\. 15 things filed/).last()).toBeVisible({ timeout: 5000 });
  await expect(dialog.locator('[data-spot="note"]')).toHaveCount(0);
  // Birds of the page under the sheet hide while the sheet's bird is on.
  const pageBirds = await page.evaluate(() =>
    [...(document.getElementById('main')?.querySelectorAll('[data-bird]') ?? [])].filter((b) => getComputedStyle(b).visibility !== 'hidden').length,
  );
  expect(pageBirds).toBe(0);
});

test('deleting the account signs out and forgets', async ({ page }) => {
  await open(page, '/settings');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const ask = page.getByRole('dialog', { name: 'Delete your Bower account?' });
  await expect(ask).toContainText('Your Bower folder and everything in it stay in your Drive.');
  await ask.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('status').getByText(/Your account is gone/)).toBeVisible();
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('on the phone a note has its menu', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone');
  await open(page, '/note/Resources/Cooking/Lemon%20tart.md');
  await page.getByRole('button', { name: 'More for Lemon tart' }).click();
  const sheet = page.getByRole('dialog');
  for (const item of ['Rename', 'Move to…', 'Bookmark', 'Move to Bin']) await expect(sheet.getByRole('button', { name: item })).toBeVisible();
  await page.keyboard.press('Escape');
  await open(page, '/files/Resources/Cooking');
  await page.getByRole('button', { name: 'More for Cooking' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Move to…' })).toBeVisible();
});
