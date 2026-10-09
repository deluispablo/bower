/**
 * v2-dock (d-v2-01, d-v2-03; WCAG 2.4.11): one bottom dock holds the messages and the run chip.
 * On a phone it spans the width above the tab bar; on desktop it is at most 520 wide, centred in
 * the main column. The page keeps room for it, and keyboard focus never ends under the tab bar.
 */
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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

const axeClean = async (page: Page): Promise<void> => {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .options({ rules: { 'target-size': { enabled: true } } })
    .analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
};

test('a message spans the phone width above the tab bar', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone dock');
  await page.setViewportSize({ width: 375, height: 812 });
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
  await axeClean(page);
});

test('the last result row ends above the run chip at full scroll', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the run chip is the phone one');
  await open(page, '/?scenario=back');
  const chip = page.getByRole('button', { name: /Watch/ });
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
    await page.setViewportSize(size);
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
