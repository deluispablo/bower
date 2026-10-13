import { expect, test } from './fixtures';
import { axeScan } from './axe';

test('AC1 the whole Files page, right panel included, has no heading-order violation', async ({ page, isMobile }) => {
  await page.goto('/files?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Positive control: on desktop the panel after main is there and keeps its heading name.
  if (!isMobile) await expect(page.getByRole('heading', { name: 'Now', exact: true })).toBeVisible();
  const results = await axeScan(page);
  const order = results.violations.filter((v) => v.id === 'heading-order');
  expect(order.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});
