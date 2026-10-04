/**
 * Round eight: what the evaluator found after round six. Each test pins one
 * entry of harness/features.json with "task": "qa-8", on demo and on fake.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string, scenario = 'default', time = 'instant'): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}&time=${time}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

test('the page menu on the phone renames a note', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone page menu');
  await open(page, '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md');
  await page.getByRole('button', { name: 'More for Flat 3, 12 Larkspur Lane' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click();
  const box = page.getByRole('dialog', { name: 'Rename' }).getByRole('textbox');
  await expect(box).toHaveValue('Flat 3, 12 Larkspur Lane');
  await box.fill('Flat 3 on Larkspur');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/note\/Projects\/Flat%20hunt\/Flat%203%20on%20Larkspur\.md/);
});

test('the page menu on the phone makes a named note in a folder', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone page menu');
  await open(page, '/files/Areas/Car');
  await page.getByRole('button', { name: 'More for Car' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New note' }).click();
  await expect(page.getByRole('dialog', { name: 'New note' })).toBeVisible();
  await page.keyboard.type('Tyres');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/note\/Areas\/Car\/Tyres\.md/);
});

test('after Delete the tree keeps its place, and Undo brings the row back to the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(tree).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('status').getByText(/Lease draft(\.pdf)? is in the Bin/)).toBeVisible();
  await expect(tree).toHaveAttribute('aria-activedescendant', /^row-Projects%2FFlat%20hunt%2F/);
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status').getByText(/Lease draft(\.pdf)? is back/)).toBeVisible();
  await expect(tree).toHaveAttribute('aria-activedescendant', 'row-Projects%2FFlat%20hunt%2FLease%20draft.pdf');
  await expect(tree).toBeFocused();
});

test('focus after a stopped run is put away stays in the page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop side panel');
  for (const where of ['home', 'panel'] as const) {
    await open(page, '/', 'fail-run');
    await page.getByRole('button', { name: /^Tidy up 15 things$/ }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /^Tidy up 15 things$/ }).click();
    await expect(page.getByRole('dialog').getByText('The tidy-up stopped').first()).toBeVisible({ timeout: 8000 });
    await page.keyboard.press('Escape');
    if (where === 'home') await page.getByRole('alert').getByRole('button', { name: 'Got it' }).click();
    else await page.getByRole('complementary').getByRole('button', { name: 'Put it away' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id), { message: where }).toBe('main');
  }
});
