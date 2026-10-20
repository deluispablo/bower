/**
 * ux-controls-polish (design-first-run plan.md; rulings ux-controls-polish-rulings.md): a control drawn only as an icon
 * shows its name on hover and keyboard focus and Escape hides it (WCAG 1.4.13), the right panel names its tab, the
 * phone's tree tools are one named menu that gives the keyboard back, small targets grow (WCAG 2.5.8), a click that
 * changes the page leaves no ring while the keyboard keeps one (WCAG 2.4.7), every file that is not a note says what
 * it is, and notes that link both ways are said once. Fake and demo, phone and desktop.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, isFake, test } from './fixtures';

const prefs = { leftOpen: true, rightOpen: true, rightSettled: true, leftWidth: 300, rightWidth: 320, birdMoves: false };
const NOTE = '/note/Projects/Flat%20hunt/Flat%203%2C%2012%20Larkspur%20Lane.md';
const HUB = '/note/Projects/Flat%20hunt/Flat%20hunt.md';
const TOOLS = ['New folder', 'Change sort order', 'Reveal the open note', 'Collapse all'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((p) => localStorage.setItem('bower:prefs', JSON.stringify(p)), prefs);
});

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}?scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

/** The words of the control's hint while it shows, else null. */
const hint = (el: Locator): Promise<string | null> =>
  el.evaluate((n) => {
    const a = getComputedStyle(n, '::after');
    return a.visibility === 'visible' && a.content !== 'none' ? a.content.replace(/^"|"$/g, '') : null;
  });

const box = async (el: Locator): Promise<{ x: number; y: number; width: number; height: number }> => {
  const b = await el.boundingBox();
  if (!b) throw new Error('no box');
  return b;
};

/** Whether the focused element draws the focus ring, and in which colour. */
const ring = (el: Locator): Promise<{ visible: boolean; style: string; color: string }> =>
  el.evaluate((n) => ({ visible: n.matches(':focus-visible'), style: getComputedStyle(n).outlineStyle, color: getComputedStyle(n).outlineColor }));

test('AC1 desktop_hints: tree tools and panel tabs show their names on hover and keyboard focus; Escape hides them', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop panels');
  await open(page, NOTE);
  const side = page.getByRole('complementary', { name: 'Side panel', exact: true });
  const right = page.getByRole('complementary', { name: 'Right panel', exact: true });
  const tools = TOOLS.map((name) => side.getByRole('button', { name, exact: true }));
  const tabs = [
    ...['Files', 'Search', 'Bookmarks'].map((name) => side.getByRole('tab', { name, exact: true })),
    ...['Linked notes', 'Outline', 'Activity'].map((name) => right.getByRole('tab', { name, exact: true })),
  ];
  for (const el of [...tools, ...tabs]) {
    const name = await el.getAttribute('aria-label');
    await el.hover();
    await expect.poll(() => hint(el), `${name} on hover`).toBe(name);
    // One hint, not the browser's as well.
    expect(await el.getAttribute('title'), `${name} has no title`).toBeNull();
  }
  await page.mouse.move(700, 600);
  for (const el of tools) await expect.poll(() => hint(el)).toBeNull();
  // From the chosen Files tab, Tab reaches each tool in turn; each shows its name.
  await side.getByRole('tab', { name: 'Files', exact: true }).focus();
  for (const [i, el] of tools.entries()) {
    await page.keyboard.press('Tab');
    await expect(el).toBeFocused();
    expect(await hint(el), `${TOOLS[i]} on keyboard focus`).toBe(TOOLS[i]);
  }
  await page.keyboard.press('Escape');
  await expect.poll(() => hint(tools[3])).toBeNull();
  await page.keyboard.press('Shift+Tab');
  await expect(tools[2]).toBeFocused();
  expect(await hint(tools[2])).toBe('Reveal the open note');
  // A tab reached with an arrow key shows its name too.
  await right.getByRole('tab', { name: 'Linked notes', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  await expect(right.getByRole('tab', { name: 'Outline', exact: true })).toBeFocused();
  expect(await hint(right.getByRole('tab', { name: 'Outline', exact: true }))).toBe('Outline');
});

test('AC1 right_panel_title: the right panel shows the name of its chosen tab, on one line', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop right panel');
  await open(page, NOTE);
  const right = page.getByRole('complementary', { name: 'Right panel', exact: true });
  const panel = await box(right);
  for (const name of ['Outline', 'Activity', 'Linked notes']) {
    await right.getByRole('tab', { name, exact: true }).click();
    const title = right.getByText(name, { exact: true });
    await expect(title).toBeVisible();
    const t = await box(title);
    expect(t.x + t.width, `${name} inside the panel`).toBeLessThanOrEqual(panel.x + panel.width);
    expect(t.height, `${name} on one line`).toBeLessThan(24);
  }
});

test('AC1 phone_folder_tools: the phone tree tools are one named menu that gives the keyboard back', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone tree');
  await open(page, '/files');
  const main = page.getByRole('main');
  for (const name of [...TOOLS, 'Expand all']) await expect(main.getByRole('button', { name, exact: true })).toHaveCount(0);
  const trigger = main.getByRole('button', { name: 'Folder tools', exact: true });
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'New folder', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^(Collapse all|Expand all)$/ })).toBeVisible();
  await expect(menu.getByText('Change sort order', { exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitemradio')).toHaveCount(6);
  await menu.getByRole('menuitemradio', { name: 'File name (Z to A)', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitemradio', { name: 'File name (Z to A)', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'New folder', exact: true });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('AC2 desktop_targets: tree tools and every tab close button are at least 32 by 32', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop shell');
  await open(page, NOTE);
  const side = page.getByRole('complementary', { name: 'Side panel', exact: true });
  for (const name of TOOLS) {
    const b = await box(side.getByRole('button', { name, exact: true }));
    expect(Math.min(b.width, b.height), name).toBeGreaterThanOrEqual(32);
  }
  const closes = page.getByRole('navigation', { name: 'Open tabs' }).getByRole('button', { name: /^Close / });
  expect(await closes.count()).toBeGreaterThan(0);
  for (const x of await closes.all()) {
    const b = await box(x);
    expect(Math.min(b.width, b.height), (await x.getAttribute('aria-label')) ?? 'tab close').toBeGreaterThanOrEqual(32);
    const tab = await box(x.locator('xpath=..'));
    expect(b.y + b.height, 'inside its tab').toBeLessThanOrEqual(tab.y + tab.height + 0.01);
  }
});

test('AC2 phone_targets: Folder tools is at least 44 by 44; the demo strip is at least 32 high and the page starts below it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone shell');
  await open(page, '/files');
  const b = await box(page.getByRole('main').getByRole('button', { name: 'Folder tools', exact: true }));
  expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
  const strip = page.getByRole('button', { name: 'Demo situations', exact: true });
  await expect(strip).toBeVisible();
  const s = await strip.evaluate((el) => ({ top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height, offset: parseFloat(getComputedStyle(document.body).paddingTop) }));
  expect(s.top).toBe(0);
  expect(s.height).toBeGreaterThanOrEqual(32);
  expect(s.offset, 'the page is pushed down by the strip height').toBe(s.height);
});

test('AC3 mouse_nav_no_ring: a click or tap that changes the page puts the keyboard on the heading without a ring', async ({ page, isMobile }) => {
  await open(page, HUB);
  const link = isMobile
    ? page.getByRole('main').getByRole('link', { name: /Flat 7, Cobble Row/ }).first()
    : page.getByRole('complementary', { name: 'Right panel', exact: true }).getByRole('listitem').getByRole('link', { name: /Flat 7, Cobble Row/ });
  if (isMobile) await link.tap();
  else await link.click();
  const h1 = page.locator('main h1');
  await expect(h1).toHaveText(/Flat 7, Cobble Row/);
  await expect(h1).toBeFocused();
  const r = await ring(h1);
  expect([r.visible, r.style]).toEqual([false, 'none']);
});

test('AC3 keyboard_keeps_ring: a key that changes the page, and Tab onward, keep the amber ring', async ({ page, isMobile }) => {
  await open(page, HUB);
  const amber = await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.color = 'var(--accent-line)';
    document.body.append(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  });
  const link = isMobile
    ? page.getByRole('main').getByRole('link', { name: /Flat 7, Cobble Row/ }).first()
    : page.getByRole('complementary', { name: 'Right panel', exact: true }).getByRole('listitem').getByRole('link', { name: /Flat 7, Cobble Row/ });
  await link.focus();
  await page.keyboard.press('Enter');
  const h1 = page.locator('main h1');
  await expect(h1).toHaveText(/Flat 7, Cobble Row/);
  await expect(h1).toBeFocused();
  expect(await ring(h1)).toEqual({ visible: true, style: 'solid', color: amber });
  await page.keyboard.press('Tab');
  const next = page.locator(':focus');
  expect(await ring(next)).toEqual({ visible: true, style: 'solid', color: amber });
});

test('AC4 badges: every file that is not a note says what it is, an unknown kind says "file"; notes and folders say nothing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop tree; the phone tree draws the same rows');
  await open(page, '/add');
  await page.locator('input[type=file][multiple]').setInputFiles([{ name: 'Scan', mimeType: 'application/octet-stream', buffer: Buffer.from('scan') }]);
  await page.getByRole('button', { name: 'Add 1 thing to the inbox', exact: true }).click();
  await expect(page).toHaveURL(/\/(\?|$)/);
  // In the app (a reload starts the demo again): the side panel's tree, every folder open.
  const side = page.getByRole('complementary', { name: 'Side panel', exact: true });
  const all = side.getByRole('button', { name: /^(Collapse all|Expand all)$/ });
  if ((await all.getAttribute('aria-label')) === 'Collapse all') await all.click();
  await side.getByRole('button', { name: 'Expand all', exact: true }).click();
  const tree = side.getByRole('tree', { name: 'Your Bower folder' });
  const badge = (sel: string): Locator => tree.locator(`${sel} [class*="badge"]`);
  await expect(badge('[data-path$="/Scan"]')).toHaveText('file');
  await expect(badge('[data-path="Projects/Flat hunt/Lease draft.pdf"]')).toHaveText('pdf');
  await expect(badge('[data-path="Projects/Flat hunt/Viewing photos/IMG_2290.jpg"]')).toHaveText('jpg');
  const rows = await tree.getByRole('treeitem').evaluateAll((items) =>
    items.map((r) => ({ path: r.getAttribute('data-path') ?? '', folder: r.hasAttribute('aria-expanded'), badges: r.querySelectorAll('[class*="badge"]').length })),
  );
  const notes = rows.filter((r) => r.path.endsWith('.md'));
  expect(notes.length, 'some note rows').toBeGreaterThan(0);
  expect(notes.filter((r) => r.badges), 'note rows have no badge').toEqual([]);
  expect(rows.filter((r) => r.folder && r.badges), 'folder rows have no badge').toEqual([]);
  expect(rows.filter((r) => !r.folder && !r.path.endsWith('.md') && r.badges !== 1), 'every other file has one badge').toEqual([]);
});

test('AC4 links_both_ways: notes that link both ways are listed once, under one "Links both ways" heading', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop right panel; the phone note page uses the same list');
  test.skip(isFake, "The pretend Drive's flats do not link back to their project; the demo's do (unit tests cover both).");
  await open(page, HUB);
  const right = page.getByRole('complementary', { name: 'Right panel', exact: true });
  await right.getByRole('tab', { name: 'Linked notes', exact: true }).click();
  const group = right.getByRole('heading', { name: 'Links both ways', exact: true, level: 3 });
  await expect(group).toBeVisible();
  await expect(right.getByText('Links both ways', { exact: true })).toHaveCount(1);
  await expect(group.locator('xpath=following-sibling::ul[1]').getByRole('link', { name: /Flat 3, 12 Larkspur Lane/ })).toBeVisible();
  const to = right.getByRole('heading', { name: 'Links to', exact: true }).locator('xpath=following-sibling::*[1]');
  await expect(to.getByRole('link', { name: /Flat 3, 12 Larkspur Lane/ })).toHaveCount(0);
});

test('AC5 switch_on_contrast: an on switch has a 3:1 edge on its ground and a 3:1 knob on its track, light and dark', async ({ page }) => {
  await open(page, '/settings');
  const sw = page.getByRole('switch', { name: 'Bower moves', exact: true });
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const c = await sw.evaluate(async (el) => {
      // After the 0.2 s track and knob transitions.
      await new Promise((r) => setTimeout(r, 300));
      const lum = (color: string): number => {
        const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
          const s = Number(v) / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
      };
      const ratio = (a: string, b: string): number => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
      };
      const solid = (color: string): boolean => !/rgba\([^)]*,\s*0\)|transparent/.test(color);
      let up: Element | null = el.parentElement;
      while (up && !solid(getComputedStyle(up).backgroundColor)) up = up.parentElement;
      const ground = getComputedStyle(up ?? document.body).backgroundColor;
      const track = getComputedStyle(el).backgroundColor;
      const shadow = getComputedStyle(el).boxShadow;
      const edge = shadow === 'none' ? track : (/rgba?\([^)]*\)/.exec(shadow)?.[0] ?? track);
      const knob = getComputedStyle(el.querySelector('span') as Element).backgroundColor;
      return { edge: ratio(edge, ground), knob: ratio(knob, track) };
    });
    expect(c.edge, `${colorScheme}: the edge on its ground`).toBeGreaterThanOrEqual(3);
    expect(c.knob, `${colorScheme}: the knob on its track`).toBeGreaterThanOrEqual(3);
  }
});
