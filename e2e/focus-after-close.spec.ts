/**
 * The keyboard never falls to the page body. Standards: WAI-ARIA APG modal dialog
 * (on close, focus returns to the opener, or to a logical place when it is gone) and
 * the single-page-app routing studies (Fable Tech Labs, GOV.UK): after a route change
 * focus moves to the new view's h1.
 */
import type { Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}?scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

const active = (page: Page): Promise<string> => page.evaluate(() => `${document.activeElement?.tagName}|${document.activeElement?.textContent?.trim().slice(0, 40)}`);

test('F1: closing the replay from the Home card keeps the keyboard on the page', async ({ page }) => {
  test.skip(isFake, 'the demo default situation has 15 things to tidy and resets on load; the opener rule itself is unit-tested in focus.test.ts');
  for (const how of ['Escape', 'Skip']) {
    await open(page, '/');
    await page.getByRole('button', { name: /^Tidy up \d+ things$/ }).first().click();
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
    else await replay.getByRole('button', { name: 'Skip' }).click();
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
  await page.getByRole('textbox').first().fill('A note for the inbox');
  const put = page.getByRole('button', { name: 'Put the note in the inbox' });
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

test('focus: every route lands the keyboard on its h1', async ({ page }) => {
  await open(page, '/');
  const h1Focused = async (label: string): Promise<void> => {
    await expect(page.locator('h1').first(), label).toBeFocused();
    expect(await active(page), label).not.toMatch(/^BODY/);
  };
  // By keyboard through the top bar where a link exists.
  for (const name of ['Add a pile', 'Talk to Bower', 'Settings', 'Home']) {
    const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).first();
    if (!(await link.isVisible())) continue;
    const before = new URL(page.url()).pathname;
    await link.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    if (new URL(page.url()).pathname === before) continue; // already there (the phone bar has fewer links)
    await h1Focused(name);
  }
  // Routes with no top-bar link: a client-side route change from the keyboard's position.
  for (const path of ['/files', '/note/Projects/Flat%20hunt/Flat%20hunt.md', '/privacy', '/terms', '/no-such-page']) {
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
