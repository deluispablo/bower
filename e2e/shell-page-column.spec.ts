import { resize } from './viewport';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { animationsEnd, expectAxeClean } from './axe';

const prefs = { leftOpen: true, rightOpen: true, leftWidth: 300, rightWidth: 320, birdMoves: false };
const folder = '/files/Projects/Flat%20hunt?source=demo&scenario=default&time=instant';
const saved = (page: Page) => page.evaluate(() => localStorage.getItem('bower:prefs'));

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((initial) => {
    // Test each motion control independently: reduced motion has Bower moves on.
    localStorage.setItem('bower:prefs', JSON.stringify({ ...initial, birdMoves: initial.birdMoves || matchMedia('(prefers-reduced-motion: reduce)').matches }));
  }, { ...prefs, birdMoves: testInfo.annotations.some(({ type }) => type === 'bower-moves-on') });
});

test('desktop page widths follow the designer table and List/Table stays on one line', async ({ page }) => {
  for (const [width, column, left, right] of [
    [900, 848, false, false], [1024, 672, true, false], [1100, 748, true, false],
    [1280, 608, true, true], [1440, 768, true, true],
  ] as const) {
    await resize(page, { width, height: 900 });
    await page.goto(folder);
    await expect(page.locator('#boot')).toHaveCount(0);
    await expect.poll(() => page.locator('#main').evaluate((el) => el.getBoundingClientRect().width)).toBe(column);
    expect(column).toBeGreaterThanOrEqual(560);
    await expect(page.getByRole('complementary', { name: 'Side panel', exact: true })).toHaveCount(left ? 1 : 0);
    await expect(page.getByRole('complementary', { name: 'Right panel', exact: true })).toHaveCount(right ? 1 : 0);
    const view = page.getByRole('radiogroup', { name: 'View' });
    await expect(view).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const rows = await view.getByRole('radio').evaluateAll((buttons) => buttons.map((button) => {
      const text = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!text) throw new Error('Missing view label');
      const range = document.createRange();
      range.selectNodeContents(text);
      return { top: button.getBoundingClientRect().top, lines: range.getClientRects().length };
    }));
    expect(rows).toHaveLength(2);
    expect(rows[0].top).toBe(rows[1].top);
    expect(rows.map((row) => row.lines)).toEqual([1, 1]);
    for (const [name, isDocked] of [['side', left], ['right', right]] as const) {
      const toggle = page.getByRole('button', { name: `${isDocked ? 'Hide' : 'Show'} the ${name} panel` });
      if (isDocked) await expect(toggle).not.toHaveAttribute('aria-expanded');
      else await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
    expect(await saved(page)).toBe(JSON.stringify(prefs));
    await expectAxeClean(page, { include: 'main', wcag22: true });
  }
});

for (const side of ['side', 'right'] as const) {
  test(`folded ${side} panel uses the edge sheet and returns focus on every close`, async ({ page }) => {
    await resize(page, { width: 900, height: 900 });
    await page.goto(folder);
    await expect(page.locator('#boot')).toHaveCount(0);
    // Radix hides the invoking shell from assistive technology while the modal is open.
    const toggle = page.getByRole('button', { name: `Show the ${side} panel`, includeHidden: true });
    const dialog = page.getByRole('dialog', { name: side === 'side' ? 'Side panel' : 'Right panel', exact: true });
    const open = async () => {
      await toggle.focus();
      await toggle.press('Enter');
      await expect(dialog).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const close = dialog.getByRole('button', { name: `Close the ${side} panel` });
      await expect(close).toBeFocused();
      const box = await close.boundingBox();
      expect(box?.width).toBe(44);
      expect(box?.height).toBe(44);
      await expect(dialog.getByRole('separator')).toHaveCount(0);
      await animationsEnd(page);
      const panel = await dialog.boundingBox();
      expect(panel?.width).toBe(side === 'side' ? 300 : 320);
      expect(panel?.x).toBe(side === 'side' ? 52 : 580);
      expect(panel?.y).toBe(0);
      expect(panel?.height).toBe(900);
      expect(await saved(page)).toBe(JSON.stringify(prefs));
    };
    await open();
    await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await open();
    await dialog.getByRole('button', { name: `Close the ${side} panel` }).click();
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await open();
    await page.mouse.click(side === 'side' ? 880 : 100, 450);
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await open();
    await resize(page, { width: 1440, height: 900 });
    await expect(dialog).toHaveCount(0);
    const dockedToggle = page.getByRole('button', { name: `Hide the ${side} panel` });
    await expect(dockedToggle).toBeFocused();
    await expect(dockedToggle).not.toHaveAttribute('aria-expanded');
    await expect(page.getByRole('complementary', { name: side === 'side' ? 'Side panel' : 'Right panel', exact: true })).toBeVisible();
    expect(await saved(page)).toBe(JSON.stringify(prefs));
    await page.getByRole('complementary', { name: side === 'side' ? 'Side panel' : 'Right panel', exact: true }).getByRole('tab').first().focus();
    await resize(page, { width: 900, height: 900 });
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
}

test('opening a folder or linked note dismisses its overlay to the new heading', async ({ page }) => {
  await resize(page, { width: 900, height: 900 });
  await page.goto(folder);
  await expect(page.locator('#boot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the side panel' }).click();
  const side = page.getByRole('dialog', { name: 'Side panel', exact: true });
  await side.getByRole('treeitem', { name: /^Resources/ }).click();
  await expect(side).toHaveCount(0);
  await expect(page.locator('main h1')).toHaveText('Resources');
  await expect(page.locator('main h1')).toBeFocused();
  expect(await saved(page)).toBe(JSON.stringify(prefs));
  await page.goto('/note/Projects/Flat%20hunt/Flat%20hunt.md?source=demo&scenario=default&time=instant');
  await expect(page.locator('#boot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the right panel' }).click();
  const right = page.getByRole('dialog', { name: 'Right panel', exact: true });
  const link = right.getByRole('link', { name: 'Flat 3, 12 Larkspur Lane' }).first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(right).toHaveCount(0);
  await expect(page).not.toHaveURL(/Flat%20hunt\.md/);
  await expect(page.locator('main h1')).toBeFocused();
  expect(await saved(page)).toBe(JSON.stringify(prefs));
});

test('edge sheets hold still with Bower moves off and with reduced motion', async ({ page }) => {
  await resize(page, { width: 900, height: 900 });
  for (const reduced of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.goto(folder);
    await expect(page.locator('#boot')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show the side panel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Side panel', exact: true });
    await expect(dialog).toBeVisible();
    expect(await saved(page)).toBe(JSON.stringify({ ...prefs, birdMoves: reduced }));
    const motion = await dialog.evaluate((el) => {
      const style = getComputedStyle(el);
      const durationMs = Math.max(...style.animationDuration.split(',').map((duration) =>
        parseFloat(duration) * (duration.trim().endsWith('ms') ? 1 : 1000)));
      return { name: style.animationName, durationMs };
    });
    if (reduced) expect(motion.name === 'none' || motion.durationMs <= 0.01).toBe(true);
    else expect(motion.name).toBe('none');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('edge sheets slide with Bower moves on and no reduced motion', {
  annotation: { type: 'bower-moves-on', description: 'Positive control for edge motion' },
}, async ({ page }) => {
  await resize(page, { width: 900, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(folder);
  await expect(page.locator('#boot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the side panel' }).click();
  const dialog = page.getByRole('dialog', { name: 'Side panel', exact: true });
  await expect(dialog).toBeVisible();
  expect(await saved(page)).toBe(JSON.stringify({ ...prefs, birdMoves: true }));
  const motion = await dialog.evaluate((el) => {
    const style = getComputedStyle(el);
    return { name: style.animationName, duration: parseFloat(style.animationDuration) };
  });
  expect(motion.name).not.toBe('none');
  expect(motion.duration).toBeGreaterThan(0);
});

test('a real mouse drag on the side panel resizer reaches its target width', async ({ page }) => {
  await resize(page, { width: 1280, height: 900 });
  await page.goto(folder);
  await expect(page.locator('#boot')).toHaveCount(0);
  // Leave room for the full 80 px drag; the separate limit test covers clamping with both panels open.
  await page.getByRole('button', { name: 'Hide the right panel' }).click();
  const resizer = page.getByRole('separator', { name: 'Resize the side panel' });
  const panel = page.getByRole('complementary', { name: 'Side panel', exact: true });
  await expect(resizer).toHaveAttribute('aria-valuemax', '480');
  const start = Number(await resizer.getAttribute('aria-valuenow'));
  const target = start + 80;
  expect(target).toBeLessThanOrEqual(Number(await resizer.getAttribute('aria-valuemax')));
  const box = await resizer.boundingBox();
  if (!box) throw new Error('Missing side resizer');
  const x = box.x + box.width / 2;
  const y = box.y + 100;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const delta of [20, 40, 60, 80]) {
    await page.mouse.move(x + delta, y, { steps: 4 });
  }
  await page.mouse.up();
  await expect(resizer).toHaveAttribute('aria-valuenow', String(target));
  await expect.poll(() => panel.evaluate((el) => el.getBoundingClientRect().width)).toBe(target);
});

test('resizers publish and stop at the current page limit without folding', async ({ page }) => {
  await resize(page, { width: 1280, height: 900 });
  await page.goto(folder);
  await expect(page.locator('#boot')).toHaveCount(0);
  const left = page.getByRole('separator', { name: 'Resize the side panel' });
  const right = page.getByRole('separator', { name: 'Resize the right panel' });
  await expect(left).toHaveAttribute('aria-valuemax', '348');
  await expect(right).toHaveAttribute('aria-valuemax', '368');
  const box = await left.boundingBox();
  if (!box) throw new Error('Missing side resizer');
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 600, box.y + 100);
  await page.mouse.up();
  await expect(left).toHaveAttribute('aria-valuenow', '348');
  await left.focus();
  await left.press('ArrowRight');
  await expect(left).toHaveAttribute('aria-valuenow', '348');
  await expect(right).toBeVisible();
  await expect.poll(() => page.locator('#main').evaluate((el) => el.getBoundingClientRect().width)).toBe(560);
  await left.press('ArrowLeft');
  await expect(left).toHaveAttribute('aria-valuenow', '332');
  await expect(right).toHaveAttribute('aria-valuemax', '336');
  await right.focus();
  await right.press('ArrowLeft');
  await right.press('ArrowLeft');
  await expect(right).toHaveAttribute('aria-valuenow', '336');
});
