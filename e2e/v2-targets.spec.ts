import { resize } from './viewport';
/**
 * v2-targets (d-v2-05, d-v2-10; WCAG 2.5.8 target size minimum, 2.5.5 target size): the desktop tab close
 * button is 24 square, and on the phone every listed control is at least 44 px. Fake Drive, phone and desktop.
 */
import type { Locator, Page } from '@playwright/test';
import { expectAxeClean } from './axe';
import { expect, test } from './fixtures';

const open = async (page: Page, path: string): Promise<void> => {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}${path.includes('scenario=') ? '' : 'scenario=default&'}time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

const size = async (el: Locator): Promise<{ w: number; h: number }> => {
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  if (!b) throw new Error('no box');
  return { w: b.width, h: b.height };
};

/** Every control the locator matches is at least `min` wide and tall (`both`) or tall. */
async function atLeast(name: string, loc: Locator, min: number, both = false): Promise<void> {
  const n = await loc.count();
  expect(n, `${name}: found`).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const { w, h } = await size(loc.nth(i));
    expect(h, `${name} #${i} height`).toBeGreaterThanOrEqual(min - 0.01);
    if (both) expect(w, `${name} #${i} width`).toBeGreaterThanOrEqual(min - 0.01);
  }
}

const axeTargets = async (page: Page, within: string): Promise<void> => {
  await expectAxeClean(page, { include: within, wcag22: true });
};

test('the desktop tab close button is at least 24 square', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tab strip');
  await open(page, '/');
  const x = page.getByRole('button', { name: 'Close Home' });
  const { w, h } = await size(x);
  expect(w).toBeGreaterThanOrEqual(24);
  expect(h).toBeGreaterThanOrEqual(24);
  const look = await x.evaluate((n) => {
    const c = getComputedStyle(n);
    return { radius: c.borderTopLeftRadius, icon: n.querySelector('svg')?.getBoundingClientRect().width, opacity: c.opacity, cls: n.className };
  });
  expect(look.radius).toBe('6px');
  expect(look.icon).toBe(16);
  expect(look.opacity).toBe('1');
  expect(look.cls).not.toMatch(/iconBtn/);
});

test('every listed phone control is at least 44 px', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone shell');
  await resize(page, { width: 375, height: 812 });

  await open(page, '/');
  await atLeast('home answers', page.locator('section[aria-labelledby="qs"] button'), 44);
  await axeTargets(page, 'main');

  await open(page, '/files');
  // ux-controls-polish: the phone's tree tools are one named menu.
  await atLeast('files toolbar', page.getByRole('button', { name: 'Folder tools', exact: true }), 44, true);
  await axeTargets(page, 'main');

  await open(page, '/bower');
  const kinds = page.getByRole('radiogroup', { name: 'What is it?' }).getByRole('radio');
  await atLeast('tell bower segments', kinds, 44);
  await atLeast('rule remove', page.getByRole('button', { name: /^Remove the rule/ }), 44);
  const kindClass = await kinds.first().evaluate((n) => n.className);
  await axeTargets(page, 'main');

  await open(page, '/settings');
  const seg = page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio');
  await atLeast('settings segments', seg, 44);
  expect(await seg.first().evaluate((n) => n.className), 'one segmented control').toBe(kindClass);
  await atLeast('settings buttons', page.getByRole('main').getByRole('button', { name: /Open in Drive|See them/ }), 44);
  const row = page.getByText('Bower moves', { exact: true }).locator('xpath=ancestor::label[1]');
  await atLeast('switch row', row, 44);
  await axeTargets(page, 'main');

  await open(page, '/sign-in?scenario=signed-out');
  await atLeast('sign-in links', page.getByRole('navigation', { name: 'About' }).getByRole('link'), 44);
  await axeTargets(page, 'main');
});

test('a tap on a switch row toggles it', async ({ page }) => {
  await open(page, '/settings');
  const sw = page.getByRole('switch', { name: 'Bower moves' });
  const before = await sw.getAttribute('aria-checked');
  await page.getByText('Hops, flies and carries things around the app.').click();
  await expect(sw).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  await page.getByText('Bower moves', { exact: true }).click();
  await expect(sw).toHaveAttribute('aria-checked', before ?? 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
});

test('desktop control sizes stay at least 24', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop shell');
  await open(page, '/');
  await atLeast('tab close', page.getByRole('button', { name: /^Close / }), 24, true);
  await atLeast('panel toggles', page.getByRole('button', { name: /^(Hide|Show) the (side|right) panel$/ }), 24, true);
  await axeTargets(page, 'main');
  await open(page, '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md');
  await axeTargets(page, 'main');
  await open(page, '/files/Projects/Flat%20hunt');
  await atLeast('files toolbar', page.getByRole('button', { name: /^(New folder|Change sort order)$/ }), 24, true);
  await axeTargets(page, 'main');
  await open(page, '/bower');
  await atLeast('tell bower segments', page.getByRole('radiogroup', { name: 'What is it?' }).getByRole('radio'), 24);
  await open(page, '/settings');
  await atLeast('settings segments', page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio'), 24);
});
