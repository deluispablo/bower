/**
 * v2-name-sheet (d-v2-09): Rename, New note and New folder ask for a name in one sheet,
 * drawn with the one field rule. Phone and desktop, on the fake Drive.
 */
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expect, isFake, test } from './fixtures';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

const axeClean = async (page: Page, within: string): Promise<void> => {
  // A sheet pops in; check it once it has settled.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
  );
  const axe = await new AxeBuilder({ page })
    .include(within)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .options({ rules: { 'target-size': { enabled: true } } })
    .analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
};

/** An empty folder "Empty one", opened as a list, so its own "New note in" button shows. */
const emptyFolder = async (page: Page, isMobile: boolean): Promise<void> => {
  if (isMobile) {
    await open(page, '/files/Resources/Cooking');
    await page.getByRole('button', { name: 'More for Cooking', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'New folder', exact: true }).click();
    await page.keyboard.type('Empty one');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/files\/Resources\/Cooking\/Empty%20one/);
    return;
  }
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /^Resources/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New folder' }).click();
  await page.keyboard.type('Empty one');
  await page.keyboard.press('Enter');
  await tree.getByRole('treeitem', { name: /^Empty one/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open as a list or table' }).click();
};

test('the rename field spans the sheet and selects the name', async ({ page, isMobile }) => {
  test.skip(!isFake, 'The fake Drive is the source this entry is judged on.');
  if (!isMobile) {
    // The desktop renames in the tree; its name sheet is the folder page's New note, with the same field.
    await emptyFolder(page, false);
    await page.getByRole('button', { name: 'New note in Empty one' }).click();
    const sheet = page.getByRole('dialog', { name: 'New note', exact: true });
    const field = sheet.getByRole('textbox', { name: 'Name', exact: true });
    await expect(field).toBeFocused();
    const w = await field.evaluate((n) => ({ box: n.getBoundingClientRect().width, font: parseFloat(getComputedStyle(n).fontSize), form: n.closest('form')?.getBoundingClientRect().width ?? 0 }));
    expect(w.box).toBeGreaterThanOrEqual(300);
    expect(w.font).toBeGreaterThanOrEqual(16);
    expect(w.box).toBeGreaterThanOrEqual(w.form - 1);
    await expect(sheet.getByText(/Links to this/)).toHaveCount(0);
    return;
  }
  for (const [path, label, start, line] of [
    ['/note/Projects/Flat%20hunt/Lease%20draft.pdf', 'Lease draft', 'Lease draft', 'Links to this file keep working.'],
    ['/note/Resources/Cooking/Lemon%20tart.md', 'Lemon tart', 'Lemon tart', 'Links to this note keep working.'],
  ] as const) {
    await open(page, path);
    await page.getByRole('button', { name: `More for ${label}`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Rename', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Rename', exact: true });
    const field = sheet.getByRole('textbox', { name: 'Name', exact: true });
    await expect(field).toHaveValue(start);
    await expect(field).toBeFocused();
    const m = await field.evaluate((n: HTMLInputElement) => ({
      width: n.getBoundingClientRect().width,
      font: parseFloat(getComputedStyle(n).fontSize),
      from: n.selectionStart,
      to: n.selectionEnd,
    }));
    expect(m.width, 'field width').toBeGreaterThanOrEqual(300);
    expect(m.font, 'font size').toBeGreaterThanOrEqual(16);
    expect([m.from, m.to], 'selection').toEqual([0, start.length]);
    await expect(sheet.getByText(line, { exact: true })).toBeVisible();
    const cancel = sheet.getByRole('button', { name: 'Cancel', exact: true });
    const rename = sheet.getByRole('button', { name: 'Rename', exact: true });
    const [c, r] = await Promise.all([cancel.boundingBox(), rename.boundingBox()]);
    expect(c?.height).toBeGreaterThanOrEqual(44);
    expect(r?.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs((c?.width ?? 0) - (r?.width ?? 1))).toBeLessThan(2);
    expect(Math.abs((c?.y ?? 0) - (r?.y ?? 1))).toBeLessThan(2);
    await axeClean(page, '[role="dialog"]');
    await cancel.click();
    await expect(sheet).toHaveCount(0);
  }
  // A folder gets no links line, and a slash is explained under the field.
  await open(page, '/files/Projects/Job%20hunt/Applications');
  await page.getByRole('button', { name: 'More for Applications', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rename', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Rename', exact: true });
  await expect(sheet.getByText(/Links to this/)).toHaveCount(0);
  const field = sheet.getByRole('textbox', { name: 'Name', exact: true });
  await field.fill('A/B');
  await expect(sheet.getByText('Names cannot have slashes; Bower used a dash.')).toBeVisible();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await axeClean(page, '[role="dialog"]');
});

test('new note from a folder uses the name sheet', async ({ page, isMobile }) => {
  test.skip(!isFake, 'The fake Drive is the source this entry is judged on.');
  await emptyFolder(page, isMobile);
  await page.getByRole('button', { name: 'New note in Empty one' }).click();
  const sheet = page.getByRole('dialog', { name: 'New note', exact: true });
  await expect(sheet).toBeVisible();
  // The name sheet's field and button, not a second form.
  const field = sheet.getByRole('textbox', { name: 'Name', exact: true });
  await expect(field).toBeFocused();
  expect((await field.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(300);
  await expect(sheet.getByText(/Links to this/)).toHaveCount(0);
  await axeClean(page, '[role="dialog"]');
  await field.fill('Soup/ideas');
  await sheet.getByRole('button', { name: 'Make the note', exact: true }).click();
  await expect(page.getByRole('status').getByText('Names cannot have slashes; Bower used a dash.')).toBeVisible();
  await expect(page).toHaveURL(/\/note\/Resources(?:\/Cooking)?\/Empty%20one\/Soup-ideas\.md/);
});
