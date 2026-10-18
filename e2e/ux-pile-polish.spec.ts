/**
 * ux-pile-polish (rulings R2, R3, R4, R5, R9): a picture added through Add shows in its 38 x 38 px box with its whole
 * name, the pile says its origin once, and a picture the browser cannot decode keeps the same box with words in it.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

// A real 1 x 1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const LONG = 'Kitchen-shelf-measurements-for-the-new-flat.png';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}?scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

const row = (page: Page, name: string): Locator => page.getByRole('list', { name: 'In this pile' }).getByRole('listitem').filter({ hasText: name });
const box = (r: Locator): Locator => r.locator('> span').first();
const size = async (l: Locator): Promise<{ width: number; height: number }> => {
  const b = await l.boundingBox();
  return { width: b?.width ?? 0, height: b?.height ?? 0 };
};
const loaded = (r: Locator) => r.locator('img').evaluateAll((imgs) => imgs.some((i) => i instanceof HTMLImageElement && i.complete && i.naturalWidth > 0));

const sendPile = async (page: Page): Promise<void> => {
  await open(page, '/add');
  await page.locator('input[type=file][multiple]').setInputFiles([
    { name: LONG, mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') },
    { name: 'Shelf.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a picture, only words') },
  ]);
  await page.getByRole('textbox', { name: 'What is this? (optional)', exact: true }).fill('Shelf photos');
  await page.getByRole('button', { name: 'Add 2 things to the inbox', exact: true }).click();
  await page.getByRole('link', { name: /Shelf photos/ }).first().click();
};

test('AC1/AC2 a picture added through Add shows in its box, with its whole name and the origin said once', async ({ page }) => {
  await sendPile(page);

  await expect(page.getByText(/^2 things from this device, added /)).toBeVisible();
  await expect(page.getByRole('list', { name: 'In this pile' }).getByText('From this device')).toHaveCount(0);

  const picture = row(page, LONG);
  await expect.poll(() => loaded(picture), { timeout: 10_000 }).toBe(true);
  const s = await size(box(picture));
  expect(Math.abs(s.width - 38)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(s.height - 38)).toBeLessThanOrEqual(0.5);

  const name = picture.getByText(LONG, { exact: true });
  await expect(name).toBeVisible();
  const fit = await name.evaluate((n) => ({ scroll: n.scrollWidth, client: n.clientWidth, overflow: getComputedStyle(n).textOverflow }));
  expect(fit.scroll).toBeLessThanOrEqual(fit.client);
  expect(fit.overflow).not.toBe('ellipsis');

});

test('AC2 a picture the browser cannot decode keeps the same box and says Preview unavailable', async ({ page }) => {
  test.skip(!isFake, 'The demo answers its valid PNG for every image (R6); the undecodable case is judged on the pretend Drive (R2).');
  await sendPile(page);
  // The pretend Drive holds the words as they were sent, which no browser decodes (R5); the demo answers its PNG (R6).
  const words = row(page, 'Shelf.jpg');
  await expect(words).toContainText('Preview unavailable', { timeout: 10_000 });
  expect(await loaded(words)).toBe(false);
  const w = await size(box(words));
  expect(Math.abs(w.width - 38)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(w.height - 38)).toBeLessThanOrEqual(0.5);
});
