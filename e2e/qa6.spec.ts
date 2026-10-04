/**
 * Round six: what the review of round five found. Each test pins one entry of
 * harness/features.json with "task": "qa-6", on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
void isFake;

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
  await expect(page.getByRole('status').getByText(/Moved Lease draft\.pdf to Areas \/ Documents/)).toBeVisible();
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

test("Escape on a new note's name takes it back", async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /^Resources/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New note' }).click();
  await page.keyboard.type('Soup ideas');
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/\/note\//);
  await expect(tree.getByRole('treeitem', { name: /^(Untitled|Soup ideas)/ })).toHaveCount(0);
});
