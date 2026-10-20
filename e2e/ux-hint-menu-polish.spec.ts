/**
 * ux-hint-menu-polish (backlog findings, ux-controls-polish review): Escape hides an icon button's name at once, not
 * after the 0.3 s hover delay (WCAG 1.4.13 dismissible), and the phone's menu items are 44 px targets (WCAG 2.5.5).
 */
import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';

const prefs = { leftOpen: true, rightOpen: true, rightSettled: true, leftWidth: 300, rightWidth: 320, birdMoves: false };

/** The words of the control's hint while it shows, else null (as `ux-controls-polish.spec.ts`). */
const hint = (el: Locator): Promise<string | null> =>
  el.evaluate((n) => {
    const a = getComputedStyle(n, '::after');
    return a.visibility === 'visible' && a.content !== 'none' ? a.content.replace(/^"|"$/g, '') : null;
  });

test('AC1 escape hides a hovered hint at once', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the hover hint is the desktop one');
  await page.addInitScript((p) => localStorage.setItem('bower:prefs', JSON.stringify(p)), prefs);
  await page.goto('/files?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const tool = page.getByRole('complementary', { name: 'Side panel', exact: true }).getByRole('button', { name: 'New folder', exact: true });
  await tool.hover();
  await expect.poll(() => hint(tool), 'setup: the name shows on hover').toBe('New folder');
  await page.keyboard.press('Escape');
  // One read, no polling: the 0.3 s hover delay must not apply to hiding.
  expect(await hint(tool), 'AC1: hidden at once').toBeNull();
});

test('AC2 phone menu items are at least 44 px tall', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone menu');
  await page.goto('/files?scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await page.getByRole('main').getByRole('button', { name: 'Folder tools', exact: true }).click();
  const items = page.getByRole('menu').locator('[role^="menuitem"]');
  await expect(items).toHaveCount(8);
  for (const item of await items.all()) {
    const box = await item.boundingBox();
    expect(box?.height ?? 0, `AC2: ${await item.innerText()}`).toBeGreaterThanOrEqual(44);
  }
});
