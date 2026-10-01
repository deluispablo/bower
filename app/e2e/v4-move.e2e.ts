/**
 * More menu and Move to… (#608): Show in folders reveals the open note in the
 * tree, and Move to… opens the folder picker (#909). Runs on the demo's sample folder.
 */

import type { Page } from '@playwright/test';

import { expect, openHome, test, visible } from './demo.js';

/** The note in Moonee Ponds that Recent lists. */
const NOTE = /10-43 Buckley St, Moonee Ponds/;

/** Opens the note from Home's Recent list, then its More menu. */
async function openMenu(page: Page): Promise<void> {
  await openHome(page);
  await visible(
    page.locator('.home-notes a[href^="/note/"]').filter({ hasText: NOTE }),
  ).click();
  await expect(page).toHaveURL(/\/note\//);
  // The page's own ⋯, exact: a stale "More for Home" never matches.
  await visible(
    page.getByRole('button', {
      name: 'More for 10-43 Buckley St, Moonee Ponds',
      exact: true,
    }),
  ).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test('the ⋯ menu lists Show in folders and Move to… with their subtitles (#907)', async ({
  page,
}) => {
  await openMenu(page);
  const menu = page.getByRole('menu');
  await expect(
    menu.getByRole('menuitem', { name: /Show in folders/ }),
  ).toContainText('Opens your folders at');
  await expect(menu.getByRole('menuitem', { name: /Move to…/ })).toContainText(
    'Bower moves it at the next tidy-up',
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

test('1280: Show in folders reveals in place, and one Back leaves the note (#920)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the sidebar is the desktop');
  await openMenu(page);
  const note = page.url();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (history.state as { bowerOverlay?: boolean } | null)?.bowerOverlay ===
          true,
      ),
    )
    .toBe(true);
  await page.getByRole('menuitem', { name: /Show in folders/ }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page).toHaveURL(note);
  await expect(
    page
      .getByRole('navigation', { name: 'Your folders' })
      .locator('a[aria-current="page"]'),
  ).toHaveCount(1);
  // The menu's own Back entry is gone, and no other was pushed.
  await expect
    .poll(() => page.evaluate(() => history.state === null))
    .toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test('Move to… opens the folder picker, not Inbox, and Move here sends the request (#909, #910)', async ({
  page,
}) => {
  await openMenu(page);
  await page.getByRole('menuitem', { name: /Move to…/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Move to…' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('radio', { name: /^Inbox/ })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Move here' })).toBeDisabled();

  // #909: no "Find a folder" field; Resources is a root, always in view.
  await sheet.getByRole('radio', { name: /Resources/ }).click();
  await sheet.getByRole('button', { name: 'Move here' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByText('In your inbox. Bower moves it at the next tidy-up.'),
  ).toBeVisible();
});

test('Move to… waits for the tidy-up: no Just this, now (#909)', async ({
  page,
}) => {
  await openMenu(page);
  await page.getByRole('menuitem', { name: /Move to…/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Move to…' });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Just this, now' }),
  ).toHaveCount(0);
});
