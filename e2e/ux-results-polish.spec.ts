import type { Page } from '@playwright/test';
import { expect, openTidy, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

// ux-results-polish: the report keeps its lists behind "See the list", the phone replay lists every thing whole under
// its folder, the desktop keeps its heap, and the replay closes with "Close". Made-up data (the default scenario).

const PARA = 'Projects have an end, Areas go on, Resources are for later, Archive is done.';
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1440, height: 900 };

/** Runs the default tidy-up from Home and returns its sheet, finished, with the filed count. */
async function finishedReport(page: Page, size: { width: number; height: number }): Promise<{ filed: number }> {
  await resize(page, size);
  await page.goto('/?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await openTidy(page);
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
  const title = sheet.getByText(/^Done\. \d+ things filed(, \d+ notes? updated)?\.$/).last();
  await expect(title).toBeVisible({ timeout: 20_000 });
  return { filed: Number(/(\d+) things filed/.exec((await title.textContent()) ?? '')?.[1]) };
}

/** Opens the replay from the sheet. */
async function replay(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Watch what Bower did', exact: true }).click();
  const court = page.getByRole('dialog', { name: 'What Bower did in the tidy-up' });
  await expect(court).toBeVisible();
  return court;
}

test('AC2 see_the_list: the lists open from "See the list", and every link focuses clear of the actions at 390 px', async ({ page }) => {
  await finishedReport(page, PHONE);
  const sheet = page.getByRole('dialog');
  const more = sheet.getByText('See the list', { exact: true });
  await expect(more).toBeVisible();
  await expect(sheet.getByRole('list', { name: 'Brought up to date' })).toHaveCount(0);
  // What needs the person shows without opening it.
  await expect(sheet.getByText('Bower has a question', { exact: true })).toBeVisible();
  await more.click();
  await expect(sheet.getByRole('list', { name: 'New notes' })).toBeVisible();
  await expect(sheet.getByRole('list', { name: 'Brought up to date' })).toBeVisible();
  const done = sheet.getByRole('button', { name: 'Done', exact: true });
  // Only the disclosure's links: the question card keeps its own note link outside it (R2-1).
  const count = await sheet.locator('details').getByRole('link').count();
  expect(count, 'positive control: the list has links').toBeGreaterThan(0);
  await more.focus();
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    const clear = await done.evaluate((btn) => {
      const focus = document.activeElement;
      const row = btn.parentElement?.getBoundingClientRect();
      const box = btn.closest('[role="dialog"]')?.getBoundingClientRect();
      if (!focus || focus.tagName !== 'A' || !row || !box) return false;
      const r = focus.getBoundingClientRect();
      return r.top >= box.top - 0.5 && r.bottom <= row.top + 0.5;
    });
    expect(clear, `link ${i + 1} of ${count} is focused in view, above the actions row`).toBe(true);
  }
  await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
});

test('AC3 phone_rows_whole: the phone replay has no heap and lists every thing whole under its folder', async ({ page }) => {
  const { filed } = await finishedReport(page, PHONE);
  const court = await replay(page);
  await expect(court.getByRole('region', { name: 'Filed from your inbox' })).toHaveCount(0);
  const folders = court.getByRole('region', { name: 'Your folders' });
  const things = folders.locator('[data-kind]');
  await expect(things).toHaveCount(filed);
  const shelves = await folders.evaluate((el) => [...el.querySelectorAll('[data-shelf]')].map((p) => p.parentElement?.querySelectorAll('[data-kind]').length ?? 0));
  expect(Math.max(...shelves), 'positive control: one folder holds more than four things').toBeGreaterThan(4);
  // Whole names: no thing or its name is cut, clipped or ends in an ellipsis.
  const cut = await things.evaluateAll((els) => els.filter((el) => [el, ...el.querySelectorAll('span')].some((n) => n.scrollWidth > n.clientWidth + 1
    || getComputedStyle(n).textOverflow === 'ellipsis')).map((el) => el.textContent));
  expect(cut).toEqual([]);
});

test('AC4 motion: the phone plays to its end over real folders with one moving Bower; the desktop keeps its heap', async ({ page }) => {
  const { filed } = await finishedReport(page, PHONE);
  const court = await replay(page);
  await expect(court.getByRole('heading', { level: 2, name: `${filed} things filed` })).toBeVisible({ timeout: 30_000 });
  const moving = await page.evaluate(() => [...document.querySelectorAll('[data-bird]:not(.posed)')].filter((b) => getComputedStyle(b).visibility !== 'hidden').length);
  expect(moving).toBeLessThanOrEqual(1);
  await court.getByRole('button', { name: 'Close', exact: true }).click();
  await resize(page, DESK);
  await page.getByRole('main').getByRole('button', { name: 'Watch the last tidy-up' }).click();
  const desk = page.getByRole('dialog', { name: 'What Bower did in the tidy-up' });
  await expect(desk.getByRole('region', { name: 'Filed from your inbox' })).toBeVisible();
});

for (const still of ['reduced motion', 'Bower moves off'] as const) {
  test(`AC4 still (${still}): every result shows at once, on phone and desktop`, async ({ page }) => {
    if (still === 'reduced motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    else await page.addInitScript(() => localStorage.setItem('bower:prefs', JSON.stringify({ birdMoves: false })));
    const { filed } = await finishedReport(page, PHONE);
    const court = await replay(page);
    await expect(court.getByRole('region', { name: 'Your folders' }).locator('[data-kind]')).toHaveCount(filed, { timeout: 1500 });
    await expect(court.getByRole('heading', { level: 2, name: `${filed} things filed` })).toBeVisible({ timeout: 1500 });
    await court.getByRole('button', { name: 'Close', exact: true }).click();
    await resize(page, DESK);
    await page.getByRole('main').getByRole('button', { name: 'Watch the last tidy-up' }).click();
    const desk = page.getByRole('dialog', { name: 'What Bower did in the tidy-up' });
    await expect(desk.getByText('All filed items reached their folders.', { exact: true })).toBeVisible({ timeout: 1500 });
  });
}

for (const how of ['Escape', 'Back', 'Close'] as const) {
  test(`AC5 close (${how}): "Close" throughout; focus and the finished checklist hold`, async ({ page }) => {
    await finishedReport(page, PHONE);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const watch = page.getByRole('main').getByRole('button', { name: 'Watch what Bower did' });
    await watch.focus();
    await page.keyboard.press('Enter');
    const court = page.getByRole('dialog', { name: 'What Bower did in the tidy-up' });
    await expect(court).toBeVisible();
    await expect(court.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await expect(court.getByRole('button', { name: /^(Skip|Done)$/ })).toHaveCount(0);
    await expect(court.getByText(PARA, { exact: true })).toHaveCount(1);
    if (how === 'Escape') await page.keyboard.press('Escape');
    else if (how === 'Back') await page.goBack();
    else await court.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(court).toHaveCount(0);
    await expect(page.locator('main h1')).toBeFocused();
    await expect(page.getByRole('region', { name: 'Your first tidy-up' })).toHaveCount(0);
  });
}
