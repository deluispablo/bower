/**
 * More menu and Move to… (#608): Show in folders reveals the open note in the
 * tree, and the folder picker asks Bower to move it, now or with the next
 * tidy-up. Runs on the demo's sample folder.
 */

import type { Page } from '@playwright/test';

import { expect, openHome, test, visible } from './demo.js';

/** The note in Flat hunt that Recent lists. */
const NOTE = /Notes from the viewing/;

/** Opens the note from Home's Recent list, then its More menu. */
async function openMenu(page: Page): Promise<void> {
  await openHome(page);
  await visible(
    page.locator('.home-notes a[href^="/note/"]').filter({ hasText: NOTE }),
  ).click();
  await expect(page).toHaveURL(/\/note\//);
  await visible(page.getByRole('button', { name: 'More' })).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test('the More menu lists Show in folders and Move to… with "waits for the tidy-up"', async ({
  page,
}) => {
  await openMenu(page);
  const menu = page.getByRole('menu');
  await expect(
    menu.getByRole('menuitem', { name: /Show in folders/ }),
  ).toContainText('NEW');
  await expect(menu.getByRole('menuitem', { name: /Move to…/ })).toContainText(
    'waits for the tidy-up',
  );
});

test('Show in folders reveals the note in the tree', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the Notes tab is the phone');
  await openMenu(page);
  await page.getByRole('menuitem', { name: /Show in folders/ }).click();
  await expect(page).toHaveURL(/\/notes\?reveal=/);
  await expect(
    visible(page.locator('[role="tree"]')).locator('a[aria-current="page"]'),
  ).toHaveCount(1);
});

test('Move to… offers folders but not Inbox, and With the next tidy-up sends the request', async ({
  page,
}) => {
  await openMenu(page);
  await page.getByRole('menuitem', { name: /Move to…/ }).click();
  const picker = page.getByRole('dialog', { name: 'Move to' });
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole('heading', { name: /^Move “.+” to…$/ }),
  ).toBeVisible();
  await expect(picker.getByRole('radio', { name: /^Inbox/ })).toHaveCount(0);
  await expect(
    picker.getByRole('button', { name: 'Move it now' }),
  ).toBeDisabled();

  await picker.getByRole('searchbox', { name: 'Find a folder' }).fill('resour');
  await picker.getByRole('radio', { name: /Resources/ }).click();
  await picker.getByRole('button', { name: 'With the next tidy-up' }).click();
  await expect(picker).toHaveCount(0);
  await expect(
    page.getByText('Asked Bower to move it with the next tidy-up.'),
  ).toBeVisible();
});

test('Move it now sends the request and starts a run', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('menuitem', { name: /Move to…/ }).click();
  const picker = page.getByRole('dialog', { name: 'Move to' });
  await picker.getByRole('searchbox', { name: 'Find a folder' }).fill('resour');
  await picker.getByRole('radio', { name: /Resources/ }).click();
  await picker.getByRole('button', { name: 'Move it now' }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByText('Asked Bower to move it now.')).toBeVisible();
});
