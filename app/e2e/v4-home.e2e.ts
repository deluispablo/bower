/**
 * Home after a tidy-up (#617, boards `Flow-05-Home` and `Why-Home`): the
 * bubble says what was filed and what Bower added and links to Just filed;
 * Last tidy-up counts what is new to you and opens the same list, with
 * Health and Notes below it; Recent rows carry New, the Bower tag and key
 * facts.
 */

import type { Page } from '@playwright/test';

import { expect, openHome, shot, test, visible } from './demo.js';

/** Runs the demo's scripted tidy-up from Home, so the run store has a
 * finished run (`lastFinished`), and closes the working sheet again. */
async function tidyUp(page: Page): Promise<void> {
  const inbox = visible(page.locator('.home-card', { hasText: 'Inbox' }));
  await inbox.getByRole('button', { name: 'Tidy up', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  await expect(visible(page.locator('.home-bubble'))).toContainText(
    'All tidy.',
    { timeout: 30_000 },
  );
  await page.keyboard.press('Escape');
  // #773: the one-time push prompt is a modal overlay that comes up once the
  // result has been seen (where push can be asked for at all); dismiss it.
  const later = page
    .getByRole('dialog')
    .getByRole('button', { name: /Not now|Got it/ });
  await later.waitFor({ state: 'visible', timeout: 2_000 }).then(
    () => later.click(),
    () => undefined,
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('the bubble says what was filed and links to Just filed', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await tidyUp(page);
  const bubble = visible(page.locator('.home-bubble'));
  await expect(bubble).toContainText(
    'All tidy. 5 filed and 1 question answered, and I added bike times to the flats. See where they went.',
  );
  await shot(page, testInfo, 'home-after-tidy');
  await bubble.getByRole('link', { name: 'See where they went' }).click();
  await expect(page).toHaveURL(/\/just-filed$/);
});

test('Last tidy-up counts what is new and opens Just filed; Health and Notes sit below', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await tidyUp(page);
  const card = visible(page.locator('.home-card', { hasText: 'Last tidy-up' }));
  await expect(card).toContainText('filed · ');
  await expect(card).toContainText('new to you');
  if (testInfo.project.name === 'desktop') {
    const tidy = await card.boundingBox();
    for (const title of ['Health', 'Notes']) {
      const other = await page
        .locator('.home-card', {
          has: page.getByRole('heading', { name: title }),
        })
        .boundingBox();
      expect(other, `${title} card`).not.toBeNull();
      // After the Last tidy-up card: below it, or beside it in the same row.
      expect((other?.y ?? 0) + 1).toBeGreaterThanOrEqual(tidy?.y ?? 0);
    }
  }
  await card.click();
  await expect(page).toHaveURL(/\/just-filed$/);
});

test('Recent rows show the kind badge, New for what was just filed, and the All link', async ({
  page,
}) => {
  await openHome(page);
  await tidyUp(page);
  const rows = page.locator('.home-recent .home-note-row');
  // The scripted run files a note about tomato seedlings (`src/demo/server.ts`).
  const filed = rows.filter({ hasText: 'Tomato seedlings' });
  await expect(filed).toBeVisible();
  await expect(filed.locator('.kind-badge')).toHaveText('MD');
  await expect(filed.locator('.new-tag')).toHaveText('New');
  // What is not from the run carries no New.
  await expect(
    rows.filter({ hasText: 'Notes from the viewing' }).locator('.new-tag'),
  ).toHaveCount(0);
  // The listings the run files show the Bower tag and their key facts.
  const listing = rows.filter({ hasText: 'Arlington Road, 2 bed' });
  await expect(listing).toBeVisible();
  await expect(listing.locator('.bower-tag')).toBeVisible();
  await expect(listing).toContainText('2 bed');
  await expect(page.locator('.home-recent-head a')).toHaveText('All');
});

test('phone Home: top bar says Home and there is no greeting heading; desktop keeps its heading (#699)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  const greeting = page.getByRole('heading', { name: /^Good \w+, Alex$/ });
  if (testInfo.project.name === 'phone') {
    await expect(
      page.locator('header.topbar').getByText('Home', { exact: true }),
    ).toBeVisible();
    await expect(greeting).toHaveCount(0);
    await expect(visible(page.locator('.home-bubble'))).toBeVisible();
  } else {
    await expect(greeting).toBeVisible();
  }
});
