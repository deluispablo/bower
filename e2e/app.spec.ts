import { expect, isFake, test } from './fixtures';
import { axeScan } from './axe';

const open = async (page: import('@playwright/test').Page, path: string, scenario = 'default', time = 'instant') => {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 5000 });
};

test('a signed-out visitor lands on the landing, signs in and gets in', async ({ page }) => {
  await open(page, '/', 'signed-out');
  await expect(page).toHaveURL(/\/landing\/$/);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: /Hello, Alex/ })).toBeVisible();
});

test('first sign-in makes the five folders', async ({ page }) => {
  await open(page, '/', 'first');
  await expect(page.getByRole('heading', { name: 'Where Bower keeps things' })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Make my Bower folder' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  // The five main folders exist now, as the folder tree shows them.
  const files = page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Files', exact: true });
  if (await files.isVisible()) await files.click();
  for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) {
    await expect(page.getByRole('link', { name: new RegExp(`^${name}`) }).or(page.getByRole('treeitem', { name: new RegExp(`^${name}`) })).first(), name).toBeVisible();
  }
});

test('a tidy-up walks the phases, files the inbox and offers the replay', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: /^Tidy up \d+ things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
  await expect(page.getByRole('dialog').getByText(/Done\. 15 things filed/).last()).toBeVisible();
  await page.getByRole('button', { name: 'Watch what Bower did' }).click();
  await expect(page.getByRole('dialog', { name: 'What Bower did in the tidy-up' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Nothing waiting', { exact: false }).first()).toBeVisible();
});

test('a failed run says why and moves nothing', async ({ page }) => {
  await open(page, '/', 'fail-run');
  await page.getByRole('button', { name: /^Tidy up \d+ things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
  await expect(page.getByRole('dialog').getByText(/Nothing was moved|The tidy-up stopped before changing anything/)).toBeVisible();
});

test('a note shows its properties, current state and timeline', async ({ page }) => {
  await open(page, '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md');
  await expect(page.getByRole('heading', { name: 'Flat 3, 12 Larkspur Lane', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current state' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  await page.getByRole('link', { name: 'Flat 7, Cobble Row' }).first().click();
  await expect(page.getByRole('heading', { name: 'Flat 7, Cobble Row', level: 1 })).toBeVisible();
});

test('a pile can be added', async ({ page }) => {
  await open(page, '/add');
  await page.getByLabel('What is this?').fill('Car insurance renewal');
  await page.getByLabel('Paste a link').fill('https://insurer.example/renewal');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByRole('button', { name: /Add 1 thing to the inbox/ }).click();
  await expect(page.getByRole('region', { name: 'Inbox' }).getByRole('link', { name: /Car insurance renewal/ })).toBeVisible();
});

test.describe('desktop explorer', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('moves a file by keyboard and menu, and undoes it', async ({ page }) => {
    await open(page, '/');
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to…' }).click();
    await page.getByLabel('Find a folder').fill('Home');
    await page.getByRole('button', { name: /^Home/ }).first().click();
    await expect(page.getByRole('status').getByText(/Moved Lease draft to Areas \/ Home/)).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(tree.getByRole('treeitem', { name: /Lease draft/ })).toBeVisible();
  });

  test('renames with F2 and walks the tree with arrows', async ({ page }) => {
    await open(page, '/note/Projects/Flat%20hunt/Flat%207%2C%20Cobble%20Row.md');
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    await tree.focus();
    await page.keyboard.press('F2');
    const input = page.getByLabel(/New name for Flat 7/);
    await input.fill('Flat 7, Cobble Rownue');
    await input.press('Enter');
    await expect(tree.getByRole('treeitem', { name: /Flat 7, Cobble Rownue/ })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(tree).toHaveAttribute('aria-activedescendant', /^row-/);
  });

  test('the command palette opens a note', async ({ page }) => {
    await open(page, '/');
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByPlaceholder('Type a command or a note').fill('budget');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Budget 2026', level: 1 })).toBeVisible();
  });
});

for (const path of ['/', '/files', '/add', '/bower', '/settings', '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md', '/files/Projects/Flat%20hunt']) {
  test(`no serious accessibility problems on ${path}`, async ({ page }) => {
    await open(page, path);
    const r = await axeScan(page, { disableRules: ['region'] });
    const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

test('runs on the source it was asked for', async ({ page }) => {
  await open(page, '/');
  expect(await page.evaluate(() => sessionStorage.getItem('bower:demo:source'))).toBe(isFake ? 'fake' : null);
});

test('a failed start says why and offers to try again', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the Worker answering 500 is the fake source');
  allowConsole(/Worker answered 500/, 'the Worker answers 500 to the first press, on purpose');
  await open(page, '/', 'start-fails');
  await page.getByRole('button', { name: /^Tidy up \d+ things$/ }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
  await expect(sheet.getByRole('alert')).toHaveText("Something went wrong on Bower's side. Try again later.");
  await expect(sheet.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Starting…' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Try again' }).click();
  await expect(sheet.getByText(/Done\. \d+ things filed/).last()).toBeVisible();
});
