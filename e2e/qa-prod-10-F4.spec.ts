/**
 * qa-prod-10-F4: on the phone, a sheet opened during a tidy-up covers the run chip: the New folder sheet's Name field
 * takes the tap, and the chip is under the scrim (specs/qa-prod-10/plan.md, F4; WAI-ARIA APG modal dialog).
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** What `elementFromPoint` finds at the centre of `target`, and whether it is inside `inside`. */
const hitAt = async (page: Page, target: Locator, inside: Locator): Promise<boolean> => {
  const box = await target.boundingBox();
  if (!box) throw new Error('The element has no box.');
  const owner = await inside.elementHandle();
  return page.evaluate(([x, y, el]) => !!el && el.contains(document.elementFromPoint(x, y)), [box.x + box.width / 2, box.y + box.height / 2, owner] as const);
};

test('AC2 qa10 new folder sheet above the run chip', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the run chip is the phone one');
  await page.goto('/files?scenario=running&time=demo');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const chip = page.getByTestId('dock-stack').getByRole('button', { name: /…$/ });
  await expect(chip, 'setup: the run chip shows').toBeVisible({ timeout: 15_000 });
  const chipBox = await chip.boundingBox();
  await page.getByRole('main').getByRole('button', { name: 'Folder tools', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'New folder', exact: true });
  const field = sheet.getByRole('textbox', { name: 'Name', exact: true });
  await expect(field).toBeFocused();
  await expect.poll(() => sheet.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  expect(await hitAt(page, field, field), 'AC2: the Name field takes a tap at its centre').toBe(true);
  if (!chipBox) throw new Error('The chip has no box.');
  const onChip = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="dock-stack"]') !== null, [chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2] as const);
  expect(onChip, 'AC2: the chip is under the sheet\'s scrim').toBe(false);
  await field.click();
  await field.fill('Receipts');
  await expect(field).toHaveValue('Receipts');
});
