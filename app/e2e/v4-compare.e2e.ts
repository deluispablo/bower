/**
 * Compare in the folder's Compare tab (#612, rebuilt by #916): the status
 * select offers the folder's own statuses and saves a change, the Columns
 * choice is remembered for the folder, and the phone draws the board
 * (PF-Compare-375). The same behaviour is covered against a stubbed Drive in
 * `test/compare-view.test.tsx`.
 */

import type { Page } from '@playwright/test';

import { expect, openHome, test } from './demo.js';

const MOONEE_PONDS =
  '/folder/1-Projects/Housing%20Search%20Australia/Moonee%20Ponds';
const APPLICATIONS = '/folder/1-Projects/Job%20Search%20Australia/Applications';

async function openCompare(page: Page, path = MOONEE_PONDS): Promise<void> {
  await openHome(page);
  await page.goto(path);
  await page.getByRole('tab', { name: /^Compare \d+ / }).click();
  await expect(page.locator('.compare')).toBeVisible();
}

test.describe('Compare (#612, #916)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // The demo's Drive starts over on a reload, so a status surviving one is
  // covered against a stubbed Drive (`test/compare-view.test.tsx`); here the
  // change is saved without an error and the table shows it.
  test('a changed status is saved and shown', async ({ page }) => {
    await openCompare(page);
    const select = page.getByLabel('Status of 6-20 Mantell St, Moonee Ponds');
    await expect(select.locator('option')).toHaveText([
      'New',
      'To view',
      'Viewed',
      'Applied',
      'Approved',
      'Signed',
      'Not for me',
      'Turned down',
    ]);
    await select.selectOption('viewed');
    await expect(select).toHaveValue('viewed');
    await expect(page.getByText(/couldn.t save that status/)).toHaveCount(0);
  });

  test('a column picked in Columns stays for the folder', async ({ page }) => {
    await openCompare(page);
    const headers = page.locator('th[scope="col"]');
    await expect(headers).toHaveText([
      'Flat',
      'Rent',
      'Available',
      'Against the area',
      'Fit',
      'Status',
    ]);
    await page.getByRole('button', { name: 'Columns' }).click();
    const popover = page.getByRole('dialog', { name: 'Columns' });
    await popover.getByLabel('Rooms').check();
    await popover.getByRole('button', { name: 'Done' }).click();
    await expect(headers.nth(2)).toHaveText('Rooms');

    await page.reload();
    await page.getByRole('tab', { name: /^Compare \d+ / }).click();
    await expect(page.locator('th[scope="col"]').nth(2)).toHaveText('Rooms');
  });

  test('a header click sorts, the active header says which way', async ({
    page,
  }) => {
    await openCompare(page);
    const fit = page.locator('th[scope="col"]', { hasText: 'Fit' });
    await expect(fit).toHaveAttribute('aria-sort', 'descending');
    const rent = page.locator('th[scope="col"]', { hasText: 'Rent' });
    await rent.getByRole('button').click();
    await expect(rent).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator('tbody th').first()).toHaveText(
      '6-20 Mantell St, Moonee Ponds',
    );
  });

  test('job offers: six columns, the folder statuses, the older value kept', async ({
    page,
  }) => {
    await openCompare(page, APPLICATIONS);
    await expect(page.locator('th[scope="col"]')).toHaveText([
      'Offer',
      'Salary',
      'Where',
      'Holiday',
      'Fit',
      'Status',
    ]);
    const select = page.getByLabel(
      'Status of Senior Consultant - Data Engineer, Altis Consulting',
    );
    await expect(select.locator('option')).toHaveText([
      'New',
      'Applied',
      'Interview',
      'Offer',
      'Accepted',
      'Not for me',
      'Turned down',
      'Declined',
    ]);
  });
});

test.describe('Compare on a phone (#701, #916)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('draws the board: the Sort chip, the quick filter, the cards', async ({
    page,
  }) => {
    await openCompare(page);
    await expect(page.locator('.compare-sort-btn')).toHaveText(
      'Fit, high first',
    );
    const filter = page.locator('.compare-chip[aria-pressed]');
    await expect(filter).toHaveText(/^Free before \d+ \w+$/);
    const cards = page.locator('.compare-card');
    await expect(cards).toHaveCount(6);
    await expect(cards.first()).toContainText('10-43 Buckley St, Moonee Ponds');
    await expect(cards.first()).toContainText('73/100');
    await expect(cards.first()).toContainText('460 AUD/week · 1 bed · from');
    await expect(cards.first().locator('.status-select-date')).toHaveText(
      /^Viewing \w{3} \d+ \w{3}$/,
    );
    await expect(cards.nth(1)).toContainText('No date yet');
    await expect(page.getByText('Copy as table')).toHaveCount(0);

    await filter.click();
    await expect(filter).toHaveText(/· 3 hidden without a date$/);
    await expect(cards).toHaveCount(3);
  });
});
