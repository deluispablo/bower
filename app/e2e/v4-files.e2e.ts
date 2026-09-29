/**
 * File screens by kind (#604, boards `Phone-File-*`): each kind of the v4
 * sample folder shows its word and meta line; a CSV is a table; an Excel file
 * and a video show Drive's preview frame; a ZIP explains itself.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './demo.js';

async function openFile(
  page: Page,
  folder: string,
  name: string | RegExp,
  title: string,
): Promise<void> {
  await page.goto(`/folder/${folder}`);
  await page.locator('.folder-item', { hasText: name }).first().click();
  await expect(page).toHaveURL(/\/file\//);
  await expect(
    page.getByRole('heading', { level: 1, name: title }),
  ).toBeVisible();
}

const FLAT = '1-Projects/Flat%20hunt';

test('a CSV is a table with its row count, and a meta line with its kind word (#604)', async ({
  page,
}) => {
  await openFile(page, FLAT, 'Flat budget', 'Flat budget');
  const props = page.locator('.file-props');
  await expect(props).toContainText('Spreadsheet (CSV) · 3 KB · 24 rows');
  await expect(
    props.getByRole('link', { name: 'Projects / Flat hunt' }),
  ).toBeVisible();
  const table = page.locator('.table-preview table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'Month',
    'Rent',
    'Bills',
    'Total',
  ]);
  await expect(table.locator('tbody tr')).toHaveCount(24);
  await expect(page.locator('.table-preview-note')).toHaveText(
    'Showing 24 of 24 rows. Scroll the table sideways for more columns.',
  );
});

test('a PDF says its pages from the companion note (#604)', async ({
  page,
}) => {
  await page.goto(`/folder/${FLAT}`);
  await page
    .locator('.folder-item', { hasText: 'Lease agreement 2026' })
    .filter({ hasText: /PDF/ })
    .first()
    .click();
  await expect(page.locator('.file-props')).toContainText(/PDF · 42 pages · /);
});

test('a video plays from Drive and says Bower cannot watch it (#604)', async ({
  page,
}) => {
  await openFile(
    page,
    FLAT,
    'Walk-through, Arlington Road',
    'Walk-through, Arlington Road',
  );
  await expect(page.locator('.file-props')).toContainText(
    /Video · 2 min 14 s · \d+ MB · 26 Sep/,
  );
  await expect(page.getByText('Plays from Google Drive')).toBeVisible();
  await expect(page.locator('.drive-preview')).toBeVisible();
  await expect(page.locator('.file-notice')).toContainText(
    "Bower can't watch videos. It filed this one by its name and the date it was taken. Tell Bower what it shows and it will write that down with it.",
  );
  await page.getByRole('link', { name: 'Say what it is' }).click();
  await expect(page).toHaveURL(/\/bower\?text=/);
});

test('an Excel file shows the Drive preview and Open in Drive to edit (#604)', async ({
  page,
}) => {
  await openFile(
    page,
    '2-Areas/Money',
    'Household costs 2026',
    'Household costs 2026',
  );
  await expect(page.locator('.file-props')).toContainText(
    'Excel spreadsheet · 18 KB · 3 sheets',
  );
  await expect(page.getByText('Preview from Google Drive')).toBeVisible();
  await expect(page.locator('.drive-preview')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open in Drive to edit' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Bower keeps it, not reads it; editing happens in Drive or Excel.',
    ),
  ).toBeVisible();
});

test('a ZIP explains itself, offers Open in Drive and Download, and gives the tip (#604)', async ({
  page,
}) => {
  await openFile(
    page,
    FLAT,
    'Photos from the viewing',
    'Photos from the viewing',
  );
  await expect(page.locator('.file-props')).toContainText(
    'ZIP archive · 14 files · 38 MB',
  );
  await expect(
    page.getByText('A ZIP archive holds other files packed together.'),
  ).toBeVisible();
  await expect(
    page.getByText(
      "It can't be shown here. Open it in Drive to see what is inside, or download it.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open in Drive' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
  await expect(
    page.getByText(
      'Next time, add the photos themselves: Bower can file and describe photos, not what is inside a ZIP.',
    ),
  ).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});

async function openLeasePdf(page: Page): Promise<void> {
  await page.goto(`/folder/${FLAT}`);
  await page
    .locator('.folder-item', { hasText: 'Lease agreement 2026' })
    .filter({ hasText: /PDF/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/file\//);
}

test("a file with a companion note shows Bower's note and never the ask-for-a-note tip (#606)", async ({
  page,
}) => {
  await openLeasePdf(page);
  const note = page.locator('.file-bower-note');
  await expect(note).toContainText('Twelve months from 1 November');
  await expect(
    note.getByRole('link', { name: "Bower's note on this" }),
  ).toBeVisible();
  await expect(page.getByText('Want a note on it?')).toHaveCount(0);
  await note.getByRole('link', { name: "Bower's note on this" }).click();
  await expect(page).toHaveURL(/\/note\//);
});

test('a long PDF lists where to look and each page link opens the file at that page (#606)', async ({
  page,
}) => {
  await openLeasePdf(page);
  const where = page.locator('.file-where');
  await expect(
    where.getByRole('heading', { name: 'Where to look' }),
  ).toBeVisible();
  await expect(where.getByRole('link')).toHaveText([
    'p. 4',
    'p. 12',
    'p. 19',
    'p. 31',
  ]);
  await expect(where.getByRole('link', { name: 'p. 12' })).toHaveAttribute(
    'href',
    /#page=12$/,
  );
  await expect(where).toContainText('The break clause');
});

test('an exported Sheet says it is a copy (#606)', async ({ page }) => {
  await openFile(page, FLAT, 'Flat budget', 'Flat budget');
  await expect(page.locator('.file-copy-notice')).toContainText(
    'A copy of your Google Sheet “Flat budget”. Bower keeps the first sheet only, as a table. The original, with all its sheets, stays where it was in your Drive.',
  );
  await expect(
    page.getByRole('button', { name: 'Open the original' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open this copy in Drive' }),
  ).toBeVisible();
});

test('previous and next walk the folder in its list, with n of m (#606)', async ({
  page,
}) => {
  await page.goto(`/folder/${FLAT}`);
  await expect(page.locator('.folder-item').first()).toBeVisible();
  const names = await page
    .locator('.folder-item .folder-row-name')
    .allTextContents();
  const at = names.findIndex((name) => name.includes('Flat budget'));
  expect(at).toBeGreaterThan(0);
  expect(at).toBeLessThan(names.length - 1);
  await page
    .locator('.folder-item', { hasText: 'Flat budget' })
    .first()
    .click();
  const walk = page.locator('.file-walk');
  await expect(
    walk.getByRole('link', { name: names[at - 1] ?? '' }),
  ).toBeVisible();
  await expect(
    walk.getByRole('link', { name: names[at + 1] ?? '' }),
  ).toBeVisible();
  await expect(walk).toContainText(
    `${String(at + 1)} of ${String(names.length)}`,
  );
  await walk.getByRole('link', { name: names[at + 1] ?? '' }).click();
  await expect(page.locator('.file-walk')).toContainText(
    `${String(at + 2)} of ${String(names.length)}`,
  );
});

test('a photo opens the viewer, full screen with More (#606)', async ({
  page,
}) => {
  await page.goto(`/folder/${FLAT}`);
  await page
    .locator('.folder-item', { hasText: 'Arlington Road, window sign' })
    .filter({ hasText: /Photo/ })
    .first()
    .click();
  const open = page.locator('.photo-viewer-open');
  await expect(open).toBeVisible();
  await expect(page.getByText('Tap to see it whole')).toBeVisible();
  await open.click();
  const full = page.getByRole('dialog', {
    name: 'Arlington Road, window sign',
  });
  await expect(full).toBeVisible();
  await expect(full.locator('.photo-viewer-counter')).toContainText(
    'in Projects / Flat hunt',
  );
  await full.getByRole('button', { name: 'More' }).click();
  await expect(full).toHaveCount(0);
  await expect(page.getByRole('menu')).toBeVisible();
});
