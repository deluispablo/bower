/**
 * Round eight: what the evaluator found after round six. Each test pins one
 * entry of the QA list with "task": "qa-8", on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, openTidy, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

test('the page menu on the phone renames a note', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone page menu');
  await open(page, '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md');
  await page.getByRole('button', { name: 'More for Flat 3, 12 Larkspur Lane' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click();
  const box = page.getByRole('dialog', { name: 'Rename' }).getByRole('textbox');
  await expect(box).toHaveValue('Flat 3, 12 Larkspur Lane');
  await box.fill('Flat 3 on Larkspur');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/note\/Projects\/Flat%20hunt\/Flat%203%20on%20Larkspur\.md/);
});



test('after Delete the tree keeps its place, and Undo brings the row back to the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(tree).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('status').getByText(/Lease draft(\.pdf)? is in your Drive's Bin/)).toBeVisible();
  await expect(tree).toHaveAttribute('aria-activedescendant', /^row-Projects%2FFlat%20hunt%2F/);
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status').getByText(/Lease draft(\.pdf)? is back/)).toBeVisible();
  await expect(tree).toHaveAttribute('aria-activedescendant', 'row-Projects%2FFlat%20hunt%2FLease%20draft.pdf');
  await expect(tree).toBeFocused();
});

test('focus after a stopped run is put away stays in the page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop side panel');
  await page.addInitScript(() => localStorage.setItem('bower:prefs', JSON.stringify({ rightOpen: true })));
  for (const where of ['home', 'panel'] as const) {
    await open(page, '/', 'fail-run');
    await openTidy(page);
    await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
    await expect(page.getByRole('dialog').getByText('The tidy-up stopped').first()).toBeVisible({ timeout: 8000 });
    await page.keyboard.press('Escape');
    if (where === 'home') await page.getByRole('alert').getByRole('button', { name: 'Got it' }).click();
    else await page.getByRole('complementary').getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id), { message: where }).toBe('main');
  }
});

test('the inbox reads the same in the tree and on Home: same order, same names', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree next to Home');
  // Inbox open in the tree from the start, as the tree keeps it: pressing its row on Home would open it and remount Home.
  await page.addInitScript(() => localStorage.setItem('bower:open', JSON.stringify(['Projects', 'Areas', 'Projects/Flat hunt', 'Inbox'])));
  await open(page, '/');
  const before = await page.evaluate(() => history.length);
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  const rows = tree.locator('[data-path^="Inbox/"]');
  await expect(rows.first()).toBeVisible();
  const start = (t: string): string => t.trim().slice(0, 14).toLowerCase();
  const inTree = (await rows.evaluateAll((els) => els.filter((e) => (e.getAttribute('data-path') ?? '').split('/').length === 2).map((e) => e.querySelector('[class*="name"]')?.textContent ?? ''))).map(start);
  const homePiles = page.locator('main a[href*="/pile/"] [class*="pileText"]');
  await page.getByRole('region', { name: 'Inbox' }).getByRole('button', { name: /^and \d+ more$/ }).click();
  expect(await page.evaluate(() => history.length), 'the tree step navigated nowhere: one mounted Home').toBe(before);
  expect(inTree.length).toBeGreaterThan(1);
  // Web-first: retries until Home's list reads the tree's names in order (playwright.dev/docs/test-assertions#auto-retrying-assertions).
  const literal = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(homePiles).toHaveText(inTree.map((t) => new RegExp(`^\\s*${literal(t)}`, 'i')));
  // A lone file is named as the tree names it: no extension (its kind shows beside it).
  for (const t of await homePiles.allTextContents()) expect(t).not.toMatch(/\.[A-Za-z0-9]{2,5}$/);
});

test('starting again in first sign-in asks for the folder again', async ({ page }) => {
  await open(page, '/', 'first');
  await page.getByRole('button', { name: 'Make my Bower folder' }).click({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Demo situations' }).click();
  await page.getByRole('button', { name: 'Start this situation again' }).click();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('heading', { name: 'Where Bower keeps things' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Make my Bower folder' })).toBeEnabled();
});

test('deleting the account and coming back: one name for it, and a fresh start', async ({ page }) => {
  await open(page, '/settings');
  await expect(page.getByText('Delete your Bower account', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete your Bower account?' }).getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('status').getByText(/Your account is gone/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL(/\/welcome/, { timeout: 10_000 });
  // The old folder is still in the Drive, and still needs the person's yes before it is linked again.
  await expect(page.getByRole('heading', { name: 'Where Bower keeps things' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Make my Bower folder' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({ timeout: 15_000 });
});

test('a saved link opens its web page, and a filed file is not promised a reading', async ({ page }) => {
  await open(page, '/note/Inbox/curry-clipping.example.url');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('curry-clipping.example');
  const web = page.getByRole('link', { name: 'Open the web page' });
  await expect(web).toHaveAttribute('href', 'https://curry-clipping.example');
  await expect(web).toHaveAttribute('target', '_blank');
  await expect(page.getByText(/reads files like this one in a tidy-up/)).toBeVisible();
  await open(page, '/note/Projects/Flat%20hunt/Lease%20draft.pdf');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Lease draft/);
  await expect(page.getByText(/reads files like this one in a tidy-up/)).toHaveCount(0);
});

test('tabs come back after a reload', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop tabs');
  await open(page, '/');
  await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open in a new tab' }).click();
  await expect(page.locator('[data-tab]')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.locator('[data-tab]')).toHaveCount(2);
  await expect(page.locator('[data-tab]').last()).toContainText(/Lease draft/);
});

test('Try again opens the tidy-up', async ({ page }) => {
  await open(page, '/', 'fail-run');
  await openTidy(page);
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await expect(page.getByRole('dialog').getByText('The tidy-up stopped').first()).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('alert').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('the palette is named once', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the keyboard palette');
  await open(page, '/');
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  // The box inside says what to type, not the dialog's name again.
  await expect(dialog.getByRole('combobox', { name: 'Command palette' })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Search your notes, or type a command' })).toBeVisible();
});
