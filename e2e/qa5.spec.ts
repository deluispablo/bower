/**
 * Round five: what testing phase 2 found. Each test pins one entry of
 * the QA list (category bug or polish), on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { animationsEnd, expectAxeClean } from './axe';
import { expect, isFake, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

test('after the tour a reload opens the app', async ({ page }) => {
  await open(page, '/', 'first');
  await page.getByRole('button', { name: 'Show me around' }).click({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  // With the folder there (kept by the pretend Drive) Home opens; with no folder the
  // welcome makes it again. Either way a heading shows: no loop.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  void isFake;
});

test('the running situation shows its live phases', async ({ page }) => {
  await open(page, '/', 'running', 'demo');
  await expect(page.getByText(/Writing your notes|Reading \d+ things/).first()).toBeVisible({ timeout: 12_000 });
});

test('an instant tidy-up ends at once', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await expect(page.getByRole('dialog').getByText(/Done\. 15 things filed/).last()).toBeVisible({ timeout: 2500 });
});

test('the run scene ends with an empty inbox', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, '/', 'default', 'demo');
  await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Done\. 15 things filed/).last()).toBeVisible({ timeout: 40_000 });
  await expect(dialog.locator('[data-spot="inbox"]')).toHaveAttribute('data-sheets', '0');
  await expect(dialog.locator('[data-spot="read"]')).toHaveAttribute('data-sheets', '0');
  await expect(dialog.locator('[data-spot="folder"]')).toHaveAttribute('data-filed', '15');
});

test.describe('the explorer from the keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop tree');

  test('after a move the tree keeps keyboard focus', async ({ page }) => {
    await open(page, '/');
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click();
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to…' }).click();
    await page.getByLabel('Find a folder').fill('Documents');
    await page.getByRole('button', { name: /^Documents/ }).first().click();
    await expect(tree).toHaveAttribute('aria-activedescendant', `row-${encodeURIComponent('Areas/Documents/Lease draft.pdf')}`);
    await expect(page.locator(`#row-${CSS_ESCAPE('Areas/Documents/Lease draft.pdf')}`)).toHaveCount(1);
  });

  test('Move to works from the keyboard', async ({ page }) => {
    await open(page, '/');
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to…' }).click();
    await page.getByLabel('Find a folder').fill('Documents');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').getByText(/Moved Lease draft to Areas \/ Documents/)).toBeVisible();
    await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to…' }).click();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('dialog').getByRole('button').filter({ hasText: /\S/ }).first()).toBeFocused();
  });


});

const CSS_ESCAPE = (path: string): string => `row-${encodeURIComponent(path)}`.slice(4).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);

test('the palette finds words inside notes', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: /Search your notes/ }).first().click();
  await page.getByRole('combobox').fill('Tally');
  const hit = page.getByRole('option', { name: /CV insights/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page).toHaveURL(/\/note\/Projects\/Job%20hunt\/CV%20insights\.md/);
});

test('while loading nothing claims to be empty', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop footer and side panel');
  await page.goto('/?scenario=slow&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('footer')).toContainText(/Looking at the inbox|waiting/);
  await expect(page.locator('footer')).not.toContainText('Nothing waiting');
  await expect(page.getByText(/^0 rules$/)).toHaveCount(0);
  await expect(page.locator('footer')).toContainText(/15 things waiting/, { timeout: 15_000 });
});

test('the boot screen follows the saved theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('bower:prefs', JSON.stringify({ theme: 'dark' })));
  await page.goto('/?scenario=default&time=instant');
  await expect.poll(() => page.evaluate(() => document.getElementById('boot') && getComputedStyle(document.getElementById('boot') as HTMLElement).backgroundColor)).toBe('rgb(11, 18, 32)');
});

test('the boot screen follows a saved light theme on a dark system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('bower:prefs', JSON.stringify({ theme: 'light' })));
  await page.goto('/?scenario=default&time=instant');
  await expect.poll(() => page.evaluate(() => document.getElementById('boot') && getComputedStyle(document.getElementById('boot') as HTMLElement).backgroundColor)).toBe('rgb(250, 249, 246)');
});

test('the folders view counts the inbox as Home does', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the phone shows the tree here, which already counts this way');
  await open(page, '/files');
  await expect(page.getByRole('link', { name: /^Inbox/ }).first()).toContainText('15 things');
});

test('a reload on the pretend Drive keeps what you did', async ({ page }) => {
  test.skip(!isFake, 'the demo starts again on every reload, on purpose');
  await open(page, '/bower');
  await page.getByRole('radio', { name: 'A rule' }).click();
  await page.getByRole('button', { name: 'anything from the dentist goes in health' }).click();
  await page.getByRole('button', { name: 'Keep this rule' }).click();
  await expect(page.getByText(/Waiting for the next tidy-up/).first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByText(/anything from the dentist goes in health/).first()).toBeVisible();
});

test('a bookmark to something gone is dropped', async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('bm-set')) {
      localStorage.setItem('bower:bookmarks', JSON.stringify(['Resources/Gone for good.md', 'Resources/Cooking/Lemon tart.md']));
      sessionStorage.setItem('bm-set', '1');
    }
  });
  await open(page, isMobile ? '/files' : '/');
  if (!isMobile) await page.getByRole('tab', { name: 'Bookmarks' }).click();
  await expect(page.getByText('Lemon tart').first()).toBeVisible();
  await expect(page.getByText('Gone for good')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bower:bookmarks'))).not.toContain('Gone for good');
});

test('reading your changes does not look like filing', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, '/bower', 'default', 'demo');
  await page.getByRole('radio', { name: 'A rule' }).click();
  await page.getByRole('button', { name: 'anything from the dentist goes in health' }).click();
  await page.getByRole('button', { name: 'Keep this rule' }).click();
  await page.getByRole('link', { name: /^Home/ }).first().click();
  await page.getByRole('button', { name: /Let Bower read (it|them) now/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Reading your changes', { timeout: 12_000 });
  await expect(dialog).not.toContainText('Putting them away');
  await expect(dialog).not.toContainText('Usually about 5');
  await expect(dialog.locator('[data-spot="folder"]')).toHaveCount(0);
  await expect(dialog.getByText(/Done\. Bower read your changes/).last()).toBeVisible({ timeout: 40_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Just filed' })).toHaveCount(0);
});

test('notifications say why they stay off', async ({ page }) => {
  await page.addInitScript(() => {
    const fake = { permission: 'default', requestPermission: (): Promise<string> => new Promise(() => undefined) };
    Object.defineProperty(window, 'Notification', { value: fake });
  });
  await open(page, '/settings');
  await page.getByRole('switch', { name: 'Tell me when a tidy-up ends' }).click();
  await expect(page.getByRole('status').getByText(/Answer your browser/)).toBeVisible();
});

test('closing the browser question says how to ask again', async ({ page }) => {
  await page.addInitScript(() => {
    const fake = { permission: 'default', requestPermission: (): Promise<string> => Promise.resolve('default') };
    Object.defineProperty(window, 'Notification', { value: fake });
  });
  await open(page, '/settings');
  const sw = page.getByRole('switch', { name: 'Tell me when a tidy-up ends' });
  await sw.click();
  await expect(page.getByRole('status').getByText(/Turn it on again/)).toBeVisible();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
});

test('the landing page opens without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/landing/index.html');
  await expect(page.getByRole('link', { name: 'GitHub' }).first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  expect(errors.filter((e) => !/fonts\.g/.test(e))).toEqual([]);
  // The drawings still get their shapes once the page runs.
  expect(await page.locator('path[d]').count()).toBeGreaterThan(5);
});

test('sign-in offers landing and legal links', async ({ page }) => {
  await open(page, '/sign-in', 'signed-out');
  await expect(page.getByRole('link', { name: 'See how Bower works', exact: true })).toHaveAttribute('href', '/landing/');
  await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute('href', '/privacy');
  await expect(page.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute('href', '/terms');
  await expect(page.getByRole('link', { name: /Run your own Bower/ })).toHaveCount(0);
});

test.describe('the side panel', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop side panel');

  test('the side panel shows what waits and what failed', async ({ page }) => {
    await open(page, '/bower', 'fail-run', 'instant');
    await page.getByRole('radio', { name: 'A rule' }).click();
    await page.getByRole('button', { name: 'anything from the dentist goes in health' }).click();
    await page.getByRole('button', { name: 'Keep this rule' }).click();
    await page.getByRole('radio', { name: 'A request' }).click();
    await page.getByRole('textbox', { name: 'Your request' }).fill('Put my id papers together');
    await page.getByRole('button', { name: 'Send' }).click();
    // design8-run-words: on /bower the panel no longer offers "Tell Bower something", so it is found by its name.
    const panel = page.getByRole('complementary', { name: 'Right panel', exact: true });
    await expect(panel.getByText('anything from the dentist goes in health')).toBeVisible();
    await expect(panel.getByText(/waits for the next tidy-up/i).first()).toBeVisible();
    await expect(panel.getByText('Put my id papers together')).toBeVisible();
    await page.getByRole('link', { name: /^Home/ }).first().click();
    await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
    await expect(page.getByRole('dialog').getByText('The tidy-up stopped').first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(panel.getByText(/tidy-up stopped/).first()).toBeVisible();
    await expect(panel.getByText(/^Resting/)).toHaveCount(0);
  });
});

test('the tidy-up question can be cancelled', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Tidy up 15 things?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Tidy up', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Add keeps one copy of a file added twice', async ({ page }) => {
  await open(page, '/add', 'empty', 'instant');
  const file = { name: 'Boiler service.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF made up') };
  await page.locator('input[type=file][multiple]').setInputFiles(file);
  await page.locator('input[type=file][multiple]').setInputFiles(file);
  await expect(page.getByRole('button', { name: /Add 1 thing to the inbox/ })).toBeVisible();
  await expect(page.getByRole('status').getByText(/already in this pile/)).toBeVisible();
  await expectAxeClean(page, { include: 'main' });
});

test('a folder counts what it shows', async ({ page }) => {
  await open(page, '/files/Projects/Flat%20hunt');
  const rows = await page.locator('main ul li a[href]').filter({ has: page.locator('svg') }).count();
  await expect(page.locator('main header p').first()).toHaveText(`${rows} ${rows === 1 ? 'thing' : 'things'}`);
  await open(page, '/files/Resources/Cooking');
  await page.getByRole('radio', { name: 'Table' }).click();
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Status' })).toHaveCount(0);
});

test("the outline lists Bower's sections and sources link", async ({ page, isMobile }) => {
  await open(page, '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md');
  const timeline = page.locator('section[aria-labelledby="tl"]');
  await timeline.getByRole('link', { name: 'Lease draft' }).click();
  await expect(page).toHaveURL(/Lease%20draft\.pdf/);
  if (isMobile) return;
  await page.goBack();
  await page.getByRole('tab', { name: 'Outline' }).click();
  await expect(page.getByRole('button', { name: 'Current state' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Timeline' })).toBeVisible();
});

test('one bird on screen when a tidy-up ends', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await expect(page.getByRole('dialog').getByText(/Done\. 15 things filed/).last()).toBeVisible({ timeout: 5000 });
  // Every bird of the page under the dialog stays under its dimmed backdrop.
  await animationsEnd(page);
  const above = await page.evaluate(() => {
    const main = document.getElementById('main');
    return [...(main?.querySelectorAll('svg') ?? [])]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 30 && r.bottom > 0 && r.top < innerHeight)
      .map((r) => document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
      .filter((el) => el && main?.contains(el)).length;
  });
  expect(above).toBe(0);
});

test('the Demo pill never covers a button', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'on the desktop the pill sits in the status bar');
  for (const path of ['/', '/pile/p1', '/add', '/settings', '/bower', '/note/Resources/Cooking/Lemon%20tart.md']) {
    await open(page, path);
    const clash = await page.evaluate(() => {
      const pill = document.querySelector('button[aria-label="Demo situations"]')?.getBoundingClientRect();
      if (!pill) return 'no pill';
      const hit = [...document.querySelectorAll('main button, main a, nav button, nav a')]
        .filter((el) => !el.closest('[aria-label="Demo situations"]'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .find(({ r }) => r.width > 0 && r.left < pill.right && r.right > pill.left && r.top < pill.bottom && r.bottom > pill.top);
      return hit ? (hit.el.textContent ?? '').trim().slice(0, 40) || hit.el.getAttribute('aria-label') : null;
    });
    expect(clash, path).toBeNull();
  }
});

test('binning a folder with things asks first', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/files/Resources/Cooking');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /^Cooking/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to Bin' }).click();
  const ask = page.getByRole('dialog', { name: 'Put Cooking in the Bin?' });
  await expect(ask).toContainText(/things inside go with it/);
  await ask.getByRole('button', { name: 'Keep it' }).click();
  await expect(tree.getByRole('treeitem', { name: /^Cooking/ })).toBeVisible();
  await tree.getByRole('treeitem', { name: /^Cooking/ }).click();
  await page.keyboard.press('Delete');
  await page.getByRole('dialog', { name: 'Put Cooking in the Bin?' }).getByRole('button', { name: 'Put it in the Bin' }).click();
  await expect(page.getByRole('status').getByText(/Cooking is in your Drive's Bin/)).toBeVisible();
});
