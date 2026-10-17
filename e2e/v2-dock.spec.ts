import { resize } from './viewport';
/**
 * v2-dock (d-v2-01, d-v2-03; WCAG 2.4.11): one bottom dock holds the messages and the run chip.
 * On a phone it spans the width above the tab bar; on desktop it is at most 520 wide, centred in
 * the main column. The page keeps room for it, and keyboard focus never ends under the tab bar.
 */
import type { Page } from '@playwright/test';
import { expectAxeClean } from './axe';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}time=instant${path.includes('scenario=') ? '' : '&scenario=default'}`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

/** A message with no button: answering a question on Home. */
const aMessage = async (page: Page) => {
  const q = page.locator('section[aria-labelledby="qs"] li').filter({ hasText: /Keep both\?/ });
  await q.getByRole('button', { name: 'Keep one' }).click();
  const box = page.getByRole('status').locator('> div').first();
  await expect(box).toBeVisible();
  // It rises in; measure once it has settled.
  await page.waitForTimeout(400);
  return box;
};

/** The dock and the page it sits over; the desktop tab strip's own close buttons are not this entry's. */
const axeClean = async (page: Page, within = 'body'): Promise<void> => {
  await expectAxeClean(page, { include: within, wcag22: true });
};

test('a message spans the phone width above the tab bar', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone dock');
  await resize(page, { width: 375, height: 812 });
  await open(page, '/');
  const box = await aMessage(page);
  const m = await box.boundingBox();
  const tab = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
  if (!m || !tab) throw new Error('no boxes');
  expect(Math.round(m.x)).toBe(16);
  expect(Math.round(m.x + m.width)).toBe(359);
  expect(m.y + m.height).toBeLessThanOrEqual(tab.y - 12 + 0.5);
  expect(m.height).toBeGreaterThanOrEqual(52);
  await axeClean(page);
});

test('a message is at most 520 wide and centred in main on desktop', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop dock');
  await open(page, '/');
  const box = await aMessage(page);
  const m = await box.boundingBox();
  const main = await page.getByRole('main').boundingBox();
  const status = await page.locator('footer, [class*="status"]').last().boundingBox();
  if (!m || !main) throw new Error('no boxes');
  expect(m.width).toBeLessThanOrEqual(520);
  expect(Math.abs(m.x + m.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(1);
  expect(m.y + m.height).toBeLessThanOrEqual((status?.y ?? main.y + main.height) - 24 + 0.5);
  await axeClean(page, '[data-testid="dock-stack"]');
});

test('the last result row ends above the run chip at full scroll', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the run chip is the phone one');
  await open(page, '/bower?scenario=back');
  const chip = page.getByRole('button', { name: /Watch what Bower did/ });
  await expect(chip).toBeVisible();
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = page.getByRole('main').locator('li:visible').last();
  const r = await last.boundingBox();
  const c = await chip.boundingBox();
  if (!r || !c) throw new Error('no boxes');
  expect(r.y + r.height).toBeLessThanOrEqual(c.y);
  await axeClean(page);
});

test('keyboard focus is never hidden behind the tab bar', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone shell');
  for (const size of [{ width: 375, height: 812 }, { width: 768, height: 1024 }]) {
    await resize(page, size);
    await open(page, '/');
    const tabTop = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())?.y ?? 0;
    const bad: string[] = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el.closest('nav[aria-label="Main"]')) return null;
        const b = el.getBoundingClientRect();
        return { end: b.bottom, name: (el.textContent ?? '').trim().slice(0, 30) };
      });
      if (r && r.end > tabTop - 16 + 0.5) bad.push(`${r.name} ends ${Math.round(r.end)} (limit ${tabTop - 16})`);
    }
    expect(bad, `at ${size.width}`).toEqual([]);
  }
});

test('the Bin message names the file in your Drive and Undo sits on one line', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree');
  await open(page, '/');
  const tree = page.getByRole('tree', { name: 'Your Bower folder' });
  await tree.getByRole('treeitem', { name: /Lease draft/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to Bin', exact: true }).click();
  const status = page.getByRole('status');
  await expect(status.getByText(/^Lease draft(\.pdf)? is in your Drive's Bin\.$/)).toBeVisible();
  await page.waitForTimeout(400);
  const undo = status.getByRole('button', { name: 'Undo' });
  const b = await undo.boundingBox();
  expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(b?.height ?? 99).toBeLessThanOrEqual(52);
});
