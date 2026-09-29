/**
 * More menu and Move to… (#608): Show in folders reveals the open note in the
 * tree, and Move to… opens the send sheet with a folder choice (#866). Runs on the demo's sample folder.
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

test('Move to… opens the send sheet with a folder choice, not Inbox, and Put in the inbox sends the request', async ({
  page,
}) => {
  await openMenu(page);
  await page.getByRole('menuitem', { name: /Move to…/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Move' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('radio', { name: /^Inbox/ })).toHaveCount(0);
  await expect(
    sheet.getByRole('button', { name: 'Put in the inbox' }),
  ).toBeDisabled();
  await expect(
    sheet.getByText('Uses one run of your Claude plan.'),
  ).toBeVisible();

  await sheet.getByRole('searchbox', { name: 'Find a folder' }).fill('resour');
  await sheet.getByRole('radio', { name: /Resources/ }).click();
  await sheet.getByRole('button', { name: 'Put in the inbox' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByText('In your inbox. Bower moves it at the next tidy-up.'),
  ).toBeVisible();
});

test('Just this, now sends the move request and starts a run', async ({
  page,
}) => {
  await openMenu(page);
  await page.getByRole('menuitem', { name: /Move to…/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Move' });
  await sheet.getByRole('searchbox', { name: 'Find a folder' }).fill('resour');
  await sheet.getByRole('radio', { name: /Resources/ }).click();
  await sheet.getByRole('button', { name: 'Just this, now' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText('Bower is on it now.')).toBeVisible();
});
