/**
 * c4-undo-compensate (TL-P4-27 addenda 2 to 5): Undo is the inverse forward change. The dock's Undo of a Bin, online and
 * offline; "Since the last tidy-up" hides an original and its inverse as a pair; a pile removal Drive cannot check is
 * said in its confirm box. The named fake trigger: the situation `withdraw-unreached`, with its hooks
 * `window.__unreachDrive()` (notes of changes and pile things find no network, nor do checks of them) and
 * `window.__driveOffline()` (the pretend Drive finds no network at all).
 */
import type { Page } from '@playwright/test';
import { expectAxeClean } from './axe';
import { expect, isFake, test } from './fixtures';

const NOTE = 'Flat 3, 12 Larkspur Lane';
const NOTE_URL = '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md';
const NOT_UNDONE = 'Not undone yet: Bower could not reach Drive. Try again when you are back online.';
const NOT_REMOVED = 'Not removed yet: Bower could not reach Drive to check. Try again when you are back online.';

async function open(page: Page, path: string): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=withdraw-unreached&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
}

/** The note goes to the Bin from its own page's menu, on the phone and on the desktop alike. */
async function binTheNote(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await open(page, NOTE_URL);
    await page.getByRole('button', { name: `More for ${NOTE}` }).click();
  } else {
    await open(page, '/');
    await page.getByRole('tree', { name: 'Your Bower folder' }).getByRole('treeitem', { name: new RegExp(NOTE) }).click({ button: 'right' });
  }
  await page.getByRole('menuitem', { name: 'Move to Bin', exact: true }).or(page.getByRole('dialog').getByRole('button', { name: 'Move to Bin', exact: true })).click();
  await expect(page.getByRole('status').getByText(`${NOTE} is in your Drive's Bin.`)).toBeVisible();
}

test('the dock Undo of a Bin brings the note back, and Since the last tidy-up shows neither line', async ({ page, isMobile }) => {
  test.skip(!isFake, 'the pretend Drive keeps the change journal');
  await binTheNote(page, isMobile);
  const dock = page.getByRole('status');
  const undo = dock.getByRole('button', { name: 'Undo' });
  const box = await undo.locator('..').elementHandle();
  if (!box) throw new Error('Undo toast missing');
  // Let the original entrance finish before measuring the confirmation's own box.
  await box.evaluate(async (el) => { await Promise.all(el.getAnimations().map((a) => a.finished)); });
  const before = await box.boundingBox();
  if (!before) throw new Error('Undo toast has no box');
  await undo.click();
  await expect(dock.getByText(`${NOTE} is back`)).toBeVisible();
  expect(await box.evaluate((el) => el.isConnected && el.textContent === 'Flat 3, 12 Larkspur Lane is back')).toBe(true);
  const after = await box.boundingBox();
  if (!after) throw new Error('Confirmation toast has no box');
  expect(after.x).toBe(before.x);
  expect(after.width).toBe(before.width);
  expect(after.y + after.height).toBe(before.y + before.height);
  expect(await box.evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect(dock.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expectAxeClean(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inbox' }).first()).toBeVisible();
  await expect(page.getByText(`Put ${NOTE} in the Bin`)).toHaveCount(0);
  await expect(page.getByText(`Put back ${NOTE}`)).toHaveCount(0);
  await expectAxeClean(page);
});

test('the dock Undo of a Bin while offline says Not undone yet in place, with Try again', async ({ page, allowConsole, isMobile }) => {
  test.skip(!isFake, 'the pretend Drive stops answering in this situation');
  allowConsole(/offline|Google Drive didn't answer|could not reach Drive/i, 'the situation finds no network for the restore');
  await binTheNote(page, isMobile);
  await page.evaluate(() => (window as unknown as { __driveOffline: () => void }).__driveOffline());
  const dock = page.getByRole('status');
  await dock.getByRole('button', { name: 'Undo' }).click();
  await expect(dock.getByText(NOT_UNDONE)).toBeVisible();
  await expect(dock.getByText(NOT_UNDONE)).toHaveCount(1);
  await expect(dock.getByText(/is in your Drive's Bin/)).toHaveCount(0);
  await expect(page.getByText(`${NOTE} is back`)).toHaveCount(0);
  const again = dock.getByRole('button', { name: 'Try again' });
  await expect(again).toBeFocused();
  await expectAxeClean(page);
  // Try again runs the same Undo: still offline, the same message says so again.
  await again.click();
  await expect(dock.getByText(NOT_UNDONE)).toHaveCount(1);
});

test('a pile removal that cannot reach Drive says so in its confirm box', async ({ page, allowConsole }) => {
  test.skip(!isFake, 'the pretend Drive stops answering in this situation');
  allowConsole(/offline|Google Drive didn't answer|could not reach Drive/i, 'the situation finds no network for the thing and its check');
  await open(page, '/add');
  await page.evaluate(() => (window as unknown as { __unreachDrive: () => void }).__unreachDrive());
  await page.getByLabel('Paste a link').fill('https://insurer.example/renewal');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByRole('button', { name: /Add 1 thing to the inbox/ }).click();
  await page.getByRole('region', { name: 'Inbox' }).getByRole('link', { name: /insurer\.example/ }).first().click();
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Remove this pile', exact: true }).click();
  const remove = main.getByRole('button', { name: 'Remove the pile', exact: true });
  await remove.click();
  const box = main.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Remove the pile', exact: true }) });
  await expect(box.getByText(NOT_REMOVED)).toBeVisible();
  await expect(box.getByText(/go to the Bin of your Drive/)).toHaveCount(0);
  await expect(remove).toBeFocused();
  await expect(page.getByRole('status').getByText(/Pile removed|did not work/)).toHaveCount(0);
  await expectAxeClean(page, { include: 'main' });
  await main.getByRole('button', { name: 'Keep it', exact: true }).click();
  await expect(box.getByText(NOT_REMOVED)).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Remove this pile', exact: true })).toBeVisible();
});
