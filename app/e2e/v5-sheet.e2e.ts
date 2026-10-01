/**
 * The tidy-up sheet on the shared overlay (#752, R-SHEET-1 to R-SHEET-6,
 * R-BIRD-8): a scrim, the page behind inert and not tappable, the four
 * states from the run's outcome, and "Finish the tidy-up" straight to the
 * confirmation. The demo holds the current run in one state through the
 * `bower:demo:run` session-storage switch (`demo/server.ts`); the chip opens
 * the sheet (`run-chip.tsx`).
 */

import type { Page } from '@playwright/test';

import { expect, test } from './demo.js';

const FLAT = '/folder/4-Archives/Flat%20hunt';

async function holdRun(page: Page, state: string): Promise<void> {
  await page.addInitScript((held) => {
    sessionStorage.setItem('bower:demo:run', held);
  }, state);
}

/**
 * A run met while it goes opens its sheet by itself once; a result already
 * over waits for the chip (`run-chip.tsx`, phone or desktop).
 */
async function openSheet(
  page: Page,
  label: string,
  byChip: boolean,
): Promise<void> {
  await page.goto(FLAT);
  if (byChip) await page.locator('.run-chip-button').click();
  await expect(page.getByRole('dialog', { name: label })).toBeVisible();
}

test('the sheet is modal: a tap on the page behind does nothing (R-SHEET-1)', async ({
  page,
}) => {
  await holdRun(page, 'running');
  await openSheet(page, 'Tidying up', false);
  const scrim = page.locator('.overlay-scrim');
  await expect(scrim).toBeVisible();
  await expect(page.locator('#app > .shell')).toHaveAttribute('inert', '');
  const overflow = await page.evaluate(() => document.body.style.overflow);
  expect(overflow).toBe('hidden');

  // A tap where the page sits lands on the scrim, not on it. The folder's
  // heading is always in view; a project card can push the rows below the fold.
  const row = page.locator('.page-header-title');
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  const before = page.url();
  const sheetBox = await page.getByRole('dialog').boundingBox();
  const x = (box?.x ?? 0) + 8;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  // Only where the sheet does not cover it: the scrim takes the tap and closes.
  const covered =
    sheetBox !== null &&
    x >= sheetBox.x &&
    x <= sheetBox.x + sheetBox.width &&
    y >= sheetBox.y &&
    y <= sheetBox.y + sheetBox.height;
  if (!covered) {
    await page.mouse.click(x, y);
    expect(page.url()).toBe(before);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('running: the Tidying bird stage is 166 px, with the steps and the demo note (R-BIRD-8, R-SHEET-5)', async ({
  page,
}) => {
  await holdRun(page, 'running');
  await openSheet(page, 'Tidying up', false);
  const sheet = page.getByRole('dialog', { name: 'Tidying up' });
  await expect(
    sheet.getByRole('heading', { name: 'Tidying up 2 things' }),
  ).toBeVisible();
  const stage = sheet.locator('.working-sheet-stage');
  const box = await stage.boundingBox();
  expect(Math.round(box?.height ?? 0)).toBe(166);
  const steps = sheet
    .getByRole('list', { name: 'Steps' })
    .getByRole('listitem');
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(2)).toContainText('Writing notes');
  await expect(sheet).toContainText('A recording.');
  await expect(
    sheet.getByRole('button', { name: 'Close' }).last(),
  ).toBeVisible();
});

test('done: tiles, rows with a tag, and See everything opens Just filed for this run (R-SHEET-2, 3, 6)', async ({
  page,
}, testInfo) => {
  // v6 (#906, E-9): the done sheet opens from the phone chip; the desktop
  // top bar has no "Done · 1 filed" pill to open it from.
  test.skip(testInfo.project.name !== 'phone', 'the done chip is phone-only');
  await holdRun(page, 'done');
  await openSheet(page, 'Tidy-up done', true);
  const sheet = page.getByRole('dialog', { name: 'Tidy-up done' });
  await expect(sheet.getByRole('heading', { name: 'Done' })).toBeVisible();
  await expect(
    sheet.getByRole('list', { name: 'What this tidy-up did' }),
  ).toBeVisible();
  const row = sheet.locator('.working-sheet-row').first();
  await expect(row.locator('.working-sheet-tag')).toBeVisible();
  const align = await row
    .locator('.working-sheet-row-title')
    .evaluate((element) => getComputedStyle(element).textAlign);
  expect(['left', 'start']).toContain(align);
  const see = sheet.getByRole('link', { name: 'See everything' });
  await expect(see).toHaveAttribute('href', /^\/just-filed\?run=/);
  await see.click();
  await expect(page).toHaveURL(/\/just-filed\?run=/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('partly done: Finish the tidy-up opens the confirmation directly (R-SHEET-4)', async ({
  page,
}) => {
  await holdRun(page, 'partial');
  await openSheet(page, 'Tidy-up partly done', true);
  const sheet = page.getByRole('dialog', { name: 'Tidy-up partly done' });
  await expect(
    sheet.getByRole('heading', { name: 'Partly done' }),
  ).toBeVisible();
  await expect(sheet.locator('.working-sheet-step-stopped')).toContainText(
    'stopped',
  );
  await sheet.getByRole('button', { name: 'Finish the tidy-up' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Is that everything?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Tidy-up partly done' }),
  ).toHaveCount(0);
});
