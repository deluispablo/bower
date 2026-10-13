import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** The row the tree names as active, with the facts WCAG 2.4.7 needs: the tree has focus and the row shows the focus token. */
async function activeRow(page: Page, tree: Locator): Promise<{ treeFocused: boolean; row: string | null; ring: boolean }> {
  return tree.evaluate((el) => {
    const id = el.getAttribute('aria-activedescendant');
    const row = id ? document.getElementById(id) : null;
    // Resolve the focus token (--accent-line) to the rgb the browser paints.
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent-line)';
    document.body.append(probe);
    const token = getComputedStyle(probe).color;
    probe.remove();
    const style = row ? getComputedStyle(row) : null;
    const ring = !!style && (
      (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && style.outlineColor === token) ||
      style.boxShadow.includes(token));
    return { treeFocused: document.activeElement === el, row: row?.getAttribute('data-path') ?? null, ring };
  });
}

async function expectRing(page: Page, tree: Locator): Promise<void> {
  // Immediately: no other key between the name box closing and the check.
  await expect(tree.getByRole('textbox')).toHaveCount(0);
  const state = await activeRow(page, tree);
  expect(state, 'the tree has focus, names an active row, and that row shows the focus ring').toMatchObject({ treeFocused: true, ring: true });
  expect(state.row).not.toBeNull();
}

for (const how of ['Enter', 'Escape'] as const) {
  test(`AC1 New folder from the tree: the active row shows a focus ring after ${how}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'The inline name box is the desktop tree.');
    await page.goto('/files?scenario=default&time=instant');
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    const resources = tree.locator('[data-path="Resources"]');
    await expect(resources).toBeVisible();
    await resources.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
    const name = tree.getByRole('textbox', { name: 'New folder in Resources', exact: true });
    await expect(name).toBeFocused();
    if (how === 'Enter') await page.keyboard.type('Ring check');
    await page.keyboard.press(how);
    await expectRing(page, tree);
  });

  test(`AC1 Rename from the tree: the active row shows a focus ring after ${how}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'The inline name box is the desktop tree.');
    await page.goto('/files?scenario=default&time=instant');
    await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
    const tree = page.getByRole('tree', { name: 'Your Bower folder' });
    const projects = tree.locator('[data-path="Projects"]');
    await expect(projects).toBeVisible();
    if ((await projects.getAttribute('aria-expanded')) !== 'true') await projects.click();
    const row = tree.locator('[data-path="Projects/Flat hunt"]');
    await expect(row).toBeVisible();
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await expect(tree.getByRole('textbox', { name: 'New name for Flat hunt', exact: true })).toBeFocused();
    // Enter with the name unchanged, so the row keeps its path while the box closes.
    await page.keyboard.press(how);
    await expectRing(page, tree);
  });
}

test('AC1 Rename from the tree: the renamed row shows a focus ring after Enter with a new name', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The inline name box is the desktop tree.');
  await page.goto('/files?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  const projects = tree.locator('[data-path="Projects"]');
  await expect(projects).toBeVisible();
  if ((await projects.getAttribute('aria-expanded')) !== 'true') await projects.click();
  const row = tree.locator('[data-path="Projects/Flat hunt"]');
  await expect(row).toBeVisible();
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const box = tree.getByRole('textbox', { name: 'New name for Flat hunt', exact: true });
  await expect(box).toBeFocused();
  await box.fill('Flat search');
  await page.keyboard.press('Enter');
  // The rename lands first; then, with no other key, the renamed row is active and ringed.
  await expect(tree.locator('[data-path="Projects/Flat search"]')).toBeVisible();
  await expectRing(page, tree);
  expect(await tree.getAttribute('aria-activedescendant')).toBe(`row-${encodeURIComponent('Projects/Flat search')}`);
});
