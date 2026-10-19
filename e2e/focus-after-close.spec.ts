/**
 * The keyboard never falls to the page body. Standards: WAI-ARIA APG modal dialog
 * (on close, focus returns to the opener, or to a logical place when it is gone) and
 * the single-page-app routing studies (Fable Tech Labs, GOV.UK): after a route change
 * focus moves to the new view's h1.
 */
import { expectAxeClean } from './axe';
import type { Locator, Page } from '@playwright/test';
import { expect, isFake, openTidy, test } from './fixtures';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}?scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

const active = (page: Page): Promise<string> => page.evaluate(() => `${document.activeElement?.tagName}|${document.activeElement?.textContent?.trim().slice(0, 40)}`);

test('F1: closing the replay from the Home card keeps the keyboard on the page', async ({ page }) => {
  test.skip(isFake, 'the demo default situation has 15 things to tidy and resets on load; the opener rule itself is unit-tested in focus.test.ts');
  for (const how of ['Escape', 'Close']) {
    await open(page, '/');
    await openTidy(page);
    await page.getByRole('dialog').getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
    await expect(page.getByRole('dialog').getByText(/Done\. 15 things filed/).last()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const watch = page.getByRole('main').getByRole('button', { name: 'Watch what Bower did' });
    await expect(watch).toBeVisible();
    await watch.focus();
    await page.keyboard.press('Enter');
    const replay = page.getByRole('dialog', { name: 'What Bower did in the tidy-up' });
    await expect(replay).toBeVisible();
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await replay.getByRole('button', { name: 'Close' }).click();
    await expect(replay).toHaveCount(0);
    await expect(watch).toHaveCount(0);
    // The card is gone with the opener: focus goes to the page's heading, never the body.
    await expect(page.locator('main h1')).toBeFocused();
    expect(await active(page), how).not.toMatch(/^BODY/);
  }
});

test('F2: a button that changes the page moves the keyboard to the new page', async ({ page }) => {
  await open(page, '/');
  const add = page.getByRole('button', { name: 'Add a pile' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Add a pile', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add a pile', level: 1 })).toBeFocused();
  await page.getByRole('textbox', { name: 'What is this? (optional)' }).fill('A note for the inbox');
  const put = page.getByRole('button', { name: 'Add to the inbox' });
  await put.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/(\?|$)/);
  await expect(page.locator('main h1')).toBeFocused();
  expect(await active(page)).not.toMatch(/^BODY/);
});

test('G1: a link from one note to another moves the keyboard to the new note', async ({ page }) => {
  await open(page, '/note/Projects/Flat%20hunt/Flat%20hunt.md');
  const link = page.getByRole('main').getByRole('link', { name: 'Flat 3, 12 Larkspur Lane' }).first();
  await expect(link).toBeVisible();
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/Flat%20hunt\.md/);
  await expect(page.locator('main h1')).toBeFocused();
  expect(await active(page)).not.toMatch(/^BODY/);
});

test('G2: signing out moves the keyboard to the sign-in page', async ({ page }) => {
  await open(page, '/settings');
  const out = page.getByRole('button', { name: 'Sign out' }).first();
  await expect(out).toBeVisible();
  await out.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  expect(await active(page)).not.toMatch(/^BODY/);
});

test('focus: every route lands the keyboard on its h1, or on the control that navigated while it stays on screen', async ({ page }) => {
  await open(page, '/');
  const h1Focused = async (label: string): Promise<void> => {
    await expect(page.locator('h1').first(), label).toBeFocused();
    expect(await active(page), label).not.toMatch(/^BODY/);
  };
  // By keyboard through the top bar where a link exists.
  for (const name of ['Add a pile', 'Ask', 'Settings', 'Home']) {
    const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).first();
    if (!(await link.isVisible())) continue;
    const before = new URL(page.url()).pathname;
    await link.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    if (new URL(page.url()).pathname === before) continue; // already there (the phone bar has fewer links)
    // TL-P2-47: the h1, or the still-attached control that navigated (a top-bar link keeps focus); never the body.
    const onLink = await link.evaluate((el) => el === document.activeElement && el.isConnected);
    if (!onLink) await h1Focused(name);
    expect(await active(page), name).not.toMatch(/^BODY/);
  }
  // Routes with no top-bar link: a client-side route change from the keyboard's position.
  for (const path of ['/files', '/note/Projects/Flat%20hunt/Flat%20hunt.md', '/privacy', '/terms', '/no-such-page']) {
    // The keyboard on the old view's heading, which the change takes away.
    await page.locator('h1').first().evaluate((h) => { h.setAttribute('tabindex', '-1'); h.focus(); });
    await page.evaluate((to) => {
      history.pushState({}, '', to);
      dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await expect.poll(() => new URL(page.url()).pathname).toBe(decodeURIComponent(path).replace(/ /g, '%20'));
    await page.waitForTimeout(400); // the old heading held focus until the route changed
    await h1Focused(path);
  }
  await open(page, '/settings');
  await page.getByRole('button', { name: 'Sign out' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sign-in/);
  await h1Focused('sign-in');
});

/**
 * d-v2-04 (APG modal dialog: on close, focus returns to the control that opened it). The sheet is
 * opened by keyboard from each button that opens it; every wait is for focus, never for time.
 */
// On a first-time Home the checklist's Tidy up is the one launch; off Home, the desktop top bar (ux-home-priorities R2).
const openers = (page: Page, isMobile: boolean): Array<[string, string, Locator]> => {
  const list: Array<[string, string, Locator]> = [['checklist button', '/', page.getByRole('region', { name: 'Your first tidy-up' }).getByRole('button', { name: 'Tidy up', exact: true })]];
  if (!isMobile) list.push(['tab-bar button', '/files/Projects', page.getByRole('button', { name: /^Tidy up \d+$/ })]);
  return list;
};

// The page body and the open sheet. The desktop tab strip's close buttons have a known target-size finding of their own.
const axeClean = async (page: Page): Promise<void> => {
  await expectAxeClean(page, { include: ['main', '[role="dialog"]'], wcag22: true });
};

for (const [name, how] of [
  ['closing the tidy sheet returns focus to its opener', 'Escape'],
  ['closing the tidy sheet with not now returns focus to its opener', 'Not now'],
] as const) {
  test(name, async ({ page, isMobile }) => {
    for (const [label, path, opener] of openers(page, isMobile)) {
      await open(page, path);
      await expect(opener, label).toBeVisible();
      await opener.focus();
      await page.keyboard.press('Enter');
      const sheet = page.getByRole('dialog', { name: /^Tidy up \d+ things\?$/ });
      await expect(sheet, label).toBeVisible();
      if (label === 'checklist button') await axeClean(page);
      if (how === 'Escape') await page.keyboard.press('Escape');
      else await sheet.getByRole('button', { name: 'Not now' }).click();
      await expect(sheet, label).toHaveCount(0);
      await expect(opener, label).toBeFocused();
      await axeClean(page);
    }
  });
}

// A sheet opened from a menu sheet gives the keyboard back to the control that opened the menu (APG: focus returns to the invoking element).
for (const item of ['Rename', 'Move to…']) {
  test(`a sheet opened from a menu sheet returns focus to the menu's opener: ${item} on a note page`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the phone');
    await open(page, '/note/Resources/Cooking/Lemon%20tart.md');
    const more = page.getByRole('button', { name: 'More for Lemon tart' });
    await more.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').getByRole('button', { name: item }).click();
    const sheet = page.getByRole('dialog', { name: item === 'Rename' ? 'Rename' : /^Move/ });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(more).toBeFocused();
    await axeClean(page);
  });

  test(`a sheet opened from a menu sheet returns focus to the menu's opener: ${item} on a file row`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the phone');
    await open(page, '/files');
    // The tree holds the keyboard; its active row is the one the menu opened from.
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    const row = tree.getByRole('treeitem', { name: /^Flat hunt/ });
    await tree.focus();
    await row.dispatchEvent('contextmenu');
    await page.getByRole('dialog').getByRole('button', { name: item }).click();
    const sheet = page.getByRole('dialog', { name: item === 'Rename' ? 'Rename' : /^Move/ });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(tree).toBeFocused();
    await axeClean(page);
  });
}
