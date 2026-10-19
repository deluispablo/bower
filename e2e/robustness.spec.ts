import type { Page } from '@playwright/test';
import { expect, isFake, openTidy, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'demo') => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const responsive = (page: Page) =>
  Promise.race([page.evaluate(() => 'ok'), new Promise((r) => setTimeout(() => r('frozen'), 3000))]);

test('a failed tidy-up says why, never freezes, and trying again works', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/', 'fail-run');
  await openTidy(page);
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
  await expect(page.getByRole('dialog').getByText(/Nothing was moved|The tidy-up stopped before changing anything/)).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(5000);
  expect(await responsive(page)).toBe('ok');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alert').getByRole('heading', { name: 'The tidy-up stopped' })).toBeVisible();
  await page.getByRole('alert').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/15 things filed/).first()).toBeVisible({ timeout: 30_000 });
  expect(await responsive(page)).toBe('ok');
});

test('the demo panel is reachable offline and leads back', async ({ page, allowConsole }) => {
  allowConsole(/BowerError: You're offline\./, 'offline scenario');
  await page.goto('/?scenario=offline&time=instant');
  await expect(page.getByText("You're offline")).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Demo situations' }).click();
  await page.getByLabel('Alex, with piles waiting').click();
  await expect(page.getByRole('heading', { name: /Hello, Alex/ })).toBeVisible({ timeout: 8000 });
});

test('a sample pile and a note-only pile go to the inbox and get filed', async ({ page }) => {
  test.skip(isFake, 'demo-only control: the sample piles live in the demo panel');
  test.setTimeout(60_000);
  await open(page, '/', 'empty', 'instant');
  await page.getByRole('button', { name: 'Demo situations' }).click();
  await page.getByRole('button', { name: 'Car insurance renewal' }).click();
  await page.getByRole('button', { name: 'Just a note' }).click();
  await page.getByRole('complementary', { name: 'Demo situations' }).getByRole('button', { name: 'Close' }).click();
  const inbox = page.getByRole('region', { name: 'Inbox' });
  await expect(inbox.getByRole('link', { name: /Car insurance renewal/ })).toBeVisible();
  await expect(inbox.getByRole('link', { name: /bins go out/i })).toBeVisible();
  await openTidy(page);
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 3 things$/ }).click();
  await expect(page.getByRole('dialog').getByText(/Done\. 3 things filed/).last()).toBeVisible({ timeout: 15_000 });
});

test('a pile note can be changed before the tidy-up', async ({ page }) => {
  await open(page, '/pile/p1');
  const box = page.getByRole('textbox', { name: 'What is this?' });
  await box.fill('Job offer and a flat near it. Compare the commute and the rent.');
  await page.getByRole('button', { name: 'Save the note' }).click();
  await expect(page.getByRole('status').getByText(/Note saved/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Compare the commute and the rent/);
});

test('a note-only pile can be added from Add', async ({ page }) => {
  await open(page, '/add', 'empty', 'instant');
  await page.getByRole('textbox', { name: 'What is this?' }).fill('Ask the landlord about the heating');
  await page.getByRole('button', { name: 'Add to the inbox' }).click();
  await expect(page.getByRole('region', { name: 'Inbox' }).getByRole('link', { name: /Ask the landlord about the heating/ })).toBeVisible();
});

test('letting Bower read your changes gives a short run with no replay', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, '/bower', 'default', 'instant');
  await page.getByRole('radio', { name: 'A rule' }).click();
  await page.getByRole('button', { name: 'anything from the dentist goes in health' }).click();
  await page.getByRole('button', { name: 'Keep this rule' }).click();
  await page.getByRole('link', { name: /Home/ }).first().click();
  await page.getByRole('button', { name: /Let Bower read (it|them) now/ }).click();
  await expect(page.getByText(/Done\. Bower read your changes/).last()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Watch what Bower did' })).toHaveCount(0);
});

test('back closes an open sheet and leaves the page where it was', async ({ page }) => {
  await open(page, '/files', 'running', 'real');
  await page.getByRole('link', { name: /^Home/ }).first().click();
  await expect(page).toHaveURL(/\/(\?|$)/);
  await page.getByRole('button', { name: /Search your notes/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/(\?|$)/);
});

test('a crafted address after sign-in lands on Home, never off the app', async ({ page }) => {
  await page.goto('/sign-in?from=%2F%5Cexample.com&scenario=signed-out&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: /Hello, Alex/ })).toBeVisible();
});

test('Add keeps its links when you leave and come back', async ({ page, isMobile }) => {
  await open(page, '/add', 'empty', 'instant');
  await page.getByRole('textbox', { name: 'Paste a link' }).fill('bbc.example/news');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByRole('link', { name: /^Home/ }).first().click();
  if (isMobile) await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Add' }).click();
  else await page.getByRole('link', { name: 'Add a pile' }).first().click();
  await expect(page.getByRole('button', { name: /Add 1 thing to the inbox/ })).toBeVisible();
});

test('Undo after moving the open note brings the page back with it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop tree');
  await open(page, '/note/Resources/Cooking/Lemon%20tart.md', 'default', 'instant');
  await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /Lemon tart/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.getByLabel('Find a folder').fill('Ideas');
  await page.getByRole('button', { name: /^Ideas/ }).click();
  await expect(page).toHaveURL(/Ideas\/Lemon%20tart\.md/);
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(page).toHaveURL(/Cooking\/Lemon%20tart\.md/);
  await expect(page.getByRole('heading', { name: 'Lemon tart', level: 1 })).toBeVisible();
});

test('a tab or newline in the sign-in address still lands on Home', async ({ page }) => {
  for (const from of ['%2F%09%2Fexample.com', '%2F%0A%2Fexample.com']) {
    await page.goto(`/sign-in?from=${from}&scenario=signed-out&time=instant`);
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('heading', { name: /Hello, Alex/ })).toBeVisible();
  }
});



test('clicking away from a refused name cancels without a second toast', async ({ page, isMobile, allowConsole }) => {
  test.skip(isMobile, 'desktop tree');
  allowConsole(/BowerError: There is already a "Flat 7, Cobble Row" here\./, 'duplicate name rejected');
  await open(page, '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md', 'default', 'instant');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Flat 3, 12 Larkspur/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const box = page.getByLabel(/New name for Flat 3/);
  await box.fill('Flat 7, Cobble Row');
  await box.press('Enter');
  await expect(page.getByRole('status').getByText(/There is already/)).toHaveCount(1);
  await page.getByRole('heading', { level: 1 }).click();
  await page.waitForTimeout(300);
  await expect(page.getByRole('status').getByText(/There is already/)).toHaveCount(1);
  await expect(tree.getByRole('treeitem', { name: /Flat 3, 12 Larkspur/ })).toBeVisible();
});

test('after a reload an added file asks to be added again', async ({ page }) => {
  await open(page, '/add', 'empty', 'instant');
  await page.locator('input[type=file][multiple]').setInputFiles({ name: 'Boiler service.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF made up') });
  await expect(page.getByRole('button', { name: /Add 1 thing to the inbox/ })).toBeVisible();
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByText('Add this file again')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to the inbox' })).toBeDisabled();
});

test('Add warns about a file you already have', async ({ page }) => {
  await open(page, '/add', 'default', 'instant');
  const lease = { name: 'Lease draft.pdf', mimeType: 'application/pdf', buffer: Buffer.from('A made-up pdf for the demo: Lease draft.pdf.\n') };
  await page.locator('input[type=file][multiple]').setInputFiles(lease);
  await expect(page.getByText('You already have this in Projects / Flat hunt.')).toBeVisible();
  await page.getByRole('button', { name: 'Leave it out' }).click();
  await expect(page.getByRole('button', { name: 'Add to the inbox' })).toBeDisabled();
  await page.locator('input[type=file][multiple]').setInputFiles(lease);
  await page.getByRole('button', { name: 'Add it anyway' }).click();
  await expect(page.getByText('You already have this in Projects / Flat hunt.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add 1 thing to the inbox/ })).toBeVisible();
});
