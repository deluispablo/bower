import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

// design-polish: small fixes from the designer review, each checked on the real styles. Made-up data.

test('design-polish AC1: after Send, Tell Bower shows one focus ring, on the box, not a second one on the text', async ({ page }) => {
  await page.goto('/bower?scenario=default&time=instant');
  const box = page.getByRole('textbox', { name: 'Your request' });
  await box.fill('Put my garden papers together');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');
  const rings = await box.evaluate((t) => {
    const ring = (e: Element) => { const c = getComputedStyle(e); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0; };
    const form = t.closest('form');
    return { text: ring(t), box: form ? ring(form) : false };
  });
  expect(rings).toEqual({ text: false, box: true });
  // Unchanged: a field on its own keeps its ring (the Add screen's note field).
  await page.goto('/add?scenario=default&time=instant');
  const own = page.getByRole('textbox').first();
  await own.focus();
  expect(await own.evaluate((t) => getComputedStyle(t).outlineStyle)).not.toBe('none');
});

test('design-polish AC2: Home pile titles use one font, whether a file name or the person\'s words', async ({ page }) => {
  await page.goto('/?scenario=default&time=instant');
  const titles = page.locator('[id^="pile-name-"]');
  await expect(titles.first()).toBeVisible();
  const fonts = await titles.evaluateAll((els) => els.map((e) => getComputedStyle(e).fontFamily));
  expect(fonts.length, 'positive control: several piles').toBeGreaterThan(1);
  expect(new Set(fonts).size).toBe(1);
});

test('design-polish AC3, AC4: Delete is a group of its own; after Sign out the sign-in screen says the device forgot you', async ({ page }) => {
  await page.goto('/settings?scenario=default&time=instant');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2, name: 'Leaving Bower', exact: true })).toBeVisible();
  const order = await main.evaluate((m) => [...m.querySelectorAll('h2, button')].map((e) => e.textContent?.trim()).filter((t) => t && ['Account', 'Sign out', 'Leaving Bower', 'Delete'].includes(t)));
  expect(order).toEqual(['Account', 'Sign out', 'Leaving Bower', 'Delete']);
  await expectAxeClean(page, { include: 'main', wcag22: true });
  await main.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  const said = page.getByText('Signed out. This device forgot you.', { exact: true });
  await expect(said).toBeVisible();
  await expect(said).toHaveAttribute('role', 'status');
  // Said once: a reload does not repeat it.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(said).toHaveCount(0);
});

test('design-polish AC5: the Add button reads "Add to the inbox", matching "Add a pile"', async ({ page }) => {
  await page.goto('/add?scenario=default&time=instant');
  await expect(page.getByRole('heading', { name: 'Add a pile', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to the inbox', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Put / })).toHaveCount(0);
});

// AC6: on a phone the demo's tab never sits on text or on a control, on any main screen, and stays easy to press.
for (const path of ['/', '/files', '/add', '/bower', '/settings', '/note/Projects/Flat%20hunt/Flat%20hunt.md']) {
  test(`design-polish AC6: the Demo tab covers nothing on ${path} on a phone`, async ({ page }) => {
    await resize(page, { width: 375, height: 812 });
    await page.goto(`${path}${path.includes('?') ? '&' : '?'}scenario=default&time=instant`);
    const tab = page.getByRole('button', { name: 'Demo situations', exact: true });
    await expect(tab).toBeVisible();
    await expect(page.locator('#boot')).toHaveCount(0);
    const result = await tab.evaluate((t) => {
      const fab = t.getBoundingClientRect();
      const hits = (r: DOMRect): boolean => r.width > 0 && r.height > 0 && r.left < fab.right && r.right > fab.left && r.top < fab.bottom && r.bottom > fab.top;
      const covered: string[] = [];
      // Text, by its own line boxes.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue?.trim() || t.contains(n)) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        if ([...r.getClientRects()].some(hits)) covered.push(`text: ${n.nodeValue.trim().slice(0, 40)}`);
      }
      // Controls, by their boxes.
      for (const el of document.querySelectorAll('a[href], button, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])')) {
        if (el === t || el.closest('[aria-hidden="true"]') || getComputedStyle(el).visibility === 'hidden') continue;
        if (hits(el.getBoundingClientRect())) covered.push(`${el.tagName.toLowerCase()}: ${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 40)}`);
      }
      return { covered, width: fab.width, height: fab.height };
    });
    expect(result.covered).toEqual([]);
    expect(Math.min(result.width, result.height), 'at least 24 by 24').toBeGreaterThanOrEqual(24);
  });
}
