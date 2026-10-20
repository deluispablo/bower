/**
 * v2-field (d-v2-08, WCAG 1.4.11): every field, switch and task box draws its edge with
 * `control-line`, and placeholders use `--text-muted`. Phone and desktop, dark and light,
 * on the fake Drive. An error field says so to the screen reader (`aria-invalid` and
 * `aria-describedby`) and passes axe with the WCAG 2.2 tags and target size.
 */
import type { Locator, Page } from '@playwright/test';
import { animationsEnd, expectAxeClean } from './axe';
import { expect, isFake, test } from './fixtures';

const THEMES = ['dark', 'light'] as const;

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};
const theme = (page: Page, value: string) =>
  page.evaluate((v) => document.documentElement.setAttribute('data-theme', v), value);

/** What a token resolves to in the current theme, as the browser computes a colour from it. */
const resolved = (page: Page, token: string): Promise<string> =>
  page.evaluate((t) => {
    const probe = document.createElement('i');
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, token);

/** The colour of the box edge: a border, or an inset ring. */
const edge = (el: Locator): Promise<{ border: string; width: number; ring: string }> =>
  el.evaluate((n) => {
    const c = getComputedStyle(n);
    return { border: c.borderTopColor, width: parseFloat(c.borderTopWidth), ring: c.boxShadow };
  });
const placeholder = (el: Locator): Promise<string> =>
  el.evaluate((n) => getComputedStyle(n, '::placeholder').color);

const axeClean = async (page: Page, within = 'main'): Promise<void> => {
  await expectAxeClean(page, { include: within, wcag22: true });
};

/** A field whose own box (or its wrapper's) is the control edge. */
async function checkField(
  page: Page,
  name: string,
  box: Locator,
  text: Locator | null,
  radius?: number,
): Promise<void> {
  // A sheet pops in; measure once it has settled.
  await animationsEnd(page);
  const line = await resolved(page, '--control-line');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const e = await edge(box);
  expect(e.border, `${name}: border colour`).toBe(line);
  // The browser snaps a border to whole device pixels; 1.5px computes as it does on a plain 1.5px border.
  const snapped = await page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.cssText = 'border:1.5px solid';
    document.body.append(probe);
    const w = parseFloat(getComputedStyle(probe).borderTopWidth);
    probe.remove();
    return w;
  });
  expect(e.width, `${name}: border width`).toBe(snapped);
  expect((await box.boundingBox())?.height ?? 0, `${name}: height`).toBeGreaterThanOrEqual(48);
  if (radius)
    expect(
      await box.evaluate((n) => parseFloat(getComputedStyle(n).borderTopLeftRadius)),
      `${name}: radius`,
    ).toBe(radius);
  if (text)
    expect(await placeholder(text), `${name}: placeholder`).toBe(
      await resolved(page, '--text-muted'),
    );
  // Focused, the border turns --text-muted (a button box is not typed in).
  const typed =
    text ??
    ((await box.locator('input, textarea').count())
      ? box.locator('input, textarea').first()
      : null);
  if (typed) {
    await typed.focus();
    expect((await edge(box)).border, `${name}: focused border`).toBe(
      await resolved(page, '--text-muted'),
    );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }
}

test('fields and switches draw their edge with the control line', async ({ page }, info) => {
  test.skip(!isFake, 'The fake Drive is the source this entry is judged on.');
  test.setTimeout(120_000);
  const desktop = info.project.name === 'desktop';
  for (const t of THEMES) {
    // Add: "What is this?", the link field, and the invalid-link error.
    await open(page, '/add');
    await theme(page, t);
    const what = page.getByLabel('What is this?');
    await checkField(page, 'What is this?', what, what, 14);
    const link = page.getByLabel('Paste a link');
    await checkField(page, 'Paste a link', page.locator('form', { has: link }), link, 14);
    await link.fill('not a link');
    await page.getByRole('button', { name: 'Add link' }).click();
    const bad = page.getByRole('alert').filter({ hasText: 'That is not a web address' });
    await expect(bad).toBeVisible();
    await expect(link).toHaveAttribute('aria-invalid', 'true');
    const described = (await link.getAttribute('aria-describedby')) ?? '';
    expect(described.split(' ')).toContain((await bad.getAttribute('id')) ?? 'missing');
    expect((await edge(page.locator('form', { has: link }))).border, 'error edge').toBe(
      await resolved(page, '--danger'),
    );
    expect(
      await bad.evaluate((n) => [getComputedStyle(n).color, getComputedStyle(n).fontSize]),
    ).toEqual([await resolved(page, '--danger'), '13px']);
    await axeClean(page);

    // A pile's note.
    await open(page, '/pile/p1');
    await theme(page, t);
    const note = page.locator('#pile-note-text');
    await checkField(page, 'pile note', note, null, 14);

    // Tell Bower's box.
    await open(page, '/bower');
    await theme(page, t);
    const ask = page.getByRole('textbox', { name: /Your request|The rule/ });
    await checkField(page, 'Tell Bower', page.locator('form', { has: ask }), ask, 14);
    await axeClean(page);

    // Home's search is a button that opens the palette; the pill keeps its edge.
    await open(page, '/');
    await theme(page, t);
    await checkField(
      page,
      'Home search',
      page.locator('main button', { hasText: /Search/ }).first(),
      null,
      999,
    );

    // The switch.
    await open(page, '/settings');
    await theme(page, t);
    const line = await resolved(page, '--control-line');
    const off = page.getByRole('switch', { checked: false }).first();
    // The track's colour eases in after the theme switch.
    await expect.poll(() => off.evaluate((n) => getComputedStyle(n).backgroundColor), { message: 'switch, off: a control-line track' }).toBe(line);
    await axeClean(page);

    // A task box, unticked: custom drawn, 24 x 24, and still a checkbox with a name.
    await open(page, '/note/Areas/Documents/Passport%20renewal.md');
    await theme(page, t);
    const box = page.getByRole('checkbox', { checked: false }).first();
    await expect(box).toBeVisible();
    const b = await box.boundingBox();
    expect([b?.width, b?.height]).toEqual([24, 24]);
    expect((await edge(box)).ring, 'task box: inset ring').toContain(line);
    expect(await box.evaluate((n) => getComputedStyle(n).borderTopLeftRadius)).toBe('7px');
    await expect(box).toHaveAccessibleName(/\S/);
    await box.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { checked: true }).first()).toBeVisible();
    await axeClean(page);

    if (!desktop) {
      // The Rename sheet's name field, from a folder page's menu (the desktop renames in the tree).
      await open(page, '/files/Projects/Job%20hunt/Applications');
      await theme(page, t);
      await page.getByRole('button', { name: 'More for Applications' }).click();
      await page.getByRole('button', { name: 'Rename' }).click();
      const name = page.getByLabel('Name', { exact: true });
      await checkField(page, 'Rename name', name, name, 14);
      await page.keyboard.press('Escape');
    }

    if (desktop) {
      // The side panel's search and Move's "Find a folder".
      await open(page, '/');
      await theme(page, t);
      await page.getByRole('tab', { name: 'Search' }).click();
      const panel = page.getByLabel('Search your notes and files');
      await expect(panel).toBeVisible();
      await checkField(page, 'panel search', page.locator('label', { has: panel }), panel, 999);
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: 'Files' }).click();
      await page.getByRole('treeitem', { name: /Flat hunt/ }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Move to…' }).click();
      const find = page.getByLabel('Find a folder');
      await checkField(page, 'Find a folder', page.locator('label', { has: find }), find, 14);
    }
  }
});

test('the sort menu tick keeps its own size and place', async ({ page }, info) => {
  test.skip(!isFake, 'The fake Drive is the source this entry is judged on.');
  test.skip(info.project.name !== 'desktop', 'The sort menu lives in the desktop Files panel.');
  await open(page, '/files');
  await page.getByRole('button', { name: 'Change sort order' }).click();
  const item = page.getByRole('menuitemradio', { checked: true });
  await expect(item).toBeVisible();
  const tick = item.locator('span').last();
  const [i, t] = [await item.boundingBox(), await tick.boundingBox()];
  expect(t?.width, 'tick width').not.toBe(24);
  expect(t?.width ?? 99, 'tick width').toBeLessThanOrEqual(20);
  expect((i?.x ?? 0) + (i?.width ?? 0) - ((t?.x ?? 0) + (t?.width ?? 0)), 'gap to right edge').toBeLessThanOrEqual(16);
  expect(await tick.evaluate((n) => getComputedStyle(n).boxShadow)).toBe('none');
});

test('a focused invalid field keeps the danger edge', async ({ page }) => {
  test.skip(!isFake, 'The fake Drive is the source this entry is judged on.');
  await open(page, '/add');
  const link = page.getByLabel('Paste a link');
  await link.fill('not a link');
  await page.keyboard.press('Enter');
  await expect(link).toHaveAttribute('aria-invalid', 'true');
  await link.focus();
  await expect(link).toBeFocused();
  const box = page.locator('form', { has: link });
  expect((await edge(box)).border, 'edge while focused').toBe(await resolved(page, '--danger'));
  const ring = await box.evaluate((n) => {
    const c = getComputedStyle(n);
    return [c.outlineStyle, c.outlineWidth, c.outlineColor];
  });
  expect(ring, 'focus ring').toEqual(['solid', '2px', await resolved(page, '--accent-line')]);
});
