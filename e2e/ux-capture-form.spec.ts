/**
 * ux-capture-form: capture looks empty until it holds something. Example placeholders, one muted placeholder colour
 * for every input (light and dark), "Add a photo" on every width, and Add still saves, recovers and keeps its draft.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';
import { resize } from './viewport';

const DESCRIPTION = 'What is this? (optional)';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}?scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const theme = (page: Page, value: string) => page.evaluate((v) => document.documentElement.setAttribute('data-theme', v), value);
const muted = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--text-muted)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
const look = (el: Locator) =>
  el.evaluate((n) => {
    const p = getComputedStyle(n, '::placeholder');
    return { placeholder: p.color, opacity: p.opacity, typed: getComputedStyle(n).color };
  });

test('AC3 Add and both Ask modes show the example placeholders', async ({ page }) => {
  await open(page, '/add');
  await expect(page.getByRole('textbox', { name: DESCRIPTION, exact: true })).toHaveAttribute('placeholder', 'For example, receipts from a weekend away');
  await open(page, '/bower');
  await expect(page.getByRole('textbox', { name: 'Your request', exact: true })).toHaveAttribute('placeholder', 'For example, put my visa papers together and tell me what is missing');
  await page.getByRole('radio', { name: 'A rule', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'The rule', exact: true })).toHaveAttribute('placeholder', 'For example, receipts go to Money, by month');
});

for (const mode of ['light', 'dark'] as const) {
  test(`AC3 placeholders are --text-muted at full opacity, distinct from typed text (${mode})`, async ({ page }) => {
    const check = async (name: string, el: Locator): Promise<void> => {
      await expect(el, name).toBeVisible();
      await theme(page, mode);
      const want = await muted(page);
      const got = await look(el);
      expect(got.placeholder, `${name}: placeholder colour`).toBe(want);
      expect(got.opacity, `${name}: placeholder opacity`).toBe('1');
      expect(got.typed, `${name}: typed text`).not.toBe(want);
    };
    await open(page, '/add');
    await check('Add description', page.getByRole('textbox', { name: DESCRIPTION, exact: true }));
    await open(page, '/bower');
    await check('Ask box', page.getByRole('textbox', { name: 'Your request', exact: true }));
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.locator('[cmdk-input]');
    await expect(palette).toBeVisible();
    await check('Palette input', palette);
  });
}

for (const width of [390, 1440]) {
  test(`AC4 the photo action reads "Add a photo" and keeps capture and accept (${width})`, async ({ page }) => {
    await resize(page, { width, height: 900 });
    await open(page, '/add');
    await expect(page.getByRole('button', { name: 'Add a photo', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take a photo', exact: true })).toHaveCount(0);
    const camera = page.locator('input[type=file][capture]');
    await expect(camera).toHaveAttribute('capture', 'environment');
    await expect(camera).toHaveAttribute('accept', 'image/*');
  });
}

const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF ${name}`) });

test('AC4 one file with no description saves, and the same file twice stays one row', async ({ page }) => {
  await open(page, '/add');
  const files = page.locator('input[type=file][multiple]');
  await files.setInputFiles([pdf('capture-a.pdf')]);
  await files.setInputFiles([pdf('capture-a.pdf')]);
  await expect(page.getByText('capture-a.pdf is already in this pile.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'In this pile' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add 1 thing to the inbox', exact: true }).click();
  await expect(page.getByText('1 thing in the inbox', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/(\?|$)/);
});

test('AC4 the draft is kept across a reload: words and a link', async ({ page }) => {
  await open(page, '/add');
  await page.getByRole('textbox', { name: 'Paste a link', exact: true }).fill('https://example.com/capture');
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(page.getByRole('textbox', { name: DESCRIPTION, exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: DESCRIPTION, exact: true }).fill('Papers from Alex');
  await page.reload();
  await expect(page.getByRole('textbox', { name: DESCRIPTION, exact: true })).toHaveValue('Papers from Alex');
  await expect(page.getByRole('list', { name: 'In this pile' })).toContainText('example.com/capture');
  await expect(page.getByRole('button', { name: 'Add 1 thing to the inbox', exact: true })).toBeEnabled();
});

test('AC2/AC4 after a real reload, a file whose bytes are gone shows the recovery reason, not the empty one', async ({ page }) => {
  test.skip(!isFake, 'The reload case is judged on the pretend Drive (R6, R9).');
  await open(page, '/add');
  await page.locator('input[type=file][multiple]').setInputFiles([pdf('capture-b.pdf')]);
  await expect(page.getByRole('button', { name: 'Add 1 thing to the inbox', exact: true })).toBeEnabled();
  await page.reload();
  const save = page.getByRole('button', { name: /to the inbox$/ });
  await expect(save).toBeDisabled();
  await expect(save).toHaveAccessibleDescription('Add the missing files again, or take them out.');
  await expect(page.getByText('Add a file, a photo or a link first.')).toHaveCount(0);
  await page.locator('input[type=file][multiple]').setInputFiles([pdf('capture-b.pdf')]);
  await expect(page.getByRole('button', { name: 'Add 1 thing to the inbox', exact: true })).toBeEnabled();
  await expect(page.getByText('Add the missing files again, or take them out.')).toHaveCount(0);
});
