/**
 * The keyboard never falls to the page body. Standards: WAI-ARIA APG modal dialog
 * (on close, focus returns to the opener, or to a logical place when it is gone) and
 * the single-page-app routing studies (Fable Tech Labs, GOV.UK): after a route change
 * focus moves to the new view's h1.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}?scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

const active = (page: Page): Promise<string> => page.evaluate(() => `${document.activeElement?.tagName}|${document.activeElement?.textContent?.trim().slice(0, 40)}`);

test('F1: closing the replay from the Home card keeps the keyboard on the page', async ({ page }) => {
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
