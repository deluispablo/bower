/**
 * Bower's note in the reading view (#602, board `Phone-Note-Bower`): the
 * Arlington Road note of the sample folder opens with the `> [!bower]` box,
 * one origin square per line, the legend, the word "Check" and the
 * "Joined from" chips.
 */

import { expect, openHome, shot, test, visible } from './demo.js';

test("the Arlington Road note shows Bower's note as the board draws it", async ({
  page,
}, testInfo) => {
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

  const box = page.locator('.bower-note-box');
  await expect(box).toBeVisible();
  await expect(box.locator('.bower-note-box-name')).toHaveText("Bower's note");
  await expect(box.locator('.bower-note-legend')).toHaveText(
    '· from the file, your notes',
  );
  const rows = box.locator('.bower-note-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator('.bower-origin-file')).toBeVisible();
  await expect(rows.nth(1).locator('.bower-origin-notes')).toBeVisible();
  await expect(rows.nth(2).locator('.bower-origin-file')).toBeVisible();
  await expect(rows.nth(1).locator('.bower-note-text')).toHaveText(
    '14 minutes by bike to your office.',
  );
  // "— Check" is the small word, only on the line that needs you.
  await expect(box.locator('.bower-note-word')).toHaveText(['Check']);
  await expect(box).not.toContainText('(from the file)');

  const joined = page.locator('.bower-joined');
  await expect(joined).toContainText('Joined from:');
  await expect(joined.locator('.bower-joined-chip')).toHaveText([
    'Offer letter, Northwind Data',
    'Cycle to Work agreement',
  ]);
  await shot(page, testInfo, 'v4-bower-note');
});
