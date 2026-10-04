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
