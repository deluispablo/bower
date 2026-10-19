import { resize } from './viewport';
/**
 * Round ten: what the evaluator found after round eight. Each test pins one
 * entry of the QA list with "task": "qa-10", on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, isFake, openTidy, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

/** Suggestions wait for the first tidy-up's report: open `back`, see the report from the checklist, close it. */
const openReviewed = async (page: Page): Promise<void> => {
  await open(page, '/', 'back');
  const checklist = page.getByRole('region', { name: 'Your first tidy-up' });
  await checklist.getByRole('button', { name: 'See the report' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^(Skip|Done|Close)$/ }).first().click();
  await expect(dialog).toHaveCount(0);
  await expect(checklist).toHaveCount(0);
};

test('a situation opened by its address starts clean: no earlier tabs, main folders alike', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop tabs and tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open in a new tab' }).click();
  await expect(page.locator('[data-tab]')).toHaveCount(2);
  await open(page, '/', 'first');
  await page.getByRole('button', { name: 'Make my Bower folder' }).click({ timeout: 10_000 });
  await expect(page.locator('[data-tab]')).toHaveCount(1, { timeout: 15_000 });
  for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) {
    await expect(tree.getByRole('treeitem', { name: new RegExp(`^${name}`) }), name).toHaveAttribute('aria-expanded', 'false');
  }
});

const notBody = (page: Page) => expect.poll(() => page.evaluate(() => document.activeElement !== document.body && !!document.activeElement));

test('the phone page menu button is as clear as Back', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone page controls');
  await resize(page, { width: 390, height: 844 });
  await open(page, '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md');
  const more = page.getByRole('button', { name: 'More for Flat 3, 12 Larkspur Lane', exact: true });
  await expect(more).toBeVisible();
  const back = page.getByRole('button', { name: 'Back', exact: true });
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    expect(await more.evaluate((el) => getComputedStyle(el).color)).toBe(await back.evaluate((el) => getComputedStyle(el).color));
    // Tiny dotted paths need enough ink to remain visible on a phone screen.
    const diameter = await more.locator('svg').evaluate((svg) => Number(getComputedStyle(svg).strokeWidth.replace('px', '')) * svg.getBoundingClientRect().width / 24);
    expect(diameter, `${theme}: each menu dot is at least 2.4 CSS pixels wide`).toBeGreaterThanOrEqual(2.4);
    const target = await more.boundingBox();
    expect(target?.width).toBeGreaterThanOrEqual(44);
    expect(target?.height).toBeGreaterThanOrEqual(44);
  }
  await more.click();
  await expect(page.getByRole('dialog', { name: 'Flat 3, 12 Larkspur Lane', exact: true })).toBeVisible();
});

test('the keyboard stays in the page after closing, answering, removing or saying no', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard use');
  await open(page, '/');
  await openTidy(page);
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await notBody(page).toBe(true);
  await open(page, '/');
  await page.locator('section[aria-labelledby="qs"] li').first().getByRole('button').first().click();
  await notBody(page).toBe(true);
  await openReviewed(page);
  await page.getByRole('region', { name: 'Bower suggests' }).getByRole('button', { name: 'No thanks' }).first().click();
  await notBody(page).toBe(true);
  await open(page, '/bower');
  await page.getByRole('button', { name: /^Remove the rule/ }).first().click();
  await notBody(page).toBe(true);
});

const toast = (page: Page, text: string | RegExp) => page.getByRole('status').getByText(text);

test('every Undo says what came back: a move and a removed rule', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.getByLabel('Find a folder').fill('Documents');
  await page.keyboard.press('Enter');
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).last().click();
  await expect(toast(page, /Lease draft(\.pdf)? is back in Projects \/ Flat hunt/)).toBeVisible();
  await open(page, '/bower');
  await page.getByRole('button', { name: /^Remove the rule/ }).first().click();
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).last().click();
  await expect(toast(page, 'The rule is back.')).toBeVisible();
});

test('No thanks can be taken back', async ({ page }) => {
  await openReviewed(page);
  const box = page.getByRole('region', { name: 'Bower suggests' });
  const title = (await box.locator('[class*="suggestTitle"]').first().textContent()) ?? '';
  await box.getByRole('button', { name: 'No thanks' }).first().click();
  await expect(toast(page, "Bower won't suggest it again.")).toBeVisible();
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.getByText(title).first()).toBeVisible();
});

const unnamedButtons = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => !(b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || b.getAttribute('title') || b.textContent?.trim()))
      .map((b) => b.className),
  );

test('no unnamed buttons: the tidy-up sheet and Add', async ({ page }) => {
  await open(page, '/');
  await openTidy(page);
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things$/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await unnamedButtons(page)).toEqual([]);
  await open(page, '/add');
  expect(await unnamedButtons(page)).toEqual([]);
});

test('the side panel tabs are tabs: one Tab stop, arrows, a panel each; Outline goes to the heading', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop panels');
  await page.addInitScript(() => localStorage.setItem('bower:prefs', JSON.stringify({ rightOpen: true })));
  await open(page, '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md');
  for (const name of ['Side panel', 'Right panel']) {
    const list = page.getByRole('tablist', { name });
    const tabs = list.getByRole('tab');
    await expect(list.locator('[role="tab"][tabindex="0"]'), name).toHaveCount(1);
    const first = list.locator('[role="tab"][aria-selected="true"]');
    await first.focus();
    await page.keyboard.press('ArrowRight');
    const now = list.locator('[role="tab"][aria-selected="true"]');
    await expect(now).toBeFocused();
    const panel = await now.getAttribute('aria-controls');
    expect(panel, name).toBeTruthy();
    await expect(page.locator(`#${panel}[role="tabpanel"]`), name).toHaveCount(1);
    expect(await tabs.count()).toBeGreaterThan(1);
  }
  const right = page.getByRole('tablist', { name: 'Right panel' });
  await right.getByRole('tab', { name: 'Outline' }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Timeline' }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('tl');
});

test('the tree finds a row by typing its first letters', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.focus();
  await page.keyboard.type('res');
  await expect(tree).toHaveAttribute('aria-activedescendant', 'row-Resources');
  await page.waitForTimeout(900);
  await page.keyboard.type('ar');
  await expect(tree).toHaveAttribute('aria-activedescendant', /^row-Ar/);
});

test('Delete on a folder asks before the Bin; on a main folder it says why not', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /^Flat hunt/ }).click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(tree).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('dialog', { name: 'Put Flat hunt in the Bin?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await tree.getByRole('treeitem', { name: /^Projects/ }).click({ button: 'right' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await expect(page.getByRole('status').getByText(/Main folders stay/)).toBeVisible();
});

test('one thing, one name: Home, the tree and the tidy-up sheet name things alike', async ({ page }) => {
  await open(page, '/');
  const homePiles = page.locator('main a[href*="/pile/"] [class*="pileText"]');
  await expect(homePiles.first()).toBeVisible();
  await page.getByRole('region', { name: 'Inbox' }).getByRole('button', { name: /^and \d+ more$/ }).click();
  const onHome = (await homePiles.allTextContents()).map((t) => t.trim());
  for (const t of await page.locator('section[aria-labelledby="recent"] [class*="pileText"]').allTextContents()) expect(t).not.toMatch(/\.[A-Za-z0-9]{2,4}$/);
  await openTidy(page);
  const sheetNames = page.getByRole('dialog').getByRole('list', { name: 'In the inbox', exact: true }).locator('li > span:not(.muted):not([aria-hidden])');
  // Web-first: allTextContents() does not wait, so wait for the sheet's list before reading it.
  await expect(sheetNames).toHaveCount(onHome.length);
  const inSheet = (await sheetNames.allTextContents()).map((t) => t.trim());
  expect(inSheet.sort()).toEqual([...onHome].sort());
});

test('no Remove while a tidy-up runs: the menu says to wait', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/', 'running', 'demo');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  const inbox = tree.getByRole('treeitem', { name: /^Inbox/ });
  if ((await inbox.getAttribute('aria-expanded')) !== 'true') await inbox.click();
  await tree.locator('[data-path^="Inbox/"]').first().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Remove the pile/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('menuitem', { name: /after the tidy-up/ })).toBeVisible();
});

test('coming back asks first, then says welcome back: the folder is still there', async ({ page }) => {
  await open(page, '/settings');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete your Bower account?' }).getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Where Bower keeps things' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Make my Bower folder' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Your Bower folder is still in My Drive, with everything in it.')).toBeVisible();
  await page.getByRole('button', { name: 'Open Bower' }).click();
  await expect(page).toHaveURL(/\/$/);
  // The old folder is found, never made twice: one Bower folder in the pretend Drive's root, with its contents.
  if (isFake) {
    const kept = await page.evaluate(() => {
      const files = (JSON.parse(sessionStorage.getItem('bower:fake:default') ?? '{"files":[]}') as { files: Array<{ meta: { name: string; folder?: boolean; parents: string[] }; trashed: boolean }> }).files;
      return files.filter((f) => f.meta.folder && f.meta.name === 'Bower' && f.meta.parents[0] === 'root' && !f.trashed).length;
    });
    expect(kept).toBe(1);
  }
});

test('a link that is not one is said so, next to the box', async ({ page }) => {
  await open(page, '/add');
  const box = page.getByLabel('Paste a link');
  await box.fill('not a link');
  await page.getByRole('button', { name: 'Add link' }).click();
  await expect(page.getByText("That is not a web address. Check it and try again.")).toBeVisible();
  await expect(box).toHaveAttribute('aria-invalid', 'true');
  await box.fill('example.com');
  await expect(box).not.toHaveAttribute('aria-invalid', 'true');
});

test('words agree: a stopped run is "The tidy-up stopped" everywhere', async ({ page }) => {
  await open(page, '/', 'fail-run');
  await openTidy(page);
  await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
  await expect(page.getByRole('dialog').getByText('The tidy-up stopped').first()).toBeVisible({ timeout: 8000 });
  await page.keyboard.press('Escape');
  await expect(page.getByText(/Tidy-up stopped/)).toHaveCount(0);
});

test('words agree: a rename says so, and says why a slash became a dash', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/note/Resources/Cooking/Lemon%20tart.md');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.focus();
  await page.keyboard.press('F2');
  await page.getByLabel(/New name for Lemon tart/).fill('Lemon tart/best');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').getByText('Renamed to Lemon tart-best. Names cannot have slashes; Bower used a dash.')).toBeVisible();
});

test('offline the footer says so, and says synced again when back', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'the desktop footer');
  await open(page, '/');
  const footer = page.locator('footer');
  await expect(footer.getByText('Synced with your Drive')).toBeVisible();
  await context.setOffline(true);
  await expect(footer.getByText('Offline. Your changes wait here until you are back.')).toBeVisible();
  await expect(footer.getByText('Synced with your Drive')).toHaveCount(0);
  await context.setOffline(false);
  await expect(footer.getByText('Synced with your Drive')).toBeVisible();
});
