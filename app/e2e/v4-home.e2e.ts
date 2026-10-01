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
  const inbox = visible(page.locator('.stat-tile', { hasText: 'Inbox' }));
  await inbox.getByRole('button', { name: 'Tidy up', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Is that everything?' });
  await confirm.getByRole('button', { name: 'Yes, tidy up' }).click();
  await expect(visible(page.locator('.home-bubble'))).toContainText(
    'Done just now',
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
    // #754: the run sentence, what Bower added, then See what changed.
    'Done just now: 2 filed',
  );
  await expect(bubble).not.toContainText('bike times');
  await shot(page, testInfo, 'home-after-tidy');
  await bubble.getByRole('link', { name: 'See what changed' }).click();
  await expect(page).toHaveURL(/\/just-filed$/);
});

test('Last tidy-up counts what is new and opens Just filed; Health and Notes sit below', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await tidyUp(page);
  const card = visible(page.locator('.stat-tile', { hasText: 'Last tidy-up' }));
  // #754: the card is the time and the counts line only.
  await expect(card).toContainText('2 filed');
  await expect(card).not.toContainText('new to you');
  if (testInfo.project.name === 'desktop') {
    const tidy = await card.boundingBox();
    // E-8: Health check is the desktop's third tile; no Notes card (K-4).
    const other = await page
      .locator('.stat-tile', { hasText: 'Health check' })
      .boundingBox();
    expect(other, 'Health check tile').not.toBeNull();
    // After the Last tidy-up tile: below it, or beside it in the same row.
    expect((other?.y ?? 0) + 1).toBeGreaterThanOrEqual(tidy?.y ?? 0);
    await expect(page.locator('.stat-tile', { hasText: 'Notes' })).toHaveCount(
      0,
    );
  }
  await card.click();
  await expect(page).toHaveURL(/\/just-filed$/);
});

test('Recent rows show the kind and the where dot, and All in Folders on the phone only (R-HM-4, R-HM-5)', async ({
  page,
}, testInfo) => {
  await openHome(page);
  await tidyUp(page);
  const rows = page.locator('.home-recent .list-row');
  // The scripted run files a note about tomato seedlings (`src/demo/server.ts`).
  const filed = rows.filter({ hasText: 'Tomato seedlings' });
  await expect(filed).toBeVisible();
  // "<kind> · ● <parent>": no MD/FILE badge, no facts, no full path.
  await expect(filed.locator('.list-row-meta')).toContainText(' · ');
  await expect(filed.locator('.list-row-dot')).toHaveCount(1);
  await expect(rows.locator('.kind-badge')).toHaveCount(0);
  await expect(rows.locator('.list-row-meta').first()).not.toContainText('/');
  const all = page.locator('.home-recent-head a');
  if (testInfo.project.name === 'phone') {
    await expect(all).toHaveText('All in Folders');
  } else {
    await expect(all).toHaveCount(0);
  }
});

test("phone Home: the top bar's G'day, Alex is the page's one h1; desktop has the h1 in the page (R-HM-1, #920 DA-1)", async ({
  page,
}, testInfo) => {
  await openHome(page);
  const greeting = page.getByRole('heading', { name: "G'day, Alex" });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  if (testInfo.project.name === 'phone') {
    await expect(
      page
        .locator('header.topbar')
        .getByRole('heading', { level: 1, name: "G'day, Alex" }),
    ).toBeVisible();
    await expect(page.locator('.home-h1')).toHaveCount(0);
    await expect(visible(page.locator('.home-bubble'))).toBeVisible();
  } else {
    await expect(greeting).toBeVisible();
  }
});
