/**
 * ux-first-tidy-checklist: the first tidy-up on Home. Adding ticks step 1, an admitted start ticks step 2 (a refused one
 * does not), and only opening a finished report ticks step 3, which the folder keeps without this device (rulings R7, R8).
 */
import type { Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

const open = async (page: Page, query: string): Promise<void> => {
  await page.goto(`/?${query}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const checklist = (page: Page) => page.getByRole('region', { name: 'Your first tidy-up' });
const item = (page: Page, n: number) => checklist(page).getByRole('listitem').nth(n);
/** Presses the checklist's button for its current step, once it shows. */
const press = async (page: Page, name: string): Promise<void> => {
  const button = checklist(page).getByRole('button', { name, exact: true });
  await expect(button).toBeVisible();
  await button.click();
};
const startFromChecklist = async (page: Page): Promise<void> => {
  await press(page, 'Tidy up');
  const dialog = page.getByRole('dialog', { name: /^Tidy up \d+ things\?$/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Tidy up \d+ things$/ }).click();
};
/** Opens the finished tidy-up from the checklist and closes what opened (the replay or the report). */
const openTheReport = async (page: Page): Promise<void> => {
  await press(page, 'See the report');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
};

test('AC2 add_ticks_step_1: adding a pile ticks step 1 and leaves only Tidy up', async ({ page }) => {
  await open(page, 'scenario=empty&time=instant');
  await press(page, 'Add a pile');
  await page.getByRole('textbox', { name: 'What is this?' }).fill('Ask the landlord about the heating');
  await page.getByRole('button', { name: 'Add to the inbox' }).click();
  await expect(page.getByRole('region', { name: 'Inbox' }).getByRole('link', { name: /Ask the landlord about the heating/ })).toBeVisible();
  await expect(item(page, 0)).toContainText('Done');
  await expect(checklist(page).getByRole('button')).toHaveCount(1);
  await expect(checklist(page).getByRole('button', { name: 'Tidy up', exact: true })).toBeVisible();
});

test('AC2 admission_ticks_step_2: starting from the confirm sheet ticks step 2', async ({ page }) => {
  await open(page, 'scenario=default&time=demo');
  await startFromChecklist(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Hide this' }).click();
  await expect(item(page, 1)).toContainText('Done');
  await expect(item(page, 2)).toHaveAttribute('aria-current', 'step');
  await expect(checklist(page).getByRole('button')).toHaveCount(0);
});

test('AC2 refused_start_keeps_step_2: a start the Worker refuses ticks nothing', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the Worker answering 500 is the fake source');
  allowConsole(/Worker answered 500/, 'the Worker answers 500 to the first press, on purpose');
  await open(page, 'scenario=start-fails&time=instant');
  await startFromChecklist(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toHaveText("Something went wrong on Bower's side. Try again later.");
  await dialog.getByRole('button', { name: 'Not now' }).click();
  await expect(checklist(page).getByRole('button', { name: 'Tidy up', exact: true })).toBeVisible();
  await expect(item(page, 1)).toHaveAttribute('aria-current', 'step');
});

test('AC2 failed_run_keeps_recovery: a failed run keeps Try again and never ticks step 3', async ({ page }) => {
  await open(page, 'scenario=fail-run&time=instant');
  await startFromChecklist(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  const stopped = page.locator('section[aria-labelledby="stopped"]');
  await expect(stopped.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(item(page, 2)).not.toContainText('Done');
  await expect(checklist(page).getByRole('button', { name: 'See the report' })).toHaveCount(0);
  await stopped.getByRole('button', { name: 'Got it' }).click();
  await expect(checklist(page)).toBeVisible();
  await expect(item(page, 2)).not.toContainText('Done');
});

test('AC3 opening_the_report_ticks_step_3: opening the finished report ends the checklist', async ({ page }) => {
  await open(page, 'scenario=back&time=instant');
  await openTheReport(page);
  await expect(checklist(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
});

test('AC3 completion_survives_a_fresh_client: the folder keeps it with this device cleared', async ({ page }) => {
  test.skip(!isFake, 'the pretend Drive keeps the folder across a reload; the demo starts again');
  await open(page, 'scenario=back&time=instant');
  await expect(checklist(page)).toBeVisible();
  await openTheReport(page);
  await expect(checklist(page)).toHaveCount(0);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
  await expect(checklist(page)).toHaveCount(0);
});
