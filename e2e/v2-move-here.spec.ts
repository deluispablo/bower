import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

async function openMove(page: Page, isMobile: boolean) {
  await page.setViewportSize({ width: isMobile ? 375 : 1440, height: 812 });
  await page.goto('/note/Projects/Flat%20hunt/Lease%20draft.pdf?source=fake&scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const opener = isMobile
    ? page.getByRole('button', { name: 'More for Lease draft' })
    : page.getByRole('tree', { name: 'Your Bower folder' });
  if (isMobile) {
    await opener.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Move to…', exact: true }).click();
  } else {
    await opener.focus();
    await opener.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to…', exact: true }).click();
  }
  await expect(page.getByRole('dialog', { name: 'Move Lease draft', exact: true })).toBeVisible();
  return opener;
}

test('the move sheet shows where the thing is now and it cannot be chosen', async ({ page, isMobile }) => {
  await openMove(page, isMobile);
  const sheet = page.getByRole('dialog', { name: 'Move Lease draft', exact: true });
  const current = sheet.getByRole('button', { name: /Flat hunt.*Now here/ });
  await expect(current).toHaveAttribute('aria-disabled', 'true');
  await expect(current.getByText('Now here', { exact: true })).toBeVisible();
  await expect(sheet).toContainText('Now in Projects / Flat hunt');
  const rows = sheet.locator('li > button');
  for (const row of await rows.all()) {
    await row.scrollIntoViewIfNeeded();
    const box = await row.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(52);
  }
  // ARIA-disabled retains the button; force allows the intentional no-op click.
  await current.click({ force: true });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Now in Projects / Flat hunt');
  await expect(page.getByRole('status').filter({ hasText: /Moved Lease draft/ })).toHaveCount(0);
  const input = sheet.getByRole('textbox', { name: 'Find a folder' });
  await input.fill('Flat hunt');
  await input.press('Enter');
  await expect(sheet).toBeVisible();
  await expect(current).toBeVisible();
  await input.fill('Documents');
  await expect(sheet.getByText('Now here')).toHaveCount(0);
  await input.fill('');
  const axe = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .options({ rules: { 'target-size': { enabled: true } } })
    .analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('the move sheet has a cancel that returns focus to its opener', async ({ page, isMobile }) => {
  const opener = await openMove(page, isMobile);
  const sheet = page.getByRole('dialog', { name: 'Move Lease draft', exact: true });
  const cancel = sheet.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeVisible();
  const cancelContainer = cancel.locator('..');
  const cancelBox = await cancel.boundingBox();
  const containerBox = await cancelContainer.boundingBox();
  if (!cancelBox || !containerBox) throw new Error('Cancel and its container must have visible bounds.');
  expect(Math.abs(cancelBox.width - containerBox.width)).toBeLessThanOrEqual(1);
  await cancel.click();
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});
