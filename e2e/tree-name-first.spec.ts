import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';

test('desktop pending New folder row passes WCAG 2.2 and target-size axe', async ({ page, isMobile }) => {
  if (isMobile) return;
  await page.goto('/files?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  const resources = tree.locator('[data-path="Resources"]');
  // Positive control: the actual target exists before opening its naming row.
  await expect(resources).toBeVisible();
  await resources.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
  const name = tree.getByRole('textbox', { name: 'New folder in Resources', exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('');
  await expect(name).toHaveAttribute('placeholder', 'Name');
  await expect(resources).toHaveAttribute('aria-expanded', 'true');
  await expectAxeClean(page, { include: '[role="tree"]', wcag22: true });
  // Include the signed invalid-field state, its description and the same target-size scan.
  await page.keyboard.type('Garden/plans');
  const error = tree.getByRole('alert');
  await expect(error).toHaveText('Names cannot have slashes; Bower used a dash.');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  const errorId = await error.getAttribute('id');
  expect(errorId).toBeTruthy();
  expect((await name.getAttribute('aria-describedby'))?.split(' ')).toContain(errorId);
  await expectAxeClean(page, { include: '[role="tree"]', wcag22: true });
  await page.keyboard.press('Escape');
  await expect(name).toHaveCount(0);
  await expect(tree.locator('[data-path="Resources/Garden-plans"]')).toHaveCount(0);
  // Positive control: the same entry can be used after cancelling.
  await resources.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
  await expect(name).toBeFocused();
  await page.keyboard.press('Escape');
});
