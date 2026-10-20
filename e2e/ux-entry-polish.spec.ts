/**
 * ux-entry-polish: the landing keeps its one (dark) theme in any system scheme and says "Press Tidy up"; Settings
 * offers no web-lookup switch, says where the folder is on one line and draws off switches as a control-line track
 * under a surface knob; the desktop sign-in gives the art 45% and centres the text in the rest.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const hexToRgb = (hex: string): string => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const tokens = JSON.parse(readFileSync('src/styles/tokens.json', 'utf8')) as { color: { tokens: { name: string; value: { dark: string } }[] } };
const darkBg = hexToRgb(tokens.color.tokens.find((t) => t.name === 'bg')?.value.dark ?? '');

/** The scheme the browser draws its own parts in: CanvasText is white in a dark one (https://www.w3.org/TR/css-color-adjust-1/#color-scheme-effect). */
const drawnDark = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'CanvasText';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c === 'rgb(255, 255, 255)';
  });

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=default&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
};

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

/** WCAG contrast of a colour (alpha composited over the ground) against the ground. */
function contrast(colour: string, ground: string): number {
  const parse = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).map(Number);
  const [r, g, b, a = 1] = parse(colour);
  const [R, G, B] = parse(ground);
  const lum = (rgb: number[]): number => {
    const [x, y, z] = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * x + 0.7152 * y + 0.0722 * z;
  };
  const top = lum([r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)]);
  const bottom = lum([R, G, B]);
  return (Math.max(top, bottom) + 0.05) / (Math.min(top, bottom) + 0.05);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC1 the landing is dark before its page logic runs, in a ${colorScheme} system`, async ({ browser, baseURL }, info) => {
    test.skip(info.project.name !== 'desktop', 'One run: the landing is static.');
    const context = await browser.newContext({ baseURL, colorScheme, javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/landing/index.html');
      await expect(page.locator('head meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
      // Before the page script, so the first paint already has it.
      expect(await page.evaluate(() => {
        const meta = document.querySelector('meta[name="color-scheme"]');
        const script = document.scripts[0];
        return !!meta && !!script && !!(meta.compareDocumentPosition(script) & Node.DOCUMENT_POSITION_FOLLOWING);
      })).toBe(true);
      expect(await drawnDark(page)).toBe(true);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(darkBg);
    } finally {
      await context.close();
    }
  });
}

test('AC1 AC2 a fresh export comes out the same after the fixer', async () => {
  test.skip(test.info().project.name !== 'desktop', 'One run: no browser.');
  const html = readFileSync('public/landing/index.html', 'utf8');
  const support = readFileSync('public/landing/support.js', 'utf8');
  expect(html).toContain('Press Tidy up, and Bower names each one and files it in your own Google Drive.');
  const root = mkdtempSync(join(tmpdir(), 'entry-polish-'));
  const landing = join(root, 'public/landing');
  mkdirSync(landing, { recursive: true });
  mkdirSync(join(root, 'scripts'));
  copyFileSync('scripts/fix-landing.mjs', join(root, 'scripts/fix-landing.mjs'));
  copyFileSync('public/landing/support.js', join(landing, 'support.js'));
  const run = (...args: string[]) => spawnSync(process.execPath, [join(root, 'scripts/fix-landing.mjs'), ...args], { encoding: 'utf8' });
  try {
    // The canvas's own words and head, as a new export brings them.
    const exported = html
      .replace('<meta name="color-scheme" content="dark">\n', '')
      .replace('Press Tidy up, and Bower names each one and files it in your own Google Drive.', 'Tap once, and Bower reads each one, names it and files it in your own Google Drive.')
      .replace('Throw it all in. Press Tidy up.', 'Throw it all in. Tap once.')
      .replaceAll('press Tidy up', 'tap Tidy up');
    writeFileSync(join(landing, 'index.html'), exported);
    expect(run('--check').status).toBe(1);
    expect(run().status).toBe(0);
    expect(readFileSync(join(landing, 'index.html'), 'utf8')).toBe(html);
    expect(readFileSync(join(landing, 'support.js'), 'utf8')).toBe(support);
    expect(run('--check').status).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC1 AC2 the landing keeps its dark ground and says Press Tidy up in a ${colorScheme} system`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/landing/index.html');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your Drive, tidied by a bowerbird.');
    await expect.poll(() => page.locator('path[d]').count()).toBeGreaterThan(5);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(darkBg);
    expect(await drawnDark(page)).toBe(true);
    await expect(page.getByText('Press Tidy up, and Bower names each one and files it in your own Google Drive.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Throw it all in. Press Tidy up.' })).toBeVisible();
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/tap once|tap Tidy up/i);
    expect(text).toContain('Looking things up on the web is still to come.');
  });
}

test('AC2 Settings offers no web lookup, and Privacy promises none', async ({ page }) => {
  await open(page, '/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByRole('switch')).toHaveCount(2);
  expect(await main.getByRole('switch').evaluateAll((all) => all.map((n) => n.getAttribute('aria-label')))).toEqual(['Tell me when a tidy-up ends', 'Bower moves']);
  await expect(main.getByText(/on the web/)).toHaveCount(0);
  await open(page, '/privacy');
  // The web is planned, not refused: Privacy says what Bower does today, and lists nothing about it under what it never does.
  await expect(page.getByRole('main').getByText('Bower does not look things up on the web yet.')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'on the web' })).toHaveCount(0);
});

test('AC3 the desktop sign-in gives the art 45% and centres the text in the rest', async ({ page }, info) => {
  await page.goto('/sign-in?scenario=signed-out&time=instant');
  const art = page.getByRole('banner');
  const main = page.getByRole('main');
  const title = main.getByRole('heading', { level: 1 });
  await expect(title).toHaveText('Your Drive, tidied by a bowerbird.');
  const width = page.viewportSize()?.width ?? 0;
  const a = await art.boundingBox();
  const m = await main.boundingBox();
  const t = await title.boundingBox();
  if (!a || !m || !t) throw new Error('The sign-in parts must be on screen.');
  // Reading order stays: the art (banner) first, then the main column.
  expect(await page.evaluate(() => {
    const banner = document.querySelector('header');
    const column = document.querySelector('main');
    return !!banner && !!column && !!(banner.compareDocumentPosition(column) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  if (info.project.name === 'desktop') {
    expect(a.width / width).toBeGreaterThan(0.44);
    expect(a.width / width).toBeLessThan(0.46);
    expect(Math.abs((t.x - (a.x + a.width)) - (width - (t.x + t.width)))).toBeLessThanOrEqual(2);
  } else {
    // The phone keeps its stack: the art above, the text the page's width below it.
    expect(a.y + a.height).toBeLessThanOrEqual(m.y + 1);
    expect(Math.round(m.width)).toBe(width);
  }
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC4 Settings says where the folder is on one line, and switches read off and on (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page, '/settings');
    const main = page.getByRole('main');
    const row = main.getByText('Bower, in My Drive', { exact: true });
    await expect(row).toBeVisible();
    await expect(main.getByText('In My Drive', { exact: true })).toHaveCount(0);
    const { height, line } = await row.evaluate((n) => ({ height: n.getBoundingClientRect().height, line: parseFloat(getComputedStyle(n).lineHeight) || parseFloat(getComputedStyle(n).fontSize) * 1.6 }));
    expect(height).toBeLessThan(line * 1.5);

    const ground = await resolved(page, '--bg');
    const paint = (name: string) => main.getByRole('switch', { name }).evaluate((n) => ({
      track: getComputedStyle(n).backgroundColor,
      knob: getComputedStyle(n.firstElementChild as Element).backgroundColor,
      checked: n.getAttribute('aria-checked'),
    }));
    const off = await paint('Tell me when a tidy-up ends');
    expect(off.checked).toBe('false');
    expect(off.track).toBe(await resolved(page, '--control-line'));
    expect(off.knob).toBe(await resolved(page, '--surface'));
    expect(contrast(off.track, ground)).toBeGreaterThanOrEqual(3);
    const on = await paint('Bower moves');
    expect(on.checked).toBe('true');
    expect(on.track).toBe(await resolved(page, '--brand'));
    // ux-controls-polish AC5: the knob is on-brand, 3:1 on the teal (white was 1.89:1).
    expect(on.knob).toBe(await resolved(page, '--on-brand'));
    expect(contrast(on.knob, on.track)).toBeGreaterThanOrEqual(3);
  });
}
