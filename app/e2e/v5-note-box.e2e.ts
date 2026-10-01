/**
 * Bower's note box (#757, boards Note-*, Note-Folded-*): the head is a
 * 48 px button that folds the box, the choice is one device preference for
 * every note, key facts show once and Details need no second toggle.
 */

import type { Page } from '@playwright/test';

import { expect, openHome, test, visible } from './demo.js';

async function openArlington(page: Page): Promise<void> {
  await openHome(page);
  await visible(
    page.getByRole('button', { name: /^Search( folders, notes and files)?$/ }),
  ).click();
  const switcher = page.getByRole('dialog', { name: 'Quick switcher' });
  await switcher.getByRole('combobox').fill('Arlington Road, 2 bed');
  await switcher
    .getByRole('option', { name: /Arlington Road, 2 bed/ })
    .filter({ hasNotText: /pdf/i })
    .first()
    .click();
}

test("Bower's note folds to one line and stays folded on the device", async ({
  page,
}) => {
  await openArlington(page);

  const head = page.getByRole('button', { name: "Fold Bower's note" });
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  const box = await page.locator('.bower-note-box-head').boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  // Open shows everything: summary, details, no caption, and no key-fact
  // tiles (G-18).
  await expect(page.locator('.bower-note-box-summary')).toBeVisible();
  await expect(page.locator('.bower-note-box .key-facts')).toHaveCount(0);
  await expect(page.locator('.note-keyfacts-caption')).toHaveCount(0);
  await expect(page.locator('.details-toggle')).toHaveCount(0);

  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.bower-note-box-summary')).toBeHidden();
  await expect(page.locator('.bower-note-box-line')).toHaveText(
    /^\d+ points?( · \d+ to check)?$/,
  );
  expect(
    await page.evaluate(() => localStorage.getItem('bower:pref:foldedNotes')),
  ).toMatch(/^\[".+"\]$/);

  // Open it again to leave the device as it was.
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.bower-note-box-summary')).toBeVisible();
});
